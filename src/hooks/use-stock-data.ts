"use client";

import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import type {
  StockProfile,
  StockQuote,
  MarketIndexQuote,
  EarningsInsight,
} from "@/types/stock";
import type {
  CompanyFinancials,
  PeriodType,
} from "@/types/financials";
import type { SearchEntry } from "@/lib/mock-data/search-index";
import type { TranscriptDocument, TranscriptPeriod } from "@/types/transcript";
import {
  fetchStockProfile,
  fetchStockQuote,
  fetchFullStockData,
  fetchAllQuotes,
  fetchBatchPeriodPerformance,
  fetchBatchDailyHistory,
  fetchBatchIntradayTrend,
  fetchBatchBuybackStrength,
  fetchBatchEarningsInsights,
  fetchMarketIndices,
  fetchAllProfiles,
  fetchCompanyFinancials,
  fetchSearchTickers,
  fetchInsiderActivity,
  fetchInsiderFeed,
  fetchTranscriptPeriods,
  fetchTranscriptDocument,
  fetchScreenerMetrics,
} from "@/app/actions/stock";
import type { ScreenerMetrics } from "@/lib/api/cache";
import { fetchSECFundamentals } from "@/app/actions/stock";
import type { SECFundamentals } from "@/lib/api/sec-edgar";

// ---------- Stock Profile ----------

/**
 * `initialData` lets a server component that already fetched the record
 * (the ticker layout does, for its metadata) seed the cache, so the first
 * paint carries the data instead of a skeleton. `undefined` means "nothing
 * to seed"; a `null` result is a real answer and is kept as such.
 */
export function useStockProfile(
  ticker: string,
  options: { initialData?: StockProfile | null } = {}
) {
  return useQuery<StockProfile | null>({
    queryKey: QUERY_KEYS.STOCK_PROFILE(ticker),
    queryFn: () => fetchStockProfile(ticker),
    staleTime: STALE_TIMES.STATIC,
    enabled: !!ticker,
    initialData: options.initialData,
  });
}

export function useAllProfiles() {
  return useQuery<StockProfile[]>({
    queryKey: ["stock", "profiles", "all"],
    queryFn: () => fetchAllProfiles(),
    staleTime: STALE_TIMES.STATIC,
  });
}

// ---------- Stock Quote ----------

export function useStockQuote(
  ticker: string,
  options: { initialData?: StockQuote | null } = {}
) {
  return useQuery<StockQuote | null>({
    queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
    queryFn: () => fetchStockQuote(ticker),
    staleTime: STALE_TIMES.QUOTE,
    enabled: !!ticker,
    initialData: options.initialData,
  });
}

/**
 * Balance-sheet figures from the filings themselves.
 *
 * Cached for a day: these move quarterly, and the SEC asks callers not to
 * hammer it. Returning null is a normal outcome - a foreign issuer or a ticker
 * with no CIK - and the caller falls back to Yahoo.
 */
export function useSECFundamentals(ticker: string, enabled: boolean = true) {
  return useQuery<SECFundamentals | null>({
    queryKey: ["sec", "fundamentals", ticker.toUpperCase()],
    queryFn: () => fetchSECFundamentals(ticker),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: enabled && !!ticker,
  });
}

export function useFullStockData(ticker: string) {
  return useQuery<{
    profile: StockProfile | null;
    quote: StockQuote | null;
    financials: CompanyFinancials | null;
    financialsSource?: "alpha-cache" | "yahoo" | "mock";
  }>({
    queryKey: ["stock", "full", ticker],
    queryFn: () => fetchFullStockData(ticker),
    staleTime: STALE_TIMES.QUOTE,
    refetchInterval: (query) =>
      query.state.data?.financials ? false : 15_000,
    refetchIntervalInBackground: true,
    enabled: !!ticker,
  });
}

export function useAllQuotes() {
  return useQuery<StockQuote[]>({
    queryKey: ["stock", "quotes", "all"],
    queryFn: () => fetchAllQuotes(),
    staleTime: STALE_TIMES.QUOTE,
  });
}

export function useMarketIndices() {
  return useQuery<MarketIndexQuote[]>({
    queryKey: QUERY_KEYS.MARKET_INDICES,
    queryFn: () => fetchMarketIndices(),
    staleTime: STALE_TIMES.INDICES,
    refetchInterval: STALE_TIMES.INDICES,
    refetchIntervalInBackground: true,
  });
}

export function useBatchPeriodPerformance(
  tickers: string[],
  window: "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL",
  enabled: boolean = true
) {
  const normalized = Array.from(
    new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))
  );
  const tickersKey = normalized.join(",");

  return useQuery<Record<string, number>>({
    queryKey: QUERY_KEYS.STOCK_PERFORMANCE(window, tickersKey),
    queryFn: () => fetchBatchPeriodPerformance(normalized, window),
    staleTime: STALE_TIMES.QUOTE,
    enabled: enabled && normalized.length > 0,
  });
}

export function useBatchDailyHistory(
  tickers: string[],
  window: "1W" | "1M" | "YTD" | "1Y" | "ALL",
  enabled: boolean = true
) {
  const normalized = Array.from(
    new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))
  );
  const tickersKey = normalized.join(",");

  return useQuery<Record<string, Array<{ date: string; close: number }>>>({
    queryKey: QUERY_KEYS.STOCK_DAILY_HISTORY(window, tickersKey),
    queryFn: () => fetchBatchDailyHistory(normalized, window),
    staleTime: STALE_TIMES.QUOTE,
    enabled: enabled && normalized.length > 0,
  });
}

