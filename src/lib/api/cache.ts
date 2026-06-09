/**
 * Supabase-backed cache for Yahoo Finance data.
 *
 * Strategy: "Lazy Fetching" with TTL.
 *   - Table: `stock_cache` (ticker PK, data JSONB, last_updated timestamp)
 *   - TTL: 24 hours by default.
 *   - On cache hit within TTL → return stored data (no Yahoo call).
 *   - On cache miss or stale → fetch from Yahoo, store, return.
 *
 * This module is server-only (uses Supabase server client).
 */

import { createClient } from "@/lib/supabase/server";
import type { CompanyFinancials } from "@/types/financials";
import type { TimeSeriesFinancialsCache } from "@/types/yahoo";
import { mapTimeSeriesFinancials } from "@/lib/api/mappers";

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

/** Default cache TTL in milliseconds (24 hours). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HOT_CACHE_MAX_ENTRIES = 1500;

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface CacheRow {
  ticker: string;
  cache_key: string;
  data: unknown;
  last_updated: string;
}

export type CacheLookupStatus = "fresh" | "stale" | "miss";

export interface CacheLookupResult<T> {
  status: CacheLookupStatus;
  data: T | null;
  ageMs: number | null;
}

interface HotCacheEntry {
  data: unknown;
  lastUpdatedMs: number;
}

const hotCache = new Map<string, HotCacheEntry>();
const singleFlightMap = new Map<string, Promise<unknown>>();

function toCompositeKey(ticker: string, cacheKey: string): string {
  return `${ticker.toUpperCase()}:${cacheKey}`;
}

function touchHotCache(compositeKey: string, entry: HotCacheEntry): void {
  // Move to the end to keep insertion order as a cheap LRU signal.
  if (hotCache.has(compositeKey)) {
    hotCache.delete(compositeKey);
  }

  hotCache.set(compositeKey, entry);

  if (hotCache.size <= HOT_CACHE_MAX_ENTRIES) return;

  const oldest = hotCache.keys().next().value;
  if (typeof oldest === "string") {
    hotCache.delete(oldest);
  }
}

function computeCacheStatus(
  ageMs: number,
  ttlMs: number,
  staleWhileRevalidateMs: number
): CacheLookupStatus {
  if (ageMs <= ttlMs) return "fresh";
  if (staleWhileRevalidateMs > 0 && ageMs <= ttlMs + staleWhileRevalidateMs) {
    return "stale";
  }
  return "miss";
}

function buildLookupResult<T>(
  value: unknown,
  lastUpdatedMs: number,
  ttlMs: number,
  staleWhileRevalidateMs: number
): CacheLookupResult<T> {
  const ageMs = Date.now() - lastUpdatedMs;
  const status = computeCacheStatus(ageMs, ttlMs, staleWhileRevalidateMs);

  if (status === "miss") {
    return { status: "miss", data: null, ageMs };
  }

  return {
    status,
    data: value as T,
    ageMs,
  };
}

// ─────────────────────────────────────────────────────────
// Core Cache Operations
// ─────────────────────────────────────────────────────────

/**
 * Attempt to retrieve cached data for a ticker + key combination.
 * Returns null if no cache entry exists or TTL has expired.
 *
 * @param ticker   - Stock symbol (e.g. "AAPL")
 * @param cacheKey - Namespace key (e.g. "profile", "quote", "financials")
 * @param ttlMs    - Time-to-live override in ms (default: 24h)
 */
export async function getCachedData<T = Record<string, unknown>>(
  ticker: string,
  cacheKey: string,
  ttlMs: number = CACHE_TTL_MS
): Promise<T | null> {
  const lookup = await getCachedDataState<T>(ticker, cacheKey, ttlMs, 0);
  return lookup.status === "fresh" ? lookup.data : null;
}

/**
 * Retrieve cache data and its freshness status.
 *
 * `fresh`: valid within TTL.
 * `stale`: expired TTL but still within stale-while-revalidate window.
 * `miss`: no data or too old.
 */
