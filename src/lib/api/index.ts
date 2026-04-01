/**
 * Data Service — Unified API barrel.
 *
 * This module is the SINGLE ENTRY POINT for all data fetching.
 * It decides whether to use Yahoo Finance (real API) or mock data
 * based on the FEATURES.ENABLE_REAL_API flag.
 *
 * Consumer code (hooks, Server Components) should import from here,
 * never directly from yahoo.ts or mock-data/.
 *
 * Server-only: all functions return Promises and must be called
 * from Server Components, Server Actions, or API Route Handlers.
 */

import { FEATURES } from "@/lib/constants";
import type {
  StockProfile,
  StockQuote,
  MarketIndexQuote,
  EarningsInsight,
} from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";
import type { SearchEntry } from "@/lib/mock-data/search-index";

// Yahoo Finance (real API)
import * as yahoo from "./yahoo";

// Mock data (development fallback)
import * as mock from "@/lib/mock-data";

// Supabase tickers table
import {
  getAllTickers,
  getAllTickerSymbols,
  tickerRowsToProfiles,
  searchTickersFromDB,
} from "./tickers";
import {
  getEarningsDetailData,
  prewarmEarningsDetailCacheForTickers,
  type EarningsDetailData,
} from "./earnings-detail";
import {
  getTranscriptPeriods,
  getTranscriptDocument,
} from "./transcripts";

const MIN_MARKET_CAP = 10_000_000_000;

const MANDATORY_US_LARGE_CAP_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "BRK-B",
  "JPM",
  "XOM",
  "NKE",
  "WFC",
  "MS",
  "GS",
  "BAC",
  "V",
  "MA",
  "UNH",
  "HD",
  "COST",
  "PG",
  "JNJ",
  "CVX",
  "ABBV",
  "KO",
  "PEP",
] as const;

// ─────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────

export async function getStockProfile(
  ticker: string
): Promise<StockProfile | null> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getProfile(ticker);
  }
  return mock.getStockProfile(ticker);
}

export async function getAllProfiles(): Promise<StockProfile[]> {
  if (FEATURES.ENABLE_REAL_API) {
    // Read from Supabase tickers table (seeded data with name + sector)
    const rows = await getAllTickers();
    if (rows.length > 0) {
      return tickerRowsToProfiles(rows);
    }
  }
  return mock.getAllProfiles();
}

// ─────────────────────────────────────────────────────────
// Quote / Price
// ─────────────────────────────────────────────────────────

export async function getStockQuote(
  ticker: string
): Promise<StockQuote | null> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getPrice(ticker);
  }
  return mock.getStockQuote(ticker);
}

export async function getAllQuotes(): Promise<StockQuote[]> {
  if (FEATURES.ENABLE_REAL_API) {
    // Read ticker symbols from Supabase, then batch-fetch quotes from Yahoo
    const symbolsFromDb = await getAllTickerSymbols();
    const symbols = Array.from(
      new Set(
        [...symbolsFromDb, ...MANDATORY_US_LARGE_CAP_SYMBOLS].map((symbol) =>
          symbol.toUpperCase()
        )
      )
    );

    if (symbols.length > 0) {
      // Batch in chunks of 50 to avoid Yahoo rate limits
      const BATCH_SIZE = 50;
      const allQuotes: StockQuote[] = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        const quotes = await yahoo.getBatchQuotes(batch);
        allQuotes.push(...quotes);
      }

      return allQuotes.filter((quote) => quote.market_cap >= MIN_MARKET_CAP);
    }
  }
  const mockQuotes = await mock.getAllQuotes();
  return mockQuotes.filter((quote) => quote.market_cap >= MIN_MARKET_CAP);
}

export async function getMarketIndices(): Promise<MarketIndexQuote[]> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getMarketIndices();
  }

  return [
    { symbol: "^DJI", label: "Dow Jones", price: 0, change_percent: 0 },
    { symbol: "^GSPC", label: "S&P 500", price: 0, change_percent: 0 },
    { symbol: "^IXIC", label: "Nasdaq", price: 0, change_percent: 0 },
  ];
}

export async function getBatchPeriodPerformance(
  tickers: string[],
  window: "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, number>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchPeriodPerformance(tickers, window);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [ticker.toUpperCase(), 0])
  );
}

export async function getBatchDailyHistory(
  tickers: string[],
  window: "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, Array<{ date: string; close: number }>>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchDailyHistory(tickers, window);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [ticker.toUpperCase(), []])
  );
}

export async function getBatchIntradayTrend(
  tickers: string[]
): Promise<Record<string, number[]>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchIntradayTrend(tickers);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [ticker.toUpperCase(), []])
  );
}

