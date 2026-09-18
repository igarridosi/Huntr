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
 * statement points sit on the fiscal period end they report — the day the
 * quarter closed, where the price line is at that quarter's close.
 */

import type { CompanyFinancials, FinancialPeriod } from "@/types/financials";
import {
  METRICS,
  ttmApplies,
  type MarketContext,
  type MetricId,
  type MetricUnit,
  type PeriodBundle,
  type StatementReader,
} from "./metrics";
import type { ChartSeries, ChartSpec, Granularity, SeriesAxis } from "./spec";
import { formatValue } from "./format";

/** Metrics a one-off investment outflow flows into. */
const CAPEX_BASED = new Set<MetricId>(["capex", "free_cash_flow", "fcf_margin", "fcf_per_share"]);
/** A quarter's capex this many times the mean of the four before it is flagged. */
const CAPEX_SPIKE = 2;

/**
 * Quarters whose capex is out of line with the four before them. Data
 * vendors fold one-off purchases into "capital expenditures" — YETI's
 * Q3 2025 carried a $38M purchase of intangibles on top of $12M of
 * plant, so the quarter read as $50M of capex — and a chart of free
 * cash flow cannot tell that from a step up in spending. The filing can.
 */
export function capexSpikes(bundles: BundledPeriod[]): Array<{ bundle: BundledPeriod; capex: number; mean: number }> {
  const out: Array<{ bundle: BundledPeriod; capex: number; mean: number }> = [];
  const capexOf = (b: BundledPeriod) => {
    const v = b.cashflow?.capital_expenditures;
    return typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : null;
  };
  for (let i = 4; i < bundles.length; i++) {
    const capex = capexOf(bundles[i]);
    if (capex === null) continue;
    let sum = 0;
    let ok = true;
    for (let k = i - 4; k < i; k++) {
      const v = capexOf(bundles[k]);
      if (v === null || bundles[k + 1].bucket.key - bundles[k].bucket.key !== KEY_STEP) {
        ok = false;
        break;
      }
      sum += v;
    }
    const mean = sum / 4;
    if (ok && mean > 0 && capex > CAPEX_SPIKE * mean) out.push({ bundle: bundles[i], capex, mean });
  }
  return out;
}

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
    return { key: p.y, label: String(p.y) };
  }
  const q = Math.floor(p.m / 3);
  return {
    key: p.y * 4 + q,
    label: `Q${q + 1} ${p.y}`,
  };
}

export function bucketFromKey(key: number, granularity: Granularity): Bucket {
  if (granularity === "annual") {
    return { key, label: String(key) };
  }
  const y = Math.floor(key / 4);
  const q = key - y * 4;
  return { key, label: `Q${q + 1} ${y}` };
}

/** First day of the bucket a period-end date falls in, ISO. */
export function bucketStart(date: string, granularity: Granularity): string {
  const p = parseIso(date);
  if (!p) return date;
  if (granularity === "annual") return `${p.y}-01-01`;
  const m = Math.floor(p.m / 3) * 3 + 1;
  return `${p.y}-${String(m).padStart(2, "0")}-01`;
}