export async function getCachedDataState<T = Record<string, unknown>>(
  ticker: string,
  cacheKey: string,
  ttlMs: number = CACHE_TTL_MS,
  staleWhileRevalidateMs: number = 0
): Promise<CacheLookupResult<T>> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);

    const hotEntry = hotCache.get(compositeKey);
    if (hotEntry) {
      const hotResult = buildLookupResult<T>(
        hotEntry.data,
        hotEntry.lastUpdatedMs,
        ttlMs,
        staleWhileRevalidateMs
      );

      if (hotResult.status !== "miss") {
        touchHotCache(compositeKey, hotEntry);
        return hotResult;
      }
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("stock_cache")
      .select("data, last_updated")
      .eq("ticker", normalizedTicker)
      .eq("cache_key", cacheKey)
      .single();

    if (error || !data) {
      return {
        status: "miss",
        data: null,
        ageMs: null,
      };
    }

    const row = data as CacheRow;
    const lastUpdatedMs = new Date(row.last_updated).getTime();
    if (!Number.isFinite(lastUpdatedMs)) {
      return {
        status: "miss",
        data: null,
        ageMs: null,
      };
    }

    touchHotCache(compositeKey, {
      data: row.data,
      lastUpdatedMs,
    });

    return buildLookupResult<T>(row.data, lastUpdatedMs, ttlMs, staleWhileRevalidateMs);
  } catch {
    // Supabase not configured or table missing — gracefully degrade
    console.warn(`[Cache] Failed to read cache for ${ticker}:${cacheKey}`);
    return {
      status: "miss",
      data: null,
      ageMs: null,
    };
  }
}

// ─────────────────────────────────────────────────────────
// Batch screener metrics extraction
// ─────────────────────────────────────────────────────────

export interface ScreenerMetrics {
  earnings_growth: number | null;
  revenue_growth: number | null;
  /**
   * Normalized P/E proxy — uses Operating Income TTM (last 4 quarters) as EPS base.
   * Excludes below-the-line extraordinary items (asset divestitures, M&A accounting, etc.).
   * Formula: Current Price / (TTM Operating NOPAT / Diluted Shares)
   * Returns null when insufficient quarterly data is cached.
   */
  normalized_pe: number | null;
  /**
   * Dividend payout ratio — dividends paid / net income (TTM).
   * Sourced from Yahoo summaryDetail.payoutRatio.
   * null when not yet cached (treat as enriched field in filter logic).
   */
  payout_ratio: number | null;
  /**
   * FCF Yield (TTM) = last annual free cash flow / market cap.
   * Computed from the financials cache when available.
   * null when financials are not yet cached for this ticker.
   */
  fcf_yield: number | null;
  /**
   * Platform quality scores (0–100) computed by the quality-score engine
   * on the cached CompanyFinancials. Sector-relative with default benchmarks
   * (no profile available in the screener batch pipeline).
   * null until the stock has been individually browsed and financials are cached.
   */
  quality_overall: number | null;
  quality_profitability: number | null;
  quality_financial_health: number | null;
  quality_cash_generation: number | null;
  /** ISO timestamp of when this metrics record was last populated from the cache */
  fetched_at: string | null;
}

/** Safely extract a number from Yahoo's normalized data or raw/fmt objects */
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

/**
 * Compute a normalized P/E ratio using Operating Income TTM.
 *
 * WHY: Yahoo Finance's trailing P/E uses GAAP net income which includes
 * extraordinary items (asset sales, M&A accounting gains, discontinued ops).
 * For companies like CI (Cigna, after divesting life insurance), this creates
 * artificially low P/E values (e.g. 2.4x instead of ~12x normalized).
 *
 * METHOD: Use Operating Income as the earnings base — it excludes:
 *   - Gains/losses on asset divestitures
 *   - Discontinued operations income
 *   - M&A accounting adjustments
 *   - Non-recurring below-the-line items
 *
 * Formula:
 *   TTM Operating EPS = Sum(operating_income last 4Q) × (1 − avgTaxRate) ÷ avgDilutedShares
 *   Normalized P/E = current_price / TTM Operating EPS
 *
 * @param data - CompanyFinancials JSON from Supabase cache
 * @param currentPrice - current market price (from ScreenerRow)
 */
