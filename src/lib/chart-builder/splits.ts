/**
 * Chart Builder — one share basis for everything on a chart.
 *
 * Prices are split-adjusted to today: Booking's close before its 25-for-1
 * split in April 2026 reads as a twenty-fifth of what it traded at. The
 * statements are not so tidy. Alpha Vantage restates some companies' share
 * counts for splits (NVIDIA's 2019 quarters carry 24.6 billion shares) and
 * not others (Booking's stop at 32.6 million), and its EPS mixes both
 * within one company: Booking's Q2 2024 reads 1.68 (a twenty-fifth of
 * $41.90) beside Q3 2024 at 83.89 (as reported). A price over an EPS on
 * another basis gave a P/E of 3x for a company trading near 25x.
 *
 * No source is assumed to be on either basis. Each figure is set on the
 * price basis by choosing, among the splits that happened after its period,
 * the multiple that fits:
 *
 *  - share counts, walking back from today's count (which is on the price
 *    basis by definition): a count moves a few percent a quarter, a split
 *    moves it by 1.5x or more, so the nearest candidate is the right one;
 *  - EPS, against net income over those counts (GAAP EPS on the price
 *    basis) where there is one, else against the EPS just after it.
 *
 * Pure; the splits and today's count come from Yahoo.
 */

import type { BalanceSheet, CompanyFinancials, IncomeStatement } from "@/types/financials";

export interface Split {
  /** ISO date the split took effect. */
  date: string;
  /** New shares per old share: 25 for 25-for-1, 1/6 for a 1-for-6 reverse split. */
  ratio: number;
}

export interface ShareBasis {
  splits: Split[];
  /** Shares outstanding today (market cap over price), on the price basis; null when unknown. */
  sharesNow: number | null;
}

const ln = Math.log;
/** Keeping a figure as the source gave it is preferred unless another basis fits clearly better. */
const KEEP_BIAS = 0.1;
/** For EPS, which swings with the season, a stronger preference for the source's own basis. */
const KEEP_BIAS_EPS = 0.3;

/**
 * The multiples a count dated `date` may be missing: the product of the
 * splits after it from the latest back to each one (a source that restated
 * for older splits and not the latest is missing only the latest), and 1.
 */
