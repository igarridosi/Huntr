"use client";

import { fetchEarningsDetailData } from "@/app/actions/stock";
import { ErrorState } from "@/components/ui/error-state";
import { MaterialPanel } from "@/components/ui/material-panel";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SelectMenu } from "@/components/ui/select-menu";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
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
import { useChartColors } from "@/hooks/use-chart-colors";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
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
  marketCap?: number | null;
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
  historyLimit: number;
  dataError?: string;
}


const PERSISTED_WEEK_KEY = "huntr_earnings_current_week";
const PREVIEW_HISTORY_LIMIT = 4;
const FULL_HISTORY_LIMIT = 14;

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

function nonZeroNumberOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return Math.abs(parsed) > 1e-9 ? parsed : null;
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
    const epsFromFinancials =
      nonZeroNumberOrNull(row.eps_diluted) ?? nonZeroNumberOrNull(row.eps_basic);

    if (existing) {
      if (existing.revenue == null) {
        existing.revenue = numberOrNull(row.revenue);
      }
      if (existing.reported == null && epsFromFinancials != null) {
        existing.reported = epsFromFinancials;
        existing.surprise = existing.surprise ?? inferSurprise(existing.reported, existing.estimate);
      }
      if (!existing.releaseDate) {
        existing.releaseDate = row.date;
      }
      existing.sortTs = Math.max(existing.sortTs, sortTs);
      continue;
    }

    merged.set(quarter, {
      quarter,
      releaseDate: row.date ?? null,
      estimate: null,
      reported: epsFromFinancials,
      surprise: null,
      revenueEstimate: null,
      revenue: numberOrNull(row.revenue),
      sortTs,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.sortTs - a.sortTs);
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

function createPersistedFallbackQuote(
  ticker: string,
  marketCap: number | null | undefined,
  date: string,
  timing: EarningsTiming
): StockQuote {
  return {
    ticker,
    price: 0,
    current_volume: 0,
    day_change: 0,
    day_change_percent: 0,
    next_earnings_date: date,
    earnings_timing: timing,
    // Keep persisted current-week reporters visible even if live quote vanished.
    market_cap: marketCap && marketCap > 0 ? marketCap : 10_000_000_000,
    shares_outstanding: 0,
    pe_ratio: 0,
    dividend_yield: 0,
    fifty_two_week_high: 0,
    fifty_two_week_low: 0,
    avg_volume: 0,
    beta: 0,
  };
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

/** "Aug 31 '26": fits the quarter column under its label. */
function formatShortDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} '${String(d.getFullYear()).slice(2)}`;
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
    <div className="rounded-lg border border-wolf-border px-3 py-1.5 text-xs shadow-lg bg-wolf-surface">
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
  // Theme-aware color tokens (Recharts SVG attributes don't support CSS vars)
  const c = useChartColors();

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
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
            <XAxis
              dataKey="quarter"
              tick={{ fill: c.tick, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              interval={0}
              angle={-45}
              textAnchor="end"
              tickMargin={10}
              height={58}
              padding={{ left: 8, right: 8 }}
              tickFormatter={formatQuarterTick}
            />
            <YAxis
              tick={{ fill: c.tick, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
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
                      fill={c.neutral}
                      opacity={0.72}
                      onMouseEnter={(event) => onPointHover(idx, "revEstimate", event)}
                    />
                  );
                }

                return (
                  <Cell
                    key={`rev-cell-${row.quarter}-${idx}`}
                    fill={c.primary}
                    opacity={hoveredIndex === idx && hoverSeries === "revReported" ? 1 : 0.92}
                    onMouseEnter={(event) => onPointHover(idx, "revReported", event)}
                  />
                );
              })}
            </Bar>
          </BarChart>
        ) : (
          <ComposedChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
            <XAxis
              dataKey="quarter"
              type="category"
              tick={{ fill: c.tick, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
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
              tick={{ fill: c.tick, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              width={52}
              tickFormatter={formatEpsTick}
            />
            <Tooltip cursor={false} content={<EarningsHoverTooltip hoverSeries={hoverSeries} />} />

            <Scatter
              dataKey="estimate"
              fill="none"
              stroke={c.tick}
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
                    stroke={c.tick}
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
                      stroke={c.grid}
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
  const rowsByQuarter = new Map<string, FormattedEarningsPoint>(rows.map((row) => [row.quarter, row]));

  const revenueTtm = (quarter: string): number | null => {
    const quarters = [quarter, shiftQuarterLabel(quarter, -1), shiftQuarterLabel(quarter, -2), shiftQuarterLabel(quarter, -3)];
    const values = quarters
      .map((label) => (label ? rowsByQuarter.get(label)?.revenue ?? null : null))
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (values.length < 4) return null;
    return values.reduce((sum, value) => sum + value, 0);
  };

  // Same five columns, same widths, for both metrics: switching EPS and
  // Revenue changes what the cells say, never where they are.
  const heads = metric === "eps" ? ["Estimate", "Reported", "Surprise", "Revenue"] : ["Revenue", "QoQ", "YoY", "TTM"];

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-wolf-border/40">
      <div className="scroll-quiet h-[232px] overflow-y-auto">
        <table className="w-full table-fixed font-mono text-[12px] tabular-nums">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[19.5%]" />
            <col className="w-[19.5%]" />
            <col className="w-[19.5%]" />
            <col className="w-[19.5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-wolf-surface font-sans">
            <tr className="text-[11px] text-mist">
              <th className="px-3 py-2.5 text-left font-medium">Quarter</th>
              {heads.map((h) => (
                <th key={h} className="px-3 py-2.5 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center font-sans text-mist">
                  No quarters on file yet
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const chartIndex = chartRows.findIndex((item) => item.quarter === row.quarter);
                const previousQuarter = shiftQuarterLabel(row.quarter, -1);
                const previousYearQuarter = shiftQuarterLabel(row.quarter, -4);
                const qoq = computeGrowthPercent(row.revenue, previousQuarter ? rowsByQuarter.get(previousQuarter)?.revenue ?? null : null);
                const yoy = computeGrowthPercent(row.revenue, previousYearQuarter ? rowsByQuarter.get(previousYearQuarter)?.revenue ?? null : null);
                const surprise = row.surprise;
                const beat = (surprise ?? 0) >= 0;

                return (
                  <tr
                    key={row.quarter}
                    className="border-t border-wolf-border/25 text-snow-peak transition-colors duration-150 hover:bg-snow-peak/[0.035]"
                    onMouseEnter={() => onHover(chartIndex >= 0 ? chartIndex : null)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <td className="px-3 py-2">
                      <span className="block font-sans text-[12px] font-medium">{row.quarter}</span>
                      <span className="block truncate font-sans text-[10.5px] text-mist">{formatShortDate(row.releaseDate)}</span>
                    </td>
                    {metric === "eps" ? (
                      <>
                        <td className="px-3 py-2 text-right text-mist">{formatEps(row.estimate)}</td>
                        <td className="px-3 py-2 text-right">{formatEps(row.reported)}</td>
                        <td className={cn("px-3 py-2 text-right", surprise == null ? "text-mist/50" : beat ? "text-bullish" : "text-bearish")}>
                          {surprise == null ? "-" : `${beat ? "+" : ""}${surprise.toFixed(1)}%`}
                        </td>
                        <td className="px-3 py-2 text-right text-mist">{formatCompactMoney(row.revenue)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right">{formatCompactMoney(row.revenue)}</td>
                        <td className={cn("px-3 py-2 text-right", signToneClass(qoq))}>{formatPct(qoq)}</td>
                        <td className={cn("px-3 py-2 text-right", signToneClass(yoy))}>{formatPct(yoy)}</td>
                        <td className="px-3 py-2 text-right text-mist">{formatCompactMoney(revenueTtm(row.quarter))}</td>
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

  const { data: quotes = [], isLoading: quotesLoading, isError: quotesError, refetch: refetchQuotes } = useAllQuotes();
  const { data: profiles = [], isError: profilesError, refetch: refetchProfiles } = useAllProfiles();
  const { lists } = useWatchlist();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();

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

    const persistedCompletedItems = persistedCurrentWeekItems.filter((item) => {
      const date = new Date(`${item.date}T00:00:00`);
      if (Number.isNaN(date.getTime())) return false;
      // Persist only events that are already in the past.
      return date < today;
    });

    const liveCurrentWeekCompleted = allUpcomingItems
      .filter(
        (item) =>
          item.date >= currentWeekStart &&
          item.date < currentWeekEnd &&
          item.date < today
      )
      .map((item) => ({
        ticker: item.ticker,
        date: toLocalIsoDate(item.date),
        timing: item.timing,
        marketCap: item.quote.market_cap,
      }));

    const mergedMap = new Map<string, PersistedWeekItem>();
    for (const item of [...persistedCompletedItems, ...liveCurrentWeekCompleted]) {
      // Keep a single entry per ticker for the current week snapshot.
      mergedMap.set(item.ticker, item);
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) => {
      if (a.date === b.date) return a.ticker.localeCompare(b.ticker);
      return a.date.localeCompare(b.date);
    });
    writePersistedWeekSnapshot(weekIso, merged);
  }, [allUpcomingItems, currentWeekStart, persistedCurrentWeekItems, today]);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const weekItems = useMemo(() => {
    const weekEnd = addDays(weekStart, 5);
    const live = allUpcomingItems.filter((item) => item.date >= weekStart && item.date < weekEnd);

    if (weekOffset !== 0) return live;

    const persisted = persistedCurrentWeekItems.reduce<EarningsItem[]>((acc, item) => {
      const quote =
        quoteMap.get(item.ticker) ??
        createPersistedFallbackQuote(item.ticker, item.marketCap, item.date, item.timing);

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
      .filter((item) =>
        item.source === "persisted" ? true : capMatches(capFilter, item.quote.market_cap)
      )
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
      .sort((a, b) => quarterSortValue(b) - quarterSortValue(a));
  }, [selectedCache]);

  const chartRows = useMemo(() => {
    const ordered = [...filteredRows].sort((a, b) => quarterSortValue(a) - quarterSortValue(b));
    if (!selectedCache) return ordered;

    const nextQuarter = resolveNextEstimateQuarter(
      selectedCache.rows,
      selectedCache.nextEarningsDate
    );

    if (!nextQuarter || nextQuarter === "Unknown") return ordered;

    const hasNextQuarter = ordered.some((row) => row.quarter === nextQuarter);
    if (hasNextQuarter) return ordered;

    const nextSortTs = new Date(`${selectedCache.nextEarningsDate}T00:00:00Z`).getTime();
    ordered.push({
      quarter: nextQuarter,
      releaseDate: selectedCache.nextEarningsDate,
      estimate: selectedCache.nextEstEps,
      reported: null,
      surprise: null,
      revenueEstimate: selectedCache.nextEstRevenue,
      revenue: null,
      sortTs: Number.isFinite(nextSortTs) ? nextSortTs : quarterLabelToTimestamp(nextQuarter),
    });

    return ordered.sort((a, b) => quarterSortValue(a) - quarterSortValue(b));
  }, [filteredRows, selectedCache]);

  const tableRows = useMemo(
    () =>
      filteredRows.filter((row) =>
        chartMetric === "revenue"
          ? row.revenue != null || row.revenueEstimate != null
          : row.reported != null || row.estimate != null
      ),
    [filteredRows, chartMetric]
  );

  const isPanelLoading = !!selectedTicker && loadingTicker === selectedTicker && !selectedCache;
  const isHistoryExpansionLoading =
    !!selectedTicker &&
    loadingTicker === selectedTicker &&
    !!selectedCache &&
    selectedCache.historyLimit < FULL_HISTORY_LIMIT;
  const hasFullHistoryLoaded = (selectedCache?.historyLimit ?? 0) >= FULL_HISTORY_LIMIT;
  // Profiles only decorate a chip (name, logo) and fall back to null, so
  // waiting on them held an otherwise-renderable calendar hostage. Quotes are
  // what the columns are actually built from.
  const isLoading = quotesLoading;

  const handleSelectTicker = async (ticker: string): Promise<void> => {
    setSelectedTicker(ticker);
    setIsPanelOpen(true);
    setHoveredChartIndex(null);
    setHoveredSeries(null);

    if (panelCache[ticker]) return;

    setLoadingTicker(ticker);

    try {
      const detail = await fetchEarningsDetailData(ticker, PREVIEW_HISTORY_LIMIT);
      const insight = detail.insight ?? null;
      const rows = formatEarningsData(
        detail.financials?.income_statement?.quarterly,
        insight?.history
      );

      const marketCap = detail.quote?.market_cap ?? quoteMap.get(ticker)?.market_cap ?? null;
      const peRatio = detail.quote?.pe_ratio ?? quoteMap.get(ticker)?.pe_ratio ?? null;
      const quarterlyIncome = detail.financials?.income_statement?.quarterly ?? [];
      const annual = detail.financials?.income_statement?.annual ?? [];
      const latestAnnualRevenue = annual.length > 0 ? annual[annual.length - 1].revenue : null;
      const latestQuarterlyRevenue = quarterlyIncome
        .slice(-4)
        .map((entry) => numberOrNull(entry.revenue))
        .filter((entry): entry is number => entry != null && Number.isFinite(entry));
      const ttmRevenue =
        latestQuarterlyRevenue.length === 4
          ? latestQuarterlyRevenue.reduce((sum, value) => sum + value, 0)
          : null;
      const revenueBase =
        latestAnnualRevenue != null && latestAnnualRevenue > 0
          ? latestAnnualRevenue
          : ttmRevenue;
      const psRatio =
        marketCap != null && revenueBase != null && revenueBase > 0
          ? marketCap / revenueBase
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
          nextEarningsDate: detail.quote?.next_earnings_date ?? quoteMap.get(ticker)?.next_earnings_date ?? null,
          historyLimit: PREVIEW_HISTORY_LIMIT,
          dataError: detail.data_error ?? undefined,
        },
      }));
    } finally {
      setLoadingTicker(null);
    }
  };

  const handleLoadMoreHistory = async (): Promise<void> => {
    if (!selectedTicker) return;

    const existing = panelCache[selectedTicker];
    if (!existing || existing.historyLimit >= FULL_HISTORY_LIMIT) return;

    if (!user) {
      openGate("deepData");
      return;
    }

    setLoadingTicker(selectedTicker);

    try {
      const detail = await fetchEarningsDetailData(selectedTicker, FULL_HISTORY_LIMIT);
      const insight = detail.insight ?? null;
      const rows = formatEarningsData(
        detail.financials?.income_statement?.quarterly,
        insight?.history
      );

      const marketCap = detail.quote?.market_cap ?? quoteMap.get(selectedTicker)?.market_cap ?? existing.marketCap;
      const peRatio = detail.quote?.pe_ratio ?? quoteMap.get(selectedTicker)?.pe_ratio ?? existing.peRatio;
      const quarterlyIncome = detail.financials?.income_statement?.quarterly ?? [];
      const annual = detail.financials?.income_statement?.annual ?? [];
      const latestAnnualRevenue = annual.length > 0 ? annual[annual.length - 1].revenue : null;
      const latestQuarterlyRevenue = quarterlyIncome
        .slice(-4)
        .map((entry) => numberOrNull(entry.revenue))
        .filter((entry): entry is number => entry != null && Number.isFinite(entry));
      const ttmRevenue =
        latestQuarterlyRevenue.length === 4
          ? latestQuarterlyRevenue.reduce((sum, value) => sum + value, 0)
          : null;
      const revenueBase =
        latestAnnualRevenue != null && latestAnnualRevenue > 0
          ? latestAnnualRevenue
          : ttmRevenue;
      const psRatio =
        marketCap != null && revenueBase != null && revenueBase > 0
          ? marketCap / revenueBase
          : existing.psRatio;

      setPanelCache((prev) => ({
        ...prev,
        [selectedTicker]: {
          rows,
          marketCap,
          peRatio,
          psRatio,
          nextEstEps: insight?.est_eps ?? existing.nextEstEps,
          nextEstRevenue: insight?.est_revenue ?? existing.nextEstRevenue,
          nextEarningsDate:
            detail.quote?.next_earnings_date ??
            quoteMap.get(selectedTicker)?.next_earnings_date ??
            existing.nextEarningsDate,
          historyLimit: FULL_HISTORY_LIMIT,
        },
      }));
    } finally {
      setLoadingTicker(null);
    }
  };

  const closePanel = () => {
    setIsPanelOpen(false);
    setSelectedTicker(null);
  };

  const panelItem = isPanelOpen ? selectedItem : null;

  const renderPanelContent = () => {
    if (!panelItem) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-snow-peak/[0.05] ring-1 ring-inset ring-wolf-border/50">
            <CalendarClock className="h-5 w-5 text-mist" aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-snow-peak">Pick a company</p>
            <p className="mt-1 text-[13px] leading-relaxed text-mist">Its last quarters against estimates, and what analysts expect next, open here.</p>
          </div>
        </div>
      );
    }

    const panelMarketCap = selectedCache?.marketCap ?? panelItem.quote.market_cap ?? null;
    const panelPeRatio = selectedCache?.peRatio ?? panelItem.quote.pe_ratio ?? null;
    const panelPsRatio = selectedCache?.psRatio ?? null;
    const hasHistoryLoaded = !!selectedCache;
    const panelError = selectedCache?.dataError ?? null;
    const change = panelItem.quote.day_change_percent;
    const reportDay = panelItem.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Company: always the same height, whatever loads below. */}
        <div className="shrink-0 border-b border-wolf-border/35 p-5">
          <div className="flex items-start gap-3">
            <TickerLogo ticker={panelItem.ticker} src={panelItem.profile?.logo_url} className="h-11 w-11 shrink-0" imageClassName="rounded-xl" fallbackClassName="rounded-xl text-xs" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold text-snow-peak">{panelItem.ticker}</span>
                <span className="truncate text-[13px] text-mist">{panelItem.profile?.name ?? ""}</span>
              </p>
              <p className="mt-0.5 font-mono text-[13px] tabular-nums">
                <span className="text-snow-peak">{formatPrice(panelItem.quote.price)}</span>{" "}
                <span className={change != null && change >= 0 ? "text-bullish" : "text-bearish"}>{formatDisplayPercent(change)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist transition-[background-color,color,transform] duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-sunset-orange/[0.07] px-3 py-2 ring-1 ring-inset ring-sunset-orange/20">
            {panelItem.timing === "Before Open" ? <Sun className="h-3.5 w-3.5 text-sunset-orange" aria-hidden /> : <Moon className="h-3.5 w-3.5 text-sunset-orange" aria-hidden />}
            <p className="text-[13px] text-snow-peak">
              {panelItem.source === "persisted" ? "Reported" : "Reports"} {reportDay}, <span className="text-mist">{panelItem.timing === "Before Open" ? "before the open" : "after the close"}</span>
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["Market cap", formatMarketCap(panelMarketCap)],
              ["P/E", formatRatio(panelPeRatio)],
              ["P/S", formatRatio(panelPsRatio)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-snow-peak/[0.03] px-3 py-2 ring-1 ring-inset ring-wolf-border/35">
                <dt className="text-[11px] text-mist">{label}</dt>
                <dd className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-snow-peak">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <SegmentedTabs<ChartMetric>
              items={[
                { key: "eps", label: "EPS" },
                { key: "revenue", label: "Revenue" },
              ]}
              value={chartMetric}
              onChange={setChartMetric}
              ariaLabel="Metric"
              size="sm"
            />
            <button
              type="button"
              onClick={handleLoadMoreHistory}
              disabled={!selectedCache || hasFullHistoryLoaded || isHistoryExpansionLoading || isPanelLoading}
              // Fixed width: the label changes, the button does not.
              className="inline-flex h-8 w-[8.5rem] items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium text-mist ring-1 ring-inset ring-wolf-border/50 transition-[background-color,color] duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak disabled:pointer-events-none disabled:opacity-50"
            >
              {isHistoryExpansionLoading ? "Loading…" : hasFullHistoryLoaded ? "14 quarters shown" : "Show 14 quarters"}
            </button>
          </div>

          <div className="flex items-baseline justify-between rounded-xl bg-snow-peak/[0.03] px-3.5 py-2.5 ring-1 ring-inset ring-wolf-border/35">
            <span className="text-[12px] text-mist">Next quarter, consensus</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-snow-peak">
              {hasHistoryLoaded ? (chartMetric === "eps" ? formatEps(selectedCache?.nextEstEps ?? null) : formatCompactMoney(selectedCache?.nextEstRevenue ?? null)) : <span className="huntr-skeleton inline-block h-4 w-14 rounded" />}
            </span>
          </div>

          {panelError ? <ErrorState inline variant="server" title={panelError} /> : null}

          <div className="h-[240px] rounded-xl bg-wolf-black/25 px-2 ring-1 ring-inset ring-wolf-border/35">
            {hasHistoryLoaded ? (
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
            ) : isPanelLoading ? (
              // The chart's own silhouette: axis, four quarters of dots.
              <div className="flex h-full items-end justify-around px-6 pb-12 pt-10" aria-busy="true">
                {[0.55, 0.35, 0.7, 0.45, 0.6].map((h, i) => (
                  <span key={i} className="huntr-skeleton h-3 w-3 rounded-full" style={{ marginBottom: `${h * 120}px` }} />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-mist">No history to chart</div>
            )}
          </div>

          {hasHistoryLoaded ? (
            <EarningsTable rows={tableRows} chartRows={chartRows} metric={chartMetric} onHover={setHoveredChartIndex} />
          ) : (
            <div className="h-[234px] space-y-2 rounded-xl p-3 ring-1 ring-inset ring-wolf-border/40" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="huntr-skeleton h-6 rounded-md" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const weekEnd = addDays(weekStart, 4);
  const rangeLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: weekEnd.getMonth() === weekStart.getMonth() ? undefined : "short", day: "numeric" })}`;
  const weekName = weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `In ${weekOffset} weeks`;
  const watchlistGroups = [{ label: "Watchlists", options: [{ value: "all", label: "All companies" }, ...lists.map((l) => ({ value: l.id, label: l.name }))] }];

  return (
    <div className="flex w-full min-h-0 flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sunset-orange/15 bg-sunset-orange/10">
          <CalendarClock className="h-5 w-5 text-sunset-orange" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-snow-peak">Earnings</h1>
          <p className="mt-0.5 text-xs tabular-nums text-mist" aria-live="polite">
            {isLoading ? "Loading the calendar…" : `${earningsItems.length} ${earningsItems.length === 1 ? "company reports" : "companies report"} ${weekOffset === 0 ? "this week" : "that week"}`}
          </p>
        </div>
      </header>

      {/* ── Toolbar: above the calendar, so its menus open over it. ───── */}
      <MaterialPanel className="relative z-20 flex flex-wrap items-center gap-3 p-3 sm:p-3.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => Math.max(0, value - 1))}
            aria-label="Previous week"
            disabled={weekOffset === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-mist transition-[background-color,color,transform] duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* Fixed width, so the arrows do not move as the label changes. */}
          <div className="w-[9.5rem] text-center">
            <p className="text-[14px] font-semibold text-snow-peak">{weekName}</p>
            <p className="font-mono text-[11px] tabular-nums text-mist">{rangeLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => Math.min(maxWeekOffset, value + 1))}
            aria-label="Next week"
            disabled={weekOffset >= maxWeekOffset}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-mist transition-[background-color,color,transform] duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="ml-1 h-8 rounded-lg px-2.5 text-[12px] font-medium text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors hover:text-snow-peak disabled:invisible"
          >
            Today
          </button>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex h-10 w-full items-center gap-2 rounded-lg bg-wolf-black/30 px-3 ring-1 ring-inset ring-wolf-border/50 focus-within:ring-sunset-orange/50 sm:w-60">
            <Search className="h-4 w-4 shrink-0 text-mist" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ticker or company"
              aria-label="Search this week"
              className="min-w-0 flex-1 bg-transparent text-sm text-snow-peak outline-none placeholder:text-mist/60"
            />
            {search ? (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-mist hover:text-snow-peak">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <SelectMenu<CapFilter>
            groups={[
              {
                label: "Market cap",
                options: [
                  { value: "all", label: "All sizes (over $10B)" },
                  { value: "mega", label: "Mega (over $200B)" },
                  { value: "large", label: "Large ($10B-200B)" },
                ],
              },
            ]}
            value={capFilter}
            onChange={setCapFilter}
            ariaLabel="Market cap"
            className="w-full sm:w-52"
          />
          <SelectMenu<string> groups={watchlistGroups} value={watchlistFilterId} onChange={setWatchlistFilterId} ariaLabel="Watchlist" className="w-full sm:w-48" />
        </div>
      </MaterialPanel>

      {/* ── Calendar + detail: the detail column is always there at xl, so
          choosing a company never re-flows the week. ─────────────────── */}
      <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <MaterialPanel className="min-w-0 p-3">
          {quotesError || profilesError ? (
            <ErrorState
              inline
              title="Could not load earnings data"
              onRetry={() => {
                void refetchQuotes();
                void refetchProfiles();
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {dayColumns.map(({ day, groups }, dayIndex) => {
                const isToday = isSameDay(day, today);
                const isPast = day < today;
                const total = groups.beforeOpen.length + groups.afterClose.length;
                const sections: EarningsSection[] = [
                  { key: "before-open", label: "Before Open", icon: Sun, items: groups.beforeOpen },
                  { key: "after-close", label: "After Close", icon: Moon, items: groups.afterClose },
                ];
                return (
                  <section
                    key={day.toISOString()}
                    aria-label={day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    className={cn(
                      "flex min-w-0 flex-col rounded-xl ring-1 ring-inset",
                      isToday ? "bg-sunset-orange/[0.04] ring-sunset-orange/30" : "bg-snow-peak/[0.02] ring-wolf-border/40"
                    )}
                  >
                    <header className="flex items-center justify-between border-b border-wolf-border/30 px-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className={cn("text-[12px] font-medium", isToday ? "text-sunset-orange" : "text-mist")}>
                          {day.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                        <span className={cn("font-mono text-[15px] font-semibold tabular-nums", isPast && !isToday ? "text-mist" : "text-snow-peak")}>
                          {day.toLocaleDateString("en-US", { day: "numeric" })}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-mist/70">{isLoading ? "" : total}</span>
                    </header>

                    {/* One height for every day, loaded or not, full or empty: the
                        window's, within bounds, so the detail beside it has room
                        and nothing on the page depends on what is selected. */}
                    <div className="scroll-quiet h-[440px] space-y-3 overflow-y-auto p-2.5 lg:h-[clamp(460px,calc(100dvh-300px),680px)]">
                      {isLoading ? (
                        <EarningsColumnSkeleton dayIndex={dayIndex} />
                      ) : (
                        sections.map((section) => (
                          <div key={section.key}>
                            <p className="mb-1.5 flex items-center justify-between px-0.5 text-[11.5px] font-medium text-mist">
                              <span className="inline-flex items-center gap-1.5">
                                <section.icon className="h-3.5 w-3.5" aria-hidden />
                                {section.label}
                              </span>
                              <span className="font-mono tabular-nums text-mist/60">{section.items.length || ""}</span>
                            </p>
                            {section.items.length === 0 ? (
                              <p className="rounded-lg px-2.5 py-2 text-[12px] text-mist/50 ring-1 ring-inset ring-dashed ring-wolf-border/30">None</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                {section.items.map((item) => {
                                  const isSelected = selectedTicker === item.ticker && isPanelOpen;
                                  const isInWatchlist = allWatchlistTickerSet.has(item.ticker);
                                  return (
                                    <button
                                      type="button"
                                      key={`${item.ticker}-${item.date.toISOString()}-${section.key}`}
                                      onClick={() => {
                                        void handleSelectTicker(item.ticker);
                                      }}
                                      aria-pressed={isSelected}
                                      aria-label={`${item.ticker}${item.profile?.name ? `, ${item.profile.name}` : ""}: open earnings history`}
                                      className={cn(
                                        // Fixed size: selecting a chip changes its colour, nothing else.
                                        "relative flex h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 ring-1 ring-inset",
                                        "transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                                        isSelected ? "bg-sunset-orange/[0.12] ring-sunset-orange/50" : "bg-snow-peak/[0.035] ring-wolf-border/35 hover:bg-snow-peak/[0.07] hover:ring-wolf-border/70"
                                      )}
                                    >
                                      <TickerLogo ticker={item.ticker} src={item.profile?.logo_url} className="h-8 w-8" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[10px]" />
                                      <span className="flex items-center gap-1">
                                        <span className="font-mono text-[12px] font-semibold text-snow-peak">{item.ticker}</span>
                                        {isInWatchlist ? <Star className="h-3 w-3 fill-sunset-orange text-sunset-orange" aria-label="In a watchlist" /> : null}
                                      </span>
                                      {item.source === "persisted" ? (
                                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-mist/60" title="Already reported" />
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </MaterialPanel>

        {/* Detail, xl and up: a fixed column the height of the calendar. */}
        {/* Positioned inside, so it takes the row's height from the calendar
            and never pushes it; its own content scrolls. */}
        <MaterialPanel className="relative hidden min-h-0 overflow-hidden p-0 xl:block">
          <div className="absolute inset-0">{renderPanelContent()}</div>
        </MaterialPanel>
      </div>

      {/* Detail below xl: a sheet from the right, over a dimmed page. */}
      {panelItem ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button type="button" aria-label="Close" onClick={closePanel} className="absolute inset-0 bg-wolf-black/60 backdrop-blur-[3px]" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${panelItem.ticker} earnings`}
            className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-wolf-surface shadow-2xl shadow-wolf-black/60 ring-1 ring-inset ring-wolf-border/50 animate-huntr-sheet motion-reduce:animate-none"
          >
            {renderPanelContent()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A day column while quotes are in flight: the column's real silhouette
 * (section labels, chips in pairs), so the layout is settled before the
 * data lands and only the content changes.
 */
function EarningsColumnSkeleton({ dayIndex }: { dayIndex: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading earnings for this day">
      {[0, 1].map((sectionIndex) => (
        <div key={sectionIndex}>
          <div className="huntr-skeleton mb-1.5 h-3 w-20 rounded-full" />
          <div className="grid grid-cols-2 gap-1.5">
            {[0, 1].map((chipIndex) => (
              <div key={chipIndex} className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl bg-snow-peak/[0.02] ring-1 ring-inset ring-wolf-border/30">
                <div
                  className="huntr-skeleton h-8 w-8 rounded-lg"
                  style={{ "--shimmer-delay": `${dayIndex * 90 + (sectionIndex * 2 + chipIndex) * 120}ms` } as React.CSSProperties}
                />
                <div className="huntr-skeleton h-2.5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
