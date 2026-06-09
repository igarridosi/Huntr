/**
 * Batch Quality Score Computation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Reads cached Yahoo Finance financials (cache_key = "financials-v2") from
 * Supabase, runs the quality-score engine for each ticker, and upserts the
 * results into the `stock_quality_scores` table.
 *
 * This module is server-only and is called by the Vercel Cron route:
 *   src/app/api/cron/quality-scores/route.ts
 *
 * Data source: Yahoo Finance only (per product specification).
 *   — Standard mode (4Y window) is used for all tickers.
 *   — Alpha Vantage deep-mode data is intentionally excluded here so scores
 *     remain consistent for the screener comparison universe.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateQualityScore } from "@/lib/calculations/quality-score";
import { mapTimeSeriesFinancials } from "@/lib/api/mappers";
import type { CompanyFinancials } from "@/types/financials";
import type { TimeSeriesFinancialsCache } from "@/types/yahoo";
import type { StockQuote } from "@/types/stock";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeQualityScoresOptions {
  /**
   * Recompute every ticker even if its score was recently computed.
   * Default: false (only tickers with stale/missing scores are processed)
   */
  force?: boolean;
  /**
   * Age threshold in milliseconds after which a score is considered stale.
   * Default: 6 days (cron runs weekly so 6d gives a comfortable buffer)
   */
  staleAgeMs?: number;
  /**
   * Number of tickers processed per Supabase upsert call.
   * Default: 200
   */
  upsertBatchSize?: number;
}

export interface ComputeQualityScoresResult {
  /** Total tickers found in the financials cache */
  total: number;
  /** Tickers for which quality scores were successfully computed + upserted */
  computed: number;
  /** Tickers skipped because their score is still fresh */
  skipped: number;
  /** Tickers where computation failed (malformed data, etc.) */
  failed: number;
  /** List of tickers that failed (capped at 50 for response payload size) */
  failedTickers: string[];
  /** Wall-clock duration in milliseconds */
  durationMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely extract a number from Yahoo's raw/fmt JSONB objects */
function extractYahooNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    const raw = obj.raw ?? obj.fmt;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string") {
      const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

// ─── Cache shape normalisation ───────────────────────────────────────────────
// `financials-v2` (Yahoo) stores TimeSeriesFinancialsCache:
//   { income: { annual, quarterly }, balance: { … }, cashflow: { … } }
//
// The quality engine and calculateQualityScore expect CompanyFinancials:
//   { income_statement: { annual, quarterly }, balance_sheet: { … }, cash_flow: { … } }
//
// Detect which shape we have and map to CompanyFinancials when needed.

function isTimeSeriesShape(data: unknown): data is TimeSeriesFinancialsCache {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const income = d.income as Record<string, unknown> | undefined;
  return Array.isArray(income?.annual);
}

function toCompanyFinancials(ticker: string, data: unknown): CompanyFinancials {
  if (isTimeSeriesShape(data)) {
    return mapTimeSeriesFinancials(ticker, data);
  }
  return data as CompanyFinancials;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run the full quality-score computation pipeline.
 *
 * Flow:
 *   1. Read all tickers with Yahoo financials cached (financials-v2)
 *   2. Optionally filter out recently-computed tickers (force=false)
 *   3. Read quote cache (price / market cap / beta / shares) in 500-ticker chunks
 *   4. Compute quality scores for each ticker
 *   5. Upsert results to stock_quality_scores in configurable batch sizes
 */
export async function computeQualityScores(
  options: ComputeQualityScoresOptions = {}
): Promise<ComputeQualityScoresResult> {
  const {
    force = false,
    staleAgeMs = 6 * 24 * 60 * 60 * 1000, // 6 days
    upsertBatchSize = 200,
  } = options;

  const startMs = Date.now();
  const supabase = createAdminClient();

  const result: ComputeQualityScoresResult = {
    total: 0,
    computed: 0,
    skipped: 0,
    failed: 0,
    failedTickers: [],
    durationMs: 0,
  };

  // ── Step 1: Read all Yahoo financials from cache ───────────────────────────
  // Only financials-v2 (Yahoo Finance) — Alpha Vantage excluded by design.
  const { data: finCacheRows, error: finErr } = await supabase
    .from("stock_cache")
    .select("ticker, data")
    .eq("cache_key", "financials-v2");

  if (finErr || !finCacheRows) {
    console.error("[QualityScores] Failed to read financials cache:", finErr?.message);
    result.durationMs = Date.now() - startMs;
    return result;
  }

  result.total = finCacheRows.length;

  // Build ticker → financials map
  const finDataMap = new Map<string, unknown>(
    finCacheRows.map((r) => [r.ticker, r.data])
  );

  let tickersToProcess = Array.from(finDataMap.keys());

  // ── Step 2: Skip fresh tickers (unless force=true) ─────────────────────────
  if (!force && tickersToProcess.length > 0) {
    const staleThreshold = new Date(Date.now() - staleAgeMs).toISOString();

    // Paginate to handle 800+ tickers (Supabase default page size is 1000)
    const freshSet = new Set<string>();
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: freshPage } = await supabase
        .from("stock_quality_scores")
        .select("ticker")
        .gt("computed_at", staleThreshold)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (!freshPage || freshPage.length === 0) break;
      for (const r of freshPage) freshSet.add(r.ticker);
      if (freshPage.length < pageSize) break;
      page++;
    }

    if (freshSet.size > 0) {
      const before = tickersToProcess.length;
      tickersToProcess = tickersToProcess.filter((t) => !freshSet.has(t));
      result.skipped = before - tickersToProcess.length;
    }
  } else if (force) {
    result.skipped = 0;
  }

