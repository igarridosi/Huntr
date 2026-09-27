/**
 * Vercel Cron — screener fundamentals pre-warm
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The screener's margins, returns, leverage, EV/EBITDA, P/S and analyst
 * targets come from each ticker's cached quoteSummary ("quote" key), which
 * otherwise only exists for companies someone has opened. This refreshes
 * every active ticker whose entry is missing or older than a week, so those
 * filters cover the whole universe.
 *
 * Schedule: see vercel.json → "0 0 * * 0" (Sunday 00:00 UTC, before the
 * financials pre-warm at 01:00 and the quality scores at 02:00).
 *
 * Manual trigger:
 *   GET /api/cron/prewarm-quotes?limit=1000&force=false
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshQuoteCache } from "@/lib/api/yahoo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Stop starting batches with this much of maxDuration left, so the response still goes out. */
const TIME_BUDGET_MS = 270_000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") ?? "1000", 10)));
  const force = searchParams.get("force") === "true";

  const startMs = Date.now();
  const supabase = createAdminClient();
  const { data: tickerRows, error } = await supabase.from("tickers").select("symbol").eq("is_active", true);
  if (error || !tickerRows) {
    return NextResponse.json({ ok: false, error: `Failed to read tickers: ${error?.message}` }, { status: 500 });
  }
  const all = tickerRows.map((r: { symbol: string }) => r.symbol.toUpperCase());

  let toProcess = all;
  if (!force) {
    const fresh = new Set<string>();
    const threshold = new Date(Date.now() - STALE_AGE_MS).toISOString();
    for (let i = 0; i < all.length; i += 500) {
      const { data } = await supabase
        .from("stock_cache")
        .select("ticker")
        .eq("cache_key", "quote")
        .gt("last_updated", threshold)
        .in("ticker", all.slice(i, i + 500));
      for (const r of data ?? []) fresh.add(r.ticker);
    }
    toProcess = all.filter((t) => !fresh.has(t));
  }
  toProcess = toProcess.slice(0, limit);

  let warmed = 0;
  let failed = 0;
  let processed = 0;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    if (Date.now() - startMs > TIME_BUDGET_MS) break;
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((t) => refreshQuoteCache(t)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) warmed++;
      else failed++;
    }
    processed += batch.length;
    if (i + BATCH_SIZE < toProcess.length) await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }

  const durationMs = Date.now() - startMs;
  console.log(`[PrewarmQuotes] ${processed}/${toProcess.length} in ${durationMs}ms — warmed ${warmed}, failed ${failed}`);
  return NextResponse.json({
    ok: true,
    universe: all.length,
    toProcess: toProcess.length,
    processed,
    warmed,
    failed,
    remaining: toProcess.length - processed,
    durationMs,
  });
}
