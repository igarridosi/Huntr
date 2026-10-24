/**
 * Huntr's Fear & Greed index, served: the daily closes of its seven inputs
 * (src/lib/fear-greed.ts) through the cached daily history, the index
 * computed from them, and the result cached for an hour. The inputs move
 * once a day; an hour keeps today's reading current without recomputing
 * ten years of history on every visit.
 */

import "server-only";
import { getBatchDailyHistory } from "@/lib/api/yahoo";
import { getCachedData, setCachedData, withSingleFlight } from "@/lib/api/cache";
import { computeFearGreed, FEAR_GREED_SYMBOLS, type FearGreedPoint } from "@/lib/fear-greed";

const CACHE_TICKER = "MARKET-FEAR-GREED";
const CACHE_KEY = "fear-greed-v1";
const TTL_MS = 60 * 60 * 1000;
/** Enough for the year so far, from any day of the year. */
const KEEP_DAYS = 270;

export interface FearGreedPayload {
  computedAt: string;
  points: FearGreedPoint[];
}

export async function getFearGreed(): Promise<FearGreedPayload | null> {
  const cached = await getCachedData<FearGreedPayload>(CACHE_TICKER, CACHE_KEY, TTL_MS);
  if (cached && Array.isArray(cached.points) && cached.points.length > 0) return cached;

  return withSingleFlight(`${CACHE_TICKER}:${CACHE_KEY}`, async () => {
    // Ten years: each day is scored against the year before it, and the
    // 125-day average needs half a year more.
    const history = await getBatchDailyHistory([...FEAR_GREED_SYMBOLS], "ALL");
    const points = computeFearGreed(history).slice(-KEEP_DAYS);
    if (points.length === 0) return null;
    const payload: FearGreedPayload = { computedAt: new Date().toISOString(), points };
    await setCachedData(CACHE_TICKER, CACHE_KEY, payload);
    return payload;
  });
}
