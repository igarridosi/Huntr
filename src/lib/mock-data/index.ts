import type { StockProfile, StockQuote } from "@/types/stock";
import type {
  CompanyFinancials,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  PeriodType,
} from "@/types/financials";

import { profilesByTicker, stockProfiles } from "./profiles";
import { quotesByTicker } from "./quotes";
import { financialsByTicker } from "./financials";
import { searchStocks, type SearchEntry } from "./search-index";

/**
 * Mock Data Service Layer.
 * Wraps raw mock data with API-like async interface.
 * When FEATURES.ENABLE_REAL_API is true, these functions
 * will be swapped out for real Supabase/FMP calls.
 *
 * All functions return Promises to match future real API shape.
 */

// ---------- Profiles ----------

export async function getStockProfile(
  ticker: string
): Promise<StockProfile | null> {
  const profile = profilesByTicker[ticker.toUpperCase()];
  return profile ?? null;
}

export async function getAllProfiles(): Promise<StockProfile[]> {
  return stockProfiles;
}

// ---------- Quotes ----------

export async function getStockQuote(
  ticker: string
): Promise<StockQuote | null> {
  const quote = quotesByTicker[ticker.toUpperCase()];
  return quote ?? null;
}

export async function getAllQuotes(): Promise<StockQuote[]> {
  return Object.values(quotesByTicker);
}

// ---------- Financials ----------

export async function getCompanyFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  const financials = financialsByTicker[ticker.toUpperCase()];
  return financials ?? null;
}

export async function getIncomeStatements(
  ticker: string,
  periodType: PeriodType = "annual"
): Promise<IncomeStatement[]> {
  const financials = financialsByTicker[ticker.toUpperCase()];
  if (!financials) return [];
  return financials.income_statement[periodType];
}

export async function getBalanceSheets(
  ticker: string,
  periodType: PeriodType = "annual"
): Promise<BalanceSheet[]> {
  const financials = financialsByTicker[ticker.toUpperCase()];
  if (!financials) return [];
  return financials.balance_sheet[periodType];
}

export async function getCashFlowStatements(
  ticker: string,
  periodType: PeriodType = "annual"
): Promise<CashFlowStatement[]> {
  const financials = financialsByTicker[ticker.toUpperCase()];
  if (!financials) return [];
  return financials.cash_flow[periodType];
}

// ---------- Search ----------

export async function searchTickersByQuery(
  query: string,
  limit = 10
): Promise<SearchEntry[]> {
  return searchStocks(query, limit);
}

// ---------- Watchlist (mock) ----------

/**
 * Mock watchlist — returns hardcoded default tickers.
 * Will be replaced with Supabase queries when auth is wired.
 */
export async function getDefaultWatchlistTickers(): Promise<string[]> {
  return ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"];
}
