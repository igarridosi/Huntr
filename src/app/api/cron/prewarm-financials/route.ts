/**
 * Vercel Cron — Yahoo Financials Pre-warm
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches Yahoo Finance fundamentals for all tickers in the screener universe
 * that do NOT yet have a fresh `financials-v2` cache entry, then stores them
 * in Supabase so the quality-score cron (runs 1 hour later) can compute scores
 * for the full 800+ ticker universe.
 *
 * Schedule: see vercel.json → "0 1 * * 0" (Sunday 01:00 UTC)
 *   — Runs 1 hour before the quality-scores cron at 02:00 UTC.
 *
 * Manual trigger (full initial population):
 *   GET /api/cron/prewarm-financials?limit=900
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Query params:
 *   limit   Max tickers to process in this invocation (default 150, max 900)
 *   force   If "true", re-fetches even tickers with recent cache (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinancials } from "@/lib/api/yahoo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Parallel tickers per batch — keeps Yahoo request concurrency manageable
const BATCH_SIZE = 10;
// Delay between batches in ms — avoids Yahoo rate-limit throttling
const BATCH_DELAY_MS = 250;
// How old a cache entry can be before we consider it stale (7 days)
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // ── 1. Authorization ───────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse params ────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const limit = Math.min(900, Math.max(1, parseInt(searchParams.get("limit") ?? "150", 10)));
  const force = searchParams.get("force") === "true";

  const startMs = Date.now();
  const supabase = createAdminClient();

  console.log(`[Prewarm] Starting — limit=${limit}, force=${force}`);

  // ── 3. Read all active tickers from the search index ──────────────────────
  const { data: tickerRows, error: tickerErr } = await supabase
    .from("tickers")
    .select("symbol")
    .eq("is_active", true);

  if (tickerErr || !tickerRows) {
    return NextResponse.json(
      { ok: false, error: `Failed to read tickers: ${tickerErr?.message}` },
      { status: 500 }
    );
  }

  const allSymbols = tickerRows.map((r: { symbol: string }) => r.symbol);

  // ── 4. Find tickers that already have fresh financials ────────────────────
  let toProcess = allSymbols;

  if (!force) {
    const staleThreshold = new Date(Date.now() - STALE_AGE_MS).toISOString();

    // Read in 500-ticker chunks to avoid PostgREST URL length limit
    const freshSet = new Set<string>();
    for (let i = 0; i < allSymbols.length; i += 500) {
      const chunk = allSymbols.slice(i, i + 500);
      const { data: freshRows } = await supabase
        .from("stock_cache")
        .select("ticker")
        .eq("cache_key", "financials-v2")
        .gt("last_updated", staleThreshold)
        .in("ticker", chunk);

      for (const r of freshRows ?? []) freshSet.add(r.ticker);
    }

    toProcess = allSymbols.filter((s) => !freshSet.has(s));
    console.log(
      `[Prewarm] ${allSymbols.length} total — ${freshSet.size} fresh — ${toProcess.length} to fetch`
    );
  }

  // Apply the per-invocation limit
  toProcess = toProcess.slice(0, limit);

  if (toProcess.length === 0) {
    return NextResponse.json({
      ok: true,
      total: allSymbols.length,
      toProcess: 0,
      warmed: 0,
      failed: 0,
      failedTickers: [],
      durationMs: Date.now() - startMs,
    });
  }

  console.log(`[Prewarm] Fetching financials for ${toProcess.length} tickers…`);

  // ── 5. Fetch Yahoo financials in parallel batches ─────────────────────────
  let warmed = 0;
  let failed = 0;
  const failedTickers: string[] = [];

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((ticker) =>
        // preferAlphaVantage: false → always fetches from Yahoo, caches as "financials-v2"
        getFinancials(ticker, { preferAlphaVantage: false })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const ticker = batch[j];
      if (result.status === "fulfilled" && result.value !== null) {
        warmed++;
      } else {
        failed++;
        if (failedTickers.length < 50) failedTickers.push(ticker);
        if (result.status === "rejected") {
          console.warn(`[Prewarm] Failed for ${ticker}:`, result.reason);
        }
      }
    }

    // Delay between batches to avoid Yahoo throttling
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const durationMs = Date.now() - startMs;

  console.log(
    `[Prewarm] Done in ${durationMs}ms — warmed: ${warmed}, failed: ${failed}`
  );

  return NextResponse.json({
    ok: true,
    total: allSymbols.length,
    toProcess: toProcess.length,
    warmed,
    failed,
    failedTickers,
    durationMs,
  });
}