function computeNormalizedPeFromFinancials(
  data: unknown,
  currentPrice: number
): number | null {
  if (!data || typeof data !== "object" || currentPrice <= 0) return null;
  const d = data as Record<string, unknown>;

  const incomeStatement = d.income_statement as Record<string, unknown> | undefined;
  const quarterly = incomeStatement?.quarterly as unknown[] | undefined;

  if (!Array.isArray(quarterly) || quarterly.length < 4) return null;

  // Sort descending by date (most recent first)
  const sorted = [...quarterly]
    .filter((r) => typeof r === "object" && r !== null)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        date: String(row.date ?? ""),
        operating_income: extractYahooNum(row.operating_income),
        income_tax: extractYahooNum(row.income_tax),
        pre_tax_income: extractYahooNum(row.pre_tax_income),
        shares_diluted: extractYahooNum(row.shares_outstanding_diluted),
      };
    })
    .filter((r) => r.date && r.operating_income !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length < 4) return null;

  const last4 = sorted.slice(0, 4);

  // TTM operating income
  const ttmOperatingIncome = last4.reduce((s, q) => s + (q.operating_income ?? 0), 0);
  if (ttmOperatingIncome <= 0) return null;

  // Average effective tax rate from last 4 quarters (capped 0–40%)
  const taxRates = last4
    .filter((q) => q.pre_tax_income !== null && q.pre_tax_income > 0 && q.income_tax !== null)
    .map((q) => Math.min(0.40, Math.max(0, (q.income_tax ?? 0) / (q.pre_tax_income ?? 1))));
  const avgTaxRate =
    taxRates.length > 0
      ? taxRates.reduce((s, r) => s + r, 0) / taxRates.length
      : 0.21; // fallback to ~US statutory rate

  // NOPAT (Net Operating Profit After Tax)
  const ttmNopat = ttmOperatingIncome * (1 - avgTaxRate);

  // Average diluted shares (prefer most recent non-zero value)
  const sharesSeries = last4
    .map((q) => q.shares_diluted)
    .filter((s): s is number => s !== null && s > 0);
  if (sharesSeries.length === 0) return null;
  const avgShares = sharesSeries[0]; // use most recent

  const operatingEps = ttmNopat / avgShares;
  if (operatingEps <= 0) return null;

  const normalizedPe = currentPrice / operatingEps;
  return Number.isFinite(normalizedPe) && normalizedPe > 0 && normalizedPe < 1000
    ? +normalizedPe.toFixed(1)
    : null;
}

/** Minimum |prior EPS| before we consider the YoY % meaningful. */
const MIN_EPS_BASE = 0.05;
/** Winsorization cap: EPS growth is clamped to ±500% (ratio ±5.0). */
const MAX_EPS_GROWTH_RATIO = 5.0;
/**
 * If EPS growth exceeds this threshold (100%), we run the ADR / currency sanity check
 * by cross-validating against a net-income-derived growth figure.
 */
const ADR_SANITY_THRESHOLD = 1.0;
/**
 * Minimum |prior TTM net income| in USD for the NI-based cross-check to be usable.
 * Below this the NI figures are too small to be meaningful.
 */
const MIN_NI_BASE_USD = 1_000_000; // $1 M

function winsorizeGrowth(v: number): number {
  return Math.min(MAX_EPS_GROWTH_RATIO, Math.max(-MAX_EPS_GROWTH_RATIO, v));
}

interface IncomeQuarterRow {
  date: string;
  eps: number | null;
  net_income: number | null;
  shares: number | null;
}

/**
 * Compute TTM Net-Income YoY growth from pre-sorted quarterly rows.
 *
 * Net income in USD is invariant to ADR ratio and per-share currency mismatch,
 * making it the correct cross-check signal when eps_diluted growth looks distorted.
 *
 * Returns null if data is insufficient or denominator is near zero.
 */
function computeNetIncomeGrowth(rows: IncomeQuarterRow[]): number | null {
  if (rows.length < 8) return null;

  const currentNI = rows.slice(0, 4).reduce((s, r) => s + (r.net_income ?? 0), 0);
  const priorNI   = rows.slice(4, 8).reduce((s, r) => s + (r.net_income ?? 0), 0);

  if (Math.abs(priorNI) < MIN_NI_BASE_USD || !Number.isFinite(priorNI) || !Number.isFinite(currentNI)) {
    return null;
  }
  const growth = (currentNI - priorNI) / Math.abs(priorNI);
  return Number.isFinite(growth) ? winsorizeGrowth(growth) : null;
}

