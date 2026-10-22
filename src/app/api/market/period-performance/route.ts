/**
 * Period returns per ticker (Radar, watchlists, portfolios)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   GET /api/market/period-performance?window=YTD&tickers=AAPL,MSFT
 *
 * A route handler rather than a Server Action for the reason given in
 * ../buyback-strength/route.ts: the browser runs actions one at a time, and
 * a window over the whole universe held search and the rest of the page
 * behind it.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dataService from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;
// The same cap as the batch Server Actions.
const MAX_TICKERS = 500;
const WINDOWS = ["1D", "1W", "1M", "YTD", "1Y", "ALL"] as const;
type Window = (typeof WINDOWS)[number];

export async function GET(req: NextRequest) {
  const window = req.nextUrl.searchParams.get("window") ?? "";
  if (!(WINDOWS as readonly string[]).includes(window)) {
    return NextResponse.json({ error: "Invalid window" }, { status: 400 });
  }
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
    return NextResponse.json(await dataService.getBatchPeriodPerformance(tickers, window as Window));
  } catch (error) {
    console.error("[period-performance] failed:", error);
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }
}
