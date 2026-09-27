/**
 * Vercel Cron — forward EPS snapshots
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Records every active ticker's next-twelve-month EPS consensus (Yahoo's
 * earnings trend) once a trading day, so the Chart Builder's forward P/E
 * is point-in-time from the first run onwards instead of reconstructed.
 * Costs no Alpha Vantage calls.
 *
 * Schedule: see vercel.json → "30 22 * * 1-5" (after the US close, weekdays)
 *
 * Manual trigger:
 *   GET /api/cron/forward-eps?limit=900&offset=0
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordNtmSnapshot } from "@/lib/api/forward-eps";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;
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
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

  const startMs = Date.now();
  const supabase = createAdminClient();
  const { data: tickerRows, error } = await supabase.from("tickers").select("symbol").eq("is_active", true).order("symbol");
  if (error || !tickerRows) {
    return NextResponse.json({ ok: false, error: `Failed to read tickers: ${error?.message}` }, { status: 500 });
  }

  const symbols = tickerRows.map((r: { symbol: string }) => r.symbol).slice(offset, offset + limit);
  let recorded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    if (Date.now() - startMs > TIME_BUDGET_MS) break;
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((t) => recordNtmSnapshot(t)));
    for (const r of results) {
      if (r.status === "rejected") failed++;
      else if (r.value === null) skipped++;
      else recorded++;
    }
    processed += batch.length;
    if (i + BATCH_SIZE < symbols.length) await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }

  const durationMs = Date.now() - startMs;
  console.log(`[ForwardEps] ${processed}/${symbols.length} in ${durationMs}ms — recorded ${recorded}, skipped ${skipped}, failed ${failed}`);
  return NextResponse.json({
    ok: true,
    total: symbols.length,
    processed,
    recorded,
    skipped,
    failed,
    // When the time budget ran out, the next offset to call with.
    nextOffset: processed < symbols.length ? offset + processed : null,
    durationMs,
  });
}
