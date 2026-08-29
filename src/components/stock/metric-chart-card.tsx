"use client";

import { useId, useMemo, useState } from "react";

import {
  BarChart as RechartsBarChart,
  Bar,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { useChartColors } from "@/hooks/use-chart-colors";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Badge } from "@/components/ui/badge";
import { cn, formatPercent } from "@/lib/utils";

// ---- Types ----

export interface MetricChartCardData {
  period: string;
  value: number;
  date?: string;
}

export interface MetricChartCardProps {
  /** Card title displayed top-left */
  title: string;
  /** Chart data (chronological: oldest → newest) */
  data: MetricChartCardData[];
  /** "bar" | "area" render mode */
  type?: "bar" | "area";
  /** Bar / stroke color */
  color?: string;
  /** Value formatter for Y-axis + tooltip */
  formatter?: (value: number) => string;
  /** If provided, shows a growth badge next to the title */
  growth?: number | null;
  /** Show compact Y-axis on the left */
  showYAxis?: boolean;
  /** Annual series for dialog toggle */
  annualData?: MetricChartCardData[];
  /** Quarterly series for dialog toggle */
  quarterlyData?: MetricChartCardData[];
  /** Optional comparison series (for dual bar cards) */
  compareData?: MetricChartCardData[];
  /** Annual comparison series for dialog */
  compareAnnualData?: MetricChartCardData[];
  /** Quarterly comparison series for dialog */
  compareQuarterlyData?: MetricChartCardData[];
  /** Label for primary series in tooltip */
  seriesLabel?: string;
  /** Label for comparison series in tooltip */
  compareLabel?: string;
  /** Color for comparison bars */
  compareColor?: string;
  /** Initial year range selected in expanded modal */
  defaultYearRange?: YearRangeFilter;
  /** Optional custom Y-axis tick formatter */
  yAxisTickFormatter?: (value: number) => string;
  /** Optional horizontal reference line for threshold metrics */
  referenceLineY?: number;
  /** Optional reference line color */
  referenceLineColor?: string;
  /** Show/hide performance footer badges in expanded dialog */
  showPerformanceFooter?: boolean;
  /** Optional max clamp for Y-axis visual scaling */
  yMaxClamp?: number;
}

type ChartPeriodFilter = "annual" | "quarterly";
type YearRangeFilter = 5 | 10 | 15 | 20;

/**
 * Compact metric chart card — Qualtrim-inspired.
 * Displays title, optional growth badge, and a mini chart.
 */
