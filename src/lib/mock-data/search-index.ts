import { stockProfiles } from "./profiles";

/**
 * Search index entry for fast ticker/name lookup with Cmd+K.
 */
export interface SearchEntry {
  ticker: string;
  name: string;
  sector: string;
  logo_url?: string;
  /** Lowercased ticker + name for matching */
  searchText: string;
}

/**
 * Pre-built search index from stock profiles.
 * Optimized for prefix and substring matching.
 */
export const searchIndex: SearchEntry[] = stockProfiles.map((p) => ({
  ticker: p.ticker,
  name: p.name,
  sector: p.sector,
  logo_url: p.logo_url,
  searchText: `${p.ticker} ${p.name}`.toLowerCase(),
}));

/**
 * Search stocks by query string (ticker or name).
 * Case-insensitive, supports partial matches.
 * Returns results sorted by relevance:
 *   1. Exact ticker match
 *   2. Ticker starts with query
 *   3. Name contains query
 */
export function searchStocks(query: string, limit = 10): SearchEntry[] {
  if (!query || query.trim().length === 0) {
    return searchIndex.slice(0, limit);
  }

  const q = query.toLowerCase().trim();

  // Partition results by match quality
  const exactTicker: SearchEntry[] = [];
  const startsWithTicker: SearchEntry[] = [];
  const containsMatch: SearchEntry[] = [];

  for (const entry of searchIndex) {
    if (entry.ticker.toLowerCase() === q) {
      exactTicker.push(entry);
    } else if (entry.ticker.toLowerCase().startsWith(q)) {
      startsWithTicker.push(entry);
    } else if (entry.searchText.includes(q)) {
      containsMatch.push(entry);
    }
  }

  return [...exactTicker, ...startsWithTicker, ...containsMatch].slice(0, limit);
}
