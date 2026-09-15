/**
 * Chart Builder — the resolver.
 *
 * Turns a `ChartSpec` plus raw data (statements per ticker, daily closes per
 * ticker) into the aligned table the canvas paints. Pure: no React, no
 * fetching, no dates from the wall clock.
 *
 * Alignment rule: statement periods are bucketed by *calendar* quarter or
 * year of their period-end date, so companies with different fiscal years
 * share a column (Microsoft's June quarter and Alphabet's June quarter are
 * the same bucket). When any series is a price, the x axis becomes time and
 * statement points sit at the middle of their bucket.
 */

import type { CompanyFinancials, FinancialPeriod } from "@/types/financials";
import {
  METRICS,
  type MarketContext,
  type MetricUnit,
  type PeriodBundle,
  type StatementReader,
} from "./metrics";
import type { ChartSeries, ChartSpec, Granularity, SeriesAxis } from "./spec";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PricePoint {
  /** ISO date. */
  date: string;
  close: number;
}

export interface ResolveInputs {
  financials: Record<string, CompanyFinancials | null | undefined>;
  prices: Record<string, PricePoint[] | undefined>;
}

export type XMode = "category" | "time";

/** One row of the chart table: `x` plus one column per series id. */
export type ResolvedPoint = { x: number } & Record<string, number | null>;

export interface ResolvedSeries extends ChartSeries {
  unit: MetricUnit;
  /** Legend label: the override, or "AAPL · Rev TTM". */
  label: string;
  first: { x: number; value: number } | null;
  last: { x: number; value: number } | null;
  /** Non-null points. */
  count: number;
}

export interface ResolveWarning {
  seriesId?: string;
  ticker?: string;
  message: string;
}

export interface ResolvedChart {
  xMode: XMode;
  points: ResolvedPoint[];
  /** Category mode only; index-aligned with `points`. */
  xLabels: string[];
  series: ResolvedSeries[];
  axes: { left: MetricUnit | null; right: MetricUnit | null };
  warnings: ResolveWarning[];
}

// ---------------------------------------------------------------------------
// Calendar buckets
// ---------------------------------------------------------------------------