export function MetricChartCard({
  title,
  data,
  type = "bar",
  color = "#FF8C42",
  formatter = defaultFormatter,
  growth,
  showYAxis = true,
  annualData,
  quarterlyData,
  compareData,
  compareAnnualData,
  compareQuarterlyData,
  seriesLabel,
  compareLabel = "Comparison",
  compareColor = "#6b7280",
  defaultYearRange = 20,
  yAxisTickFormatter,
  referenceLineY,
  referenceLineColor = "#ef4444",
  showPerformanceFooter = true,
  yMaxClamp,
}: MetricChartCardProps) {
  const chartId = useId().replace(/:/g, "");
  const miniGradientId = `mc-grad-${chartId}-mini`;
  const expandedGradientId = `mc-grad-${chartId}-expanded`;
  const [dialogPeriod, setDialogPeriod] = useState<ChartPeriodFilter>("annual");
  const [yearRange, setYearRange] = useState<YearRangeFilter>(defaultYearRange);

  const annualSeries = annualData ?? data;
  const quarterlySeries = quarterlyData ?? annualSeries;
  const resolvedSeriesLabel = seriesLabel ?? title;
  const compareAnnualSeries = useMemo(
    () => compareAnnualData ?? compareData ?? [],
    [compareAnnualData, compareData]
  );
  const compareQuarterlySeries = compareQuarterlyData ?? compareAnnualSeries;

  // Offered ranges come from the full annual series, not the filtered one, so
  // the buttons do not shrink as a narrower range is picked.
  const yearRangeOptions = useMemo(
    () => availableYearRanges(seriesSpanInYears(annualSeries)),
    [annualSeries]
  );
  // The requested default can outrun the history - clamp to the widest option
  // this stock actually has.
  const effectiveYearRange = yearRangeOptions.includes(yearRange)
    ? yearRange
    : yearRangeOptions[yearRangeOptions.length - 1];

  const annualFiltered = useMemo(
    () => filterSeriesByYearRange(annualSeries, effectiveYearRange),
    [annualSeries, effectiveYearRange]
  );
  const quarterlyFiltered = useMemo(
    () => filterSeriesByYearRange(quarterlySeries, effectiveYearRange),
    [quarterlySeries, effectiveYearRange]
  );
  const compareAnnualFiltered = useMemo(
    () => filterSeriesByYearRange(compareAnnualSeries, effectiveYearRange),
    [compareAnnualSeries, effectiveYearRange]
  );
  const compareQuarterlyFiltered = useMemo(
    () => filterSeriesByYearRange(compareQuarterlySeries, effectiveYearRange),
    [compareQuarterlySeries, effectiveYearRange]
  );

  const dialogData = useMemo(
    () => (dialogPeriod === "annual" ? annualFiltered : quarterlyFiltered),
    [dialogPeriod, annualFiltered, quarterlyFiltered]
  );
  const dialogCompareData = useMemo(
    () => (dialogPeriod === "annual" ? compareAnnualFiltered : compareQuarterlyFiltered),
    [dialogPeriod, compareAnnualFiltered, compareQuarterlyFiltered]
  );
  const performance = useMemo(
    () => buildPerformanceBadges(dialogData, dialogPeriod),
    [dialogData, dialogPeriod]
  );
  const shouldShowPerformanceFooter = showPerformanceFooter;

  if (!data.length) return null;

  return (
    <div className="insight-enter flex flex-col gap-2 rounded-xl bg-wolf-surface p-4 ring-1 ring-inset ring-wolf-border/50">
      {/* Header: title + growth badge */}
      <div className="flex items-center gap-2">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/70">
          {title}
        </h3>
        {growth !== undefined && growth !== null && (
          <Badge
            variant={growth >= 0 ? "bullish" : "bearish"}
            className="shrink-0 px-1.5 py-0 font-mono text-[10px] leading-4 tabular-nums"
            title="Change across the visible window"
          >
            {growth >= 0 ? "↑" : "↓"} {formatPercent(Math.abs(growth), 1)}
          </Badge>
        )}
        <div className="ml-auto">
          <ExpandChartDialog
            title={title}
            headerRight={
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 items-center rounded-xl bg-snow-peak/[0.04] p-0.5 ring-1 ring-inset ring-wolf-border/50">
                  {yearRangeOptions.map((years) => (
                    <button
                      key={years}
                      type="button"
                      onClick={() => setYearRange(years)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums",
                        "transition-[background-color,color,transform] duration-150 ease-out",
                        "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                        effectiveYearRange === years
                          ? "bg-sunset-orange/15 text-sunset-orange"
                          : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak"
                      )}
                    >
                      {years}Y
                    </button>
                  ))}
                </div>

                <div className="inline-flex h-8 items-center rounded-xl bg-snow-peak/[0.04] p-0.5 ring-1 ring-inset ring-wolf-border/50">
                  {(["annual", "quarterly"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setDialogPeriod(period)}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-medium capitalize",
                        "transition-[background-color,color,transform] duration-150 ease-out",
                        "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                        dialogPeriod === period
                          ? "bg-sunset-orange/15 text-sunset-orange"
                          : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak"
                      )}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
            }
            footer={shouldShowPerformanceFooter && performance.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {performance.map((item) => (
                  <span
                    key={item.label}
                    className={cn(
                      "inline-flex h-7 items-center rounded-lg px-2.5 font-mono text-xs tabular-nums",
                      "ring-1 ring-inset",
                      item.value >= 0
                        ? "bg-bullish/12 text-bullish ring-bullish/25"
                        : "bg-bearish/12 text-bearish ring-bearish/25"
                    )}
                  >
                    {item.label}: {formatPercent(item.value, 1)}
                  </span>
                ))}
              </div>
            ) : null}
          >
            <div className="h-[420px] w-full">
              <MetricChartRender
                data={dialogData}
                compareData={dialogCompareData}
                type={type}
                color={color}
                compareColor={compareColor}
                seriesLabel={resolvedSeriesLabel}
                compareLabel={compareLabel}
                formatter={formatter}
                yAxisTickFormatter={yAxisTickFormatter}
                referenceLineY={referenceLineY}
                referenceLineColor={referenceLineColor}
                yMaxClamp={yMaxClamp}
                showYAxis
                gradientId={expandedGradientId}
              />
            </div>
          </ExpandChartDialog>
        </div>
      </div>

      <div className="w-full h-40">
        <MetricChartRender
          data={data}
          compareData={compareData}
          type={type}
          color={color}
          compareColor={compareColor}
          seriesLabel={resolvedSeriesLabel}
          compareLabel={compareLabel}
          formatter={formatter}
          yAxisTickFormatter={yAxisTickFormatter}
          referenceLineY={referenceLineY}
          referenceLineColor={referenceLineColor}
          yMaxClamp={yMaxClamp}
          showYAxis={showYAxis}
          gradientId={miniGradientId}
        />
      </div>
    </div>
  );
}

