/**
 * Watchlist types — Domain Model.
 * Source of Truth: ARCHITECTURE.md § 2.2
 */

import type { StockProfile, StockQuote } from "./stock";

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  items: WatchlistItem[];
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  ticker: string;
  added_at: string;
  // Enriched in frontend via mock data join
  profile?: StockProfile;
  quote?: StockQuote;
}
