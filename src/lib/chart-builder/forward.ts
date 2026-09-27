/**
 * Chart Builder — forward EPS: what analysts expected a company to earn over
 * the next twelve months, as of a date.
 *
 * A true point-in-time forward P/E divides each day's price by the consensus
 * that stood on that day. That history is a paid dataset, so it is built
 * from three honest sources, best first:
 *
 *  1. Snapshots we record ourselves every trading day (the `forward-eps`
 *     cron): exact, but only from the day recording started.
 *  2. The consensus for each past quarter as it stood just before that
 *     quarter reported (Alpha Vantage's EARNINGS), read two ways — the
 *     last twelve months rolled forward one quarter, and the next four
 *     quarters summed — and combined (see below).
 *  3. Today's consensus by quarter and fiscal year (Yahoo's earnings trend)
 *     for quarters that have not reported yet.
 *
 * Every figure is set on the price basis (split-adjusted to today).
 */

import type { IncomeStatement } from "@/types/financials";
import { gaapAnchor, perShareMultipliers, type ShareBasis, type Split } from "./splits";

export interface EpsQuarter {
  /** Fiscal quarter end, ISO. */
  date: string;
  reported: number | null;
  /** Consensus just before the report. */
  estimate: number | null;
}

export interface EpsTrend {
  /** When the consensus was read, ISO. */
  asOf: string;
  /** Last quarter the company has reported, ISO; null when unknown. */
  lastReported: string | null;
  /** Consensus for the current and next fiscal quarters. */
  quarters: Array<{ end: string; eps: number }>;
  /** Consensus for the current and next fiscal years. */
  years: Array<{ end: string; eps: number }>;
}

export interface EpsSnapshot {
  /** ISO day the consensus was recorded. */
  date: string;
  /** Next-twelve-month EPS that day, on that day's share basis. */
  ntm: number;
}