export function useBatchIntradayTrend(
  tickers: string[],
  enabled: boolean = true
) {
  const normalized = Array.from(
    new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))
  );
  const tickersKey = normalized.join(",");

  return useQuery<Record<string, number[]>>({
    queryKey: QUERY_KEYS.STOCK_INTRADAY_TREND(tickersKey),
    queryFn: () => fetchBatchIntradayTrend(normalized),
    staleTime: STALE_TIMES.QUOTE,
    enabled: enabled && normalized.length > 0,
  });
}

export function useBatchBuybackStrength(
  tickers: string[],
  enabled: boolean = true
) {
  const normalized = Array.from(
    new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))
  );
  const tickersKey = normalized.join(",");

  return useQuery<Record<string, number>>({
    queryKey: QUERY_KEYS.STOCK_BUYBACK(tickersKey),
    queryFn: () => fetchBatchBuybackStrength(normalized),
    staleTime: STALE_TIMES.STATIC,
    enabled: enabled && normalized.length > 0,
  });
}

export function useBatchEarningsInsights(
  tickers: string[],
  enabled: boolean = true
) {
  const normalized = Array.from(
    new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))
  );
  const tickersKey = normalized.join(",");

  return useQuery<Record<string, EarningsInsight>>({
    queryKey: QUERY_KEYS.STOCK_EARNINGS_INSIGHTS(tickersKey),
    queryFn: () => fetchBatchEarningsInsights(normalized),
    staleTime: STALE_TIMES.QUOTE,
    enabled: enabled && normalized.length > 0,
  });
}

// ---------- Financials ----------

export function useFinancials(
  ticker: string,
  periodType: PeriodType = "annual",
  enabled: boolean = true
) {
  return useQuery<CompanyFinancials | null>({
    queryKey: [...QUERY_KEYS.FINANCIALS(ticker), periodType],
    queryFn: () => fetchCompanyFinancials(ticker),
    staleTime: STALE_TIMES.FINANCIALS,
    refetchInterval: (query) => (query.state.data ? false : 15_000),
    refetchIntervalInBackground: true,
    enabled: enabled && !!ticker,
  });
}

// ---------- Search ----------

export function useSearch(query: string, limit = 10) {
  return useQuery<SearchEntry[]>({
    queryKey: QUERY_KEYS.SEARCH(query),
    queryFn: () => fetchSearchTickers(query, limit),
    staleTime: STALE_TIMES.SEARCH,
    // Search is always enabled — returns popular results for empty query
    enabled: true,
  });
}

// ---------- Insiders ----------

/**
 * Insider activity for one ticker. A cold ticker costs a burst of SEC
 * requests on the server, so the result is held for the same six hours
 * the server caches it and never refetched on focus.
 */
export function useInsiderActivity(ticker: string, enabled: boolean = true) {
  const t = ticker.trim().toUpperCase();
  return useQuery({
    queryKey: QUERY_KEYS.INSIDERS(t),
    queryFn: () => fetchInsiderActivity(t),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && t.length > 0,
  });
}

export function useInsiderFeed(tickers: string[], enabled: boolean = true) {
  const normalized = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))).sort();
  return useQuery({
    queryKey: QUERY_KEYS.INSIDER_FEED(normalized.join(",")),
    queryFn: () => fetchInsiderFeed(normalized),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && normalized.length > 0,
  });
}

// ---------- Transcripts ----------

export function useTranscriptPeriods(ticker: string, enabled: boolean = true) {
  return useQuery<TranscriptPeriod[]>({
    queryKey: QUERY_KEYS.TRANSCRIPT_PERIODS(ticker.toUpperCase()),
    queryFn: () => fetchTranscriptPeriods(ticker),
    staleTime: STALE_TIMES.STATIC,
    enabled: enabled && !!ticker,
  });
}

export function useTranscriptDocument(
  ticker: string,
  year: number | null,
  quarter: number | null,
  enabled: boolean = true
) {
  return useQuery<TranscriptDocument | null>({
    queryKey: QUERY_KEYS.TRANSCRIPT_DOCUMENT(
      ticker.toUpperCase(),
      year ?? 0,
      quarter ?? 0
    ),
    queryFn: () => fetchTranscriptDocument(ticker, year ?? 0, quarter ?? 0),
    staleTime: STALE_TIMES.STATIC,
    enabled: enabled && !!ticker && year != null && quarter != null,
  });
}

// ---------- Screener enrichment metrics (beta, earnings_growth, revenue_growth) ----------

/**
 * Fetches beta + earnings/revenue growth for a list of tickers.
 * Uses two-pass strategy: Supabase cache first, individual fetch for misses.
 * Intended to enrich the screener page — only call with the VISIBLE page tickers
 * (≤ PAGE_SIZE) to avoid hammering the API.
 */
export function useScreenerMetrics(
  tickers: string[],
  enabled = true
) {
  const key = tickers.slice().sort().join(",");
  return useQuery<Record<string, ScreenerMetrics>>({
    queryKey: ["screener", "metrics", key],
    queryFn: () => fetchScreenerMetrics(tickers),
    staleTime: STALE_TIMES.FINANCIALS, // 15 min — these don't change often
    enabled: enabled && tickers.length > 0,
  });
}
