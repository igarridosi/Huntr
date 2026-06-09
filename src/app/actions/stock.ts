"use server";

import * as dataService from "@/lib/api";
import type {
  StockProfile,
  StockQuote,
  MarketIndexQuote,
  EarningsInsight,
} from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";
import type { SearchEntry } from "@/lib/mock-data/search-index";
import type { EarningsDetailData } from "@/lib/api";
import { prewarmEarningsDetailCacheForTickers as prewarmEarningsDetailCacheForTickersService } from "@/lib/api/earnings-detail";
import { getFinancialsFromAlphaVantage, isAlphaThrottleError, readAlphaThrottleState } from "@/lib/api/alphavantage";
import { getCachedDataState, setCachedData, withSingleFlight, getBatchCachedScreenerMetrics } from "@/lib/api/cache";
import type { ScreenerMetrics } from "@/lib/api/cache";
import type { TranscriptDocument, TranscriptPeriod } from "@/types/transcript";

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;
// 500 covers large portfolios/watchlists for authenticated users.
// Server Actions are already session-gated by middleware.
const BATCH_TICKER_LIMIT = 500;

function sanitizeTicker(ticker: unknown): string {
  if (typeof ticker !== "string") throw new Error("Invalid ticker");
  const t = ticker.trim().toUpperCase();
  if (!TICKER_RE.test(t)) throw new Error(`Invalid ticker: ${ticker}`);
  return t;
}

function sanitizeTickers(tickers: unknown): string[] {
  if (!Array.isArray(tickers)) throw new Error("tickers must be an array");
  if (tickers.length > BATCH_TICKER_LIMIT)
    throw new Error(`Batch size exceeds limit of ${BATCH_TICKER_LIMIT}`);
  return tickers.map(sanitizeTicker);
}

export async function fetchStockProfile(
  ticker: string
): Promise<StockProfile | null> {
  return dataService.getStockProfile(sanitizeTicker(ticker));
}

export async function fetchAllProfiles(): Promise<StockProfile[]> {
  return dataService.getAllProfiles();
}

export async function fetchStockQuote(
  ticker: string
): Promise<StockQuote | null> {
  return dataService.getStockQuote(sanitizeTicker(ticker));
}

export async function fetchAllQuotes(): Promise<StockQuote[]> {
  return dataService.getAllQuotes();
}

export async function fetchMarketIndices(): Promise<MarketIndexQuote[]> {
  return dataService.getMarketIndices();
}

const VALID_WINDOWS = new Set(["1D", "1W", "1M", "YTD", "1Y", "ALL"]);

export async function fetchBatchPeriodPerformance(
  tickers: string[],
  window: "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, number>> {
  if (!VALID_WINDOWS.has(window)) throw new Error(`Invalid window: ${window}`);
  return dataService.getBatchPeriodPerformance(sanitizeTickers(tickers), window);
}

const VALID_HISTORY_WINDOWS = new Set(["1W", "1M", "YTD", "1Y", "ALL"]);

export async function fetchBatchDailyHistory(
  tickers: string[],
  window: "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, Array<{ date: string; close: number }>>> {
  if (!VALID_HISTORY_WINDOWS.has(window))
    throw new Error(`Invalid window: ${window}`);
  return dataService.getBatchDailyHistory(sanitizeTickers(tickers), window);
}

export async function fetchBatchIntradayTrend(
  tickers: string[]
): Promise<Record<string, number[]>> {
  return dataService.getBatchIntradayTrend(sanitizeTickers(tickers));
}

export async function fetchBatchBuybackStrength(
  tickers: string[]
): Promise<Record<string, number>> {
  return dataService.getBatchBuybackStrength(sanitizeTickers(tickers));
}

export async function fetchBatchEarningsInsights(
  tickers: string[]
): Promise<Record<string, EarningsInsight>> {
  return dataService.getBatchEarningsInsights(sanitizeTickers(tickers));
}

export async function fetchCompanyFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  return dataService.getCompanyFinancials(sanitizeTicker(ticker));
}

export async function fetchAlphaFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!alphaKey) return null;

  const normalizedTicker = sanitizeTicker(ticker);
  const cached = await getCachedDataState<CompanyFinancials>(
    normalizedTicker,
    "financials-alpha-v2",
    12 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000
  );

  if (cached.status !== "miss" && cached.data) {
    return cached.data;
  }

  return withSingleFlight(`${normalizedTicker}:financials-alpha-v2:fetch`, async () => {
    const alphaFinancials = await getFinancialsFromAlphaVantage(normalizedTicker, alphaKey);

    if (!alphaFinancials) {
      throw new Error("ALPHA_VANTAGE_DATA_UNAVAILABLE");
    }

    await setCachedData(normalizedTicker, "financials-alpha-v2", alphaFinancials);
    return alphaFinancials;
  }).catch((error) => {
    if (isAlphaThrottleError(error)) {
      throw new Error("ALPHA_VANTAGE_LIMIT_REACHED");
    }
    throw error;
  });
}

