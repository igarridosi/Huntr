/**
 * Chart Builder — the `ChartSpec` model.
 *
 * A spec is the single source of truth for a chart: the UI edits it, the
 * resolver turns it into data, the canvas paints it, the URL encodes it and
 * Supabase stores it. It is plain JSON and versioned, so anything that can
 * hold a spec (a shared link, a saved chart) keeps working across releases
 * as long as `migrateSpec` knows how to lift the old shape.
 */

import { METRICS, isMetricId, type MetricId } from "./metrics";

export const CHART_SPEC_VERSION = 1 as const;

export const MAX_SERIES = 8;
/** Four companies: enough for a comparison, few enough to keep Alpha Vantage calls in check. */
export const MAX_TICKERS = 4;
export const MAX_TITLE_LENGTH = 120;

/**
 * `line` is a stroke only; `area` is the same stroke with a gradient fill
 * underneath. They are distinct shapes on purpose — there is no separate
 * "fill" style switch that would make the two collapse into one.
 */
export type SeriesShape = "bar" | "line" | "area";
export type SeriesAxis = "left" | "right";

export type SeriesTransform =
  /** The value as reported. */
  | "raw"
  /** Divided by diluted shares outstanding of the same period. */
  | "per_share"
  /** Rolling four-quarter sum. Flow metrics on quarterly granularity only. */
  | "ttm"
  /** Percent change against the same period one year earlier. */
  | "yoy"
  /** Percent change from the first visible point. */
  | "indexed";

export interface ChartSeries {
  /** Short client-generated id; stable for the life of the series. */
  id: string;
  ticker: string;
  metric: MetricId;
  transform: SeriesTransform;
  shape: SeriesShape;
  axis: SeriesAxis;
  /** Hex colour. Defaults to the palette entry for the series' index. */
  color: string;
  /** Overrides the generated "AAPL · Revenue" legend label. */
  label?: string;
  /** Kept in the legend, not painted. */
  hidden?: boolean;
}

export type Granularity = "annual" | "quarterly";
export type CanvasTheme = "wolf" | "navy" | "snow" | "parchment";
export type AspectRatio = "16:9" | "4:3" | "1:1";
export type ValueLabels = "none" | "last" | "ends" | "all";
export type LegendPosition = "top" | "bottom" | "hidden";
/**
 * How an axis writes its numbers. The unit (currency, percent, multiple…)
 * comes from the series and is never overridden — "revenue as a
 * percentage" is not a thing an axis can mean — only the notation is.
 */
export type AxisFormat = "auto" | "compact" | "full";

export interface ChartStyle {
  theme: CanvasTheme;
  aspect: AspectRatio;
  legend: LegendPosition;
  grid: boolean;
  valueLabels: ValueLabels;
  /** Stacks `bar` series that share an axis. Never stacks across axes. */
  stacked: boolean;
  barRadius: 0 | 2 | 4;
  lineWidth: 1.5 | 2 | 2.5;
  /** Kept for older specs; the canvas always carries the watermark now. */
  watermark: boolean;
  yLeftFormat: AxisFormat;
  yRightFormat: AxisFormat;
}

export interface ChartRange {
  /** ISO date (YYYY-MM-DD) or null for "from the earliest point". */
  from: string | null;
  /** ISO date (YYYY-MM-DD) or null for "to the latest point". */
  to: string | null;
}

/**
 * Which periods make it onto the axis when companies report over different
 * windows. `common` keeps only the periods every statement series has, so a
 * quarter one company has filed and the rest have not does not become a
 * lone column; `all` shows the union and leaves the gaps visible.
 */
export type PeriodAlignment = "common" | "all";

export interface ChartSpec {
  v: typeof CHART_SPEC_VERSION;
  title: string;
  subtitle?: string;
  granularity: Granularity;
  align: PeriodAlignment;
  range: ChartRange;
  series: ChartSeries[];
  style: ChartStyle;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_STYLE: ChartStyle = {
  theme: "wolf",
  aspect: "16:9",
  legend: "top",
  grid: true,
  valueLabels: "last",
  stacked: false,
  barRadius: 2,
  lineWidth: 2,
  watermark: true,
  yLeftFormat: "auto",
  yRightFormat: "auto",
};

export function createSeriesId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function createSeries(
  input: Pick<ChartSeries, "ticker" | "metric"> & Partial<ChartSeries>
): ChartSeries {
  return {
    id: input.id ?? createSeriesId(),
    ticker: normalizeTicker(input.ticker),
    metric: input.metric,
    transform: input.transform ?? "raw",
    shape: input.shape ?? "bar",
    axis: input.axis ?? "left",
    color: input.color ?? "#FF8C42",
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
  };
}

export type SpecInit = Omit<Partial<ChartSpec>, "style"> & { style?: Partial<ChartStyle> };

export function createSpec(partial: SpecInit = {}): ChartSpec {
  return {
    v: CHART_SPEC_VERSION,
    title: partial.title ?? "Untitled chart",
    ...(partial.subtitle !== undefined ? { subtitle: partial.subtitle } : {}),
    granularity: partial.granularity ?? "quarterly",
    align: partial.align ?? "common",
    range: partial.range ?? { from: null, to: null },
    series: partial.series ?? [],
    style: { ...DEFAULT_STYLE, ...(partial.style ?? {}) },
  };
}

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

const TICKER_RE = /^[A-Z0-9.^=-]{1,12}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type SpecIssueCode =
  | "too_many_series"
  | "too_many_tickers"
  | "bad_ticker"
  | "unknown_metric"
  | "ttm_needs_quarterly"
  | "ttm_needs_flow"
  | "per_share_needs_currency"
  | "indexed_needs_line"
  | "price_needs_line"
  | "title_too_long"
  | "bad_range"
  | "range_inverted"
  | "duplicate_series_id";

export interface SpecIssue {
  code: SpecIssueCode;
  /** Series id the issue belongs to, when it is about one series. */
  seriesId?: string;
  message: string;
  /** `error` stops rendering; `warning` renders with the issue surfaced. */
  severity: "error" | "warning";
}

/**
 * Checks a spec against the model rules. Pure; never throws on a malformed
 * object because specs also arrive from URLs and old saved rows.
 */
export function validateSpec(spec: ChartSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];

