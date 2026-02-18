/**
 * Supabase-backed cache for Yahoo Finance data.
 *
 * Strategy: "Lazy Fetching" with TTL.
 *   - Table: `stock_cache` (ticker PK, data JSONB, last_updated timestamp)
 *   - TTL: 24 hours by default.
 *   - On cache hit within TTL → return stored data (no Yahoo call).
 *   - On cache miss or stale → fetch from Yahoo, store, return.
 *
 * This module is server-only (uses Supabase server client).
 */

import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

/** Default cache TTL in milliseconds (24 hours). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface CacheRow {
  ticker: string;
  cache_key: string;
  data: Record<string, unknown>;
  last_updated: string;
}

// ─────────────────────────────────────────────────────────
// Core Cache Operations
// ─────────────────────────────────────────────────────────

/**
 * Attempt to retrieve cached data for a ticker + key combination.
 * Returns null if no cache entry exists or TTL has expired.
 *
 * @param ticker   - Stock symbol (e.g. "AAPL")
 * @param cacheKey - Namespace key (e.g. "profile", "quote", "financials")
 * @param ttlMs    - Time-to-live override in ms (default: 24h)
 */
export async function getCachedData<T = Record<string, unknown>>(
  ticker: string,
  cacheKey: string,
  ttlMs: number = CACHE_TTL_MS
): Promise<T | null> {
  try {
    const supabase = await createClient();
    const compositeKey = `${ticker.toUpperCase()}:${cacheKey}`;

    const { data, error } = await supabase
      .from("stock_cache")
      .select("data, last_updated")
      .eq("ticker", ticker.toUpperCase())
      .eq("cache_key", cacheKey)
      .single();

    if (error || !data) return null;

    // Check TTL
    const lastUpdated = new Date(data.last_updated).getTime();
    const now = Date.now();
    if (now - lastUpdated > ttlMs) {
      // Cache expired — return null to trigger fresh fetch
      return null;
    }

    return data.data as T;
  } catch {
    // Supabase not configured or table missing — gracefully degrade
    console.warn(`[Cache] Failed to read cache for ${ticker}:${cacheKey}`);
    return null;
  }
}

/**
 * Store data in the cache. Uses upsert to handle both insert and update.
 *
 * @param ticker   - Stock symbol
 * @param cacheKey - Namespace key
 * @param data     - JSON-serializable data to cache
 */
export async function setCachedData(
  ticker: string,
  cacheKey: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from("stock_cache").upsert(
      {
        ticker: ticker.toUpperCase(),
        cache_key: cacheKey,
        data,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "ticker,cache_key" }
    );
  } catch {
    // Non-critical — log and continue
    console.warn(`[Cache] Failed to write cache for ${ticker}:${cacheKey}`);
  }
}

/**
 * Invalidate (delete) a specific cache entry.
 */
export async function invalidateCache(
  ticker: string,
  cacheKey: string
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", ticker.toUpperCase())
      .eq("cache_key", cacheKey);
  } catch {
    console.warn(`[Cache] Failed to invalidate cache for ${ticker}:${cacheKey}`);
  }
}

/**
 * Invalidate ALL cache entries for a ticker (profile + quote + financials).
 */
export async function invalidateAllForTicker(ticker: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", ticker.toUpperCase());
  } catch {
    console.warn(`[Cache] Failed to invalidate all cache for ${ticker}`);
  }
}
