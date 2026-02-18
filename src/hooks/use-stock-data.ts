"use client";

import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import type { StockProfile, StockQuote } from "@/types/stock";
import type {
  CompanyFinancials,
  PeriodType,
} from "@/types/financials";
import type { SearchEntry } from "@/lib/mock-data/search-index";
import {
  getStockProfile,
  getStockQuote,
  getAllQuotes,
  getCompanyFinancials,
  searchTickersByQuery,
} from "@/lib/mock-data";

// ---------- Stock Profile ----------

export function useStockProfile(ticker: string) {
  return useQuery<StockProfile | null>({
    queryKey: QUERY_KEYS.STOCK_PROFILE(ticker),
    queryFn: () => getStockProfile(ticker),
    staleTime: STALE_TIMES.STATIC,
    enabled: !!ticker,
  });
}

// ---------- Stock Quote ----------

export function useStockQuote(ticker: string) {
  return useQuery<StockQuote | null>({
    queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
    queryFn: () => getStockQuote(ticker),
    staleTime: STALE_TIMES.QUOTE,
    enabled: !!ticker,
  });
}

export function useAllQuotes() {
  return useQuery<StockQuote[]>({
    queryKey: ["stock", "quotes", "all"],
    queryFn: () => getAllQuotes(),
    staleTime: STALE_TIMES.QUOTE,
  });
}

// ---------- Financials ----------

export function useFinancials(
  ticker: string,
  periodType: PeriodType = "annual"
) {
  return useQuery<CompanyFinancials | null>({
    queryKey: QUERY_KEYS.FINANCIALS(ticker, periodType),
    queryFn: () => getCompanyFinancials(ticker),
    staleTime: STALE_TIMES.STATIC,
    enabled: !!ticker,
  });
}

// ---------- Search ----------

export function useSearch(query: string, limit = 10) {
  return useQuery<SearchEntry[]>({
    queryKey: QUERY_KEYS.SEARCH(query),
    queryFn: () => searchTickersByQuery(query, limit),
    staleTime: STALE_TIMES.STATIC,
    // Only search when query has content, otherwise return all
    enabled: true,
  });
}