  if (spec.title.length > MAX_TITLE_LENGTH) {
    issues.push({
      code: "title_too_long",
      severity: "warning",
      message: `Title longer than ${MAX_TITLE_LENGTH} characters.`,
    });
  }

  if (spec.series.length > MAX_SERIES) {
    issues.push({
      code: "too_many_series",
      severity: "error",
      message: `A chart holds at most ${MAX_SERIES} series.`,
    });
  }

  const tickers = new Set(spec.series.map((s) => s.ticker));
  if (tickers.size > MAX_TICKERS) {
    issues.push({
      code: "too_many_tickers",
      severity: "error",
      message: `A chart compares at most ${MAX_TICKERS} tickers.`,
    });
  }

  const seenIds = new Set<string>();
  for (const s of spec.series) {
    if (seenIds.has(s.id)) {
      issues.push({
        code: "duplicate_series_id",
        seriesId: s.id,
        severity: "error",
        message: `Series id "${s.id}" is used twice.`,
      });
    }
    seenIds.add(s.id);

    if (!TICKER_RE.test(s.ticker)) {
      issues.push({
        code: "bad_ticker",
        seriesId: s.id,
        severity: "error",
        message: `"${s.ticker}" is not a valid ticker.`,
      });
    }

    if (!isMetricId(s.metric)) {
      issues.push({
        code: "unknown_metric",
        seriesId: s.id,
        severity: "error",
        message: `Unknown metric "${String(s.metric)}".`,
      });
      continue;
    }
    const def = METRICS[s.metric];

    if (s.transform === "ttm") {
      if (spec.granularity !== "quarterly") {
        issues.push({
          code: "ttm_needs_quarterly",
          seriesId: s.id,
          severity: "warning",
          message: "TTM only applies to quarterly data; the annual value is shown instead.",
        });
      }
      if (def.kind !== "flow") {
        issues.push({
          code: "ttm_needs_flow",
          seriesId: s.id,
          severity: "warning",
          message: `${def.label} is not a flow; TTM is ignored.`,
        });
      }
    }

    if (s.transform === "per_share" && !(def.source === "statements" && def.unit === "currency")) {
      issues.push({
        code: "per_share_needs_currency",
        seriesId: s.id,
        severity: "warning",
        message: `${def.label} cannot be expressed per share; the raw value is shown.`,
      });
    }

    if (s.transform === "indexed" && s.shape === "bar") {
      issues.push({
        code: "indexed_needs_line",
        seriesId: s.id,
        severity: "warning",
        message: "Indexed series are drawn as lines.",
      });
    }

    // A daily price as bars would be thousands of one-day rectangles on a
    // time axis — unreadable, and heavy enough to stall the page.
    if (def.source === "price" && s.shape === "bar") {
      issues.push({
        code: "price_needs_line",
        seriesId: s.id,
        severity: "warning",
        message: "Prices are drawn as lines.",
      });
    }
  }

  const { from, to } = spec.range;
  if ((from !== null && !ISO_DATE_RE.test(from)) || (to !== null && !ISO_DATE_RE.test(to))) {
    issues.push({
      code: "bad_range",
      severity: "error",
      message: "Range dates must be YYYY-MM-DD.",
    });
  } else if (from !== null && to !== null && from > to) {
    issues.push({
      code: "range_inverted",
      severity: "error",
      message: "Range start is after its end.",
    });
  }

  return issues;
}

