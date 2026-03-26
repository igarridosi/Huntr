"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import type { StockQuote } from "@/types/stock";

type PriceRange = "5D" | "1M" | "6M" | "YTD" | "1A" | "5A" | "10Y";

interface PricePoint {
  x: string;
  value: number;
  dateLabel: string;
}

interface StockPriceCardProps {
  ticker: string;
  quote: StockQuote | null;
}

const RANGE_OPTIONS: PriceRange[] = ["5D", "1M", "6M", "YTD", "1A", "5A", "10Y"];

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function filterDailyRange(
  rows: Array<{ date: string; close: number }>,
  range: PriceRange
): Array<{ date: string; close: number }> {
  if (rows.length === 0) return [];

  const latestTs = new Date(rows[rows.length - 1].date).getTime();
  if (!Number.isFinite(latestTs)) return rows;

  const latest = new Date(latestTs);
  let cutoff = new Date(latest);

  if (range === "5D") {
    return rows.slice(Math.max(0, rows.length - 5));
  }
  if (range === "1M") cutoff.setMonth(cutoff.getMonth() - 1);
  if (range === "6M") cutoff.setMonth(cutoff.getMonth() - 6);
  if (range === "1A") cutoff.setFullYear(cutoff.getFullYear() - 1);
  if (range === "5A") cutoff.setFullYear(cutoff.getFullYear() - 5);
  if (range === "10Y") cutoff.setFullYear(cutoff.getFullYear() - 10);
  if (range === "YTD") cutoff = new Date(latest.getFullYear(), 0, 1);

  const cutoffTs = cutoff.getTime();
  const filtered = rows.filter((row) => new Date(row.date).getTime() >= cutoffTs);
  return filtered.length ? filtered : rows;
}