/**
 * EPS Growth YoY — TTM diluted EPS (last 4 quarters) vs prior TTM (quarters 5–8).
 *
 * Base-effect guard: if |prior TTM EPS| < MIN_EPS_BASE ($0.05), the percentage
 * is mathematically distorted (e.g. MU near-zero → +756%). Return null instead.
 *
 * ADR / currency mismatch guard:
 *   For foreign companies listed as US ADRs (e.g. HSBC 1 ADR = 5 ordinary shares),
 *   Yahoo Finance sometimes provides eps_diluted in different bases across periods
 *   (GBP/ordinary-share for historical, USD/ADR for recent) or reports net income in
 *   the local reporting currency for older quarters. This creates phantom growth of
 *   exactly N × 100% where N is the ADR conversion ratio.
 *
 *   Detection: if |eps_growth| > ADR_SANITY_THRESHOLD (100%), cross-check against
 *   net-income-based growth (which is currency/ratio-invariant). If the two metrics
 *   diverge by more than 3×, the EPS figure is considered unreliable and the
 *   net-income growth is used instead.
 *
 * Winsorized at ±MAX_EPS_GROWTH_RATIO (±500%) to suppress remaining outliers.
 * Falls back to annual YoY when fewer than 8 quarterly rows are available.
 */
function computeEpsGrowthFromFinancials(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const incomeStatement = d.income_statement as Record<string, unknown> | undefined;

  // ── Quarterly path (preferred): TTM vs prior TTM ──────────────────────────
  const quarterlyRows = (incomeStatement?.quarterly as unknown[]) ?? [];
  if (Array.isArray(quarterlyRows) && quarterlyRows.length >= 8) {
    const sorted: IncomeQuarterRow[] = [...quarterlyRows]
      .filter((r) => typeof r === "object" && r !== null)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          date:       String(row.date ?? ""),
          eps:        extractYahooNum(row.eps_diluted),
          net_income: extractYahooNum(row.net_income),
          shares:     extractYahooNum(row.shares_outstanding_diluted),
        };
      })
      .filter((r) => r.date)
      .sort((a, b) => b.date.localeCompare(a.date)); // most-recent first

    // Only keep rows that have at least eps OR net_income
    const withEps = sorted.filter((r) => r.eps !== null);

    if (withEps.length >= 8) {
      const currentTTM = withEps.slice(0, 4).reduce((s, r) => s + r.eps!, 0);
      const priorTTM   = withEps.slice(4, 8).reduce((s, r) => s + r.eps!, 0);

      if (Math.abs(priorTTM) < MIN_EPS_BASE || !Number.isFinite(priorTTM) || !Number.isFinite(currentTTM)) {
        return null;
      }

      const epsGrowth = (currentTTM - priorTTM) / Math.abs(priorTTM);
      if (!Number.isFinite(epsGrowth)) return null;

      // ADR / currency sanity check ─────────────────────────────────────────
      // eps_diluted across periods can mix ADR vs ordinary-share bases or
      // GBP vs USD currency, making epsGrowth meaningless for foreign ADRs.
      // net_income growth is immune to per-share ratio and currency mismatches
      // because it is a single absolute USD number per period.
      if (Math.abs(epsGrowth) > ADR_SANITY_THRESHOLD) {
        const niGrowth = computeNetIncomeGrowth(sorted);

        if (niGrowth !== null) {
          const isEpsSuspicious =
            // EPS extreme, NI reasonable
            Math.abs(niGrowth) < ADR_SANITY_THRESHOLD &&
            Math.abs(epsGrowth) > Math.abs(niGrowth) * 3;

          if (isEpsSuspicious) {
            // eps_diluted is distorted (ADR ratio or currency mismatch).
            // Use NI-based growth — it is consistent across all periods.
            return winsorizeGrowth(niGrowth);
          }
        }
        // If NI growth is also extreme or unavailable, both might be legitimate
        // (e.g. genuine high-growth turnaround). Still winsorize.
      }

      return winsorizeGrowth(epsGrowth);
    }
  }

  // ── Annual fallback: latest annual EPS vs prior year ──────────────────────
  const annualRows = (incomeStatement?.annual as unknown[]) ?? [];
  if (!Array.isArray(annualRows) || annualRows.length < 2) return null;

  const sortedAnnual = [...annualRows]
    .filter((r) => typeof r === "object" && r !== null)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        date:       String(row.date ?? ""),
        eps:        extractYahooNum(row.eps_diluted),
        net_income: extractYahooNum(row.net_income),
        shares:     extractYahooNum(row.shares_outstanding_diluted),
      };
    })
    .filter((r) => r.eps !== null && r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sortedAnnual.length < 2) return null;

  const latest = sortedAnnual[sortedAnnual.length - 1].eps!;
  const prior  = sortedAnnual[sortedAnnual.length - 2].eps!;

  if (Math.abs(prior) < MIN_EPS_BASE || !Number.isFinite(prior) || !Number.isFinite(latest)) return null;
  const annualEpsGrowth = (latest - prior) / Math.abs(prior);
  if (!Number.isFinite(annualEpsGrowth)) return null;

  // Same ADR sanity check for annual path
  if (Math.abs(annualEpsGrowth) > ADR_SANITY_THRESHOLD && sortedAnnual.length >= 2) {
    const latestNI = sortedAnnual[sortedAnnual.length - 1].net_income;
    const priorNI  = sortedAnnual[sortedAnnual.length - 2].net_income;

    if (latestNI !== null && priorNI !== null && Math.abs(priorNI) >= MIN_NI_BASE_USD) {
      const niGrowth = (latestNI - priorNI) / Math.abs(priorNI);
      if (
        Number.isFinite(niGrowth) &&
        Math.abs(niGrowth) < ADR_SANITY_THRESHOLD &&
        Math.abs(annualEpsGrowth) > Math.abs(niGrowth) * 3
      ) {
        return winsorizeGrowth(niGrowth);
      }
    }
  }

  return winsorizeGrowth(annualEpsGrowth);
}

