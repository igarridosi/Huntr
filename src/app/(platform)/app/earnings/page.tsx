"use client";

import { fetchBatchEarningsInsights, fetchCompanyFinancials } from "@/app/actions/stock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TickerLogo } from "@/components/ui/ticker-logo";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Moon,
  Search,
  Star,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAllProfiles, useAllQuotes } from "@/hooks/use-stock-data";
import { useWatchlist } from "@/hooks/use-watchlist";
import type { CompanyFinancials } from "@/types/financials";
import type { EarningsHistoryPoint, StockProfile, StockQuote } from "@/types/stock";

type CapFilter = "all" | "mega" | "large" | "mid" | "small";
type EarningsTiming = "Before Open" | "After Close";
type EventSource = "upcoming" | "persisted";
type ChartMetric = "revenue" | "eps";
type HoverSeries = "epsEstimate" | "epsReported" | "revEstimate" | "revReported";

interface EarningsItem {
  ticker: string;
  date: Date;
  profile: StockProfile | null;
  quote: StockQuote;
  timing: EarningsTiming;
  source: EventSource;
}

interface EarningsSection {
  key: string;
  label: EarningsTiming;
  icon: typeof Sun;
  items: EarningsItem[];
}

interface PersistedWeekItem {
  ticker: string;
  date: string;
  timing: EarningsTiming;
}

interface PersistedWeekSnapshot {
  weekStart: string;
  items: PersistedWeekItem[];
}

interface FormattedEarningsPoint {
  quarter: string;
  releaseDate: string | null;
  estimate: number | null;
  reported: number | null;
  surprise: number | null;
  revenueEstimate: number | null;
  revenue: number | null;
  sortTs: number;
}

interface SidePanelCache {
  rows: FormattedEarningsPoint[];
  marketCap: number | null;
  peRatio: number | null;
  psRatio: number | null;
  nextEstEps: number | null;
  nextEstRevenue: number | null;
  nextEarningsDate: string | null;
}

const PERSISTED_WEEK_KEY = "huntr_earnings_current_week";

function getWeekStart(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function capMatches(filter: CapFilter, marketCap: number): boolean {
  // Earnings calendar policy: only show 10B+ companies.
  if (marketCap < 10_000_000_000) return false;
  if (filter === "all") return true;
  if (filter === "mega") return marketCap >= 200_000_000_000;
  if (filter === "large") {
    return marketCap >= 10_000_000_000 && marketCap < 200_000_000_000;
  }
  return false;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toWeekIso(date: Date): string {
  return toLocalIsoDate(date);
}

function quarterLabelFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function previousQuarterLabelFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const currentQuarter = Math.floor(date.getUTCMonth() / 3) + 1;
  const year = date.getUTCFullYear();
  const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const prevQuarterYear = currentQuarter === 1 ? year - 1 : year;

  return `Q${prevQuarter} ${prevQuarterYear}`;
}

function quarterLabelToTimestamp(label: string): number {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!match) return 0;

  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return Date.UTC(year, (quarter - 1) * 3, 1);
}

function parseQuarterLabel(label: string): { quarter: number; year: number } | null {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!match) return null;
  return {
    quarter: Number(match[1]),
    year: Number(match[2]),
  };
}

function shiftQuarterLabel(label: string, offset: number): string | null {
  const parsed = parseQuarterLabel(label);
  if (!parsed) return null;

  const absolute = parsed.year * 4 + (parsed.quarter - 1) + offset;
  if (!Number.isFinite(absolute) || absolute < 0) return null;

  const year = Math.floor(absolute / 4);
  const quarter = (absolute % 4) + 1;
  return `Q${quarter} ${year}`;
}