export function countCandidates(splits: readonly Split[], date: string): number[] {
  const after = splits.filter((s) => s.date > date && Number.isFinite(s.ratio) && s.ratio > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out = [1];
  let product = 1;
  for (let i = after.length - 1; i >= 0; i--) {
    product *= after[i].ratio;
    out.push(product);
  }
  return out;
}

/** The candidate that brings `value` nearest `ref` in ratio, with a bias for leaving it as it is. */
function pick(value: number, ref: number, candidates: readonly number[], bias: number, invert: boolean): number {
  let best = 1;
  let bestScore = Infinity;
  for (const c of candidates) {
    const m = invert ? 1 / c : c;
    const score = Math.abs(ln(Math.abs(value * m) / Math.abs(ref))) + (c === 1 ? 0 : bias);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Share counts on the price basis, walking back from the newest. Returns
 * the multiplier for each input index (1 where nothing changes).
 */
export function countMultipliers(rows: ReadonlyArray<{ date: string; value: number }>, splits: readonly Split[], sharesNow: number | null): number[] {
  const order = rows.map((r, i) => i).sort((a, b) => rows[b].date.localeCompare(rows[a].date));
  const out = rows.map(() => 1);
  let ref = sharesNow !== null && sharesNow > 0 ? sharesNow : null;
  for (const i of order) {
    const { date, value } = rows[i];
    if (!(value > 0)) continue;
    const candidates = countCandidates(splits, date);
    const m = ref === null || candidates.length === 1 ? 1 : pick(value, ref, candidates, KEEP_BIAS, false);
    out[i] = m;
    ref = value * m;
  }
  return out;
}

/**
 * Per-share figures on the price basis. `anchor` is the same figure worked
 * out from basis-safe parts (net income over normalised shares) when there
 * is one; otherwise the figure is compared with the ones just after it.
 */
export function perShareMultipliers(
  rows: ReadonlyArray<{ date: string; value: number }>,
  splits: readonly Split[],
  anchor: (date: string) => number | null
): number[] {
  const order = rows.map((r, i) => i).sort((a, b) => rows[b].date.localeCompare(rows[a].date));
  const out = rows.map(() => 1);
  const recent: number[] = [];
  for (const i of order) {
    const { date, value } = rows[i];
    if (!Number.isFinite(value) || value === 0) continue;
    const candidates = countCandidates(splits, date);
    if (candidates.length > 1) {
      const ref = anchor(date) ?? median(recent);
      if (ref !== null && ref !== 0) out[i] = pick(value, ref, candidates, KEEP_BIAS_EPS, true);
    }
    recent.unshift(Math.abs(value * out[i]));
    if (recent.length > 4) recent.pop();
  }
  return out;
}

/** Whether any split could matter to a history: none at all means nothing to do. */
const hasSplits = (b: ShareBasis | null | undefined): b is ShareBasis => !!b && b.splits.length > 0;

/** Months since year 0: quarter ends a few days apart (fiscal calendars, sources) share one. */
const monthOf = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/**
 * GAAP EPS on the price basis around a date: the median of net income over
 * normalised diluted shares for the rows within two periods, positive
 * values only (a loss says nothing about scale). Null when fewer than two.
 * Matched by month, so another source's rows for the same quarter find it.
 */
export function gaapAnchor(rows: readonly IncomeStatement[]): (date: string) => number | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const gaap = sorted.map((r) => (r.shares_outstanding_diluted > 0 && r.net_income > 0 ? r.net_income / r.shares_outstanding_diluted : null));
  const index = new Map(sorted.map((r, i) => [monthOf(r.date), i] as const));
  return (date) => {
    const i = index.get(monthOf(date));
    if (i === undefined) return null;
    const near = gaap.slice(Math.max(0, i - 2), i + 3).filter((v): v is number => v !== null);
    return near.length >= 2 ? median(near) : null;
  };
}

function normalizeIncome(rows: IncomeStatement[], basis: ShareBasis): IncomeStatement[] {
  const dil = countMultipliers(rows.map((r) => ({ date: r.date, value: r.shares_outstanding_diluted })), basis.splits, basis.sharesNow);
  const bas = countMultipliers(rows.map((r) => ({ date: r.date, value: r.shares_outstanding_basic })), basis.splits, basis.sharesNow);
  const counted = rows.map((r, i) => ({
    ...r,
    shares_outstanding_diluted: r.shares_outstanding_diluted * dil[i],
    shares_outstanding_basic: r.shares_outstanding_basic * bas[i],
  }));
  const anchor = gaapAnchor(counted);
  const epsD = perShareMultipliers(counted.map((r) => ({ date: r.date, value: r.eps_diluted })), basis.splits, anchor);
  const epsB = perShareMultipliers(counted.map((r) => ({ date: r.date, value: r.eps_basic })), basis.splits, anchor);
  return counted.map((r, i) => ({ ...r, eps_diluted: r.eps_diluted * epsD[i], eps_basic: r.eps_basic * epsB[i] }));
}

function normalizeBalance(rows: BalanceSheet[], basis: ShareBasis): BalanceSheet[] {
  const m = countMultipliers(rows.map((r) => ({ date: r.date, value: r.shares_outstanding })), basis.splits, basis.sharesNow);
  return rows.map((r, i) => (m[i] === 1 ? r : { ...r, shares_outstanding: r.shares_outstanding * m[i] }));
}

/** Statements with every share count and EPS on the price basis. Unchanged when there are no splits. */
export function normalizeShareBasis<F extends CompanyFinancials | null | undefined>(fin: F, basis: ShareBasis | null | undefined): F {
  if (!fin || !hasSplits(basis)) return fin;
  const inc = fin.income_statement;
  const bal = fin.balance_sheet;
  return {
    ...fin,
    income_statement: inc ? { annual: normalizeIncome(inc.annual ?? [], basis), quarterly: normalizeIncome(inc.quarterly ?? [], basis) } : inc,
    balance_sheet: bal ? { annual: normalizeBalance(bal.annual ?? [], basis), quarterly: normalizeBalance(bal.quarterly ?? [], basis) } : bal,
  };
}