interface MetricChartRenderProps {
  data: MetricChartCardData[];
  compareData?: MetricChartCardData[];
  type: "bar" | "area";
  color: string;
  compareColor: string;
  seriesLabel: string;
  compareLabel: string;
  formatter: (value: number) => string;
  yAxisTickFormatter?: (value: number) => string;
  referenceLineY?: number;
  referenceLineColor: string;
  yMaxClamp?: number;
  showYAxis: boolean;
  gradientId: string;
}

function MetricChartRender({
  data,
  compareData,
  type,
  color,
  compareColor,
  seriesLabel,
  compareLabel,
  formatter,
  yAxisTickFormatter,
  referenceLineY,
  referenceLineColor,
  yMaxClamp,
  showYAxis,
  gradientId,
}: MetricChartRenderProps) {
  const c = useChartColors();
  const prefersReducedMotion = usePrefersReducedMotion();

  // Switching range or granularity replaces the series outright. Left alone,
  // Recharts tweens old bar to new bar by position, so flipping annual to
  // quarterly slides 2019's bar into Q3's - two unrelated figures - and reads
  // as the data warping rather than being replaced. Remounting on a key built
  // from the window itself makes every switch a clean rebuild from the
  // baseline: the bars grow back up in place, which is legible as "this is a
  // different set of numbers". It also makes the motion interruption-proof,
  // because a rapid second switch discards the first tree mid-flight instead
  // of queueing behind it.
  const seriesKey = useMemo(
    () =>
      [
        data.length,
        data[0]?.period ?? "",
        data[data.length - 1]?.period ?? "",
      ].join("|"),
    [data]
  );

  // Long enough to read as growth, short enough that it never delays reading
  // the chart. Recharts' own default is 1500ms, which feels like waiting.
  const animationDuration = prefersReducedMotion ? 0 : 460;

  const yDomain = useMemo<[number, number]>(() => {
    return computeYAxisDomain({
      data,
      compareData,
      yMaxClamp,
      forceZeroFloor: type === "bar",
    });
  }, [data, compareData, yMaxClamp, type]);

  const mergedSeries = useMemo(() => {
    if (!compareData || compareData.length === 0) return null;

    const byPeriod = new Map<string, { value?: number; compareValue?: number }>();

    for (const row of data) {
      byPeriod.set(row.period, {
        ...(byPeriod.get(row.period) ?? {}),
        value: row.value,
      });
    }

    for (const row of compareData) {
      byPeriod.set(row.period, {
        ...(byPeriod.get(row.period) ?? {}),
        compareValue: row.value,
      });
    }

    return data.map((row) => {
      const merged = byPeriod.get(row.period) ?? {};
      return {
        period: row.period,
        value: merged.value ?? row.value,
        compareValue: merged.compareValue ?? null,
      };
    });
  }, [data, compareData]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "bar" ? (
        <RechartsBarChart
          key={seriesKey}
          data={mergedSeries ?? data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          barCategoryGap="8%"
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={c.grid}
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: c.tick, fontSize: 10 }}
            dy={4}
            interval="preserveStartEnd"
          />
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: c.tick, fontSize: 10 }}
              width={48}
              domain={yDomain}
              tickFormatter={(v: number) =>
                yAxisTickFormatter ? yAxisTickFormatter(v) : compactFormat(v)
              }
            />
          )}
          <Tooltip
            cursor={false}
            content={
              <ChartTooltip
                formatter={(v) => formatter(v)}
              />
            }
          />
          <Bar
            dataKey="value"
            name={seriesLabel}
            fill={color}
            radius={[3, 3, 0, 0]}
            minPointSize={2}
            activeBar={{ fill: color, fillOpacity: 0.85 }}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={animationDuration}
            animationEasing="ease-out"
          />
          {mergedSeries ? (
            <Bar
              dataKey="compareValue"
              name={compareLabel}
              fill={compareColor}
              radius={[3, 3, 0, 0]}
              minPointSize={2}
              activeBar={{ fill: compareColor, fillOpacity: 0.9 }}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={animationDuration}
              // The paired series trails its partner by a beat, so a debt/net
              // debt card reads as two series rather than one thick bar.
              animationBegin={prefersReducedMotion ? 0 : 90}
              animationEasing="ease-out"
            />
          ) : null}
        </RechartsBarChart>
      ) : (
        <RechartsAreaChart
          key={seriesKey}
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={c.grid}
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: c.tick, fontSize: 10 }}
            dy={4}
            interval="preserveStartEnd"
          />
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: c.tick, fontSize: 10 }}
              width={48}
              domain={yDomain}
              tickFormatter={(v: number) =>
                yAxisTickFormatter ? yAxisTickFormatter(v) : compactFormat(v)
              }
            />
          )}
          {referenceLineY != null ? (
            <ReferenceLine y={referenceLineY} stroke={referenceLineColor} strokeDasharray="4 4" />
          ) : null}
          <Tooltip
            cursor={false}
            content={
              <ChartTooltip
                formatter={(v) => formatter(v)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesLabel}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{
              r: 3,
              fill: color,
              stroke: c.dotStroke,
              strokeWidth: 2,
            }}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={animationDuration}
            animationEasing="ease-out"
          />
        </RechartsAreaChart>
      )}
    </ResponsiveContainer>
  );
}

