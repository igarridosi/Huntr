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
} from "@/app/actions/stock";

// ---------- Stock Profile ----------

export function useStockProfile(ticker: string) {
  return useQuery<StockProfile | null>({
    queryKey: QUERY_KEYS.STOCK_PROFILE(ticker),
    queryFn: () => fetchStockProfile(ticker),
    staleTime: STALE_TIMES.STATIC,
    enabled: !!ticker,
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

export function useStockQuote(ticker: string) {
  return useQuery<StockQuote | null>({
    queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
    queryFn: () => fetchStockQuote(ticker),
    staleTime: STALE_TIMES.QUOTE,
    enabled: !!ticker,
  });
}

export function useFullStockData(ticker: string) {
  return useQuery<{
    profile: StockProfile | null;
    quote: StockQuote | null;
    financials: CompanyFinancials | null;
  }>({
    queryKey: ["stock", "full", ticker],
    queryFn: () => fetchFullStockData(ticker),
    staleTime: STALE_TIMES.QUOTE,
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
    staleTime: STALE_TIMES.STATIC,
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
