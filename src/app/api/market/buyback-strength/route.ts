/**
 * Buyback strength for the Opportunity Radar
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Last fiscal year's cut in share count, per ticker:
 *
 *   GET /api/market/buyback-strength?tickers=AAPL,MSFT
 *
 * A route handler rather than a Server Action on purpose. The browser runs
 * Server Actions one at a time, and on a cold cache this request reads a
 * filing per company in the universe (a minute or more): as an action it
 * held every other action on the page behind it, search included, until it
 * finished. Route handlers are plain requests and run alongside them.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dataService from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    return NextResponse.json(await dataService.getBatchBuybackStrength(tickers));
  } catch (error) {
    console.error("[buyback-strength] failed:", error);
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }
}