export function StockPriceCard({ ticker, quote }: StockPriceCardProps) {
  const [range, setRange] = useState<PriceRange>("1A");
  const [isCompact, setIsCompact] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [chartEpoch, setChartEpoch] = useState(0);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: dailyHistory, isLoading: isDailyLoading } = useBatchDailyHistory([ticker], "ALL", !!ticker);
  const daily = (dailyHistory?.[ticker] ?? [])
    .filter((row) => Number.isFinite(row.close))
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const chartData = useMemo<PricePoint[]>(() => {
    const ranged = filterDailyRange(daily, range);
    return ranged.map((row) => ({
      x: formatDateShort(row.date),
      value: row.close,
      dateLabel: row.date,
    }));
  }, [range, daily]);

  const rangePerformance = useMemo(() => {
    return RANGE_OPTIONS.map((item) => {
      const ranged = filterDailyRange(daily, item);
      if (ranged.length < 2) {
        return { label: item, value: null as number | null };
      }

      const startValue = ranged[0]?.close;
      const endValue = ranged[ranged.length - 1]?.close;
      if (
        !Number.isFinite(startValue) ||
        !Number.isFinite(endValue) ||
        Math.abs(startValue) < 1e-9
      ) {
        return { label: item, value: null as number | null };
      }

      return {
        label: item,
        value: (endValue - startValue) / Math.abs(startValue),
      };
    });
  }, [daily]);

  const start = chartData[0]?.value ?? null;
  const end = chartData[chartData.length - 1]?.value ?? quote?.price ?? null;
  const absChange =
    start != null && end != null && Number.isFinite(start) && Number.isFinite(end)
      ? end - start
      : null;
  const pctChange =
    absChange != null && start != null && Math.abs(start) > 1e-9
      ? absChange / Math.abs(start)
      : null;

  const latestCloseDate = daily[daily.length - 1]?.date ?? null;
  const isTrendLoading = isDailyLoading && daily.length === 0;

  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  const handleToggleCompact = () => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    setIsResizing(true);
    setIsCompact((prev) => !prev);
    resizeTimeoutRef.current = setTimeout(() => {
      setChartEpoch((prev) => prev + 1);
      setIsResizing(false);
    }, 280);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-wolf-border/50 bg-wolf-surface flex flex-col",
        isCompact ? "p-3 sm:p-4 gap-2.5" : "p-4 sm:p-5 gap-3"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-snow-peak">Stock Price</p>
          <p className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-snow-peak">
            {end != null ? formatCurrency(end) : "-"}
          </p>
          {isTrendLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          ) : (
            <>
              <p className={cn("mt-1 text-sm font-medium", absChange != null && absChange >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {absChange != null && pctChange != null
                  ? `${absChange >= 0 ? "+" : ""}${formatCurrency(absChange)} (${formatPercent(pctChange, 2)}) ${range}`
                  : "-"}
              </p>
              <p className="mt-1 text-[11px] text-mist">
                {latestCloseDate ? `Closed: ${formatDateShort(latestCloseDate)}` : "No close data"}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleCompact}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-wolf-border/60 bg-wolf-black/30 text-mist hover:text-snow-peak hover:bg-wolf-border/30 transition-colors"
            aria-label={isCompact ? "Expand stock price card" : "Collapse stock price card"}
            title={isCompact ? "Expandir vista en tarjeta" : "Volver a vista compacta"}
          >
            {isCompact ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>

          <ExpandChartDialog
            title="Stock Price"
            headerRight={
              <div className="inline-flex items-center rounded-xl bg-wolf-black/60 border border-wolf-border/60 p-0.5 h-8 shadow-sm">
                {RANGE_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRange(item)}
                    className={cn(
                      "px-2 py-1 text-xs font-medium rounded-lg transition-all duration-150",
                      range === item
                        ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                        : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            }
            footer={
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {rangePerformance.map((item) => (
                  <Badge
                    key={item.label}
                    variant={
                      item.value == null
                        ? "secondary"
                        : item.value >= 0
                          ? "bullish"
                          : "bearish"
                    }
                    className="text-xs font-mono px-2 py-0.5 h-7"
                  >
                    {item.label}: {item.value == null ? "N/A" : formatPercent(item.value, 2)}
                  </Badge>
                ))}
              </div>
            }
          >
            <div className="h-[420px] w-full">
              {isTrendLoading ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : (
                <PriceChart data={chartData} stroke="#FF8C42" />
              )}
            </div>
          </ExpandChartDialog>
        </div>
      </div>

      <div className="inline-flex items-center rounded-xl bg-wolf-black/60 border border-wolf-border/60 p-0.5 h-8 shadow-sm w-fit">
        {RANGE_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setRange(item)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded-lg transition-all duration-150",
              range === item
                ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "overflow-hidden transition-[height] duration-300 ease-out",
          isCompact ? "h-40 sm:h-44 mt-1.5" : "h-56 sm:h-64 lg:h-72 xl:h-80 mt-2 sm:mt-4"
        )}
      >
        {isTrendLoading || isResizing ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : (
          <PriceChart key={`stock-chart-${chartEpoch}-${range}-${isCompact ? "compact" : "full"}`} data={chartData} stroke="#FF8C42" />
        )}
      </div>
    </div>
  );
}

function PriceChart({ data, stroke }: { data: PricePoint[]; stroke: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="stock-price-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.26} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" strokeOpacity={0.35} vertical={false} />
        <XAxis
          dataKey="x"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8C9DA1", fontSize: 10 }}
          tickMargin={10}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8C9DA1", fontSize: 10 }}
          width={48}
          tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
          domain={["auto", "auto"]}
        />
        <Tooltip
          cursor={false}
          content={<ChartTooltip labelFormatter={(label) => label} formatter={(v) => formatCurrency(v)} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2.2}
          isAnimationActive
          animationBegin={50}
          animationDuration={550}
          animationEasing="ease-out"
          fill="url(#stock-price-gradient)"
          dot={false}
          activeDot={{ r: 3, fill: stroke, stroke: "#0B1416", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