/**
 * Read screener metrics for many tickers at once.
 *
/**
 * Detect whether raw cache data is in the `TimeSeriesFinancialsCache` shape
 * (financials-v2) vs the `CompanyFinancials` shape (financials-alpha-v2 / legacy).
 *
 * `financials-v2` stores:  { income: { annual, quarterly }, balance: { … }, cashflow: { … } }
 * `CompanyFinancials` is:  { income_statement: { annual, quarterly }, balance_sheet: { … }, cash_flow: { … } }
 */
function isTimeSeriesShape(data: unknown): data is TimeSeriesFinancialsCache {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const income = d.income as Record<string, unknown> | undefined;
  return Array.isArray(income?.annual);
}

/**
 * Normalise raw cache data to `CompanyFinancials` regardless of which
 * shape was stored (TimeSeriesFinancialsCache or CompanyFinancials).
 */
function toCompanyFinancials(ticker: string, data: unknown): CompanyFinancials {
  if (isTimeSeriesShape(data)) {
    return mapTimeSeriesFinancials(ticker, data);
  }
  return data as CompanyFinancials;
}

/**
 * Read screener metrics for many tickers at once.
 *
 * Three-pass Supabase batch strategy (no Yahoo API calls):
 *   1. Query "quote" cache         → earnings/revenue growth, market cap, fetched_at.
 *   2. Query "financials" cache    → normalized_pe, FCF yield, EPS growth fallback/ADR fix.
 *   3. Query stock_quality_scores  → pre-computed quality scores (populated by weekly cron).
 *
 * Three Supabase queries total regardless of ticker count.
 */
