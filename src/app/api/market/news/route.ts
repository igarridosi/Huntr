/**
 * Headlines per symbol for the Insights news row
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   GET /api/market/news?symbols=NVDA,^GSPC
 *
 * The page picks the symbols (today's notable movers and indices, see
 * src/lib/market-news.ts) from data it already has; this only fetches their
 * recent headlines, cached per symbol for 15 minutes. A route handler, not a
 * Server Action: the browser runs actions one at a time, and this must not
 * hold search or anything else behind it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSymbolNews } from "@/lib/api/yahoo";
import { FEATURES } from "@/lib/constants";
import type { NewsItem } from "@/lib/market-news";

export const dynamic = "force-dynamic";

// Futures (GC=F) and crypto pairs (BTC-USD) too.
const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,12}$/;
// The Stocks row's sixteen candidates; the Markets row asks for seven.
const MAX_SYMBOLS = 16;

export async function GET(req: NextRequest) {
  const symbols = Array.from(
    new Set(
      (req.nextUrl.searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (symbols.length === 0 || symbols.length > MAX_SYMBOLS || !symbols.every((s) => SYMBOL_RE.test(s))) {
    return NextResponse.json({ error: "Invalid symbols" }, { status: 400 });
  }
  if (!FEATURES.ENABLE_REAL_API) return NextResponse.json({});

  // One symbol failing leaves its card out, not the row.
  const entries = await Promise.all(
    symbols.map(async (symbol): Promise<[string, NewsItem[]]> => [symbol, await getSymbolNews(symbol).catch(() => [])])
  );
  return NextResponse.json(Object.fromEntries(entries));
}