export function hasErrors(issues: SpecIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/**
 * Applies the coercions the warnings above describe, so a spec that came
 * from a URL or an older version renders the way the rules say instead of
 * relying on every consumer to re-implement them.
 */
export function normalizeSpec(spec: ChartSpec): ChartSpec {
  return {
    ...spec,
    title: spec.title.slice(0, MAX_TITLE_LENGTH),
    series: spec.series
      .filter((s) => isMetricId(s.metric))
      .slice(0, MAX_SERIES)
      .map((s) => {
        const def = METRICS[s.metric];
        let transform = s.transform;
        if (transform === "ttm" && (spec.granularity !== "quarterly" || def.kind !== "flow")) {
          transform = "raw";
        }
        if (transform === "per_share" && !(def.source === "statements" && def.unit === "currency")) {
          transform = "raw";
        }
        const shape: SeriesShape = s.shape === "bar" && (transform === "indexed" || def.source === "price") ? "line" : s.shape;
        return { ...s, ticker: normalizeTicker(s.ticker), transform, shape };
      }),
  };
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

export type MigrationResult =
  | { ok: true; spec: ChartSpec; migratedFrom: number | null }
  | { ok: false; reason: "newer_version" | "malformed" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Lifts a spec of any known version to the current one. Unknown fields are
 * dropped, missing style fields take their defaults, and a spec written by a
 * newer build is refused rather than half-read.
 */
export function migrateSpec(input: unknown): MigrationResult {
  if (!isRecord(input)) return { ok: false, reason: "malformed" };

  const v = typeof input.v === "number" ? input.v : 0;
  if (v > CHART_SPEC_VERSION) return { ok: false, reason: "newer_version" };

  if (typeof input.title !== "string" || !Array.isArray(input.series)) {
    return { ok: false, reason: "malformed" };
  }

  const series: ChartSeries[] = [];
  for (const raw of input.series) {
    if (!isRecord(raw) || typeof raw.ticker !== "string" || typeof raw.metric !== "string") {
      return { ok: false, reason: "malformed" };
    }
    series.push(
      createSeries({
        id: typeof raw.id === "string" ? raw.id : undefined,
        ticker: raw.ticker,
        metric: raw.metric as MetricId,
        transform: isTransform(raw.transform) ? raw.transform : "raw",
        shape: isShape(raw.shape) ? raw.shape : "bar",
        axis: raw.axis === "right" ? "right" : "left",
        color: typeof raw.color === "string" ? raw.color : undefined,
        label: typeof raw.label === "string" ? raw.label : undefined,
        hidden: raw.hidden === true ? true : undefined,
      })
    );
  }

  const style = isRecord(input.style) ? input.style : {};
  const range = isRecord(input.range) ? input.range : {};

  const spec = createSpec({
    title: input.title,
    subtitle: typeof input.subtitle === "string" ? input.subtitle : undefined,
    granularity: input.granularity === "annual" ? "annual" : "quarterly",
    align: input.align === "all" ? "all" : "common",
    range: {
      from: typeof range.from === "string" ? range.from : null,
      to: typeof range.to === "string" ? range.to : null,
    },
    series,
    style: pickStyle(style),
  });

  return { ok: true, spec, migratedFrom: v === CHART_SPEC_VERSION ? null : v };
}

const TRANSFORMS: readonly SeriesTransform[] = ["raw", "per_share", "ttm", "yoy", "indexed"];
const SHAPES: readonly SeriesShape[] = ["bar", "line", "area"];

function isTransform(v: unknown): v is SeriesTransform {
  return typeof v === "string" && (TRANSFORMS as readonly string[]).includes(v);
}
function isShape(v: unknown): v is SeriesShape {
  return typeof v === "string" && (SHAPES as readonly string[]).includes(v);
}

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | undefined {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : undefined;
}

/** Keeps only known style fields with valid values; the rest fall back to defaults. */
function pickStyle(raw: Record<string, unknown>): Partial<ChartStyle> {
  const out: Partial<ChartStyle> = {};
  const theme = oneOf<CanvasTheme>(raw.theme, ["wolf", "navy", "snow", "parchment"]);
  const aspect = oneOf<AspectRatio>(raw.aspect, ["16:9", "4:3", "1:1"]);
  const legend = oneOf<LegendPosition>(raw.legend, ["top", "bottom", "hidden"]);
  const valueLabels = oneOf<ValueLabels>(raw.valueLabels, ["none", "last", "ends", "all"]);
  const barRadius = oneOf<0 | 2 | 4>(raw.barRadius, [0, 2, 4]);
  const lineWidth = oneOf<1.5 | 2 | 2.5>(raw.lineWidth, [1.5, 2, 2.5]);
  // Older specs stored a unit override here ("currency" | "percent" |
  // "number"); those collapse to the default notation.
  const yLeftFormat = oneOf<AxisFormat>(raw.yLeftFormat, ["auto", "compact", "full"]);
  const yRightFormat = oneOf<AxisFormat>(raw.yRightFormat, ["auto", "compact", "full"]);
  if (theme) out.theme = theme;
  if (aspect) out.aspect = aspect;
  if (legend) out.legend = legend;
  if (valueLabels) out.valueLabels = valueLabels;
  if (barRadius !== undefined) out.barRadius = barRadius;
  if (lineWidth !== undefined) out.lineWidth = lineWidth;
  if (yLeftFormat) out.yLeftFormat = yLeftFormat;
  if (yRightFormat) out.yRightFormat = yRightFormat;
  if (typeof raw.grid === "boolean") out.grid = raw.grid;
  if (typeof raw.stacked === "boolean") out.stacked = raw.stacked;
  if (typeof raw.watermark === "boolean") out.watermark = raw.watermark;
  return out;
}
