/**
 * What The Hunting Ground plots for each company: Huntr's quality score and
 * free-cash-flow yield, read from our caches only.
 *
 *   GET /api/market/hunting-ground?tickers=AAPL,MSFT
 */

import { NextRequest, NextResponse } from "next/server";
import { getHuntingGroundMetrics } from "@/lib/api/cache";

export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;
// The same cap as the batch Server Actions.
const MAX_TICKERS = 500;

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
    return NextResponse.json(await getHuntingGroundMetrics(tickers));
  } catch (error) {
    console.error("[hunting-ground] failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}
