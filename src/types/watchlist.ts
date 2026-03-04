/**
 * Watchlist types — Domain Model.
 * Supports multi-list, notes, tags, alerts, and target prices.
 */

import type { StockProfile, StockQuote } from "./stock";

// ---- Storage Model (persisted to localStorage) ----

export interface WatchlistStore {
  lists: WatchlistList[];
  customTags: string[];
  activeListId: string;
}

export interface WatchlistList {
  id: string;
  name: string;
  color: string;
  items: WatchlistTickerItem[];
  created_at: string;
}

export interface WatchlistTickerItem {
  ticker: string;
  added_at: string;
  notes: string;
  tags: string[];
  target_price: number | null;
}

// ---- Enriched Entry (for UI rendering) ----

export interface WatchlistEntry {
  ticker: string;
  added_at: string;
  notes: string;
  tags: string[];
  target_price: number | null;
  profile: StockProfile | null;
  quote: StockQuote | null;
}

// ---- View Modes ----

export type WatchlistView =
  | "overview"
  | "performance"
  | "fundamental"
  | "dividends";

// ---- Price Alerts ----

export interface PriceAlert {
  id: string;
  ticker: string;
  type: "above" | "below";
  price: number;
  active: boolean;
  created_at: string;
}

// ---- Constants ----

export const DEFAULT_TAGS = [
  "Blue Chip",
  "High Volatility",
  "Value Play",
  "Growth",
  "Dividend King",
  "Momentum",
] as const;

export const TAG_COLORS: Record<string, string> = {
  "Blue Chip": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "High Volatility": "bg-red-500/15 text-red-400 border-red-500/20",
  "Value Play": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  Growth: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  "Dividend King":
    "bg-golden-hour/15 text-golden-hour border-golden-hour/20",
  Momentum: "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/20",
};

export const LIST_COLORS = [
  "#FF8C42",
  "#4A9EFF",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F43F5E",
] as const;

export const DEFAULT_TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "TSLA",
  "JPM",
  "V",
];
