/**
 * Server Actions for stock data.
 *
 * These bridge the gap between client-side TanStack Query hooks
 * and the server-only Yahoo Finance / cache layer.
 * Each action is a thin wrapper around the unified data service.
 *
 * Usage: imported by use-stock-data.ts hooks as queryFn callbacks.
 */

"use server";

import * as dataService from "@/lib/api";
import type { StockProfile, StockQuote, MarketIndexQuote } from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";
import type { SearchEntry } from "@/lib/mock-data/search-index";

export async function fetchStockProfile(
  ticker: string
): Promise<StockProfile | null> {
  return dataService.getStockProfile(ticker);
}

export async function fetchAllProfiles(): Promise<StockProfile[]> {
  return dataService.getAllProfiles();
}

export async function fetchStockQuote(
  ticker: string
): Promise<StockQuote | null> {
  return dataService.getStockQuote(ticker);
}

export async function fetchAllQuotes(): Promise<StockQuote[]> {
  return dataService.getAllQuotes();
}

export async function fetchMarketIndices(): Promise<MarketIndexQuote[]> {
  return dataService.getMarketIndices();
}

export async function fetchBatchPeriodPerformance(
  tickers: string[],
  window: "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, number>> {
  return dataService.getBatchPeriodPerformance(tickers, window);
}

export async function fetchBatchDailyHistory(
  tickers: string[],
  window: "1W" | "1M" | "YTD" | "1Y" | "ALL"
): Promise<Record<string, Array<{ date: string; close: number }>>> {
  return dataService.getBatchDailyHistory(tickers, window);
}

export async function fetchBatchIntradayTrend(
  tickers: string[]
): Promise<Record<string, number[]>> {
  return dataService.getBatchIntradayTrend(tickers);
}

export async function fetchBatchBuybackStrength(
  tickers: string[]
): Promise<Record<string, number>> {
  return dataService.getBatchBuybackStrength(tickers);
}

export async function fetchCompanyFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  return dataService.getCompanyFinancials(ticker);
}

export async function fetchSearchTickers(
  query: string,
  limit: number = 10
): Promise<SearchEntry[]> {
  return dataService.searchTickers(query, limit);
}

export async function fetchFullStockData(ticker: string) {
  return dataService.getFullStockData(ticker);
}

export async function fetchDefaultWatchlistTickers(): Promise<string[]> {
  return dataService.getWatchlistTickers();
}