export async function getBatchBuybackStrength(
  tickers: string[]
): Promise<Record<string, number>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchBuybackStrength(tickers);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [ticker.toUpperCase(), 0])
  );
}

export async function getBatchEarningsInsights(
  tickers: string[]
): Promise<Record<string, EarningsInsight>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchEarningsInsights(tickers);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [
      ticker.toUpperCase(),
      {
        ticker: ticker.toUpperCase(),
        company_name: null,
        next_earnings_date: null,
        earnings_timing: "Time TBD",
        est_eps: null,
        est_revenue: null,
        history: [],
        investor_relations_url: null,
        webcast_url: null,
        source: "none",
      } satisfies EarningsInsight,
    ])
  );
}

// ─────────────────────────────────────────────────────────
// Financials
// ─────────────────────────────────────────────────────────

export async function getCompanyFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getFinancials(ticker);
  }
  return mock.getCompanyFinancials(ticker);
}

// ─────────────────────────────────────────────────────────
// Full data (single Yahoo call for ticker page)
// ─────────────────────────────────────────────────────────

export async function getFullStockData(ticker: string) {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getFullStockData(ticker);
  }
  // Mock fallback: combine separate calls
  const [profile, quote, financials] = await Promise.all([
    mock.getStockProfile(ticker),
    mock.getStockQuote(ticker),
    mock.getCompanyFinancials(ticker),
  ]);
  return { profile, quote, financials };
}

// ─────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────

export async function searchTickers(
  query: string,
  limit = 10
): Promise<SearchEntry[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const fallbackResults = await mock.searchTickersByQuery(query, Math.max(limit * 2, 20));

  const score = (entry: SearchEntry): number => {
    const ticker = entry.ticker.toLowerCase();
    const name = entry.name.toLowerCase();
    if (!normalizedQuery) return 10;
    if (ticker === normalizedQuery) return 0;
    if (ticker.startsWith(normalizedQuery)) return 1;
    if (name.startsWith(normalizedQuery)) return 2;
    if (name.includes(normalizedQuery)) return 3;
    if (ticker.includes(normalizedQuery)) return 4;
    return 6;
  };

  if (FEATURES.ENABLE_REAL_API) {
    // Search from Supabase tickers table
    const dbResults = await searchTickersFromDB(query, limit);
    if (dbResults.length > 0) {
      // Keep search universe aligned with global >10B policy.
      const caps = await yahoo.getBatchQuotes(dbResults.map((row) => row.ticker));
      const capMap = new Map(caps.map((quote) => [quote.ticker.toUpperCase(), quote.market_cap]));

      const filtered = dbResults.filter((row) => {
        const cap = capMap.get(row.ticker.toUpperCase()) ?? 0;
        if (cap >= MIN_MARKET_CAP) return true;

        // Prevent false "no results" when market-cap batch quote is temporarily missing.
        if (!normalizedQuery) return false;
        const ticker = row.ticker.toLowerCase();
        const name = row.name.toLowerCase();
        const isStrongMatch =
          ticker === normalizedQuery ||
          ticker.startsWith(normalizedQuery) ||
          name.startsWith(normalizedQuery);

        return cap === 0 && isStrongMatch;
      });

      const mappedDb: SearchEntry[] = filtered.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        logo_url: r.logo_url,
        searchText: r.searchText,
      }));

      // Merge DB + fallback so strategic names (e.g. DUOL) still appear
      // if live metadata is temporarily incomplete.
      const merged = new Map<string, SearchEntry>();
      for (const entry of [...mappedDb, ...fallbackResults]) {
        const key = entry.ticker.toUpperCase();
        if (!merged.has(key)) merged.set(key, entry);
      }

      return Array.from(merged.values())
        .sort((a, b) => {
          const scoreDiff = score(a) - score(b);
          if (scoreDiff !== 0) return scoreDiff;
          return a.ticker.localeCompare(b.ticker);
        })
        .slice(0, limit);
    }
  }

  // Fallback to local mock search index
  return fallbackResults.slice(0, limit);
}

// ─────────────────────────────────────────────────────────
// Watchlist (temporary — will be replaced by Supabase auth)
// ─────────────────────────────────────────────────────────

export async function getWatchlistTickers(): Promise<string[]> {
  return mock.getDefaultWatchlistTickers();
}

export {
  getEarningsDetailData,
  prewarmEarningsDetailCacheForTickers,
  getTranscriptPeriods,
  getTranscriptDocument,
};

export type {
  EarningsDetailData,
};