export interface ForwardInputs {
  quarters: EpsQuarter[];
  trend: EpsTrend | null;
  snapshots: EpsSnapshot[];
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** Months since year 0 for an ISO date: quarter ends a few days apart share one. */
export const monthIndex = (iso: string): number => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/** Split factor to bring a figure dated `date` onto today's basis (per-share figures divide by it). */
export function splitFactorAfter(splits: readonly Split[], date: string): number {
  return splits.reduce((f, s) => (s.date > date && s.ratio > 0 ? f * s.ratio : f), 1);
}

// ---------------------------------------------------------------------------
// Next twelve months from today's consensus
// ---------------------------------------------------------------------------

/**
 * Next-twelve-month EPS from a consensus snapshot: the fiscal years
 * blended by how much of the current one is still ahead — the usual
 * calendarisation. With a quarter still to report in the current year,
 * a quarter of it counts; with none, the next year is the whole of it.
 */
export function ntmFromTrend(trend: EpsTrend): number | null {
  const [fy0, fy1] = [...trend.years].sort((a, b) => a.end.localeCompare(b.end));
  if (!fy0) return null;
  const last = trend.lastReported ? monthIndex(trend.lastReported) : null;
  // Quarters of the current year still ahead: 0-4.
  const ahead = last === null ? 4 : Math.max(0, Math.min(4, Math.round((monthIndex(fy0.end) - last) / 3)));
  if (ahead === 4 || !fy1) return ahead === 0 ? null : fy0.eps;
  const w = ahead / 4;
  return w * fy0.eps + (1 - w) * fy1.eps;
}

// ---------------------------------------------------------------------------
// Forward EPS at a date
// ---------------------------------------------------------------------------

/** How far apart the two readings of the next twelve months may be and still both count. */
const AGREEMENT = 1.6;
/** Below this share of its best of the two years before, the last twelve months are a trough. */
const TROUGH = 0.5;
/** How far a snapshot may be from a period end and still speak for it. */
const SNAPSHOT_REACH_DAYS = 10;

/**
 * A reader for next-twelve-month EPS at a date, on the price basis. The
 * quarters' reported and estimated EPS must already be on that basis
 * (see `perShareMultipliers`); trend and snapshot figures are scaled here,
 * since they are on the basis of the day they were read.
 */
/** Next-twelve-month EPS at a period end; `snapshot` answers for any day a consensus was recorded near. */
export type ForwardReader = ((date: string) => number | null) & { snapshot: (date: string) => number | null };

/** A daily line reads a snapshot only this close to the day. */
const SNAPSHOT_DAILY_DAYS = 4;

export function forwardEpsReader(inputs: ForwardInputs, splits: readonly Split[]): ForwardReader {
  const byMonth = new Map<number, EpsQuarter>();
  for (const q of inputs.quarters) byMonth.set(monthIndex(q.date), q);

  const trend = inputs.trend;
  const trendScale = trend ? 1 / splitFactorAfter(splits, trend.asOf) : 1;
  const trendQuarter = new Map<number, number>();
  for (const q of trend?.quarters ?? []) trendQuarter.set(monthIndex(q.end), q.eps * trendScale);
  const years = (trend?.years ?? []).map((y) => ({ end: monthIndex(y.end), eps: y.eps * trendScale }));
  const lastReported = trend?.lastReported ? monthIndex(trend.lastReported) : null;

  const snapshots = [...inputs.snapshots]
    .filter((s) => Number.isFinite(s.ntm) && s.ntm !== 0)
    .map((s) => ({ t: Date.parse(s.date), ntm: s.ntm / splitFactorAfter(splits, s.date) }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);

  /** A quarter's expected EPS: its pre-report consensus, today's consensus, or its share of a fiscal-year estimate. */
  const quarterEstimate = (m: number): number | null => {
    const h = byMonth.get(m);
    if (h?.estimate !== null && h?.estimate !== undefined) return h.estimate;
    const t = trendQuarter.get(m);
    if (t !== undefined) return t;
    const fy = years.find((y) => y.end - m >= 0 && y.end - m <= 9 && (y.end - m) % 3 === 0);
    if (!fy) return null;
    // The year's estimate less what its other quarters are known or expected to earn, shared by the unknown ones.
    let known = 0;
    let unknown = 0;
    for (let k = fy.end - 9; k <= fy.end; k += 3) {
      const hq = byMonth.get(k);
      const value =
        lastReported !== null && k <= lastReported && hq?.reported !== null && hq?.reported !== undefined
          ? hq.reported
          : (hq?.estimate ?? trendQuarter.get(k) ?? null);
      if (value === null) unknown++;
      else known += value;
    }
    return unknown === 0 ? null : (fy.eps - known) / unknown;
  };

  const snapshotNear = (date: string, reachDays: number): number | null => {
    const t = Date.parse(date);
    if (!Number.isFinite(t) || snapshots.length === 0) return null;
    let nearest: { d: number; ntm: number } | null = null;
    for (const s of snapshots) {
      const d = Math.abs(s.t - t) / 86_400_000;
      if (d <= reachDays && (!nearest || d < nearest.d)) nearest = { d, ntm: s.ntm };
    }
    return nearest?.ntm ?? null;
  };

  const read = (date: string) => {
    const t = Date.parse(date);
    if (!Number.isFinite(t)) return null;

    // 1. A snapshot recorded near the date.
    const snap = snapshotNear(date, SNAPSHOT_REACH_DAYS);
    if (snap !== null) return snap;

    const m = monthIndex(date);

    const estimateOf = (k: number) => byMonth.get(k)?.estimate ?? trendQuarter.get(k) ?? null;
    const reportedOf = (k: number) => byMonth.get(k)?.reported ?? null;

    // 2a. Roll: the last twelve months with the quarter about to drop out
    //     replaced by the consensus for the one coming in. Only the nearest
    //     estimate is used, so nothing a year out leaks back — but it lags
    //     a company whose earnings are about to change a lot.
    let ttm = 0;
    for (let k = 0; k < 4; k++) {
      const r = reportedOf(m - 3 * k);
      if (r === null) {
        ttm = NaN;
        break;
      }
      ttm += r;
    }
    const nextEstimate = estimateOf(m + 3);
    const leaving = reportedOf(m - 9);
    const roll = Number.isFinite(ttm) && nextEstimate !== null && leaving !== null ? ttm - leaving + nextEstimate : NaN;

    // 2b. Sum: the next four quarters' consensus, each as it stood near its
    //     own report — ahead of the date, so it sees change coming, with
    //     some hindsight in the quarters furthest out.
    let sum = 0;
    for (let k = 1; k <= 4; k++) {
      const e = quarterEstimate(m + 3 * k);
      if (e === null) {
        sum = NaN;
        break;
      }
      sum += e;
    }

    // How they combine, measured against Fiscal.ai's Booking series and
    // NVIDIA's 2022-23 turn:
    //  - agreeing (within 1.6x), the truth sits between them: geometric mean;
    //  - the sum below the roll is a fall only hindsight saw (the 2020
    //    quarters seen from 2019): the roll;
    //  - the sum above the roll is a rise the roll lags and the sum
    //    overstates: the mean again;
    //  - the roll is not trusted off a trough (twelve months under half the
    //    best of the two years before), where it divides by next to nothing.
    const pos = (x: number) => Number.isFinite(x) && x > 0;
    let best = 0;
    for (let k = 1; k <= 8; k++) {
      let t = 0;
      for (let j = 0; j < 4; j++) {
        const r = reportedOf(m - 3 * (k + j));
        if (r === null) {
          t = NaN;
          break;
        }
        t += r;
      }
      if (Number.isFinite(t)) best = Math.max(best, t);
    }
    const rollOk = pos(roll) && ttm >= TROUGH * best;
    if (rollOk && pos(sum)) {
      const agree = Math.max(roll, sum) / Math.min(roll, sum) <= AGREEMENT;
      return agree || sum > roll ? Math.sqrt(roll * sum) : roll;
    }
    if (pos(sum)) return sum;
    if (pos(roll)) return roll;

    // The latest period, when the quarters ahead are only known as years.
    if (trend && lastReported !== null && m >= lastReported) {
      const ntm = ntmFromTrend(trend);
      return ntm === null ? null : ntm * trendScale;
    }
    return null;
  };
  return Object.assign(read, { snapshot: (date: string) => snapshotNear(date, SNAPSHOT_DAILY_DAYS) });
}

/**
 * The reader for a chart: Alpha Vantage's quarters set on the price basis
 * first — its EPS mixes bases within one company — against GAAP EPS from
 * the chart's own (already normalised) quarterly income statement. A
 * quarter's estimate is on the same basis as its reported figure, so both
 * take the multiple the reported one needed.
 */
export function buildForwardReader(
  inputs: ForwardInputs,
  basis: ShareBasis | null | undefined,
  quarterlyIncome: readonly IncomeStatement[] = []
): ForwardReader {
  const splits = basis?.splits ?? [];
  const rows = inputs.quarters.map((q) => ({ date: q.date, value: q.reported ?? q.estimate ?? 0 }));
  const m = splits.length > 0 ? perShareMultipliers(rows, splits, gaapAnchor(quarterlyIncome)) : rows.map(() => 1);
  const quarters = inputs.quarters.map((q, i) => ({
    date: q.date,
    reported: q.reported === null ? null : q.reported * m[i],
    estimate: q.estimate === null ? null : q.estimate * m[i],
  }));
  return forwardEpsReader({ ...inputs, quarters }, splits);
}
