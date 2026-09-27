/**
 * Forward EPS history we keep ourselves.
 *
 * Point-in-time consensus is a paid dataset. What costs nothing is reading
 * today's consensus every trading day and keeping it: from the day the
 * `forward-eps` cron first ran, each company's forward P/E is exact rather
 * than reconstructed. One stock_cache row per ticker holds the series.
 *
 * Server-only.
 */

import { ntmFromTrend, type EpsSnapshot } from "@/lib/chart-builder/forward";
import { getCachedDataState, setCachedData } from "./cache";
import { fetchEpsTrend, type YahooEpsTrend } from "./yahoo";

const SNAPSHOT_KEY = "eps-ntm-v1";
/** Ten years of trading days is plenty and keeps the row small. */
const MAX_POINTS = 2600;
const FOREVER_MS = 100 * 365 * 24 * 60 * 60 * 1000;

interface SnapshotRow {
  points: EpsSnapshot[];
}

/** Every snapshot on file for a ticker, oldest first; empty when none. */
export async function readNtmSnapshots(ticker: string): Promise<EpsSnapshot[]> {
  const cached = await getCachedDataState<SnapshotRow>(ticker.toUpperCase(), SNAPSHOT_KEY, FOREVER_MS);
  const points = cached.status !== "miss" ? cached.data?.points : null;
  return Array.isArray(points) ? points.filter((p) => typeof p?.date === "string" && Number.isFinite(p?.ntm)) : [];
}

/**
 * Reads today's consensus and adds it to the ticker's series (one point
 * per day; a second run the same day replaces the first). Returns the
 * next-twelve-month EPS recorded, or null when there was none to record.
 */
export async function recordNtmSnapshot(ticker: string, trend?: YahooEpsTrend | null): Promise<number | null> {
  const key = ticker.toUpperCase();
  const read = trend === undefined ? await fetchEpsTrend(key) : trend;
  if (!read) return null;
  const ntm = ntmFromTrend(read);
  if (ntm === null || !Number.isFinite(ntm) || ntm === 0) return null;

  const existing = await readNtmSnapshots(key);
  const points = [...existing.filter((p) => p.date !== read.asOf), { date: read.asOf, ntm: Number(ntm.toFixed(4)) }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_POINTS);
  await setCachedData(key, SNAPSHOT_KEY, { points } as unknown as Record<string, unknown>);
  return ntm;
}
