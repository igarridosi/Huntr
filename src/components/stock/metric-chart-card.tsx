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

  const annualFiltered = useMemo(
    () => filterSeriesByYearRange(annualSeries, yearRange),
    [annualSeries, yearRange]
  );
  const quarterlyFiltered = useMemo(
    () => filterSeriesByYearRange(quarterlySeries, yearRange),
    [quarterlySeries, yearRange]
  );
  const compareAnnualFiltered = useMemo(
    () => filterSeriesByYearRange(compareAnnualSeries, yearRange),
    [compareAnnualSeries, yearRange]
  );
  const compareQuarterlyFiltered = useMemo(
    () => filterSeriesByYearRange(compareQuarterlySeries, yearRange),
    [compareQuarterlySeries, yearRange]
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
    <div className="rounded-xl border border-wolf-border/50 bg-wolf-surface p-4 flex flex-col gap-2">
      {/* Header: title + growth badge */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-snow-peak truncate">
          {title}
        </h3>
        {growth !== undefined && growth !== null && (
          <Badge
            variant={growth >= 0 ? "bullish" : "bearish"}
            className="text-[10px] font-mono px-1.5 py-0 leading-4 shrink-0"
          >
            {growth >= 0 ? "↑" : "↓"} {formatPercent(Math.abs(growth), 1)}
          </Badge>
        )}
        <div className="ml-auto">
          <ExpandChartDialog
            title={title}
            headerRight={
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-xl bg-wolf-black/60 border border-wolf-border/60 p-0.5 h-8 shadow-sm">
                  {([5, 10, 15, 20] as const).map((years) => (
                    <button
                      key={years}
                      type="button"
                      onClick={() => setYearRange(years)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150",
                        yearRange === years
                          ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                          : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
                      )}
                    >
                      {years}Y
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center rounded-xl bg-wolf-black/60 border border-wolf-border/60 p-0.5 h-8 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setDialogPeriod("annual")}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150",
                      dialogPeriod === "annual"
                        ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                        : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
                    )}
                  >
                    Annual
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogPeriod("quarterly")}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150",
                      dialogPeriod === "quarterly"
                        ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                        : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
                    )}
                  >
                    Quarterly
                  </button>
                </div>
              </div>
            }
            footer={shouldShowPerformanceFooter ? (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {performance.map((item) => (
                  <Badge
                    key={item.label}
                    variant={
                      item.value === null
                        ? "secondary"
                        : item.value >= 0
                          ? "bullish"
                          : "bearish"
                    }
                    className="text-xs font-mono px-2 py-0.5 h-7"
                  >
                    {item.label}: {item.value === null ? "N/A" : formatPercent(item.value, 1)}
                  </Badge>
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
          data={mergedSeries ?? data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          barCategoryGap="8%"
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#2A3B40"
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8C9DA1", fontSize: 10 }}
            dy={4}
            interval="preserveStartEnd"
          />
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
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
          />
          {mergedSeries ? (
            <Bar
              dataKey="compareValue"
              name={compareLabel}
              fill={compareColor}
              radius={[3, 3, 0, 0]}
              minPointSize={2}
              activeBar={{ fill: compareColor, fillOpacity: 0.9 }}
            />
          ) : null}
        </RechartsBarChart>
      ) : (
        <RechartsAreaChart
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
            stroke="#2A3B40"
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8C9DA1", fontSize: 10 }}
            dy={4}
            interval="preserveStartEnd"
          />
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
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
              stroke: "#0B1416",
              strokeWidth: 2,
            }}
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
  if (start === undefined || end === undefined || start <= 0) return null;
  return (end - start) / start;
}

function buildPerformanceBadges(
  data: MetricChartCardData[],
  period: ChartPeriodFilter
) {
  const yearWindows = [1, 3, 5, 10, 15] as const;

  return yearWindows.map((years) => {
    const lookbackPoints = period === "quarterly" ? years * 4 + 1 : years + 1;
    return {
      label: `${years}Y`,
      value: calculateChange(data, lookbackPoints),
    };
  });
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
