"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceGhost } from "@/components/stock/price-ghost";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import { useChartColors } from "@/hooks/use-chart-colors";
import type { StockQuote } from "@/types/stock";

type PriceRange = "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "10Y";

interface PricePoint {
  x: string;
  value: number;
  dateLabel: string;
}

interface StockPriceCardProps {
  ticker: string;
  quote: StockQuote | null;
}

const RANGE_OPTIONS: PriceRange[] = ["5D", "1M", "6M", "YTD", "1Y", "5Y", "10Y"];

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
  if (range === "1Y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  if (range === "5Y") cutoff.setFullYear(cutoff.getFullYear() - 5);
  if (range === "10Y") cutoff.setFullYear(cutoff.getFullYear() - 10);
  if (range === "YTD") cutoff = new Date(latest.getFullYear(), 0, 1);

  const cutoffTs = cutoff.getTime();
  const filtered = rows.filter((row) => new Date(row.date).getTime() >= cutoffTs);
  return filtered.length ? filtered : rows;
}

export function StockPriceCard({ ticker, quote }: StockPriceCardProps) {
  const [range, setRange] = useState<PriceRange>("1Y");
  // The first chart on the page draws itself in; a range picked after that
  // only fades over (see PriceChart).
  const [firstRange] = useState<PriceRange>(range);

  // Two requests, so the page does not wait on the big one. The last year
  // (enough for 5D to 1Y, and what the header's price map uses) comes first
  // and draws the chart; the full history (5Y, 10Y) follows in the
  // background once it is in. Waiting on the full history held the chart
  // back about four seconds behind an empty box.
  const { data: yearHistory, isLoading: isYearLoading } = useBatchDailyHistory([ticker], "1Y", !!ticker);
  const { data: fullHistory } = useBatchDailyHistory([ticker], "ALL", !!ticker && !!yearHistory);
  const needsFull = (r: PriceRange) => r === "5Y" || r === "10Y";

  // A long range picked before its history is in keeps the current chart on
  // screen (dimmed) until it is, rather than dropping to an empty box.
  const [shownRange, setShownRange] = useState<PriceRange>(range);
  if (shownRange !== range && (!needsFull(range) || fullHistory)) setShownRange(range);
  const pending = shownRange !== range;

  // On a range change the chart on screen wipes out while the new one wipes
  // in (see .price-wipe-*): the outgoing one is kept here until its exit
  // animation ends. Set during render, the React way to follow a prop.
  const [outgoing, setOutgoing] = useState<{ key: string; data: PricePoint[] } | null>(null);
  const [onScreen, setOnScreen] = useState<{ key: string; data: PricePoint[] } | null>(null);

  const source = needsFull(shownRange) ? fullHistory : yearHistory;
  // Memoised: rebuilt on every render, it handed the chart a new array each
  // time, and the chart redrew for nothing.
  const daily = useMemo(
    () =>
      (source?.[ticker] ?? [])
        .filter((row) => Number.isFinite(row.close))
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [source, ticker]
  );
  const allDaily = useMemo(
    () =>
      ((fullHistory ?? yearHistory)?.[ticker] ?? [])
        .filter((row) => Number.isFinite(row.close))
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [fullHistory, yearHistory, ticker]
  );

  const chartData = useMemo<PricePoint[]>(() => {
    const ranged = filterDailyRange(daily, shownRange);
    return ranged.map((row) => ({
      x: formatDateShort(row.date),
      value: row.close,
      dateLabel: row.date,
    }));
  }, [shownRange, daily]);

  // A backstop for the exit: animationend does not fire in a background
  // tab (animations do not run there), and the old chart must never be
  // left on top of the new one.
  useEffect(() => {
    if (!outgoing) return;
    const id = window.setTimeout(() => setOutgoing(null), 400);
    return () => window.clearTimeout(id);
  }, [outgoing]);

  if (chartData.length > 0) {
    if (!onScreen) setOnScreen({ key: shownRange, data: chartData });
    else if (onScreen.key !== shownRange) {
      setOutgoing(onScreen);
      setOnScreen({ key: shownRange, data: chartData });
    } else if (onScreen.data !== chartData) setOnScreen({ key: shownRange, data: chartData });
  }

  const rangePerformance = useMemo(() => {
    return RANGE_OPTIONS.map((item) => {
      const ranged = filterDailyRange(allDaily, item);
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
  }, [allDaily]);

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
  const isTrendLoading = isYearLoading && daily.length === 0;

  return (
    // One fixed size, always. It sets the height of its row on wide
    // screens, so nothing beside it (the quality score opening a dimension)
    // can stretch or shrink the chart.
    <div className="flex flex-col gap-2.5 rounded-xl border border-wolf-border/50 bg-wolf-surface p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          {/* The price itself heads the page already; here the headline is
              what the chosen range did to it. */}
          <p className="text-[13px] font-medium text-mist">Price, {shownRange}</p>
          {isTrendLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-[30px] w-36" />
              <Skeleton className="h-3 w-44" />
            </div>
          ) : (
            <div key={shownRange} className="price-figures">
              <p
                className={cn(
                  "mt-1.5 font-mono text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em] sm:text-[30px]",
                  pctChange == null ? "text-snow-peak" : pctChange >= 0 ? "text-bullish" : "text-bearish"
                )}
              >
                {pctChange != null ? `${pctChange >= 0 ? "+" : ""}${formatPercent(pctChange, 2)}` : "-"}
              </p>
              <p className="mt-2 font-mono text-[12px] tabular-nums text-mist">
                {absChange != null ? `${absChange >= 0 ? "+" : ""}${formatCurrency(absChange)}` : "-"}
                <span className="text-mist/70">
                  {latestCloseDate ? `, close ${formatDateShort(latestCloseDate)}` : ""}
                  {end != null ? ` at ${formatCurrency(end)}` : ""}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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
                      "min-h-9 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150 sm:min-h-0 sm:px-2 sm:py-1",
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
              "min-h-9 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150 sm:min-h-0 sm:px-2 sm:py-1",
              range === item
                ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-1.5 h-56 sm:h-64 xl:h-[22rem]">
        {isTrendLoading ? (
          <PriceGhost />
        ) : (
          <div className={cn("relative h-full w-full transition-opacity duration-200", pending && "opacity-40")}>
            {outgoing ? (
              <div className="absolute inset-0" aria-hidden>
                <PriceChart
                  key={`out-${outgoing.key}`}
                  data={outgoing.data}
                  stroke="#FF8C42"
                  motion="exit"
                  onMotionEnd={() => setOutgoing(null)}
                />
              </div>
            ) : null}
            {onScreen ? (
              <div className="absolute inset-0">
                <PriceChart
                  key={onScreen.key}
                  data={onScreen.data}
                  stroke="#FF8C42"
                  motion={onScreen.key === firstRange && !outgoing ? "first" : "enter"}
                />
              </div>
            ) : null}
            {pending ? (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-wolf-black/80 px-2.5 py-1 text-[11.5px] text-snow-peak ring-1 ring-inset ring-wolf-border/60">
                Loading {range}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The chart wipes in and out left to right, as time runs, through a soft
 * gradient edge rather than a hard cut: a mask sliding across it.
 * "first" is the page opening (650 ms); "enter" and "exit" are a range
 * change, the old chart leaving (220 ms) as the new one arrives just behind
 * it (480 ms), short because ranges get flicked through in a row. CSS
 * animations: they keep running while the page mounts, where Recharts' own
 * tween (main thread) stuttered. "static" (the expanded dialog) does not move.
 */
function PriceChart({
  data,
  stroke,
  motion = "static",
  onMotionEnd,
}: {
  data: PricePoint[];
  stroke: string;
  motion?: "first" | "enter" | "exit" | "static";
  onMotionEnd?: () => void;
}) {
  const c = useChartColors();
  // Measured here rather than by ResponsiveContainer. That one renders an
  // empty box, measures it asynchronously and only then draws, a beat
  // later, at the final size: the entrance ran its course on the empty box
  // and the chart popped in afterwards. Now the animated layer and the chart
  // mount together, once the size is known.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="h-full w-full">
    {size ? (
    <div
      className={cn(
        "h-full w-full",
        motion === "first" && "price-wipe-first",
        motion === "enter" && "price-wipe-in",
        motion === "exit" && "price-wipe-out"
      )}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onMotionEnd?.();
      }}
    >
      <AreaChart width={size.width} height={size.height} data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="stock-price-gradient" x1="0" y1="0" x2="0" y2="1">
            {/* Qualtrim's fill: a solid body under the line that fades only
                near the floor, so the area reads as a shape, not a glow. */}
            <stop offset="0%" stopColor={stroke} stopOpacity={0.55} />
            <stop offset="70%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.06} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} strokeOpacity={0.35} vertical={false} />
        <XAxis
          dataKey="x"
          axisLine={false}
          tickLine={false}
          tick={{ fill: c.tick, fontSize: 10 }}
          tickMargin={10}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: c.tick, fontSize: 10 }}
          width={48}
          tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
          domain={["auto", "auto"]}
        />
        <Tooltip
          cursor={false}
          content={<ChartTooltip labelFormatter={(label) => label} formatter={(v) => formatCurrency(v)} />}
        />
        <Area
          // Straight segments between sessions: a smoothed curve invents
          // prices between the closes and rounds off the real moves.
          type="linear"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.6}
          // Recharts' own entrance tweens the path on the main thread, the
          // same thread busy mounting the page, so it stuttered at the start.
          // The reveal is a CSS wipe on the wrapper instead (see .price-wipe-*).
          isAnimationActive={false}
          fill="url(#stock-price-gradient)"
          dot={false}
          activeDot={{ r: 3, fill: stroke, stroke: c.dotStroke, strokeWidth: 2 }}
        />
      </AreaChart>
    </div>
    ) : null}
    </div>
  );
}
