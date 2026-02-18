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
} from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { Badge } from "@/components/ui/badge";
import { cn, formatPercent } from "@/lib/utils";

// ---- Types ----

export interface MetricChartCardData {
  period: string;
  value: number;
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
}

type ChartPeriodFilter = "annual" | "quarterly";

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
}: MetricChartCardProps) {
  if (!data.length) return null;

  const chartId = useId().replace(/:/g, "");
  const miniGradientId = `mc-grad-${chartId}-mini`;
  const expandedGradientId = `mc-grad-${chartId}-expanded`;
  const [dialogPeriod, setDialogPeriod] = useState<ChartPeriodFilter>("annual");

  const annualSeries = annualData ?? data;
  const quarterlySeries = quarterlyData ?? annualSeries;
  const dialogData = useMemo(
    () => (dialogPeriod === "annual" ? annualSeries : quarterlySeries),
    [dialogPeriod, annualSeries, quarterlySeries]
  );
  const performance = useMemo(() => buildPerformanceBadges(dialogData), [dialogData]);
  const showPerformanceFooter = dialogPeriod === "annual";

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
            }
            footer={showPerformanceFooter ? (
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
                type={type}
                color={color}
                formatter={formatter}
                showYAxis
                gradientId={expandedGradientId}
              />
            </div>
          </ExpandChartDialog>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 160 }}>
        <MetricChartRender
          data={data}
          type={type}
          color={color}
          formatter={formatter}
          showYAxis={showYAxis}
          gradientId={miniGradientId}
        />
      </div>
    </div>
  );
}

interface MetricChartRenderProps {
  data: MetricChartCardData[];
  type: "bar" | "area";
  color: string;
  formatter: (value: number) => string;
  showYAxis: boolean;
  gradientId: string;
}

function MetricChartRender({
  data,
  type,
  color,
  formatter,
  showYAxis,
  gradientId,
}: MetricChartRenderProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "bar" ? (
        <RechartsBarChart
          data={data}
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
              tickFormatter={(v: number) => compactFormat(v)}
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
            fill={color}
            radius={[3, 3, 0, 0]}
            minPointSize={2}
            activeBar={{ fill: color, fillOpacity: 0.85 }}
          />
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
              tickFormatter={(v: number) => compactFormat(v)}
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
          <Area
            type="monotone"
            dataKey="value"
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

function buildPerformanceBadges(data: MetricChartCardData[]) {
  return [
    { label: "YTD", value: calculateChange(data, 2) },
    { label: "1Y", value: calculateChange(data, 2) },
    { label: "2Y", value: calculateChange(data, 3) },
  ];
}
