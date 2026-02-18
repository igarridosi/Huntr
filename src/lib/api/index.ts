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
import type { StockProfile, StockQuote, MarketIndexQuote } from "@/types/stock";
import type { CompanyFinancials, PeriodType } from "@/types/financials";
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
  type TickerSearchEntry,
} from "./tickers";

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
    const symbols = await getAllTickerSymbols();
    if (symbols.length > 0) {
      // Batch in chunks of 50 to avoid Yahoo rate limits
      const BATCH_SIZE = 50;
      const allQuotes: StockQuote[] = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        const quotes = await yahoo.getBatchQuotes(batch);
        allQuotes.push(...quotes);
      }
      return allQuotes;
    }
  }
  return mock.getAllQuotes();
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
  window: "1D" | "1W" | "1M" | "YTD"
): Promise<Record<string, number>> {
  if (FEATURES.ENABLE_REAL_API) {
    return yahoo.getBatchPeriodPerformance(tickers, window);
  }

  return Object.fromEntries(
    tickers.map((ticker) => [ticker.toUpperCase(), 0])
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
  if (FEATURES.ENABLE_REAL_API) {
    // Search from Supabase tickers table
    const dbResults = await searchTickersFromDB(query, limit);
    if (dbResults.length > 0) {
      return dbResults.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        logo_url: r.logo_url,
        searchText: r.searchText,
      }));
    }
  }
  // Fallback to local mock search index
  return mock.searchTickersByQuery(query, limit);
}

// ─────────────────────────────────────────────────────────
// Watchlist (temporary — will be replaced by Supabase auth)
// ─────────────────────────────────────────────────────────

export async function getWatchlistTickers(): Promise<string[]> {
  return mock.getDefaultWatchlistTickers();
}
