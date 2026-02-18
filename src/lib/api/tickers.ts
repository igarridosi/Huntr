/**
 * Supabase Tickers Service.
 *
 * Reads from the `tickers` table seeded by scripts/seed-tickers.ts.
 * Provides the search index and ticker list for the Insights page.
 *
 * Server-only module.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { StockProfile } from "@/types/stock";
import { buildTickerLogoUrl, normalizeWebsiteUrl } from "@/lib/logo";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface TickerRow {
  symbol: string;
  name: string;
  sector: string;
  website: string;
  is_active: boolean;
}

export interface TickerSearchEntry {
  ticker: string;
  name: string;
  sector: string;
  logo_url: string;
  searchText: string;
}

// ─────────────────────────────────────────────────────────
// Read all active tickers
// ─────────────────────────────────────────────────────────

/**
 * Fetch all active ticker symbols from Supabase.
 * Used to build the Insights page and batch-fetch quotes.
 */
export async function getAllTickerSymbols(): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tickers")
      .select("symbol")
      .eq("is_active", true)
      .order("symbol");

    if (error || !data) {
      console.warn("[Tickers] Failed to read tickers:", error?.message);
      return [];
    }

    return data.map((row) => row.symbol);
  } catch {
    console.warn("[Tickers] Supabase not available, returning empty list");
    return [];
  }
}

/**
 * Fetch all active tickers with full metadata.
 */
export async function getAllTickers(): Promise<TickerRow[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tickers")
      .select("symbol, name, sector, website, is_active")
      .eq("is_active", true)
      .order("symbol");

    if (error || !data) {
      console.warn("[Tickers] Failed to read tickers:", error?.message);
      return [];
    }

    return data as TickerRow[];
  } catch {
    console.warn("[Tickers] Supabase not available");
    return [];
  }
}

/**
 * Convert Supabase ticker rows into StockProfile stubs.
 * These are partial profiles (no description, logo, etc.)
 * but enough for the Insights list.
 */
export function tickerRowsToProfiles(rows: TickerRow[]): StockProfile[] {
  return rows.map((row) => ({
    ticker: row.symbol,
    name: row.name,
    sector: row.sector,
    industry: "",
    exchange: "US",
    currency: "USD",
    country: "US",
    description: "",
    logo_url: buildTickerLogoUrl(row.website),
    website: normalizeWebsiteUrl(row.website),
  }));
}

/**
 * Search tickers from Supabase using text matching.
 * Falls back to in-memory search if Supabase is unavailable.
 */
export async function searchTickersFromDB(
  query: string,
  limit = 10
): Promise<TickerSearchEntry[]> {
  try {
    const supabase = createAdminClient();

    if (!query || query.trim().length === 0) {
      // Return popular tickers (alphabetical for now)
      const { data, error } = await supabase
        .from("tickers")
        .select("symbol, name, sector, website")
        .eq("is_active", true)
        .order("symbol")
        .limit(limit);

      if (error || !data) return [];

      return data.map((row) => ({
        ticker: row.symbol,
        name: row.name,
        sector: row.sector,
        logo_url: buildTickerLogoUrl((row as { website?: string }).website ?? ""),
        searchText: `${row.symbol} ${row.name}`.toLowerCase(),
      }));
    }

    const q = query.trim().toUpperCase();

    // Use ilike for flexible matching
    const { data, error } = await supabase
      .from("tickers")
      .select("symbol, name, sector, website")
      .eq("is_active", true)
      .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
      .order("symbol")
      .limit(limit);

    if (error || !data) return [];

    // Sort: exact match first, then starts-with, then contains
    const results = data.map((row) => ({
      ticker: row.symbol,
      name: row.name,
      sector: row.sector,
      logo_url: buildTickerLogoUrl((row as { website?: string }).website ?? ""),
      searchText: `${row.symbol} ${row.name}`.toLowerCase(),
    }));

    return results.sort((a, b) => {
      const ql = query.toLowerCase();
      const aExact = a.ticker.toLowerCase() === ql ? 0 : 1;
      const bExact = b.ticker.toLowerCase() === ql ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aStarts = a.ticker.toLowerCase().startsWith(ql) ? 0 : 1;
      const bStarts = b.ticker.toLowerCase().startsWith(ql) ? 0 : 1;
      return aStarts - bStarts;
    });
  } catch {
    return [];
  }
}