export async function getAlphaAvailability(): Promise<{
  available: boolean;
  reason?: "throttled" | "not_configured";
}> {
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!alphaKey) return { available: false, reason: "not_configured" };

  const throttleState = await readAlphaThrottleState(alphaKey);
  return throttleState ? { available: false, reason: "throttled" } : { available: true };
}

export async function fetchSearchTickers(
  query: string,
  limit: number = 10
): Promise<SearchEntry[]> {
  return dataService.searchTickers(query, limit);
}

export async function fetchFullStockData(ticker: string) {
  return dataService.getFullStockData(sanitizeTicker(ticker));
}

export async function fetchDefaultWatchlistTickers(): Promise<string[]> {
  return dataService.getWatchlistTickers();
}

export async function fetchEarningsDetailData(
  ticker: string,
  historyLimit?: number
): Promise<EarningsDetailData> {
  return dataService.getEarningsDetailData(sanitizeTicker(ticker), historyLimit);
}

export async function prewarmEarningsDetailCacheForTickers(
  tickers: string[]
): Promise<{ total: number; warmed: number; failed: string[] }> {
  return prewarmEarningsDetailCacheForTickersService(sanitizeTickers(tickers));
}

export async function fetchTranscriptPeriods(
  ticker: string
): Promise<TranscriptPeriod[]> {
  return dataService.getTranscriptPeriods(sanitizeTicker(ticker));
}

export async function fetchTranscriptDocument(
  ticker: string,
  year: number,
  quarter: number
): Promise<TranscriptDocument | null> {
  const t = sanitizeTicker(ticker);
  const y = Math.trunc(Number(year));
  const q = Math.trunc(Number(quarter));
  if (!Number.isFinite(y) || y < 1990 || y > 2100)
    throw new Error("Invalid year");
  if (q < 1 || q > 4) throw new Error("Invalid quarter");
  return dataService.getTranscriptDocument(t, y, q);
}

/**
 * Fetch screener metrics from Supabase cache only — safe to call with many tickers.
 * No Yahoo API calls. Used to enrich ALL rows before filtering.
 *
 * NOTE: does NOT use sanitizeTickers() because that function enforces
 * BATCH_TICKER_LIMIT (500) which is designed to protect Yahoo API rate limits.
 * This function only reads from Supabase so it is safe with 1000+ tickers.
 */
export async function fetchAllCachedScreenerMetrics(
  tickers: string[]
): Promise<Record<string, ScreenerMetrics>> {
  if (!Array.isArray(tickers) || tickers.length === 0) return {};
  if (tickers.length > 2000) throw new Error("Screener universe exceeds 2000 tickers");
  // Validate each ticker individually (no batch size limit for this endpoint)
  const sanitized = tickers.map(sanitizeTicker);
  return getBatchCachedScreenerMetrics(sanitized);
}

/**
 * Fetch screener metrics for a SMALL batch (visible page, ≤ PAGE_SIZE).
 * Strategy:
 *   1. Read from Supabase "quote" cache (one query).
 *   2. For any ticker still missing, trigger individual getStockQuote() —
 *      this hits Yahoo quoteSummary (financialData + summaryDetail) and caches result.
 *   3. Re-read from cache after population.
 * Only call with ≤ 20 tickers to avoid rate limits.
 */
export async function fetchScreenerMetrics(
  tickers: string[]
): Promise<Record<string, ScreenerMetrics>> {
  const sanitized = sanitizeTickers(tickers);
  if (sanitized.length === 0) return {};

  // Safety: never fire more than 20 individual Yahoo requests at once
  const safeList = sanitized.slice(0, 20);

  // Pass 1: batch Supabase cache read
  const cached = await getBatchCachedScreenerMetrics(safeList);

  // Pass 2: fire individual quoteSummary for tickers still missing earnings/revenue growth.
  // This hits Yahoo quoteSummary (financialData + summaryDetail) and caches the result.
  // Quality scores and FCF yield are then computed from the financials cache in the
  // batch getBatchCachedScreenerMetrics call.
  const missing = safeList.filter(
    (t) =>
      !cached[t] ||
      (cached[t].earnings_growth === null && cached[t].revenue_growth === null)
  );

  if (missing.length > 0) {
    await Promise.allSettled(missing.map((t) => dataService.getStockQuote(t)));
    const fresh = await getBatchCachedScreenerMetrics(missing);
    Object.assign(cached, fresh);
  }

  return cached;
}
