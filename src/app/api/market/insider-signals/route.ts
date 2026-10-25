/**
 * What the insiders of a list of companies have done, from what Huntr has
 * already read: never a request to EDGAR, so a watchlist of fifty costs no
 * SEC traffic. A company never opened in Tracks is simply absent.
 *
 *   GET /api/market/insider-signals?tickers=AAPL,MSFT
 */

import { NextRequest, NextResponse } from "next/server";
import { getCachedInsiderActivity } from "@/lib/api/sec-form4";
import { toInsiderSignal, type InsiderSignal } from "@/lib/insiders/signal";

export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;
const MAX_TICKERS = 100;

export async function GET(req: NextRequest) {
  const tickers = Array.from(
    new Set(
      (req.nextUrl.searchParams.get("tickers") ?? "")
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (tickers.length === 0 || tickers.length > MAX_TICKERS || !tickers.every((t) => TICKER_RE.test(t))) {
    return NextResponse.json({ error: "Invalid tickers" }, { status: 400 });
  }
  try {
    const found = await Promise.all(tickers.map((t) => getCachedInsiderActivity(t).catch(() => null)));
    const out: Record<string, InsiderSignal> = {};
    found.forEach((a, i) => {
      if (a) out[tickers[i]] = toInsiderSignal(a.summary);
    });
    return NextResponse.json(out);
  } catch (error) {
    console.error("[insider-signals] failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}
