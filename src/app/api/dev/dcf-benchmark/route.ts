/**
 * DCF benchmark — development only
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches each ticker the way the DCF page does (quote, profile, statements,
 * filings, exchange rate) and evaluates it with `evaluateCompany`, the same
 * derivation the page runs on Auto-Populate. Driven by
 * `scripts/dcf-benchmark.mjs`; not served in production.
 *
 *   GET /api/dev/dcf-benchmark?tickers=AAPL,ONON&raw=1
 *
 * `raw=1` also returns the fetched data, which the script freezes into the
 * fixtures the CI test replays.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dataService from "@/lib/api";
import { getSECFundamentals } from "@/lib/api/sec-edgar";
import { getFxRate } from "@/lib/api/yahoo";
import { evaluateCompany, type BenchmarkRaw } from "@/lib/dcf/benchmark";
import { needsFx } from "@/lib/dcf/company-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;
const MAX_TICKERS = 60;
const CONCURRENCY = 3;

async function fetchRaw(ticker: string): Promise<BenchmarkRaw> {
  const [quote, profile, financials, sec] = await Promise.all([
    dataService.getStockQuote(ticker).catch(() => null),
    dataService.getStockProfile(ticker).catch(() => null),
    dataService.getCompanyFinancials(ticker).catch(() => null),
    getSECFundamentals(ticker).catch(() => null),
  ]);
  const fx = needsFx(quote);
  const fxRate = fx ? await getFxRate(fx.from, fx.to).catch(() => null) : null;
  return {
    ticker,
    quote,
    profile: profile ? { name: profile.name ?? null, sector: profile.sector ?? null, industry: profile.industry ?? null } : null,
    financials,
    sec,
    fxRate,
  };
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const tickers = (req.nextUrl.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => TICKER_RE.test(t))
    .slice(0, MAX_TICKERS);
  const withRaw = req.nextUrl.searchParams.get("raw") === "1";
  if (tickers.length === 0) {
    return NextResponse.json({ error: "Pass ?tickers=AAPL,MSFT" }, { status: 400 });
  }

  const out: Array<{ result: ReturnType<typeof evaluateCompany>; raw?: BenchmarkRaw; error?: string }> = [];
  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      tickers.slice(i, i + CONCURRENCY).map(async (ticker) => {
        try {
          const raw = await fetchRaw(ticker);
          return { result: evaluateCompany(raw), ...(withRaw ? { raw } : {}) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            result: { ticker, verdict: "fail" as const, failures: [`Error: ${message}`], warnings: [], summary: null },
            error: message,
          };
        }
      })
    );
    out.push(...batch);
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), results: out });
}
