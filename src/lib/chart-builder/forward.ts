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
 *     quarter reported (Alpha Vantage's EARNINGS). Near point-in-time is
 *     the next quarter's: its growth over the same quarter a year before,
 *     applied to the last twelve months' EPS. Where that cannot be read
 *     (a loss a year ago, an outlier quarter), the next four quarters'
 *     estimates summed — each the estimate it had near its own report,
 *     which is why it comes second.
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

/** Below this share of the last twelve months, one quarter is too small to read growth from alone. */
const SMALL_QUARTER_SHARE = 0.18;
/** How far a snapshot may be from a period end and still speak for it. */
const SNAPSHOT_REACH_DAYS = 10;

/**
 * A reader for next-twelve-month EPS at a date, on the price basis. The
 * quarters' reported and estimated EPS must already be on that basis
 * (see `perShareMultipliers`); trend and snapshot figures are scaled here,
 * since they are on the basis of the day they were read.
 */
export function forwardEpsReader(inputs: ForwardInputs, splits: readonly Split[]): (date: string) => number | null {
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

  return (date: string) => {
    const t = Date.parse(date);
    if (!Number.isFinite(t)) return null;

    // 1. A snapshot recorded near the date.
    let nearest: { d: number; ntm: number } | null = null;
    for (const s of snapshots) {
      const d = Math.abs(s.t - t) / 86_400_000;
      if (d <= SNAPSHOT_REACH_DAYS && (!nearest || d < nearest.d)) nearest = { d, ntm: s.ntm };
    }
    if (nearest) return nearest.ntm;

    const m = monthIndex(date);

    // 2. The next quarter's consensus against the same quarter a year
    //    earlier, applied to the last twelve months: only the estimate
    //    nearest the date is used, so a crisis a year out (the 2020
    //    quarters, seen from 2019) does not leak back into it.
    const estimateOf = (k: number) => byMonth.get(k)?.estimate ?? trendQuarter.get(k) ?? null;
    const reportedOf = (k: number) => byMonth.get(k)?.reported ?? null;
    let ttm = 0;
    for (let k = 0; k < 4; k++) {
      const r = reportedOf(m - 3 * k);
      if (r === null) {
        ttm = NaN;
        break;
      }
      ttm += r;
    }
    if (Number.isFinite(ttm) && ttm > 0) {
      // A seasonally small quarter (Booking's first) moves too much on its
      // own to stand for a year; then the next two stand together.
      const one = reportedOf(m - 9);
      const span = one !== null && one / ttm >= SMALL_QUARTER_SHARE ? 1 : 2;
      let expected = 0;
      let base = 0;
      for (let k = 1; k <= span; k++) {
        const e = estimateOf(m + 3 * k);
        const r = reportedOf(m + 3 * k - 12);
        if (e === null || r === null) {
          expected = NaN;
          break;
        }
        expected += e;
        base += r;
      }
      const growth = base > 0 ? expected / base : NaN;
      // Beyond these the quarters are an outlier (a loss, a one-off), not a trend.
      if (Number.isFinite(growth) && growth >= 0.5 && growth <= 2.5) return ttm * growth;
    }

    // 3. The next four fiscal quarters' consensus.
    let total = 0;
    for (let k = 1; k <= 4; k++) {
      const e = quarterEstimate(m + 3 * k);
      if (e === null) {
        total = NaN;
        break;
      }
      total += e;
    }
    if (Number.isFinite(total)) return total;

    // The latest period, when the quarters ahead are only known as years.
    if (trend && lastReported !== null && m >= lastReported) {
      const ntm = ntmFromTrend(trend);
      return ntm === null ? null : ntm * trendScale;
    }
    return null;
  };
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
): (date: string) => number | null {
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
