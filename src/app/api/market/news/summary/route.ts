/**
 * The summary shown in the Insights news preview.
 *
 *   GET /api/market/news/summary?symbol=^GSPC&id=<story id>
 *
 * Names a story already in that symbol's cached news; the server looks up
 * its link itself (see src/lib/api/news-summary.ts), so no URL is taken from
 * the request.
 */

import { NextRequest, NextResponse } from "next/server";
import { getNewsSummary } from "@/lib/api/news-summary";
import { FEATURES } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Futures (GC=F) and crypto pairs (BTC-USD) too.
const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,12}$/;
const ID_RE = /^[A-Za-z0-9\-]{1,64}$/;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!SYMBOL_RE.test(symbol) || !ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid story" }, { status: 400 });
  }
  if (!FEATURES.ENABLE_REAL_API) return NextResponse.json({ summary: null });

  // A failed read answers 502, not "no summary": the browser keeps what it
  // gets for the session, and a passing failure must not stick.
  const summary = await getNewsSummary(symbol, id).catch(() => undefined);
  if (summary === undefined) return NextResponse.json({ error: "Summary unavailable" }, { status: 502 });
  return NextResponse.json({ summary });
}