export interface Bucket {
  /** Sortable, arithmetic key: year*4+quarter or year. */
  key: number;
  label: string;
  /** Epoch ms at the middle of the bucket (for the time axis). */
  mid: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseIso(date: string): { y: number; m: number; d: number } | null {
  const m = ISO_RE.exec(date);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

export function toCalendarBucket(date: string, granularity: Granularity): Bucket | null {
  const p = parseIso(date);
  if (!p) return null;
  if (granularity === "annual") {
    return { key: p.y, label: String(p.y), mid: Date.UTC(p.y, 6, 1) };
  }
  const q = Math.floor(p.m / 3);
  return {
    key: p.y * 4 + q,
    label: `Q${q + 1} ${p.y}`,
    mid: Date.UTC(p.y, q * 3 + 1, 15),
  };
}

export function bucketFromKey(key: number, granularity: Granularity): Bucket {
  if (granularity === "annual") {
    return { key, label: String(key), mid: Date.UTC(key, 6, 1) };
  }
  const y = Math.floor(key / 4);
  const q = key - y * 4;
  return { key, label: `Q${q + 1} ${y}`, mid: Date.UTC(y, q * 3 + 1, 15) };
}

/** Distance between consecutive buckets in key units. */
const KEY_STEP = 1;
/** How many buckets back "one year ago" is. */
const yearStep = (g: Granularity) => (g === "quarterly" ? 4 : 1);

// ---------------------------------------------------------------------------
// Bundling statements
// ---------------------------------------------------------------------------

export interface BundledPeriod extends PeriodBundle {
  bucket: Bucket;
}

/**
 * Joins income, balance and cash-flow rows of one granularity by calendar
 * bucket. Rows for the same bucket from the same statement keep the first
 * one seen (sources list newest first, so that is the latest restatement).
 */
export function bundlePeriods(
  fin: CompanyFinancials,
  granularity: Granularity
): BundledPeriod[] {
  const byKey = new Map<number, BundledPeriod>();

  const put = <R extends FinancialPeriod>(
    rows: ReadonlyArray<R> | undefined,
    has: (b: BundledPeriod) => boolean,
    set: (b: BundledPeriod, row: R) => void
  ) => {
    for (const row of rows ?? []) {
      const bucket = toCalendarBucket(row.date, granularity);
      if (!bucket) continue;
      let bundle = byKey.get(bucket.key);
      if (!bundle) {
        bundle = { date: row.date, period: row.period, bucket };
        byKey.set(bucket.key, bundle);
      }
      if (!has(bundle)) {
        set(bundle, row);
        // The bundle's date is the latest period end among its statements.
        if (row.date > bundle.date) bundle.date = row.date;
      }
    }
  };

  put(fin.income_statement?.[granularity], (b) => b.income !== undefined, (b, r) => { b.income = r; });
  put(fin.balance_sheet?.[granularity], (b) => b.balance !== undefined, (b, r) => { b.balance = r; });
  put(fin.cash_flow?.[granularity], (b) => b.cashflow !== undefined, (b, r) => { b.cashflow = r; });

  return [...byKey.values()].sort((a, b) => a.bucket.key - b.bucket.key);
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Closes older than this before a period end are not "the close at period end". */
const MAX_PRICE_GAP_DAYS = 14;

/** Last close on or before `date`, or null when none is close enough. */
export function priceAt(sorted: PricePoint[], date: string): number | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const gapDays = (Date.parse(date) - Date.parse(sorted[found].date)) / 86_400_000;
  if (!Number.isFinite(gapDays) || gapDays > MAX_PRICE_GAP_DAYS) return null;
  const close = sorted[found].close;
  return Number.isFinite(close) && close > 0 ? close : null;
}

function sortedPrices(points: PricePoint[] | undefined): PricePoint[] {
  return (points ?? [])
    .filter((p) => ISO_RE.test(p.date) && Number.isFinite(p.close) && p.close > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Per-series values
// ---------------------------------------------------------------------------

/** Values keyed by bucket key. */
type Keyed = Map<number, number | null>;

/** Sum of the reader over the four consecutive buckets ending at `i`. */
function ttmAt(bundles: BundledPeriod[], i: number, read: StatementReader): number | null {
  if (i < 3) return null;
  let total = 0;
  for (let k = i - 3; k <= i; k++) {
    if (k > i - 3 && bundles[k].bucket.key - bundles[k - 1].bucket.key !== KEY_STEP) return null;
    const v = read(bundles[k]);
    if (v === null) return null;
    total += v;
  }
  return total;
}

function statementValues(
  series: ChartSeries,
  granularity: Granularity,
  bundles: BundledPeriod[],
  prices: PricePoint[]
): Keyed {
  const def = METRICS[series.metric];
  const out: Keyed = new Map();

  bundles.forEach((b, i) => {
    let v: number | null = null;
    if (def.source === "statements" && def.read) {
      v = def.read(b);
    } else if (def.source === "market" && def.derive) {
      const price = priceAt(prices, b.date);
      if (price !== null) {
        const ctx: MarketContext = {
          price,
          flow: (read) => (granularity === "quarterly" ? ttmAt(bundles, i, read) : read(b)),
          stock: (read) => read(b),
        };
        v = def.derive(ctx);
      }
    }
    out.set(b.bucket.key, v !== null && Number.isFinite(v) ? v : null);
  });

  return out;
}

const sharesOf: StatementReader = (p) => {
  const v = p.income?.shares_outstanding_diluted ?? p.balance?.shares_outstanding;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Applies the history-dependent transforms. `indexed` is not here: it
 * depends on the visible range and runs after the range filter.
 */
export function applyTransform(
  values: Keyed,
  transform: ChartSeries["transform"],
  granularity: Granularity,
  bundles: BundledPeriod[]
): Keyed {
  if (transform === "raw" || transform === "indexed") return values;

  const out: Keyed = new Map();
  const byKey = new Map(bundles.map((b) => [b.bucket.key, b] as const));

  if (transform === "per_share") {
    for (const [key, v] of values) {
      const bundle = byKey.get(key);
      const shares = bundle ? sharesOf(bundle) : null;
      out.set(key, v === null || shares === null ? null : v / shares);
    }
    return out;
  }

  if (transform === "ttm") {
    for (const [key, v] of values) {
      if (v === null) {
        out.set(key, null);
        continue;
      }
      let total = 0;
      let ok = true;
      for (let back = 0; back < 4; back++) {
        const prev = values.get(key - back * KEY_STEP);
        if (prev === null || prev === undefined) {
          ok = false;
          break;
        }
        total += prev;
      }
      out.set(key, ok ? total : null);
    }
    return out;
  }

  // yoy
  const step = yearStep(granularity);
  for (const [key, v] of values) {
    const prev = values.get(key - step);
    out.set(key, v === null || prev === null || prev === undefined || prev <= 0 ? null : (v / prev - 1) * 100);
  }
  return out;
}

/** Percent change from the first non-null value, in place order. */
export function indexValues<T extends { value: number | null }>(points: T[]): T[] {
  const base = points.find((p) => p.value !== null && p.value !== 0)?.value ?? null;
  return points.map((p) => ({
    ...p,
    value: base === null || p.value === null ? null : (p.value / base - 1) * 100,
  }));
}

export function unitOf(series: ChartSeries): MetricUnit {
  if (series.transform === "indexed" || series.transform === "yoy") return "percent";
  if (series.transform === "per_share") return "per_share";
  return METRICS[series.metric].unit;
}

export function seriesLabel(series: ChartSeries): string {
  if (series.label) return series.label;
  const short = METRICS[series.metric].short;
  const suffix =
    series.transform === "per_share"
      ? "/sh"
      : series.transform === "ttm"
        ? " TTM"
        : series.transform === "yoy"
          ? " YoY"
          : series.transform === "indexed"
            ? " (indexed)"
            : "";
  return `${series.ticker} · ${short}${suffix}`;
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

/**
 * Keeps one unit per axis. A series whose unit clashes with its axis moves
 * to the other axis when that one is free (or already in its unit);
 * otherwise it stays and a warning says the axis mixes units.
 */
export function assignAxes(
  series: Array<{ id: string; axis: SeriesAxis; unit: MetricUnit }>
): { axes: ResolvedChart["axes"]; axisOf: Map<string, SeriesAxis>; warnings: ResolveWarning[] } {
  const axes: ResolvedChart["axes"] = { left: null, right: null };
  const axisOf = new Map<string, SeriesAxis>();
  const warnings: ResolveWarning[] = [];

  for (const s of series) {
    const other: SeriesAxis = s.axis === "left" ? "right" : "left";
    if (axes[s.axis] === null || axes[s.axis] === s.unit) {
      axes[s.axis] = s.unit;
      axisOf.set(s.id, s.axis);
    } else if (axes[other] === null || axes[other] === s.unit) {
      axes[other] = s.unit;
      axisOf.set(s.id, other);
      warnings.push({ seriesId: s.id, message: `Moved to the ${other} axis: its unit differs from the ${s.axis} axis.` });
    } else {
      axisOf.set(s.id, s.axis);
      warnings.push({ seriesId: s.id, message: `The ${s.axis} axis mixes units; values are shown unformatted.` });
    }
  }

  return { axes, axisOf, warnings };
}

// ---------------------------------------------------------------------------
// resolveChart
// ---------------------------------------------------------------------------

interface SeriesPoints {
  series: ChartSeries;
  unit: MetricUnit;
  /** Category mode: bucket key; time mode: epoch ms. */
  points: Array<{ x: number; value: number | null }>;
}

function inRange(date: string, range: ChartSpec["range"]): boolean {
  if (range.from !== null && date < range.from) return false;
  if (range.to !== null && date > range.to) return false;
  return true;
}

export function resolveChart(spec: ChartSpec, inputs: ResolveInputs): ResolvedChart {
  const warnings: ResolveWarning[] = [];
  const xMode: XMode = spec.series.some((s) => METRICS[s.metric].source === "price") ? "time" : "category";

  const bundleCache = new Map<string, BundledPeriod[] | null>();
  const priceCache = new Map<string, PricePoint[]>();
  const bundlesFor = (ticker: string): BundledPeriod[] | null => {
    if (!bundleCache.has(ticker)) {
      const fin = inputs.financials[ticker];
      bundleCache.set(ticker, fin ? bundlePeriods(fin, spec.granularity) : null);
    }
    return bundleCache.get(ticker) ?? null;
  };
  const pricesFor = (ticker: string): PricePoint[] => {
    let p = priceCache.get(ticker);
    if (!p) {
      p = sortedPrices(inputs.prices[ticker]);
      priceCache.set(ticker, p);
    }
    return p;
  };

  const warnedTickers = new Set<string>();
  const all: SeriesPoints[] = [];

  for (const series of spec.series) {
    const def = METRICS[series.metric];
    const unit = unitOf(series);

    if (def.source === "price") {
      const prices = pricesFor(series.ticker);
      if (prices.length === 0 && !warnedTickers.has(`p:${series.ticker}`)) {
        warnedTickers.add(`p:${series.ticker}`);
        warnings.push({ seriesId: series.id, ticker: series.ticker, message: `No price history for ${series.ticker}.` });
      }
      let points = prices
        .filter((p) => inRange(p.date, spec.range))
        .map((p) => ({ x: Date.parse(p.date), value: p.close as number | null }));
      if (series.transform === "indexed") points = indexValues(points);
      all.push({ series, unit, points });
      continue;
    }

    const bundles = bundlesFor(series.ticker);
    if (!bundles || bundles.length === 0) {
      if (!warnedTickers.has(`f:${series.ticker}`)) {
        warnedTickers.add(`f:${series.ticker}`);
        warnings.push({ seriesId: series.id, ticker: series.ticker, message: `No financial statements for ${series.ticker}.` });
      }
      all.push({ series, unit, points: [] });
      continue;
    }

    const prices = def.source === "market" ? pricesFor(series.ticker) : [];
    if (def.source === "market" && prices.length === 0 && !warnedTickers.has(`p:${series.ticker}`)) {
      warnedTickers.add(`p:${series.ticker}`);
      warnings.push({ seriesId: series.id, ticker: series.ticker, message: `No price history for ${series.ticker}; market metrics need it.` });
    }

    const raw = statementValues(series, spec.granularity, bundles, prices);
    const transformed = applyTransform(raw, series.transform, spec.granularity, bundles);

    if (series.transform === "ttm" && spec.granularity === "quarterly" && bundles.length < 4) {
      warnings.push({ seriesId: series.id, ticker: series.ticker, message: `${series.ticker} has fewer than four quarters; TTM cannot be computed.` });
    }

    let points = bundles
      .filter((b) => inRange(b.date, spec.range))
      .map((b) => ({ x: xMode === "time" ? b.bucket.mid : b.bucket.key, value: transformed.get(b.bucket.key) ?? null }));
    if (series.transform === "indexed") points = indexValues(points);

    if (def.source === "market" && prices.length > 0 && points.length > 0 && points.every((p) => p.value === null)) {
      warnings.push({ seriesId: series.id, ticker: series.ticker, message: `${def.label} needs price history covering the periods shown.` });
    }

    all.push({ series, unit, points });
  }

  // Axes
  const { axes, axisOf, warnings: axisWarnings } = assignAxes(
    all.map((s) => ({ id: s.series.id, axis: s.series.axis, unit: s.unit }))
  );
  warnings.push(...axisWarnings);

  // Align on the union of x values.
  const xs = new Set<number>();
  for (const s of all) for (const p of s.points) xs.add(p.x);
  const sortedX = [...xs].sort((a, b) => a - b);
  const indexOfX = new Map(sortedX.map((x, i) => [x, i] as const));

  const points: ResolvedPoint[] = sortedX.map((x, i) => ({ x: xMode === "category" ? i : x }) as ResolvedPoint);
  for (const s of all) {
    for (const p of points) p[s.series.id] = null;
    for (const p of s.points) {
      const row = points[indexOfX.get(p.x)!];
      row[s.series.id] = p.value;
    }
  }

  const xLabels = xMode === "category" ? sortedX.map((key) => bucketFromKey(key, spec.granularity).label) : [];

  const series: ResolvedSeries[] = all.map((s) => {
    const nonNull = s.points.filter((p): p is { x: number; value: number } => p.value !== null);
    const toX = (x: number) => (xMode === "category" ? indexOfX.get(x)! : x);
    const first = nonNull.length ? { x: toX(nonNull[0].x), value: nonNull[0].value } : null;
    const lastP = nonNull[nonNull.length - 1];
    const last = lastP ? { x: toX(lastP.x), value: lastP.value } : null;
    if (nonNull.length === 0 && s.points.length > 0) {
      warnings.push({ seriesId: s.series.id, ticker: s.series.ticker, message: `${seriesLabel(s.series)} has no values in this range.` });
    }
    return {
      ...s.series,
      axis: axisOf.get(s.series.id) ?? s.series.axis,
      unit: s.unit,
      label: seriesLabel(s.series),
      first,
      last,
      count: nonNull.length,
    };
  });

  return { xMode, points, xLabels, series, axes, warnings };
}