  if (tickersToProcess.length === 0) {
    console.log("[QualityScores] All tickers are fresh — nothing to compute.");
    result.durationMs = Date.now() - startMs;
    return result;
  }

  console.log(
    `[QualityScores] Processing ${tickersToProcess.length} tickers ` +
    `(${result.skipped} skipped as fresh, ${result.total - tickersToProcess.length - result.skipped} not in list)`
  );

  // ── Step 3: Read quote cache for market data ───────────────────────────────
  // Needed by the quality engine: price, market cap, beta, shares outstanding
  const quoteMap = new Map<string, { price: number; marketCap: number; beta: number; shares: number }>();
  const SUPABASE_IN_LIMIT = 500;

  for (let i = 0; i < tickersToProcess.length; i += SUPABASE_IN_LIMIT) {
    const chunk = tickersToProcess.slice(i, i + SUPABASE_IN_LIMIT);

    const { data: quoteRows } = await supabase
      .from("stock_cache")
      .select("ticker, data")
      .in("ticker", chunk)
      .eq("cache_key", "quote");

    for (const row of quoteRows ?? []) {
      const raw = row.data as Record<string, unknown> | null;
      if (!raw) continue;

      const summaryDetail = raw.summaryDetail as Record<string, unknown> | null;
      const financialData = raw.financialData as Record<string, unknown> | null;
      const keyStats = raw.defaultKeyStatistics as Record<string, unknown> | null;

      const price = extractYahooNum(financialData?.currentPrice) ?? 0;
      const marketCap =
        extractYahooNum(summaryDetail?.marketCap) ??
        extractYahooNum(keyStats?.marketCap) ?? 0;
      const beta = extractYahooNum(summaryDetail?.beta) ?? 0;
      const shares = extractYahooNum(keyStats?.sharesOutstanding) ?? 0;

      quoteMap.set(row.ticker, { price, marketCap, beta, shares });
    }
  }

  // ── Step 4: Compute quality scores ────────────────────────────────────────
  type UpsertRow = {
    ticker: string;
    quality_overall: number;
    quality_profitability: number;
    quality_financial_health: number;
    quality_growth: number;
    quality_cash_generation: number;
    sector: string;
    mode: string;
    flags: string[];
    computed_at: string;
  };

  const upsertRows: UpsertRow[] = [];
  const computedAt = new Date().toISOString();

  for (const ticker of tickersToProcess) {
    try {
      const finData = finDataMap.get(ticker);
      if (!finData) {
        result.failed++;
        if (result.failedTickers.length < 50) result.failedTickers.push(ticker);
        continue;
      }

      // Normalise cache shape: financials-v2 stores TimeSeriesFinancialsCache,
      // not CompanyFinancials. Apply the same mapping that getFinancials() uses.
      const financials = toCompanyFinancials(ticker, finData);
      const annualCount = financials?.income_statement?.annual?.length ?? 0;

      // Require at least 2 annual periods for meaningful scores
      if (annualCount < 2) {
        result.skipped++;
        continue;
      }

      const q = quoteMap.get(ticker) ?? { price: 0, marketCap: 0, beta: 0, shares: 0 };

      // Construct minimal StockQuote — only fields consumed by the quality engine
      const minQuote: StockQuote = {
        ticker,
        price:               q.price,
        market_cap:          q.marketCap,
        shares_outstanding:  q.shares,
        beta:                q.beta,
        pe_ratio:            0,
        dividend_yield:      0,
        fifty_two_week_high: 0,
        fifty_two_week_low:  0,
        avg_volume:          0,
      };

      // Run the quality engine (Standard mode — Yahoo 4Y window)
      // No profile passed → sector auto-detected from financials data
      const qs = calculateQualityScore(financials, minQuote, null);

      upsertRows.push({
        ticker,
        quality_overall:          Math.round(qs.overall),
        quality_profitability:    Math.round(qs.dimensions[0].score),
        quality_financial_health: Math.round(qs.dimensions[2].score),
        quality_growth:           Math.round(qs.dimensions[1].score),
        quality_cash_generation:  Math.round(qs.dimensions[3].score),
        sector:                   qs.sector,
        mode:                     qs.mode,
        flags:                    qs.flags,
        computed_at:              computedAt,
      });

      result.computed++;
    } catch (err) {
      console.warn(`[QualityScores] Failed to compute for ${ticker}:`, err);
      result.failed++;
      if (result.failedTickers.length < 50) result.failedTickers.push(ticker);
    }
  }

  // ── Step 5: Upsert results to stock_quality_scores ─────────────────────────
  console.log(`[QualityScores] Upserting ${upsertRows.length} score rows…`);

  for (let i = 0; i < upsertRows.length; i += upsertBatchSize) {
    const batch = upsertRows.slice(i, i + upsertBatchSize);

    const { error: upsertErr } = await supabase
      .from("stock_quality_scores")
      .upsert(batch, { onConflict: "ticker" });

    if (upsertErr) {
      console.error(
        `[QualityScores] Upsert error (batch ${Math.floor(i / upsertBatchSize) + 1}):`,
        upsertErr.message
      );
    }
  }

  result.durationMs = Date.now() - startMs;

  console.log(
    `[QualityScores] Done in ${result.durationMs}ms — ` +
    `computed: ${result.computed}, skipped: ${result.skipped}, failed: ${result.failed}`
  );

  return result;
}