/** Last day of the bucket a period-end date falls in, ISO. */
export function bucketEnd(date: string, granularity: Granularity): string {
  const p = parseIso(date);
  if (!p) return date;
  if (granularity === "annual") return `${p.y}-12-31`;
  const q = Math.floor(p.m / 3);
  const last = new Date(Date.UTC(p.y, q * 3 + 3, 0)).getUTCDate();
  return `${p.y}-${String(q * 3 + 3).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Distance between consecutive buckets in key units. */
const KEY_STEP = 1;
/** How many buckets back "one year ago" is. */
const yearStep = (g: Granularity) => (g === "annual" ? 1 : 4);
/** The statement rows a granularity reads: `ttm` is quarterly data read four quarters at a time. */
const rowsOf = (g: Granularity): "annual" | "quarterly" => (g === "annual" ? "annual" : "quarterly");

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

  const rows = rowsOf(granularity);
  put(fin.income_statement?.[rows], (b) => b.income !== undefined, (b, r) => { b.income = r; });
  put(fin.balance_sheet?.[rows], (b) => b.balance !== undefined, (b, r) => { b.balance = r; });
  put(fin.cash_flow?.[rows], (b) => b.cashflow !== undefined, (b, r) => { b.cashflow = r; });

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
      if (granularity === "ttm" && def.parts) {
        // A ratio over twelve months is the ratio of the sums, not the
        // mean of four ratios: a heavy quarter weighs what it weighed.
        const { num, den, denKind, percent } = def.parts;
        const n = ttmAt(bundles, i, num);
        const d = denKind === "flow" ? ttmAt(bundles, i, den) : i >= 3 ? den(b) : null;
        v = n === null || d === null || d <= 0 ? null : (n / d) * (percent ? 100 : 1);
      } else if (granularity === "ttm" && def.kind === "flow") {
        v = ttmAt(bundles, i, def.read);
      } else {
        v = def.read(b);
      }
    } else if (def.source === "market" && def.derive) {
      const price = priceAt(prices, b.date);
      if (price !== null) {
        const ctx: MarketContext = {
          price,
          flow: (read) => (granularity === "annual" ? read(b) : ttmAt(bundles, i, read)),
          stock: (read) => read(b),
        };
        v = def.derive(ctx);
      }
    }
    out.set(b.bucket.key, v !== null && Number.isFinite(v) ? v : null);
  });

  return out;
}

/** Diluted shares from the income statement, else the balance sheet's count; a 0 means the source did not have it. */
const sharesOf: StatementReader = (p) => {
  for (const v of [p.income?.shares_outstanding_diluted, p.balance?.shares_outstanding]) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
};

/**
 * Applies the history-dependent transforms. `indexed` is not here: it
 * depends on the visible range and runs after the range filter.
 */
export function applyTransform(
  values: Keyed,
  transform: ChartSeries["transform"],
  granularity: Granularity,
  bundles: BundledPeriod[],
  metric?: MetricId
): Keyed {
  if (transform === "raw" || transform === "indexed") return values;
  // Four quarters summed once: on the annual view there are none, and on
  // the trailing-twelve-month view the period already did it.
  if (transform === "ttm" && granularity !== "quarterly") return values;

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

  const parts = metric ? METRICS[metric].parts : undefined;
  if (transform === "ttm" && parts) {
    // A ratio's TTM is the ratio of the sums, as on the ttm period.
    for (const [key, v] of values) {
      const i = bundles.findIndex((b) => b.bucket.key === key);
      if (v === null || i < 0) {
        out.set(key, null);
        continue;
      }
      const n = ttmAt(bundles, i, parts.num);
      const d = parts.denKind === "flow" ? ttmAt(bundles, i, parts.den) : i >= 3 ? parts.den(bundles[i]) : null;
      out.set(key, n === null || d === null || d <= 0 ? null : (n / d) * (parts.percent ? 100 : 1));
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

/**
 * Percent change from a base, in place order. The base is the value of
 * the period just before the first one shown when the caller has it, so
 * the first column carries its own change rather than a 0 % by
 * definition; otherwise the first non-null value shown (which is then 0).
 */
export function indexValues<T extends { value: number | null }>(points: T[], priorBase: number | null = null): T[] {
  const base = priorBase !== null && priorBase !== 0 ? priorBase : (points.find((p) => p.value !== null && p.value !== 0)?.value ?? null);
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

/** "AAPL · Rev TTM/sh": the metric, then the period when it is trailing twelve months, then the transform. */
export function seriesLabel(series: ChartSeries, granularity?: Granularity): string {
  if (series.label) return series.label;
  const def = METRICS[series.metric];
  const ttm = series.transform === "ttm" || (granularity === "ttm" && ttmApplies(def)) ? " TTM" : "";
  const suffix =
    series.transform === "per_share"
      ? "/sh"
      : series.transform === "yoy"
        ? " YoY"
        : series.transform === "indexed"
          ? " (indexed)"
          : "";
  return `${series.ticker} · ${def.short}${ttm}${suffix}`;
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
  /** The value of the period before `x`, from the unfiltered data — the base an indexed series starts from. */
  priorTo?: (x: number) => number | null;
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

  // On the time axis a bucket sits on the day its period closed. With
  // several companies in one bucket the latest of their closes is used,
  // so they keep sharing a row (and a bar slot) as they do by key.
  const bucketX = new Map<number, number>();
  if (xMode === "time") {
    for (const t of new Set(spec.series.filter((s) => METRICS[s.metric].source !== "price").map((s) => s.ticker))) {
      for (const b of bundlesFor(t) ?? []) {
        const end = Date.parse(b.date);
        if (!Number.isFinite(end)) continue;
        bucketX.set(b.bucket.key, Math.max(bucketX.get(b.bucket.key) ?? -Infinity, end));
      }
    }
  }
  const xOf = (b: BundledPeriod) => (xMode === "time" ? (bucketX.get(b.bucket.key) ?? Date.parse(b.date)) : b.bucket.key);

  const warnedTickers = new Set<string>();
  const all: SeriesPoints[] = [];

  for (const series of spec.series) {
    const def = METRICS[series.metric];
    const unit = unitOf(series);

    if (def.source === "price") {
      const prices = pricesFor(series.ticker);
      // The range is expressed in period ends; a price line must cover the
      // whole of the first and last bucket, not start at the first period's
      // close, or it begins after the bar that sits in that quarter.
      // A price-only chart has no buckets and keeps the range as given.
      const hasBuckets = spec.series.some((x) => METRICS[x.metric].source !== "price");
      const priceRange = hasBuckets
        ? {
            from: spec.range.from === null ? null : bucketStart(spec.range.from, spec.granularity),
            to: spec.range.to === null ? null : bucketEnd(spec.range.to, spec.granularity),
          }
        : spec.range;
      if (prices.length === 0 && !warnedTickers.has(`p:${series.ticker}`)) {
        warnedTickers.add(`p:${series.ticker}`);
        warnings.push({ seriesId: series.id, ticker: series.ticker, message: `No price history for ${series.ticker}.` });
      }
      const points = prices
        .filter((p) => inRange(p.date, priceRange))
        .map((p) => ({ x: Date.parse(p.date), value: p.close as number | null }));
      const priorTo = (x: number) => {
        let last: number | null = null;
        for (const p of prices) {
          if (Date.parse(p.date) >= x) break;
          last = p.close;
        }
        return last;
      };
      all.push({ series, unit, points, priorTo });
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
    const transformed = applyTransform(raw, series.transform, spec.granularity, bundles, series.metric);

    if (CAPEX_BASED.has(series.metric) && spec.granularity !== "annual" && !warnedTickers.has(`c:${series.ticker}`)) {
      const spikes = capexSpikes(bundles).filter((s) => inRange(s.bundle.date, spec.range));
      const last = spikes[spikes.length - 1];
      if (last) {
        warnedTickers.add(`c:${series.ticker}`);
        warnings.push({
          seriesId: series.id,
          ticker: series.ticker,
          message: `${series.ticker}'s capex in ${last.bundle.bucket.label} (${formatValue("currency", last.capex)}) is over twice the average of the four quarters before it (${formatValue("currency", last.mean)}) — check the filing for an acquisition or a one-off purchase of assets.`,
        });
      }
    }

    if ((series.transform === "ttm" || spec.granularity === "ttm") && spec.granularity !== "annual" && bundles.length < 4) {
      warnings.push({ seriesId: series.id, ticker: series.ticker, message: `${series.ticker} has fewer than four quarters; TTM cannot be computed.` });
    }

    const points = bundles
      .filter((b) => inRange(b.date, spec.range))
      .map((b) => ({ x: xOf(b), value: transformed.get(b.bucket.key) ?? null }));

    if (def.source === "market" && prices.length > 0 && points.length > 0 && points.every((p) => p.value === null)) {
      warnings.push({ seriesId: series.id, ticker: series.ticker, message: `${def.label} needs price history covering the periods shown, and the per-share figures behind it.` });
    }

    const keyOfX = new Map(bundles.map((b) => [xOf(b), b.bucket.key] as const));
    const priorTo = (x: number) => {
      const key = keyOfX.get(x);
      return key === undefined ? null : (transformed.get(key - KEY_STEP) ?? null);
    };
    all.push({ series, unit, points, priorTo });
  }

  // Axes
  const { axes, axisOf, warnings: axisWarnings } = assignAxes(
    all.map((s) => ({ id: s.series.id, axis: s.series.axis, unit: s.unit }))
  );
  warnings.push(...axisWarnings);

  // Align on the union of x values — or, in `common` mode, only on the
  // buckets every statement series with data reports, so one company's
  // extra quarter does not stand alone.
  const xs = new Set<number>();
  for (const s of all) for (const p of s.points) xs.add(p.x);
  if (spec.align === "common") {
    const statementSeries = all.filter(
      (s) => METRICS[s.series.metric].source !== "price" && s.points.some((p) => p.value !== null)
    );
    if (statementSeries.length > 1) {
      const bucketXs = new Set<number>();
      for (const s of statementSeries) for (const p of s.points) bucketXs.add(p.x);
      for (const x of bucketXs) {
        if (!statementSeries.every((s) => s.points.some((p) => p.x === x && p.value !== null))) {
          xs.delete(x);
          for (const s of statementSeries) s.points = s.points.filter((p) => p.x !== x);
        }
      }
    }
  }
  // Indexing runs last, on what is actually shown: the base is the period
  // just before the first one on the chart (so that column shows its own
  // change), falling back to the first shown value when there is none.
  for (const s of all) {
    if (s.series.transform !== "indexed") continue;
    const first = s.points.find((p) => p.value !== null);
    s.points = indexValues(s.points, first ? (s.priorTo?.(first.x) ?? null) : null);
  }

  // A history-dependent transform (YoY, TTM) or period has nothing to say
  // for its first year; those warm-up periods are dropped from the front
  // rather than shown as empty columns. Gaps elsewhere stay: they are real.
  let sortedX = [...xs].sort((a, b) => a - b);
  if (spec.granularity === "ttm" || all.some((s) => s.series.transform === "yoy" || s.series.transform === "ttm")) {
    const drawn = new Set<number>();
    for (const s of all) for (const p of s.points) if (p.value !== null) drawn.add(p.x);
    const firstDrawn = sortedX.findIndex((x) => drawn.has(x));
    sortedX = firstDrawn <= 0 ? sortedX : sortedX.slice(firstDrawn);
  }
  const indexOfX = new Map(sortedX.map((x, i) => [x, i] as const));

  const points: ResolvedPoint[] = sortedX.map((x, i) => ({ x: xMode === "category" ? i : x }) as ResolvedPoint);
  for (const s of all) {
    for (const p of points) p[s.series.id] = null;
    for (const p of s.points) {
      const i = indexOfX.get(p.x);
      if (i !== undefined) points[i][s.series.id] = p.value;
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
      warnings.push({ seriesId: s.series.id, ticker: s.series.ticker, message: `${seriesLabel(s.series, spec.granularity)} has no values in this range.` });
    }
    return {
      ...s.series,
      axis: axisOf.get(s.series.id) ?? s.series.axis,
      unit: s.unit,
      label: seriesLabel(s.series, spec.granularity),
      first,
      last,
      count: nonNull.length,
    };
  });

  return { xMode, points, xLabels, series, axes, warnings };
}