function resolveNextEstimateQuarter(
  rows: FormattedEarningsPoint[],
  nextEarningsDate: string | null
): string | null {
  const estimateOnlyRows = rows.filter(
    (row) =>
      (row.estimate != null || row.revenueEstimate != null) &&
      row.reported == null &&
      row.revenue == null
  );

  const latestReported = [...rows]
    .filter((row) => row.reported != null || row.revenue != null)
    .sort((a, b) => quarterLabelToTimestamp(b.quarter) - quarterLabelToTimestamp(a.quarter))[0];

  if (latestReported) {
    const latestReportedTs = quarterLabelToTimestamp(latestReported.quarter);
    const nextEstimateBySequence = estimateOnlyRows
      .filter((row) => quarterLabelToTimestamp(row.quarter) > latestReportedTs)
      .sort((a, b) => quarterLabelToTimestamp(a.quarter) - quarterLabelToTimestamp(b.quarter))[0];

    if (nextEstimateBySequence) return nextEstimateBySequence.quarter;

    const inferredNextQuarter = shiftQuarterLabel(latestReported.quarter, 1);
    if (inferredNextQuarter) return inferredNextQuarter;
  }

  const fallbackEstimate = [...estimateOnlyRows]
    .sort((a, b) => quarterLabelToTimestamp(a.quarter) - quarterLabelToTimestamp(b.quarter))
    .at(-1);
  if (fallbackEstimate) return fallbackEstimate.quarter;

  if (!nextEarningsDate) return null;
  const fromDate = previousQuarterLabelFromDate(nextEarningsDate);
  return fromDate === "Unknown" ? null : fromDate;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function inferSurprise(actual: number | null, estimate: number | null): number | null {
  if (
    actual == null ||
    estimate == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(estimate) ||
    Math.abs(estimate) < 1e-9
  ) {
    return null;
  }

  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function formatEarningsData(
  yahooFinancials: CompanyFinancials["income_statement"]["quarterly"] | undefined,
  alphaVantageCalendar: EarningsHistoryPoint[] | undefined
): FormattedEarningsPoint[] {
  const merged = new Map<string, FormattedEarningsPoint>();

  for (const point of alphaVantageCalendar ?? []) {
    const quarter = /^Q[1-4]\s\d{4}$/.test(point.quarter)
      ? point.quarter
      : point.report_date
        ? quarterLabelFromDate(point.report_date)
        : point.quarter;

    const rawActual = numberOrNull(point.eps_actual);
    const estimate = numberOrNull(point.eps_estimate);
    const reportTs = point.report_date
      ? new Date(`${point.report_date}T00:00:00Z`).getTime()
      : null;
    const isFutureReport = reportTs != null && Number.isFinite(reportTs) && reportTs > Date.now();
    const surpriseRaw = numberOrNull(point.surprise_percent);
    const looksLikePlaceholderMiss =
      rawActual === 0 &&
      estimate != null &&
      surpriseRaw != null &&
      surpriseRaw <= -99.9;
    const actual =
      (isFutureReport && rawActual === 0 && estimate != null) || looksLikePlaceholderMiss
        ? null
        : rawActual;
    const surprise = surpriseRaw ?? inferSurprise(actual, estimate);

    const sortTs = point.report_date
      ? new Date(`${point.report_date}T00:00:00Z`).getTime()
      : quarterLabelToTimestamp(quarter);

    merged.set(quarter, {
      quarter,
      releaseDate: point.report_date ?? null,
      estimate,
      reported: actual,
      surprise,
      revenueEstimate: numberOrNull(point.revenue_estimate),
      revenue: numberOrNull(point.revenue_actual),
      sortTs,
    });
  }

  for (const row of yahooFinancials ?? []) {
    const quarter = /^Q[1-4]\s\d{4}$/.test(row.period)
      ? row.period
      : quarterLabelFromDate(row.date);

    const existing = merged.get(quarter);
    const sortTs = quarterLabelToTimestamp(quarter);

    if (existing) {
      if (existing.revenue == null) {
        existing.revenue = numberOrNull(row.revenue);
      }
      existing.sortTs = Math.max(existing.sortTs, sortTs);
      continue;
    }

    merged.set(quarter, {
      quarter,
      releaseDate: null,
      estimate: null,
      reported: null,
      surprise: null,
      revenueEstimate: null,
      revenue: numberOrNull(row.revenue),
      sortTs,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.sortTs - a.sortTs)
    .slice(0, 16);
}

function readPersistedWeekSnapshot(expectedWeekStartIso: string): PersistedWeekItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PERSISTED_WEEK_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as PersistedWeekSnapshot;
    if (parsed.weekStart !== expectedWeekStartIso) {
      window.localStorage.removeItem(PERSISTED_WEEK_KEY);
      return [];
    }

    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writePersistedWeekSnapshot(weekStartIso: string, items: PersistedWeekItem[]): void {
  if (typeof window === "undefined") return;

  const payload: PersistedWeekSnapshot = {
    weekStart: weekStartIso,
    items,
  };

  window.localStorage.setItem(PERSISTED_WEEK_KEY, JSON.stringify(payload));
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEps(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompactMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMarketCap(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "-";
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  return formatCompactMoney(value);
}

function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "-";
  return value.toFixed(1);
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function formatDisplayPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}%`;
}

function computeGrowthPercent(current: number | null, previous: number | null): number | null {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    Math.abs(previous) < 1e-9
  ) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function quarterSortValue(row: FormattedEarningsPoint): number {
  const quarterTs = quarterLabelToTimestamp(row.quarter);
  return quarterTs > 0 ? quarterTs : row.sortTs;
}

function floorRevenueAxisMin(dataMin: number): number {
  if (!Number.isFinite(dataMin)) return 0;
  if (dataMin <= 0) return Math.floor(dataMin);

  const padded = dataMin * 0.9;
  if (padded >= 100) return Math.floor(padded / 10) * 10;
  if (padded >= 10) return Math.floor(padded);
  if (padded >= 1) return Math.floor(padded * 10) / 10;
  return Math.max(0, Math.floor(padded * 100) / 100);
}

function signToneClass(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "text-snow-peak/95";
  return value >= 0 ? "text-emerald-400" : "text-rose-400";
}

interface DotProps {
  className: string;
}

function PanelSkeleton({ onClose }: { onClose: () => void }) {
  const scatterDots: DotProps[] = [
    { className: "left-[3%] top-[72%] [animation-delay:0.1s] [animation-duration:1.9s]" },
    { className: "left-[9%] top-[90%] [animation-delay:0.3s] [animation-duration:2.2s]" },
    { className: "left-[15%] top-[86%] [animation-delay:0.5s] [animation-duration:2.1s]" },
    { className: "left-[21%] top-[76%] [animation-delay:0.2s] [animation-duration:1.8s]" },
    { className: "left-[27%] top-[64%] [animation-delay:0.7s] [animation-duration:2.4s]" },
    { className: "left-[33%] top-[51%] [animation-delay:0.4s] [animation-duration:2.0s]" },
    { className: "left-[39%] top-[35%] [animation-delay:0.9s] [animation-duration:2.3s]" },
    { className: "left-[45%] top-[46%] [animation-delay:0.6s] [animation-duration:1.9s]" },
    { className: "left-[51%] top-[55%] [animation-delay:0.8s] [animation-duration:2.5s]" },
    { className: "left-[57%] top-[42%] [animation-delay:0.4s] [animation-duration:2.1s]" },
    { className: "left-[63%] top-[42%] [animation-delay:0.2s] [animation-duration:1.7s]" },
    { className: "left-[69%] top-[44%] [animation-delay:0.5s] [animation-duration:2.2s]" },
    { className: "left-[75%] top-[32%] [animation-delay:0.7s] [animation-duration:2.0s]" },
    { className: "left-[81%] top-[25%] [animation-delay:0.35s] [animation-duration:2.3s]" },
    { className: "left-[87%] top-[28%] [animation-delay:0.55s] [animation-duration:2.1s]" },
    { className: "left-[93%] top-[24%] [animation-delay:0.15s] [animation-duration:1.8s]" },
    { className: "left-[98%] top-[18%] [animation-delay:0.75s] [animation-duration:2.4s]" },
  ];

  return (
    <div className="min-h-screen bg-[#081317] p-6 m-0 rounded-xl font-sans">
      <div className="mx-auto flex w-full max-w-[340px] sm:max-w-md flex-col gap-4">
        
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close side panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* TOP SECTION: (Antes Next Estimate) */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#0f1b23] p-5 shadow-lg">
          {/* Texto sustituido por esqueleto */}
          <div className="mb-4 h-3 w-28 rounded bg-slate-700/40 animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-slate-700/40 animate-pulse" />
        </div>

        {/* MIDDLE SECTION: SCATTER PLOT */}
        <div className="rounded-2xl border border-slate-800/60 bg-[#0f1b23] p-5 shadow-lg">
          <div className="flex h-[280px] gap-4">
            {/* Y-Axis */}
            <div className="flex flex-col justify-between pb-8 pt-2">
              {[1, 2, 3, 4].map((tick) => (
                <div key={`y-${tick}`} className="h-2.5 w-8 rounded bg-slate-700/40 animate-pulse" />
              ))}
            </div>

            {/* Chart Area */}
            <div className="relative flex-1 overflow-visible border-b-2 border-l-2 border-slate-700/40 pb-6">
              {/* Grid de fondo */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(51,65,85,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.15)_1px,transparent_1px)] bg-[size:30px_30px]" />

              {/* Puntos aleatorios animados */}
              {scatterDots.map((dot, idx) => (
                <div 
                  key={`dot-${idx}`} 
                  className={`absolute h-2.5 w-2.5 rounded-full bg-sunset-orange/70 shadow-[0_0_8px_rgba(100,116,139,0.5)] animate-pulse ${dot.className}`}
                />
              ))}

            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: DATA TABLE */}
        <div className="flex flex-col gap-5 rounded-2xl border border-slate-800/60 bg-[#0f1b23] p-5 shadow-lg">
          
          {/* Header Row */}
          <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.5fr] items-center gap-3 pb-4 border-b border-slate-800/60">
            <div className="flex flex-col gap-2.5">
               <div className="h-2.5 w-11/12 rounded bg-slate-700/40 animate-pulse" />
               <div className="h-2.5 w-2/3 rounded bg-slate-700/40 animate-pulse" />
            </div>
            <div className="h-2.5 w-full rounded bg-slate-700/40 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-slate-700/40 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-slate-700/40 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-slate-700/40 animate-pulse" />
          </div>

          {/* Data Row 1 */}
          <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.5fr] items-center gap-3 pb-4 border-b border-slate-800/60">
            <div className="flex flex-col gap-2.5">
               <div className="h-2.5 w-10/12 rounded bg-slate-700/40 animate-pulse" />
               <div className="h-2.5 w-1/2 rounded bg-slate-700/40 animate-pulse" />
            </div>
            <div className="flex flex-col gap-2.5">
               <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
               <div className="h-2.5 w-1/2 rounded bg-slate-700/40 animate-pulse" />
            </div>
            <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
            <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
          </div>

           {/* Data Row 2 */}
           <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.5fr] items-center gap-3">
            <div className="flex flex-col gap-2.5">
               <div className="h-2.5 w-10/12 rounded bg-slate-700/40 animate-pulse" />
               <div className="h-2.5 w-1/2 rounded bg-slate-700/40 animate-pulse" />
            </div>
            <div className="flex flex-col gap-2.5">
               <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
               <div className="h-2.5 w-1/2 rounded bg-slate-700/40 animate-pulse" />
            </div>
            <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
            <div className="h-2.5 w-3/4 rounded bg-slate-700/40 animate-pulse" />
            
            
          </div>
        </div>

      </div>
    </div>
  );
}

function formatQuarterTick(quarter: string): string {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(quarter.trim());
  if (!match) return quarter;
  return `Q${match[1]} '${match[2].slice(2)}`;
}

function formatRevenueTick(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `$${compact}`;
}

function formatEpsTick(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function getHoverText(
  row: FormattedEarningsPoint,
  series: HoverSeries | null
): { label: string; value: string } | null {
  if (!series) return null;

  if (series === "epsEstimate") {
    if (row.estimate == null) return null;
    return {
      label: `EPS Estimate for ${row.quarter}`,
      value: formatEps(row.estimate),
    };
  }

  if (series === "epsReported") {
    if (row.reported == null) return null;
    return {
      label: `EPS for ${row.quarter}`,
      value: formatEps(row.reported),
    };
  }

  if (series === "revEstimate") {
    if (row.revenueEstimate == null) return null;
    return {
      label: `Revenue Estimate for ${row.quarter}`,
      value: formatCompactMoney(row.revenueEstimate),
    };
  }

  if (row.revenue == null) return null;
  return {
    label: `Revenue for ${row.quarter}`,
    value: formatCompactMoney(row.revenue),
  };
}

function EarningsHoverTooltip({
  active,
  payload,
  hoverSeries,
}: {
  active?: boolean;
  payload?: Array<{ payload: FormattedEarningsPoint }>;
  hoverSeries: HoverSeries | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const hoverText = getHoverText(row, hoverSeries);
  if (!hoverText) return null;

  return (
    <div className="rounded-lg border border-wolf-border/70 bg-[#0A1417]/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="text-snow-peak">
        {hoverText.label} <span className="font-semibold">{hoverText.value}</span>
      </p>
    </div>
  );
}

function EarningsMetricChart({
  metric,
  data,
  hoveredIndex,
  hoverSeries,
  onPointHover,
  onPointLeave,
}: {
  metric: ChartMetric;
  data: FormattedEarningsPoint[];
  hoveredIndex: number | null;
  hoverSeries: HoverSeries | null;
  onPointHover: (index: number, series: HoverSeries, event?: unknown) => void;
  onPointLeave: () => void;
}) {
  const revenueData = data.map((row) => {
    const estimateOnlyNextQuarter =
      row.revenue == null && row.revenueEstimate != null;

    return {
      ...row,
      // Revenue chart policy: show reported bars + only the upcoming estimate bar.
      revenueBar: estimateOnlyNextQuarter ? row.revenueEstimate : row.revenue,
      revenueBarIsEstimate: estimateOnlyNextQuarter,
    };
  });

  return (
    <div className="relative h-full w-full" onMouseLeave={onPointLeave}>
      <ResponsiveContainer width="100%" height="100%">
        {metric === "revenue" ? (
          <BarChart data={revenueData} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} barGap={4} barCategoryGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" opacity={0.3} />
            <XAxis
              dataKey="quarter"
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#2A3B40" }}
              interval={0}
              angle={-45}
              textAnchor="end"
              tickMargin={10}
              height={58}
              padding={{ left: 8, right: 8 }}
              tickFormatter={formatQuarterTick}
            />
            <YAxis
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#2A3B40" }}
              width={56}
              domain={[(dataMin: number) => floorRevenueAxisMin(dataMin), "auto"]}
              tickFormatter={formatRevenueTick}
            />
            <Tooltip cursor={false} content={<EarningsHoverTooltip hoverSeries={hoverSeries} />} />

            <Bar dataKey="revenueBar" radius={[4, 4, 0, 0]} barSize={14}>
              {revenueData.map((row, idx) => {
                if (row.revenueBarIsEstimate) {
                  return (
                    <Cell
                      key={`rev-next-est-cell-${row.quarter}-${idx}`}
                      fill="#7D8697"
                      opacity={0.72}
                      onMouseEnter={(event) => onPointHover(idx, "revEstimate", event)}
                    />
                  );
                }

                return (
                  <Cell
                    key={`rev-cell-${row.quarter}-${idx}`}
                    fill="#f97316"
                    opacity={hoveredIndex === idx && hoverSeries === "revReported" ? 1 : 0.92}
                    onMouseEnter={(event) => onPointHover(idx, "revReported", event)}
                  />
                );
              })}
            </Bar>
          </BarChart>
        ) : (
          <ComposedChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" opacity={0.3} />
            <XAxis
              dataKey="quarter"
              type="category"
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#2A3B40" }}
              interval={0}
              angle={-45}
              textAnchor="end"
              tickMargin={10}
              height={58}
              padding={{ left: 8, right: 8 }}
              tickFormatter={formatQuarterTick}
            />
            <YAxis
              type="number"
              domain={["auto", "auto"]}
              tick={{ fill: "#8C9DA1", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#2A3B40" }}
              width={52}
              tickFormatter={formatEpsTick}
            />
            <Tooltip cursor={false} content={<EarningsHoverTooltip hoverSeries={hoverSeries} />} />

            <Scatter
              dataKey="estimate"
              fill="none"
              stroke="#6b7280"
              strokeWidth={2}
              shape={(props: unknown) => {
                const p = props as { cx?: number; cy?: number; index?: number };
                const active = p.index === hoveredIndex && hoverSeries === "epsEstimate";
                return (
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={active ? 6 : 4.5}
                    fill="none"
                    stroke="#6b7280"
                    strokeWidth={active ? 2.6 : 2}
                    onMouseEnter={(event) => {
                      if (typeof p.index === "number") onPointHover(p.index, "epsEstimate", event);
                    }}
                  />
                );
              }}
            />

            <Scatter
              dataKey="reported"
              shape={(props: unknown) => {
                const p = props as {
                  cx?: number;
                  cy?: number;
                  payload?: FormattedEarningsPoint;
                  index?: number;
                  yAxis?: { scale?: (value: number) => number };
                };
                const row = p.payload;
                if (!row || row.reported == null) return null;

                const beat =
                  row.estimate != null
                    ? row.reported >= row.estimate
                    : (row.surprise ?? 0) >= 0;
                const color = beat ? "#10b981" : "#f43f5e";
                const active = p.index === hoveredIndex && hoverSeries === "epsReported";
                const estimateCy =
                  row.estimate != null && p.yAxis?.scale
                    ? p.yAxis.scale(row.estimate)
                    : p.cy;

                return (
                  <g>
                    <line
                      x1={p.cx}
                      y1={estimateCy}
                      x2={p.cx}
                      y2={p.cy}
                      stroke="#4b5563"
                      strokeWidth={1}
                    />
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={active ? 6.5 : 5}
                      fill={color}
                      stroke={color}
                      strokeWidth={active ? 2.4 : 1.2}
                      onMouseEnter={(event) => {
                        if (typeof p.index === "number") onPointHover(p.index, "epsReported", event);
                      }}
                    />
                  </g>
                );
              }}
            />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function EarningsTable({
  rows,
  chartRows,
  metric,
  onHover,
}: {
  rows: FormattedEarningsPoint[];
  chartRows: FormattedEarningsPoint[];
  metric: ChartMetric;
  onHover: (index: number | null) => void;
}) {
  const rowsByQuarter = new Map<string, FormattedEarningsPoint>(
    rows.map((row) => [row.quarter, row])
  );

  const revenueTtm = (quarter: string): number | null => {
    const quarters = [
      quarter,
      shiftQuarterLabel(quarter, -1),
      shiftQuarterLabel(quarter, -2),
      shiftQuarterLabel(quarter, -3),
    ];

    const values = quarters
      .map((label) => (label ? rowsByQuarter.get(label)?.revenue ?? null : null))
      .filter((value): value is number => value != null && Number.isFinite(value));

    if (values.length < 4) return null;
    return values.reduce((sum, value) => sum + value, 0);
  };

  return (
    <div className="rounded-md border border-wolf-border/35 overflow-hidden">
      <div className="max-h-[340px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-wolf-black sticky top-0">
            <tr className="text-mist">
              <th className="px-2.5 py-2 text-left font-medium">Quarter</th>
              <th className="px-2.5 py-2 text-left font-medium">Release Date</th>
              {metric === "eps" ? (
                <>
                  <th className="px-2.5 py-2 text-right font-medium">Estimate</th>
                  <th className="px-2.5 py-2 text-right font-medium">Reported</th>
                  <th className="px-2.5 py-2 text-right font-medium">Surprise %</th>
                  <th className="px-2.5 py-2 text-right font-medium">Revenue</th>
                </>
              ) : (
                <>
                  <th className="px-2.5 py-2 text-right font-medium">Revenue</th>
                  <th className="px-2.5 py-2 text-right font-medium">QoQ %</th>
                  <th className="px-2.5 py-2 text-right font-medium">YoY %</th>
                  <th className="px-2.5 py-2 text-right font-medium">TTM Rev</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2.5 py-4 text-center text-mist">No history available</td>
              </tr>
            ) : (
              rows.map((row) => {
                const chartIndex = chartRows.findIndex((item) => item.quarter === row.quarter);
                const estimateValue = metric === "eps" ? row.estimate : row.revenueEstimate;
                const reportedValue = metric === "eps" ? row.reported : row.revenue;
                const surpriseValue =
                  metric === "eps"
                    ? row.surprise
                    : inferSurprise(row.revenue ?? null, row.revenueEstimate ?? null);
                const isBeat = (surpriseValue ?? 0) >= 0;
                const previousQuarter = shiftQuarterLabel(row.quarter, -1);
                const previousYearQuarter = shiftQuarterLabel(row.quarter, -4);
                const qoq = computeGrowthPercent(
                  row.revenue,
                  previousQuarter ? rowsByQuarter.get(previousQuarter)?.revenue ?? null : null
                );
                const yoy = computeGrowthPercent(
                  row.revenue,
                  previousYearQuarter ? rowsByQuarter.get(previousYearQuarter)?.revenue ?? null : null
                );
                const ttmRevenue = revenueTtm(row.quarter);

                return (
                  <tr
                    key={row.quarter}
                    className="border-t border-wolf-border/30 text-snow-peak/95 hover:bg-wolf-surface/40 transition-colors"
                    onMouseEnter={() => onHover(chartIndex >= 0 ? chartIndex : null)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <td className="px-2.5 py-2">{row.quarter}</td>
                    <td className="px-2.5 py-2">{formatDate(row.releaseDate)}</td>
                    {metric === "eps" ? (
                      <>
                        <td className="px-2.5 py-2 text-right">{formatEps(estimateValue)}</td>
                        <td className="px-2.5 py-2 text-right">{formatEps(reportedValue)}</td>
                        <td className={isBeat ? "px-2.5 py-2 text-right text-emerald-500" : "px-2.5 py-2 text-right text-rose-500"}>
                          {surpriseValue == null ? (
                            <span>-</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              {isBeat ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {formatPct(surpriseValue)}
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right">{formatCompactMoney(row.revenue)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-2.5 py-2 text-right">{formatCompactMoney(row.revenue)}</td>
                        <td className={`px-2.5 py-2 text-right ${signToneClass(qoq)}`}>{formatPct(qoq)}</td>
                        <td className={`px-2.5 py-2 text-right ${signToneClass(yoy)}`}>{formatPct(yoy)}</td>
                        <td className="px-2.5 py-2 text-right">{formatCompactMoney(ttmRevenue)}</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EarningsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [capFilter, setCapFilter] = useState<CapFilter>("all");
  const [watchlistFilterId, setWatchlistFilterId] = useState("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<HoverSeries | null>(null);
  const [panelCache, setPanelCache] = useState<Record<string, SidePanelCache>>({});
  const [chartMetric, setChartMetric] = useState<ChartMetric>("eps");

  const { data: quotes = [], isLoading: quotesLoading } = useAllQuotes();
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const { lists } = useWatchlist();

  const currentWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const weekStart = useMemo(
    () => addDays(currentWeekStart, weekOffset * 7),
    [currentWeekStart, weekOffset]
  );

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.ticker.toUpperCase(), profile])),
    [profiles]
  );

  const quoteMap = useMemo(
    () => new Map(quotes.map((quote) => [quote.ticker.toUpperCase(), quote])),
    [quotes]
  );

  const allWatchlistTickerSet = useMemo(() => {
    const all = lists.flatMap((list) => list.items.map((item) => item.ticker.toUpperCase()));
    return new Set(all);
  }, [lists]);

  const watchlistTickerSet = useMemo(() => {
    if (watchlistFilterId === "all") return null;
    const list = lists.find((entry) => entry.id === watchlistFilterId);
    if (!list) return null;
    return new Set(list.items.map((item) => item.ticker.toUpperCase()));
  }, [lists, watchlistFilterId]);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const allUpcomingItems = useMemo<EarningsItem[]>(() => {
    const items: EarningsItem[] = [];

    for (const quote of quotes) {
      if (!quote.next_earnings_date) continue;

      const timing =
        quote.earnings_timing === "Before Open" || quote.earnings_timing === "After Close"
          ? quote.earnings_timing
          : "After Close";

      const date = new Date(`${quote.next_earnings_date}T00:00:00`);
      if (Number.isNaN(date.getTime())) continue;
      if (date < currentWeekStart) continue;

      items.push({
        ticker: quote.ticker.toUpperCase(),
        date,
        profile: profileMap.get(quote.ticker.toUpperCase()) ?? null,
        quote,
        timing,
        source: "upcoming",
      });
    }

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [quotes, profileMap, currentWeekStart]);

  const maxWeekOffset = useMemo(() => {
    if (allUpcomingItems.length === 0) return 0;

    const farthest = allUpcomingItems[allUpcomingItems.length - 1].date;
    const diffMs = farthest.getTime() - currentWeekStart.getTime();
    const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(0, weeks);
  }, [allUpcomingItems, currentWeekStart]);

  const persistedCurrentWeekItems = useMemo(
    () => readPersistedWeekSnapshot(toWeekIso(currentWeekStart)),
    [currentWeekStart]
  );

  useEffect(() => {
    const weekIso = toWeekIso(currentWeekStart);
    const currentWeekEnd = addDays(currentWeekStart, 5);

    const liveCurrentWeek = allUpcomingItems
      .filter((item) => item.date >= currentWeekStart && item.date < currentWeekEnd)
      .map((item) => ({
        ticker: item.ticker,
        date: toLocalIsoDate(item.date),
        timing: item.timing,
      }));

    const mergedMap = new Map<string, PersistedWeekItem>();
    for (const item of [...persistedCurrentWeekItems, ...liveCurrentWeek]) {
      const key = `${item.ticker}|${item.date}|${item.timing}`;
      mergedMap.set(key, item);
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    writePersistedWeekSnapshot(weekIso, merged);
  }, [allUpcomingItems, currentWeekStart, persistedCurrentWeekItems]);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const weekItems = useMemo(() => {
    const weekEnd = addDays(weekStart, 5);
    const live = allUpcomingItems.filter((item) => item.date >= weekStart && item.date < weekEnd);

    if (weekOffset !== 0) return live;

    const persisted = persistedCurrentWeekItems.reduce<EarningsItem[]>((acc, item) => {
      const quote = quoteMap.get(item.ticker);
      if (!quote) return acc;

      const date = new Date(`${item.date}T00:00:00`);
      if (Number.isNaN(date.getTime())) return acc;

      acc.push({
        ticker: item.ticker,
        date,
        profile: profileMap.get(item.ticker) ?? null,
        quote,
        timing: item.timing,
        source: "persisted",
      });

      return acc;
    }, []);

    const dedupe = new Map<string, EarningsItem>();
    for (const item of [...persisted, ...live]) {
      const key = `${item.ticker}|${toLocalIsoDate(item.date)}|${item.timing}`;
      dedupe.set(key, item);
    }

    return Array.from(dedupe.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [allUpcomingItems, weekOffset, weekStart, persistedCurrentWeekItems, quoteMap, profileMap]);

  const earningsItems = useMemo(() => {
    return weekItems
      .filter((item) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return (
          item.ticker.toLowerCase().includes(term) ||
          (item.profile?.name ?? "").toLowerCase().includes(term)
        );
      })
      .filter((item) => capMatches(capFilter, item.quote.market_cap))
      .filter((item) => {
        if (!watchlistTickerSet) return true;
        return watchlistTickerSet.has(item.ticker);
      })
      .sort((a, b) => b.quote.market_cap - a.quote.market_cap);
  }, [weekItems, search, capFilter, watchlistTickerSet]);

  const dayColumns = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        groups: {
          beforeOpen: earningsItems.filter(
            (item) => isSameDay(item.date, day) && item.timing === "Before Open"
          ),
          afterClose: earningsItems.filter(
            (item) => isSameDay(item.date, day) && item.timing === "After Close"
          ),
        },
      })),
    [weekDays, earningsItems]
  );

  const selectedItem = useMemo(
    () => (selectedTicker ? earningsItems.find((item) => item.ticker === selectedTicker) ?? null : null),
    [earningsItems, selectedTicker]
  );

  const selectedCache = selectedTicker ? panelCache[selectedTicker] : undefined;

  const filteredRows = useMemo(() => {
    const base = selectedCache ? [...selectedCache.rows] : [];

    return base
      .filter(
        (row) =>
          row.estimate != null ||
          row.reported != null ||
          row.revenueEstimate != null ||
          row.revenue != null
      )
      .sort((a, b) => quarterSortValue(b) - quarterSortValue(a))
      .slice(0, 16);
  }, [selectedCache]);

  const chartRows = useMemo(() => {
    const ordered = [...filteredRows].sort((a, b) => quarterSortValue(a) - quarterSortValue(b));
    if (!selectedCache) return ordered;

    const hasAnyNextEstimate = selectedCache.nextEstEps != null || selectedCache.nextEstRevenue != null;
    if (!hasAnyNextEstimate) return ordered;

    const nextQuarter = resolveNextEstimateQuarter(
      selectedCache.rows,
      selectedCache.nextEarningsDate
    );

    if (!nextQuarter || nextQuarter === "Unknown") return ordered;

    // Keep chart focused on a single upcoming estimate quarter per ticker sequence.
    const pruned = ordered.filter((row) => {
      const isEstimateOnly =
        row.reported == null &&
        row.revenue == null &&
        (row.estimate != null || row.revenueEstimate != null);

      if (!isEstimateOnly) return true;
      return row.quarter === nextQuarter;
    });

    const nextSortTs = new Date(`${selectedCache.nextEarningsDate}T00:00:00Z`).getTime();
    const index = pruned.findIndex((row) => row.quarter === nextQuarter);

    if (index >= 0) {
      const existing = pruned[index];
      pruned[index] = {
        ...existing,
        estimate: existing.estimate ?? selectedCache.nextEstEps,
        revenueEstimate: existing.revenueEstimate ?? selectedCache.nextEstRevenue,
      };
      return pruned.sort((a, b) => quarterSortValue(a) - quarterSortValue(b));
    }

    pruned.push({
      quarter: nextQuarter,
      releaseDate: selectedCache.nextEarningsDate,
      estimate: selectedCache.nextEstEps,
      reported: null,
      surprise: null,
      revenueEstimate: selectedCache.nextEstRevenue,
      revenue: null,
      sortTs: Number.isFinite(nextSortTs) ? nextSortTs : quarterLabelToTimestamp(nextQuarter),
    });

    return pruned
      .sort((a, b) => quarterSortValue(a) - quarterSortValue(b))
      .slice(-16);
  }, [filteredRows, selectedCache]);

  const tableRows = useMemo(
    () =>
      filteredRows.filter((row) =>
        chartMetric === "revenue" ? row.revenue != null : row.reported != null
      ),
    [filteredRows, chartMetric]
  );

  const isPanelLoading = !!selectedTicker && loadingTicker === selectedTicker;
  const isLoading = quotesLoading || profilesLoading;

  const handleSelectTicker = async (ticker: string): Promise<void> => {
    setSelectedTicker(ticker);
    setIsPanelOpen(true);
    setHoveredChartIndex(null);
    setHoveredSeries(null);

    if (panelCache[ticker]) return;

    setLoadingTicker(ticker);

    try {
      const [financials, insightMap] = await Promise.all([
        fetchCompanyFinancials(ticker),
        fetchBatchEarningsInsights([ticker]),
      ]);

      const insight = insightMap[ticker.toUpperCase()] ?? null;
      const rows = formatEarningsData(
        financials?.income_statement?.quarterly,
        insight?.history
      );

      const marketCap = quoteMap.get(ticker)?.market_cap ?? null;
      const peRatio = quoteMap.get(ticker)?.pe_ratio ?? null;
      const annual = financials?.income_statement?.annual ?? [];
      const latestAnnualRevenue = annual.length > 0 ? annual[annual.length - 1].revenue : null;
      const psRatio =
        marketCap != null && latestAnnualRevenue != null && latestAnnualRevenue > 0
          ? marketCap / latestAnnualRevenue
          : null;

      setPanelCache((prev) => ({
        ...prev,
        [ticker]: {
          rows,
          marketCap,
          peRatio,
          psRatio,
          nextEstEps: insight?.est_eps ?? null,
          nextEstRevenue: insight?.est_revenue ?? null,
          nextEarningsDate: quoteMap.get(ticker)?.next_earnings_date ?? null,
        },
      }));
    } finally {
      setLoadingTicker(null);
    }
  };

  const renderPanelContent = () => {
    if (!selectedTicker || !selectedItem) {
      return (
        <div className="p-6">
          <p className="text-sm text-snow-peak font-medium">Quick View</p>
          <p className="text-xs text-mist mt-1">Select a ticker from the calendar to open the side menu.</p>
        </div>
      );
    }

    if (isPanelLoading || !selectedCache) {
      return <PanelSkeleton onClose={() => setIsPanelOpen(false)} />;
    }

    const highlightedQuarter =
      hoveredChartIndex != null && hoveredChartIndex >= 0 && hoveredChartIndex < chartRows.length
        ? chartRows[hoveredChartIndex].quarter
        : null;

    return (
      <div className="h-full min-h-0 flex flex-col">
        <div className="p-4 border-b border-wolf-border/35">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <TickerLogo
                ticker={selectedItem.ticker}
                src={selectedItem.profile?.logo_url}
                className="h-10 w-10"
                imageClassName="rounded-md"
                fallbackClassName="rounded-md text-xs"
              />
              <div>
                <p className="text-lg font-semibold text-snow-peak">{selectedItem.ticker}</p>
                <p
                  className={
                    selectedItem.quote.day_change_percent != null && selectedItem.quote.day_change_percent >= 0
                      ? "text-sm font-medium text-emerald-400 leading-tight"
                      : "text-sm font-medium text-rose-400 leading-tight"
                  }
                >
                  {formatPrice(selectedItem.quote.price)}
                  {" "}
                  <span className="text-xs">
                    {formatDisplayPercent(selectedItem.quote.day_change_percent)}
                  </span>
                </p>
                <p className="text-xs text-mist/90 mt-1">
                  Next earnings: {formatDate(selectedItem.quote.next_earnings_date ?? null)}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsPanelOpen(false)}
              aria-label="Close side panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-mist">Mkt Cap</p>
              <p className="text-sm font-semibold text-snow-peak">{formatMarketCap(selectedCache.marketCap)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-mist">P/E</p>
              <p className="text-sm font-semibold text-snow-peak">{formatRatio(selectedCache.peRatio)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-mist">P/S</p>
              <p className="text-sm font-semibold text-snow-peak">{formatRatio(selectedCache.psRatio)}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-mist">Recent Earnings Quarters</p>
            <div className="inline-flex rounded-full border border-wolf-border/40 bg-wolf-black/35 p-0.5">
              <button
                type="button"
                className={
                  chartMetric === "revenue"
                    ? "px-3 py-1 rounded-full text-xs font-medium bg-wolf-surface text-snow-peak"
                    : "px-3 py-1 rounded-full text-xs text-mist"
                }
                onClick={() => setChartMetric("revenue")}
              >
                Revenue
              </button>
              <button
                type="button"
                className={
                  chartMetric === "eps"
                    ? "px-3 py-1 rounded-full text-xs font-medium bg-wolf-surface text-snow-peak"
                    : "px-3 py-1 rounded-full text-xs text-mist"
                }
                onClick={() => setChartMetric("eps")}
              >
                EPS
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/35 bg-[#0A171B]/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-mist">Next estimate</p>
            <p className="mt-1 text-sm font-semibold text-snow-peak">
              {chartMetric === "eps"
                ? `EPS: ${formatEps(selectedCache.nextEstEps)}`
                : `Revenue: ${formatCompactMoney(selectedCache.nextEstRevenue)}`}
            </p>
            <p className="mt-1 text-[10px] text-mist/80">EPS source: Yahoo consensus (Alpha fallback).</p>
          </div>

          <div className="h-[250px] rounded-xl border border-wolf-border/45 bg-gradient-to-b from-[#0A171B] to-[#091215] px-2 py-0 shadow-[0_10px_35px_rgba(0,0,0,0.28)]">
            <EarningsMetricChart
              metric={chartMetric}
              data={chartRows}
              hoveredIndex={hoveredChartIndex}
              hoverSeries={hoveredSeries}
              onPointHover={(index, series) => {
                setHoveredChartIndex(index);
                setHoveredSeries(series);
              }}
              onPointLeave={() => {
                setHoveredChartIndex(null);
                setHoveredSeries(null);
              }}
            />
          </div>

          <EarningsTable
            rows={tableRows}
            chartRows={chartRows}
            metric={chartMetric}
            onHover={setHoveredChartIndex}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <CalendarClock className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Earnings</h1>
          <p className="text-xs text-mist mt-0.5">Weekly earnings calendar, curated for fast scanning</p>
        </div>
      </div>

      <div className={isPanelOpen && selectedItem ? "grid grid-cols-1 2xl:grid-cols-[1fr_450px] gap-4 flex-1 min-h-0" : "grid grid-cols-1 gap-4 flex-1 min-h-0"}>
        <Card className="h-[100vh] min-h-0">
          <CardContent className="p-2 h-full min-h-0 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wolf-border/30 p-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setWeekOffset((value) => Math.max(0, value - 1))}
                  aria-label="Previous week"
                  disabled={weekOffset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs">
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setWeekOffset((value) => Math.min(maxWeekOffset, value + 1))}
                  aria-label="Next week"
                  disabled={weekOffset >= maxWeekOffset}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="ml-1">
                  <p className="text-sm font-semibold text-snow-peak">Earnings This Week</p>
                  <p className="text-[11px] text-mist">
                    {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" - "}
                    {addDays(weekStart, 4).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-auto sm:min-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mist/70" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ticker or company"
                    className="h-9 w-full sm:w-[220px] pl-8 text-xs"
                  />
                </div>

                <select
                  value={capFilter}
                  onChange={(event) => setCapFilter(event.target.value as CapFilter)}
                  className="h-9 w-full sm:w-auto rounded-md border border-wolf-border/40 bg-wolf-black/40 px-3 text-xs text-snow-peak"
                  aria-label="Market cap filter"
                >
                  <option value="all">Market Cap: 10B+</option>
                  <option value="mega">Mega (200B+)</option>
                  <option value="large">Large (10B-200B)</option>
                </select>

                <select
                  value={watchlistFilterId}
                  onChange={(event) => setWatchlistFilterId(event.target.value)}
                  className="h-9 w-full sm:w-auto rounded-md border border-wolf-border/40 bg-wolf-black/40 px-3 text-xs text-snow-peak"
                  aria-label="Watchlist filter"
                >
                  <option value="all">Filter by Watchlist: All</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 p-3">
              <div className="hidden xl:grid xl:col-span-5 grid-cols-5 rounded-md border border-wolf-border/40 bg-wolf-black/35 overflow-hidden">
                {weekDays.map((day) => (
                  <div key={`calendar-${day.toISOString()}`} className="px-3 py-2 border-r border-wolf-border/35 last:border-r-0 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-mist">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <div className="mt-1 flex justify-center">
                      <span
                        className={
                          isSameDay(day, today)
                            ? "h-6 w-6 rounded-full bg-sunset-orange text-xs font-semibold inline-flex items-center justify-center"
                            : "text-xs font-semibold text-snow-peak"
                        }
                      >
                        {day.toLocaleDateString("en-US", { day: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {dayColumns.map(({ day, groups }) => {
                const sections: EarningsSection[] = [
                  { key: "before-open", label: "Before Open", icon: Sun, items: groups.beforeOpen },
                  { key: "after-close", label: "After Close", icon: Moon, items: groups.afterClose },
                ];

                return (
                  <div key={day.toISOString()} className="rounded-lg border border-wolf-border/40 bg-wolf-black/80 overflow-hidden">
                    <div className="border-b border-wolf-border/30 px-3 py-2">
                      <p className="xl:hidden text-xs uppercase tracking-wide text-mist">
                        {day.toLocaleDateString("en-US", { weekday: "short" })}
                      </p>
                      <p className="xl:hidden text-sm font-semibold text-snow-peak">
                        {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>

                    <div className="p-2 space-y-2 min-h-[280px] sm:min-h-[320px] xl:min-h-[380px] max-h-[58vh] xl:max-h-[520px] overflow-y-auto">
                      {isLoading ? (
                        <div className="rounded-xl border border-wolf-border/45 bg-[#0A171B]/75 p-3 shadow-[0_10px_35px_rgba(0,0,0,0.28)]">
                          <div className="flex items-center gap-3">
                            <div className="relative h-7 w-7 rounded-full border border-sunset-orange/45 bg-sunset-orange/10">
                              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-sunset-orange border-r-sunset-orange animate-[spin_1.2s_linear_infinite]" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-snow-peak">Loading weekly earnings</p>
                              <p className="text-[11px] text-mist/80">Syncing quotes and profiles...</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        sections.map((section) => (
                          <div key={section.key} className="rounded-md border border-wolf-border/40 bg-wolf-black/35 p-2.5">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[11px] font-medium text-snow-peak inline-flex items-center gap-1.5">
                                <section.icon className="h-3.5 w-3.5 text-mist" />
                                {section.label}
                              </p>
                              <Badge variant="secondary" className="text-[10px] h-5">{section.items.length}</Badge>
                            </div>

                            {section.items.length === 0 ? (
                              <p className="text-xs text-mist/70">No reports</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-2">
                                {section.items.map((item) => {
                                  const isSelected = selectedTicker === item.ticker && isPanelOpen;
                                  const isInWatchlist = allWatchlistTickerSet.has(item.ticker);

                                  return (
                                    <button
                                      type="button"
                                      key={`${item.ticker}-${item.date.toISOString()}-${section.key}`}
                                      onClick={() => { void handleSelectTicker(item.ticker); }}
                                      className={
                                        isSelected
                                          ? "rounded-md border border-sunset-orange/60 bg-wolf-surface/90 p-2 min-h-[78px] w-full gap-3 flex justify-center text-center"
                                          : "rounded-md border border-wolf-border/45 bg-wolf-surface/90 p-2 min-h-[78px] w-full gap-2 flex justify-center text-center hover:border-sunset-orange/30 transition-colors"
                                      }
                                      aria-label={`Open ${item.ticker} earnings quick view`}
                                    >
                                      <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                                        <div className="relative mx-auto w-fit">
                                          <TickerLogo
                                            ticker={item.ticker}
                                            src={item.profile?.logo_url}
                                            className="h-8 w-8 sm:h-10 sm:w-10"
                                            imageClassName="rounded-[6px]"
                                            fallbackClassName="rounded-[6px] text-[10px]"
                                          />
                                          {isInWatchlist ? (
                                            <span className="absolute -top-1 -right-2 z-20 inline-flex items-center justify-center h-4 w-4 rounded-full bg-black text-sunset-orange ring-2 ring-[#000000] shadow-[0_0_0_2px_rgba(251,191,36,0.35)]">
                                              <Star className="h-3.5 w-3.5" />
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="w-full">
                                          <p className="text-[11px] sm:text-xs font-semibold text-snow-peak leading-tight">{item.ticker}</p>
                                          {item.source === "persisted" ? (
                                            <p className="text-[10px] text-mist/80">Reported</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </CardContent>
        </Card>

        {isPanelOpen && selectedItem ? (
          <Card className="hidden 2xl:block h-full min-h-0">
            <CardContent className="p-0 h-full min-h-0 overflow-hidden">{renderPanelContent()}</CardContent>
          </Card>
        ) : null}
      </div>

      {isPanelOpen && selectedItem ? (
        <div className="2xl:hidden fixed inset-0 z-40 bg-black/20">
          <div className="absolute inset-y-0 right-0 w-full max-w-[480px] bg-midnight-rock border-l border-wolf-border/45 overflow-y-auto">
            {renderPanelContent()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