export async function getBatchCachedScreenerMetrics(
  tickers: string[]
): Promise<Record<string, ScreenerMetrics>> {
  if (tickers.length === 0) return {};

  try {
    const normalizedTickers = tickers.map((t) => t.toUpperCase());
    const supabase = await createClient();

    // ── Pass 1: "quote" cache ────────────────────────────────────────────────
    const { data: quoteRows, error: quoteErr } = await supabase
      .from("stock_cache")
      .select("ticker, data, last_updated")
      .in("ticker", normalizedTickers)
      .eq("cache_key", "quote");

    const result: Record<string, ScreenerMetrics> = {};
    // Temp maps used in Pass 2
    const priceByTicker:     Record<string, number> = {};
    const marketCapByTicker: Record<string, number> = {};

    if (!quoteErr && quoteRows) {
      for (const row of quoteRows) {
        const raw = row.data as Record<string, unknown> | null;
        if (!raw) continue;
        const summaryDetail    = raw.summaryDetail            as Record<string, unknown> | null;
        const financialData    = raw.financialData            as Record<string, unknown> | null;
        const keyStats         = raw.defaultKeyStatistics     as Record<string, unknown> | null;

        const currentPrice = extractYahooNum(financialData?.currentPrice);
        if (currentPrice && currentPrice > 0) priceByTicker[row.ticker] = currentPrice;

        const marketCap = extractYahooNum(summaryDetail?.marketCap) ?? extractYahooNum(keyStats?.marketCap);
        if (marketCap && marketCap > 0) marketCapByTicker[row.ticker] = marketCap;

        const rawEarningsGrowth = extractYahooNum(financialData?.earningsGrowth);
        const rawRevenueGrowth  = extractYahooNum(financialData?.revenueGrowth);

        // Store the winsorized Yahoo value as-is. ADR / currency artifact detection
        // is done in Pass 2 where we can cross-check against actual NI figures.
        result[row.ticker] = {
          earnings_growth:      rawEarningsGrowth !== null ? winsorizeGrowth(rawEarningsGrowth) : null,
          revenue_growth:       rawRevenueGrowth,
          normalized_pe:        null,
          payout_ratio:         extractYahooNum(summaryDetail?.payoutRatio),
          fcf_yield:            null,
          quality_overall:      null,
          quality_profitability:null,
          quality_financial_health: null,
          quality_cash_generation:  null,
          fetched_at:           row.last_updated ?? null,
        };
      }
    }

    // ── Pass 2: financials cache ─────────────────────────────────────────────
    // Used for:
    //   a) normalized_pe (Operating NOPAT TTM / diluted shares)
    //   b) earnings_growth fallback / ADR artifact override
    //   c) FCF Yield = last annual FCF / market cap
    //   d) Platform quality scores (Overall, Profitability, Financial Health, Cash Generation)
    const { data: finRows } = await supabase
      .from("stock_cache")
      .select("ticker, data, cache_key")
      .in("ticker", normalizedTickers)
      .in("cache_key", ["financials-alpha-v2", "financials-v2"]);

    // Prefer alpha data over yahoo data when both exist
    const finByTicker: Record<string, { data: unknown; key: string }> = {};
    for (const row of finRows ?? []) {
      const existing = finByTicker[row.ticker];
      if (!existing || row.cache_key === "financials-alpha-v2") {
        finByTicker[row.ticker] = { data: row.data, key: row.cache_key };
      }
    }

    for (const ticker of normalizedTickers) {
      const fin = finByTicker[ticker];
      if (!fin) continue;

      const price     = priceByTicker[ticker]     ?? 0;
      const marketCap = marketCapByTicker[ticker] ?? 0;

      // Normalise to CompanyFinancials — financials-v2 stores TimeSeriesFinancialsCache,
      // financials-alpha-v2 stores CompanyFinancials directly.
      const financials = toCompanyFinancials(ticker, fin.data);

      // a) Normalized P/E
      const normPe = computeNormalizedPeFromFinancials(financials, price);

      // b+c) EPS growth fallback + ADR check
      const p2EpsGrowth = computeEpsGrowthFromFinancials(financials);

      // c) FCF Yield
      let fcfYield: number | null = null;
      try {
        const annualCF = [...(financials?.cash_flow?.annual ?? [])]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastFCF = annualCF[0]?.free_cash_flow;
        if (lastFCF != null && Number.isFinite(lastFCF) && marketCap > 0) {
          fcfYield = lastFCF / marketCap;
        }
      } catch { /* silently skip */ }

      if (result[ticker]) {
        if (normPe !== null)   result[ticker].normalized_pe = normPe;
        if (fcfYield !== null) result[ticker].fcf_yield     = fcfYield;

        const p1Growth = result[ticker].earnings_growth;
        if (p1Growth === null) {
          if (p2EpsGrowth !== null) result[ticker].earnings_growth = p2EpsGrowth;
        } else if (
          p2EpsGrowth !== null &&
          Math.abs(p1Growth) > ADR_SANITY_THRESHOLD &&
          Math.abs(p2EpsGrowth) < ADR_SANITY_THRESHOLD / 2 &&
          Math.abs(p1Growth) > Math.abs(p2EpsGrowth) * 5
        ) {
          result[ticker].earnings_growth = p2EpsGrowth;
        }
      } else {
        result[ticker] = {
          earnings_growth:          p2EpsGrowth,
          revenue_growth:           null,
          normalized_pe:            normPe,
          payout_ratio:             null,
          fcf_yield:                fcfYield,
          quality_overall:          null,
          quality_profitability:    null,
          quality_financial_health: null,
          quality_cash_generation:  null,
          fetched_at:               null,
        };
      }
    }

    // ── Pass 3: quality scores from pre-computed table ────────────────────────
    // A single SQL query replaces per-ticker quality engine invocations.
    // Scores are populated weekly by the cron job at /api/cron/quality-scores.
    //
    // IMPORTANT: most screener tickers never go through Pass 1 (no individual
    // getStockQuote call), so result[ticker] may not exist yet. We must create
    // a minimal entry for those tickers so their quality scores are surfaced to
    // the filter layer — otherwise mergeMetrics() has nothing to merge.
    const { data: qualityRows } = await supabase
      .from("stock_quality_scores")
      .select("ticker, quality_overall, quality_profitability, quality_financial_health, quality_cash_generation")
      .in("ticker", normalizedTickers);

    for (const qr of qualityRows ?? []) {
      if (!result[qr.ticker]) {
        // Ticker has a pre-computed quality score but no quote/financials cache
        // entry yet — create a minimal metrics stub so the scores are visible.
        result[qr.ticker] = {
          earnings_growth:          null,
          revenue_growth:           null,
          normalized_pe:            null,
          payout_ratio:             null,
          fcf_yield:                null,
          quality_overall:          null,
          quality_profitability:    null,
          quality_financial_health: null,
          quality_cash_generation:  null,
          fetched_at:               null,
        };
      }
      result[qr.ticker].quality_overall           = qr.quality_overall          ?? null;
      result[qr.ticker].quality_profitability     = qr.quality_profitability    ?? null;
      result[qr.ticker].quality_financial_health  = qr.quality_financial_health ?? null;
      result[qr.ticker].quality_cash_generation   = qr.quality_cash_generation  ?? null;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Store data in the cache. Uses upsert to handle both insert and update.
 *
 * @param ticker   - Stock symbol
 * @param cacheKey - Namespace key
 * @param data     - JSON-serializable data to cache
 */
export async function setCachedData(
  ticker: string,
  cacheKey: string,
  data: unknown
): Promise<void> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const lastUpdated = new Date().toISOString();
    const lastUpdatedMs = new Date(lastUpdated).getTime();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);

    touchHotCache(compositeKey, {
      data,
      lastUpdatedMs,
    });

    const supabase = await createClient();

    const { error } = await supabase.from("stock_cache").upsert(
      {
        ticker: normalizedTicker,
        cache_key: cacheKey,
        data,
        last_updated: lastUpdated,
      },
      { onConflict: "ticker,cache_key" }
    );

    if (error) {
      console.warn(`[Cache] Failed to write cache for ${normalizedTicker}:${cacheKey}`);
    }
  } catch {
    // Non-critical — log and continue
    console.warn(`[Cache] Failed to write cache for ${ticker}:${cacheKey}`);
  }
}

/**
 * Deduplicate concurrent async work per key (single-flight pattern).
 */
export async function withSingleFlight<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const existing = singleFlightMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = (async () => {
    try {
      return await operation();
    } finally {
      singleFlightMap.delete(key);
    }
  })();

  singleFlightMap.set(key, pending as Promise<unknown>);
  return pending;
}

/**
 * Invalidate (delete) a specific cache entry.
 */
export async function invalidateCache(
  ticker: string,
  cacheKey: string
): Promise<void> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);
    hotCache.delete(compositeKey);

    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", normalizedTicker)
      .eq("cache_key", cacheKey);
  } catch {
    console.warn(`[Cache] Failed to invalidate cache for ${ticker}:${cacheKey}`);
  }
}

/**
 * Invalidate ALL cache entries for a ticker (profile + quote + financials).
 */
export async function invalidateAllForTicker(ticker: string): Promise<void> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const prefix = `${normalizedTicker}:`;

    for (const key of Array.from(hotCache.keys())) {
      if (key.startsWith(prefix)) {
        hotCache.delete(key);
      }
    }

    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", normalizedTicker);
  } catch {
    console.warn(`[Cache] Failed to invalidate all cache for ${ticker}`);
  }
}
