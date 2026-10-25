"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  fetchBatchDailyHistory,
  fetchBatchIntradayTrend,
  fetchBatchEarningsInsights,
  fetchMarketIndices,
  fetchAllProfiles,
  fetchCompanyFinancials,
  fetchSearchTickers,
  fetchInsiderActivity,
  fetchTranscriptPeriods,
  fetchTranscriptDocument,
  fetchScreenerMetrics,
} from "@/app/actions/stock";
import type { HuntingGroundMetrics, ScreenerMetrics } from "@/lib/api/cache";
import type { FearGreedPoint } from "@/lib/fear-greed";
import type { NewsItem } from "@/lib/market-news";
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

/**
 * Recent headlines for the symbols the Insights page asks about (the
 * indices, and today's standout movers). A route handler, so a slow fetch never
 * queues the page's Server Actions behind it.
 */
export function useMarketNews(symbols: string[], enabled: boolean = true) {
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).join(",");
  return useQuery<Record<string, NewsItem[]>>({
    queryKey: QUERY_KEYS.MARKET_NEWS(key),
    queryFn: async () => {
      const res = await fetch(`/api/market/news?symbols=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`Market news failed: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: enabled && key.length > 0,
  });
}

/** Huntr's Fear & Greed index, the last ~270 trading days (computed and cached hourly on the server). */
export function useFearGreed() {
  return useQuery<{ computedAt: string | null; points: FearGreedPoint[] }>({
    queryKey: QUERY_KEYS.FEAR_GREED,
    queryFn: async () => {
      const res = await fetch("/api/market/fear-greed");
      if (!res.ok) throw new Error(`Fear & Greed failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** Quality score and free-cash-flow yield for The Hunting Ground, from our caches only. */
export function useHuntingGroundMetrics(tickers: string[]) {
  const key = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).sort().join(",");
  return useQuery<Record<string, HuntingGroundMetrics>>({
    queryKey: QUERY_KEYS.HUNTING_GROUND(key),
    queryFn: async () => {
      const res = await fetch(`/api/market/hunting-ground?tickers=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`Hunting Ground failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    enabled: key.length > 0,
  });
}

/** Gold, crude oil, the 10-year yield and bitcoin today, for the Insights news. */
export function useNewsAssets(enabled: boolean = true) {
  return useQuery<MarketIndexQuote[]>({
    queryKey: QUERY_KEYS.NEWS_ASSETS,
    queryFn: async () => {
      const res = await fetch("/api/market/assets");
      if (!res.ok) throw new Error(`News assets failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    enabled,
  });
}

/** The preview's summary of one story; fetched when the preview opens, kept for the session. */
export function useNewsSummary(symbol: string | null, id: string | null) {
  return useQuery<{ summary: string | null }>({
    queryKey: QUERY_KEYS.NEWS_SUMMARY(symbol ?? "", id ?? ""),
    queryFn: async () => {
      const params = new URLSearchParams({ symbol: symbol ?? "", id: id ?? "" });
      const res = await fetch(`/api/market/news/summary?${params}`);
      if (!res.ok) throw new Error(`News summary failed: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
    retry: 1,
    enabled: !!symbol && !!id,
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

/**
 * The server actions refuse more than 500 tickers per call (an abuse guard),
 * and the Opportunity Radar ranks the whole universe, which is larger. Split
 * the request and merge the answers; the calls run side by side.
 */
const ACTION_BATCH_LIMIT = 400;
async function inChunks<T>(
  tickers: string[],
  call: (chunk: string[]) => Promise<Record<string, T>>
): Promise<Record<string, T>> {
  if (tickers.length <= ACTION_BATCH_LIMIT) return call(tickers);
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += ACTION_BATCH_LIMIT) {
    chunks.push(tickers.slice(i, i + ACTION_BATCH_LIMIT));
  }
  const parts = await Promise.all(chunks.map(call));
  return Object.assign({}, ...parts);
}

/**
 * Through a route handler, not a Server Action, like buyback strength below:
 * the browser runs actions one at a time, and a window over the whole
 * universe held search and the rest of the page behind it.
 */
async function fetchPeriodPerformance(
  tickers: string[],
  window: "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, number>> {
  const res = await fetch(
    `/api/market/period-performance?window=${window}&tickers=${encodeURIComponent(tickers.join(","))}`
  );
  if (!res.ok) throw new Error(`Period performance failed: ${res.status}`);
  return res.json();
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
    queryFn: () => inChunks(normalized, (chunk) => fetchPeriodPerformance(chunk, window)),
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

/**
 * Through a route handler, not a Server Action: the browser runs actions one
 * at a time, and a cold load of this one (a filing per company) held search
 * and everything else on the page behind it. See the route for more.
 */
async function fetchBuybackStrength(tickers: string[]): Promise<Record<string, number>> {
  const res = await fetch(`/api/market/buyback-strength?tickers=${encodeURIComponent(tickers.join(","))}`);
  if (!res.ok) throw new Error(`Buyback strength failed: ${res.status}`);
  return res.json();
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
    queryFn: () => inChunks(normalized, fetchBuybackStrength),
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
  const key = QUERY_KEYS.INSIDERS(t);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchInsiderActivity(t),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && t.length > 0,
  });

  /*
   * A first read returns after one step of filings, so the page has
   * something to show within seconds. The rest is asked for here, a step
   * at a time, and each step replaces the data so the view fills in as it
   * goes. A step that reads nothing new ends the run: a filing that will
   * not load must not turn into a loop.
   */
  const pending = Boolean(query.data && query.data.progress.read < query.data.progress.total);
  useEffect(() => {
    if (!pending || !enabled) return;
    let alive = true;
    (async () => {
      let read = queryClient.getQueryData<Awaited<ReturnType<typeof fetchInsiderActivity>>>(key)?.progress.read ?? 0;
      for (;;) {
        const next = await fetchInsiderActivity(t).catch(() => null);
        if (!alive || !next) return;
        queryClient.setQueryData(key, next);
        if (next.progress.read >= next.progress.total || next.progress.read <= read) return;
        read = next.progress.read;
      }
    })();
    return () => {
      alive = false;
    };
    // `key` is derived from `t`; listing it would restart the run every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, pending, enabled, queryClient]);

  return query;
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
