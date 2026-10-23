/**
 * What The Hunting Ground plots for each company: Huntr's quality score,
 * free-cash-flow yield (converted for foreign filers) and, for financial
 * companies, the industry that decides whether they are placed
 * (src/lib/api/hunting-ground.ts).
 *
 *   GET /api/market/hunting-ground?tickers=AAPL,MSFT
 */

import { NextRequest, NextResponse } from "next/server";
import { getHuntingGround } from "@/lib/api/hunting-ground";

export const dynamic = "force-dynamic";
// The first read of a week can fetch a few dozen financial profiles.
export const maxDuration = 60;

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
    return NextResponse.json(await getHuntingGround(tickers));
  } catch (error) {
    console.error("[hunting-ground] failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}
