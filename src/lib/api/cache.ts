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
const HOT_CACHE_MAX_ENTRIES = 1500;

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface CacheRow {
  ticker: string;
  cache_key: string;
  data: unknown;
  last_updated: string;
}

export type CacheLookupStatus = "fresh" | "stale" | "miss";

export interface CacheLookupResult<T> {
  status: CacheLookupStatus;
  data: T | null;
  ageMs: number | null;
}

interface HotCacheEntry {
  data: unknown;
  lastUpdatedMs: number;
}

const hotCache = new Map<string, HotCacheEntry>();
const singleFlightMap = new Map<string, Promise<unknown>>();

function toCompositeKey(ticker: string, cacheKey: string): string {
  return `${ticker.toUpperCase()}:${cacheKey}`;
}

function touchHotCache(compositeKey: string, entry: HotCacheEntry): void {
  // Move to the end to keep insertion order as a cheap LRU signal.
  if (hotCache.has(compositeKey)) {
    hotCache.delete(compositeKey);
  }

  hotCache.set(compositeKey, entry);

  if (hotCache.size <= HOT_CACHE_MAX_ENTRIES) return;

  const oldest = hotCache.keys().next().value;
  if (typeof oldest === "string") {
    hotCache.delete(oldest);
  }
}

function computeCacheStatus(
  ageMs: number,
  ttlMs: number,
  staleWhileRevalidateMs: number
): CacheLookupStatus {
  if (ageMs <= ttlMs) return "fresh";
  if (staleWhileRevalidateMs > 0 && ageMs <= ttlMs + staleWhileRevalidateMs) {
    return "stale";
  }
  return "miss";
}

function buildLookupResult<T>(
  value: unknown,
  lastUpdatedMs: number,
  ttlMs: number,
  staleWhileRevalidateMs: number
): CacheLookupResult<T> {
  const ageMs = Date.now() - lastUpdatedMs;
  const status = computeCacheStatus(ageMs, ttlMs, staleWhileRevalidateMs);

  if (status === "miss") {
    return { status: "miss", data: null, ageMs };
  }

  return {
    status,
    data: value as T,
    ageMs,
  };
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
  const lookup = await getCachedDataState<T>(ticker, cacheKey, ttlMs, 0);
  return lookup.status === "fresh" ? lookup.data : null;
}

/**
 * Retrieve cache data and its freshness status.
 *
 * `fresh`: valid within TTL.
 * `stale`: expired TTL but still within stale-while-revalidate window.
 * `miss`: no data or too old.
 */
export async function getCachedDataState<T = Record<string, unknown>>(
  ticker: string,
  cacheKey: string,
  ttlMs: number = CACHE_TTL_MS,
  staleWhileRevalidateMs: number = 0
): Promise<CacheLookupResult<T>> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);

    const hotEntry = hotCache.get(compositeKey);
    if (hotEntry) {
      const hotResult = buildLookupResult<T>(
        hotEntry.data,
        hotEntry.lastUpdatedMs,
        ttlMs,
        staleWhileRevalidateMs
      );

      if (hotResult.status !== "miss") {
        touchHotCache(compositeKey, hotEntry);
        return hotResult;
      }
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("stock_cache")
      .select("data, last_updated")
      .eq("ticker", normalizedTicker)
      .eq("cache_key", cacheKey)
      .single();

    if (error || !data) {
      return {
        status: "miss",
        data: null,
        ageMs: null,
      };
    }

    const row = data as CacheRow;
    const lastUpdatedMs = new Date(row.last_updated).getTime();
    if (!Number.isFinite(lastUpdatedMs)) {
      return {
        status: "miss",
        data: null,
        ageMs: null,
      };
    }

    touchHotCache(compositeKey, {
      data: row.data,
      lastUpdatedMs,
    });

    return buildLookupResult<T>(row.data, lastUpdatedMs, ttlMs, staleWhileRevalidateMs);
  } catch {
    // Supabase not configured or table missing — gracefully degrade
    console.warn(`[Cache] Failed to read cache for ${ticker}:${cacheKey}`);
    return {
      status: "miss",
      data: null,
      ageMs: null,
    };
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
  data: unknown
): Promise<void> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const lastUpdated = new Date().toISOString();
    const lastUpdatedMs = new Date(lastUpdated).getTime();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);

    touchHotCache(compositeKey, {
      data,
      lastUpdatedMs,
    });

    const supabase = await createClient();

    const { error } = await supabase.from("stock_cache").upsert(
      {
        ticker: normalizedTicker,
        cache_key: cacheKey,
        data,
        last_updated: lastUpdated,
      },
      { onConflict: "ticker,cache_key" }
    );

    if (error) {
      console.warn(`[Cache] Failed to write cache for ${normalizedTicker}:${cacheKey}`);
    }
  } catch {
    // Non-critical — log and continue
    console.warn(`[Cache] Failed to write cache for ${ticker}:${cacheKey}`);
  }
}

/**
 * Deduplicate concurrent async work per key (single-flight pattern).
 */
export async function withSingleFlight<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const existing = singleFlightMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = (async () => {
    try {
      return await operation();
    } finally {
      singleFlightMap.delete(key);
    }
  })();

  singleFlightMap.set(key, pending as Promise<unknown>);
  return pending;
}

/**
 * Invalidate (delete) a specific cache entry.
 */
export async function invalidateCache(
  ticker: string,
  cacheKey: string
): Promise<void> {
  try {
    const normalizedTicker = ticker.toUpperCase();
    const compositeKey = toCompositeKey(normalizedTicker, cacheKey);
    hotCache.delete(compositeKey);

    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", normalizedTicker)
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
    const normalizedTicker = ticker.toUpperCase();
    const prefix = `${normalizedTicker}:`;

    for (const key of Array.from(hotCache.keys())) {
      if (key.startsWith(prefix)) {
        hotCache.delete(key);
      }
    }

    const supabase = await createClient();
    await supabase
      .from("stock_cache")
      .delete()
      .eq("ticker", normalizedTicker);
  } catch {
    console.warn(`[Cache] Failed to invalidate all cache for ${ticker}`);
  }
}