// ---- Helpers ----

function compactFormat(v: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

function defaultFormatter(v: number): string {
  return `$${compactFormat(v)}`;
}

function filterSeriesByYearRange(
  rows: MetricChartCardData[],
  years: YearRangeFilter
): MetricChartCardData[] {
  if (!rows.length) return rows;

  const latestDateMs = rows.reduce((latest, row) => {
    const ts = row.date ? new Date(row.date).getTime() : NaN;
    if (!Number.isFinite(ts)) return latest;
    return Math.max(latest, ts);
  }, Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(latestDateMs)) {
    return rows.slice(-years);
  }

  const cutoff = new Date(latestDateMs);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const cutoffMs = cutoff.getTime();

  const filtered = rows.filter((row) => {
    const ts = row.date ? new Date(row.date).getTime() : NaN;
    if (!Number.isFinite(ts)) return false;
    return ts >= cutoffMs;
  });

  return filtered.length ? filtered : rows;
}

function calculateChange(
  data: MetricChartCardData[],
  lookbackPoints: number
): number | null {
  if (data.length < lookbackPoints || lookbackPoints < 2) return null;
  const start = data[data.length - lookbackPoints]?.value;
  const end = data[data.length - 1]?.value;
  if (start === undefined || end === undefined || start === 0) return null;
  // |start|, so a window that opens in the red reads as a recovery rather than
  // an inverted collapse. A zero base is genuinely undefined and stays out.
  return (end - start) / Math.abs(start);
}

/**
 * Change over each lookback window the loaded series can actually answer.
 *
 * Every window used to be emitted whether or not there was history behind it,
 * so a Yahoo series - four years deep at best - produced a row that was mostly
 * "N/A", and so did any company too young to have a 10Y record no matter which
 * provider it came from. A window with no data behind it is not a result, so
 * it is dropped rather than rendered as an absence: what remains is exactly
 * what this stock, on this data source, can support.
 */
function buildPerformanceBadges(
  data: MetricChartCardData[],
  period: ChartPeriodFilter
) {
  const yearWindows = [1, 3, 5, 10, 15, 20] as const;

  return yearWindows.flatMap((years) => {
    const lookbackPoints = period === "quarterly" ? years * 4 + 1 : years + 1;
    const value = calculateChange(data, lookbackPoints);
    return value === null ? [] : [{ label: `${years}Y`, value }];
  });
}

/**
 * How many years of history a series actually holds, from its own timestamps.
 *
 * Drives which range buttons are worth offering: a stock that listed four
 * years ago has nothing to show behind a 20Y button, and neither does a
 * provider that only returns four annual periods.
 */
function seriesSpanInYears(rows: MetricChartCardData[]): number {
  const times = rows
    .map((row) => (row.date ? new Date(row.date).getTime() : NaN))
    .filter((time) => Number.isFinite(time));

  if (times.length < 2) return rows.length;

  const span = Math.max(...times) - Math.min(...times);
  return span / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * The range options worth showing: every step the history reaches, plus the
 * first one that covers all of it, so there is always a way to see everything.
 */
function availableYearRanges(spanYears: number): YearRangeFilter[] {
  const all: YearRangeFilter[] = [5, 10, 15, 20];
  const shown = all.filter((years) => years < spanYears);
  const next = all.find((years) => years >= spanYears);
  if (next) shown.push(next);
  return shown.length ? shown : [all[0]];
}

function computeYAxisDomain({
  data,
  compareData,
  yMaxClamp,
  forceZeroFloor,
}: {
  data: MetricChartCardData[];
  compareData?: MetricChartCardData[];
  yMaxClamp?: number;
  forceZeroFloor: boolean;
}): [number, number] {
  const values = [
    ...data.map((row) => row.value),
    ...(compareData ?? []).map((row) => row.value),
  ].filter((value) => Number.isFinite(value));

  if (!values.length) {
    return [0, Number.isFinite(yMaxClamp) ? Math.max(1, yMaxClamp as number) : 1];
  }

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.15, 1);
    min -= pad;
    max += pad;
  } else {
    const span = max - min;
    const pad = span * 0.12;
    min -= pad;
    max += pad;
  }

  if (forceZeroFloor && min > 0) {
    min = 0;
  }

  if (Number.isFinite(yMaxClamp)) {
    max = Math.min(max, yMaxClamp as number);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    const fallbackMax = Number.isFinite(yMaxClamp) ? Math.max(1, yMaxClamp as number) : 1;
    return [0, fallbackMax];
  }

  return [min, max];
}
