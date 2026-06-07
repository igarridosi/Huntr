"use client";

import Link from "next/link";
import {
  ArrowUp,
  ArrowDown,
  Search,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Gem,
  Zap,
  DollarSign,
  TrendingUp,
  Rocket,
  Shield,
  ChevronsUpDown,
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useScreener } from "@/hooks/use-screener";
import { useScreenerMetrics } from "@/hooks/use-stock-data";
import { SCREENER_PRESETS } from "@/types/screener";
import type { FilterId, ScreenerRow } from "@/types/screener";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCompactNumber,
  formatPercent,
  formatCurrency,
} from "@/lib/utils";

// ─── Preset icon map ──────────────────────────────────────────────────────────

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Gem, Zap, DollarSign, TrendingUp, Rocket, Shield,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 13;

// ─── Filter definitions ───────────────────────────────────────────────────────

interface FilterDef {
  id: FilterId;
  label: string;
  tooltip: string;
  displayScale?: number;
  unit: string;
  /** Optional custom value formatter for the active-filter chip label. */
  formatValue?: (v: number) => string;
  presets: Array<{ label: string; min: number | null; max: number | null }>;
}

const FILTER_DEFS: FilterDef[] = [
  {
    id: "market_cap",
    label: "Market Cap",
    tooltip: "Total market capitalisation in USD (price × shares outstanding)",
    unit: "",
    // Raw market-cap values are in raw USD (e.g. 200000000000). Use formatCompactNumber
    // so the chip reads "≥200B" instead of "≥200000000000.0".
    formatValue: (v) => formatCompactNumber(v),
    presets: [
      { label: "All", min: null, max: null },
      { label: "Mega >200B", min: 200e9, max: null },
      { label: "Large 10–200B", min: 10e9, max: 200e9 },
      { label: "Mid <10B", min: null, max: 10e9 },
    ],
  },
  {
    id: "pe_ratio",
    label: "P/E (TTM Adj.)",
    tooltip: "How many dollars you pay per $1 of annual profit. Lower = cheaper. Under 15x is value territory, 15–25x is fair, above 25x means the market expects strong growth. We strip out one-time windfalls (asset sales, M&A) for a cleaner number.",
    unit: "x",
    presets: [
      { label: "All", min: null, max: null },
      { label: "<15x Value", min: null, max: 15 },
      { label: "15–25x Fair", min: 15, max: 25 },
      { label: ">25x Growth", min: 25, max: null },
    ],
  },
  {
    id: "dividend_yield",
    label: "Div. Yield (TTM)",
    tooltip: "Annual dividends paid ÷ current price (trailing 12 months)",
    unit: "%",
    displayScale: 100,
    presets: [
      { label: "All", min: null, max: null },
      { label: "Any", min: 0.005, max: null },
      { label: ">2%", min: 0.02, max: null },
      { label: ">4%", min: 0.04, max: null },
    ],
  },
  {
    // Rule 2 — explicit YoY window in filter label
    id: "earnings_growth",
    label: "EPS Growth (YoY)",
    tooltip: "Year-over-Year EPS growth: current TTM diluted EPS vs prior TTM. Sourced from Yahoo financialData or computed from cached income statement.",
    unit: "%",
    displayScale: 100,
    presets: [
      { label: "All", min: null, max: null },
      { label: ">5% YoY", min: 0.05, max: null },
      { label: ">10% YoY", min: 0.10, max: null },
      { label: ">20% YoY", min: 0.20, max: null },
    ],
  },
  {
    // Rule 3 — Beta 5Y Monthly
    id: "beta",
    label: "β 5Y Monthly",
    tooltip: "5-Year Monthly Beta vs S&P 500 — measures systematic market risk over a full business cycle. Standard institutional convention (avoids short-term noise).",
    unit: "x",
    presets: [
      { label: "All", min: null, max: null },
      { label: "Defensive <0.8", min: null, max: 0.8 },
      { label: "Market 0.8–1.2", min: 0.8, max: 1.2 },
      { label: "Aggressive >1.5", min: 1.5, max: null },
    ],
  },
  {
    id: "from_52w_high",
    label: "Distance 52W High",
    tooltip: "Current price ÷ 52-week high − 1. Negative = below peak. Near 0% = breakout zone.",
    unit: "%",
    displayScale: 100,
    presets: [
      { label: "All", min: null, max: null },
      { label: "Near high >-5%", min: -0.05, max: null },
      { label: "Pullback -10 to -25%", min: -0.25, max: -0.10 },
      { label: "Dip <-25%", min: null, max: -0.25 },
    ],
  },
];

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  sortKey?: keyof ScreenerRow;
  align?: "right" | "left";
  tooltip?: string;
  format: (row: ScreenerRow) => React.ReactNode;
}

const COLUMNS: ColDef[] = [
  {
    key: "name",
    label: "Company",
    sortKey: "ticker",
    align: "left",
    format: (row) => (
      <Link
        href={ROUTES.SYMBOL(row.ticker)}
        className="flex items-center gap-2.5 min-w-0 group/link"
      >
        <TickerLogo
          ticker={row.ticker}
          src={row.logo_url}
          className="h-7 w-7 shrink-0"
          imageClassName="rounded-[6px]"
          fallbackClassName="rounded-[6px] text-[10px]"
        />
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-snow-peak group-hover/link:text-sunset-orange transition-colors truncate">
            {row.ticker}
          </p>
          <p className="text-[10px] text-mist truncate max-w-[140px]">{row.name}</p>
        </div>
      </Link>
    ),
  },
  {
    key: "market_cap",
    label: "Mkt Cap",
    sortKey: "market_cap",
    align: "right",
    format: (row) => (
      <span className="font-mono text-xs text-snow-peak tabular-nums">
        {row.market_cap > 0 ? formatCompactNumber(row.market_cap) : "—"}
      </span>
    ),
  },
  {
    key: "price",
    label: "Price",
    sortKey: "price",
    align: "right",
    format: (row) => (
      <span className="font-mono text-xs font-semibold text-snow-peak tabular-nums">
        {formatCurrency(row.price)}
      </span>
    ),
  },
  {
    key: "pe_ratio",
    label: "P/E (TTM Adj.)",
    sortKey: "pe_ratio",
    align: "right",
    tooltip: "Price ÷ annual earnings per share (last 12 months). Uses clean operating profit when available — ignores one-time items like asset sales. ⚠ = earnings included a non-recurring event; the true multiple is probably higher.",
    format: (row) => {
      const gaapAnomaly = row.pe_ratio !== null && row.pe_ratio < 5 && row.market_cap >= 10e9;
      // Use normalized_pe when available; if GAAP shows anomaly and normalized is available, prefer it
      const displayPe = gaapAnomaly && row.normalized_pe !== null
        ? row.normalized_pe
        : row.pe_ratio;
      const isGaapFallback = gaapAnomaly && row.normalized_pe === null;
      return (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            !displayPe
              ? "text-mist/40"
              : isGaapFallback
                ? "text-golden-hour"
                : displayPe < 15
                  ? "text-bullish"
                  : displayPe > 40
                    ? "text-sunset-orange/80"
                    : "text-snow-peak"
          )}
        >
          {displayPe ? `${displayPe.toFixed(1)}x` : "—"}
          {isGaapFallback && <span className="ml-0.5 text-golden-hour/70">⚠</span>}
        </span>
      );
    },
  },
  {
    key: "dividend_yield",
    label: "Yield (TTM)",
    sortKey: "dividend_yield",
    align: "right",
    tooltip: "Annual dividend yield — trailing 12 months dividends ÷ current price",
    format: (row) => (
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          row.dividend_yield && row.dividend_yield > 0.02
            ? "text-golden-hour"
            : row.dividend_yield
              ? "text-snow-peak"
              : "text-mist/40"
        )}
      >
        {row.dividend_yield ? formatPercent(row.dividend_yield, 2) : "—"}
      </span>
    ),
  },
  {
    // Rule 2 — explicit YoY window in column label
    key: "earnings_growth",
    label: "EPS Growth (YoY)",
    sortKey: "earnings_growth",
    align: "right",
    tooltip: "Year-over-Year EPS growth: current TTM diluted EPS vs prior TTM period (GAAP).",
    format: (row) => {
      if (row.earnings_growth === null)
        return (
          <Tooltip
            content={`Browse ${row.ticker} once to cache EPS data`}
            side="top"
          >
            <span className="inline-flex items-center justify-end cursor-help">
              <span className="font-mono text-[10px] text-mist/30 border-b border-dashed border-mist/25 leading-none pb-px">
                —
              </span>
            </span>
          </Tooltip>
        );
      const pos = row.earnings_growth >= 0;
      return (
        <span className={cn("font-mono text-xs tabular-nums", pos ? "text-bullish" : "text-bearish")}>
          {pos ? "+" : ""}
          {formatPercent(row.earnings_growth, 1)}
        </span>
      );
    },
  },
  {
    // Rule 3 — Beta 5Y Monthly label
    key: "beta",
    label: "β 5Y",
    sortKey: "beta",
    align: "right",
    tooltip: "5-Year Monthly Beta vs S&P 500. Standard institutional measure — avoids short-term noise. <0.8 = defensive, >1.5 = high systematic risk.",
    format: (row) => {
      if (row.beta === null || row.beta === 0)
        return (
          <Tooltip
            content={`Browse ${row.ticker} once to compute β`}
            side="top"
          >
            <span className="inline-flex items-center justify-end cursor-help">
              <span className="font-mono text-[10px] text-mist/30 border-b border-dashed border-mist/25 leading-none pb-px">
                —
              </span>
            </span>
          </Tooltip>
        );
      return (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            row.beta < 0.8
              ? "text-teal-400"
              : row.beta > 1.5
                ? "text-sunset-orange"
                : "text-snow-peak"
          )}
        >
          {row.beta.toFixed(2)}
        </span>
      );
    },
  },
  {
    key: "from_52w_high_pct",
    label: "vs 52W High",
    sortKey: "from_52w_high_pct",
    align: "right",
    tooltip: "Current price ÷ 52-week high − 1. Negative = below peak. Near 0% = breakout zone.",
    format: (row) => {
      if (row.from_52w_high_pct === null)
        return <span className="text-mist/40 text-xs">—</span>;
      const v = row.from_52w_high_pct;
      return (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            v > -0.05 ? "text-bullish" : v < -0.25 ? "text-bearish" : "text-golden-hour"
          )}
        >
          {v >= 0 ? "+" : ""}
          {formatPercent(v, 1)}
        </span>
      );
    },
  },
  {
    key: "sector",
    label: "Sector",
    sortKey: "sector",
    align: "left",
    format: (row) => (
      <span className="text-[10px] text-mist/70 truncate max-w-[120px] block">
        {row.sector || "—"}
      </span>
    ),
  },
];

// ─── Sort header ──────────────────────────────────────────────────────────────

function ThCell({
  col,
  sort,
  onSort,
}: {
  col: ColDef;
  sort: { key: string; dir: string };
  onSort: (k: keyof ScreenerRow) => void;
}) {
  const isActive = col.sortKey && sort.key === col.sortKey;

  const inner = (
    <button
      type="button"
      onClick={() => col.sortKey && onSort(col.sortKey)}
      disabled={!col.sortKey}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
        col.sortKey ? "cursor-pointer" : "cursor-default",
        isActive ? "text-sunset-orange" : "text-mist/60 hover:text-mist"
      )}
    >
      {col.label}
      {col.sortKey ? (
        isActive ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-2.5 w-2.5" />
          ) : (
            <ArrowDown className="h-2.5 w-2.5" />
          )
        ) : (
          <ChevronsUpDown className="h-2.5 w-2.5 opacity-40" />
        )
      ) : null}
    </button>
  );

  return (
    <th
      className={cn(
        "px-3 py-2.5 whitespace-nowrap",
        col.align === "right" ? "text-right" : "text-left"
      )}
    >
      {col.tooltip ? (
        <Tooltip content={col.tooltip} side="top">
          <span>{inner}</span>
        </Tooltip>
      ) : (
        inner
      )}
    </th>
  );
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  activeFilters,
  onSetFilter,
  onRemove,
  onClear,
  filterCount,
}: {
  activeFilters: ReturnType<typeof useScreener>["activeFilters"];
  onSetFilter: (id: FilterId, min: number | null, max: number | null) => void;
  onRemove: (id: FilterId) => void;
  onClear: () => void;
  filterCount: number;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-mist" />
          <span className="text-xs font-semibold text-snow-peak">Filters</span>
          {filterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sunset-orange text-[9px] font-bold text-wolf-black">
              {filterCount}
            </span>
          )}
        </div>
        {filterCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-mist hover:text-bearish transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {FILTER_DEFS.map((def) => {
        const current = activeFilters[def.id];
        const isActive = !!current;

        return (
          <div key={def.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Tooltip content={def.tooltip} side="right">
                <span className="text-[11px] font-medium text-mist cursor-help">
                  {def.label}
                </span>
              </Tooltip>
              {isActive && (
                <button
                  type="button"
                  onClick={() => onRemove(def.id)}
                  className="text-mist/50 hover:text-bearish transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {def.presets.map((preset) => {
                const isNone = preset.min === null && preset.max === null;
                const isSelected = isNone
                  ? !isActive
                  : current?.min === preset.min && current?.max === preset.max;

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      isNone
                        ? onRemove(def.id)
                        : onSetFilter(def.id, preset.min, preset.max)
                    }
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-all border",
                      isSelected
                        ? "bg-sunset-orange/12 text-sunset-orange border-sunset-orange/25"
                        : "text-mist/70 border-wolf-border/30 hover:border-wolf-border/60 hover:text-snow-peak bg-transparent"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Active chips ─────────────────────────────────────────────────────────────

function ActiveChips({
  activeFilters,
  onRemove,
}: {
  activeFilters: ReturnType<typeof useScreener>["activeFilters"];
  onRemove: (id: FilterId) => void;
}) {
  const entries = Object.entries(activeFilters) as [
    FilterId,
    { min: number | null; max: number | null },
  ][];
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([id, range]) => {
        const def = FILTER_DEFS.find((d) => d.id === id);
        const scale = def?.displayScale ?? 1;
        const unit = def?.unit ?? "";

        // Use the custom formatter when defined (e.g. market cap → "200B"),
        // otherwise fall back to numeric scaling + unit suffix.
        const fmtVal = def?.formatValue
          ? def.formatValue
          : (v: number) => `${(v * scale).toFixed(1)}${unit}`;

        const label =
          range.min !== null && range.max !== null
            ? `${fmtVal(range.min)}–${fmtVal(range.max)}`
            : range.min !== null
              ? `≥${fmtVal(range.min)}`
              : `≤${fmtVal(range.max!)}`;

        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded border border-sunset-orange/20 bg-sunset-orange/8 px-2 py-0.5 text-[10px] font-medium text-sunset-orange"
          >
            {def?.label}: {label}
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="hover:text-bearish ml-0.5 transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ─── URL serialisation ────────────────────────────────────────────────────────
// Mirrors the parsing done in use-screener.ts (paramToFilters / paramToSort).
// Format: f=id=min:max~id2=min2:max2  |  sort=key:dir  |  q=search  |  pg=N

function filtersToParam(filters: ReturnType<typeof useScreener>["activeFilters"]): string {
  return Object.entries(filters)
    .map(([id, r]) => `${id}=${r?.min ?? ""}:${r?.max ?? ""}`)
    .join("~");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    isLoading,
    metricsLoading,
    filteredRows,
    totalCount,
    filteredCount,
    activeFilters,
    activeFilterCount,
    activePresetId,
    sort,
    search,
    nullEnrichedCount,
    enrichedFieldsActive,
    mergeMetricsIntoRows,
    setFilter,
    removeFilter,
    clearFilters,
    applyPreset,
    toggleSort,
    setSearch,
  } = useScreener();

  // Initialise page from URL; default 1.
  const [page, setPage] = useState<number>(() => {
    const pg = searchParams.get("pg");
    return pg ? Math.max(1, parseInt(pg, 10)) : 1;
  });

  // ── Single effect that writes all screener state to the URL ────────────────
  // Uses router.replace (same history entry) so the browser back button returns
  // to the URL with the exact filters/page the user had before clicking a ticker.
  const hasMounted = useRef(false);

  useEffect(() => {
    // Skip the very first render — state was just initialised FROM the URL,
    // so there is nothing new to write back.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const params = new URLSearchParams();

    const f = filtersToParam(activeFilters);
    if (f) params.set("f", f);

    if (search) params.set("q", search);

    // Omit sort when it equals the default (market_cap desc) to keep URLs clean.
    if (sort.key !== "market_cap" || sort.dir !== "desc") {
      params.set("sort", `${sort.key}:${sort.dir}`);
    }

    if (activePresetId) params.set("preset", activePresetId);

    // Omit pg=1 to keep URLs clean.
    if (page > 1) params.set("pg", String(page));

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [activeFilters, sort, search, activePresetId, page, router, pathname]);

  const handleSetFilter = useCallback(
    (id: FilterId, min: number | null, max: number | null) => { setPage(1); setFilter(id, min, max); },
    [setFilter]
  );
  const handleRemoveFilter = useCallback(
    (id: FilterId) => { setPage(1); removeFilter(id); },
    [removeFilter]
  );
  const handleClear = useCallback(() => { setPage(1); clearFilters(); }, [clearFilters]);
  const handleSearch = useCallback((v: string) => { setPage(1); setSearch(v); }, [setSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // Slice current page from filtered results
  const pageRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage]
  );

  // For the visible 13 tickers, trigger individual Yahoo quoteSummary fetch
  // (summaryDetail.beta + financialData.earningsGrowth/revenueGrowth).
  // This populates the Supabase "quote" cache and returns real values.
  const pageTickers = useMemo(() => pageRows.map((r) => r.ticker), [pageRows]);
  const { data: pageMetrics } = useScreenerMetrics(pageTickers, !isLoading);

  // Merge per-page Yahoo data INTO the display rows.
  // pageMetrics overrides allMetrics (more fresh / more complete for the visible slice).
  const enrichedPageRows = useMemo(
    () => mergeMetricsIntoRows(pageRows, pageMetrics),
    [pageRows, pageMetrics, mergeMetricsIntoRows]
  );

  // Latest sync timestamp — most recent metrics_fetched_at across visible rows
  const latestSyncTs = useMemo(() => {
    const ts = enrichedPageRows
      .map((r) => r.metrics_fetched_at)
      .filter((t): t is string => !!t)
      .sort()
      .at(-1);
    return ts ? new Date(ts) : null;
  }, [enrichedPageRows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-snow-peak">Stock Screener</h1>
          <p className="text-[11px] text-mist mt-0.5">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="xs" color="mist" /> Loading stocks…
              </span>
            ) : (
              `${filteredCount} of ${totalCount} stocks`
            )}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mist/60" />
          <Input
            placeholder="Ticker or company…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-wolf-black/40 border-wolf-border/40 focus:border-sunset-orange/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mist/50 hover:text-snow-peak"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Preset pills */}
      <div className="flex flex-wrap gap-1.5">
        {SCREENER_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.icon];
          const isActive = activePresetId === preset.id;
          return (
            <Tooltip key={preset.id} content={preset.description} side="bottom">
              <button
                type="button"
                onClick={() => { setPage(1); applyPreset(preset); }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  isActive
                    ? "bg-sunset-orange/12 border-sunset-orange/30 text-sunset-orange"
                    : "border-wolf-border/40 text-mist hover:border-wolf-border hover:text-snow-peak"
                )}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {preset.label}
              </button>
            </Tooltip>
          );
        })}
        {activePresetId && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-wolf-border/30 text-[10px] text-mist hover:text-bearish hover:border-bearish/30 transition-colors"
          >
            <X className="h-2.5 w-2.5" /> Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      <ActiveChips activeFilters={activeFilters} onRemove={handleRemoveFilter} />

      {/* Enrichment data notice — shown when beta/earnings filters active with partial data */}
      {enrichedFieldsActive && (metricsLoading || nullEnrichedCount > 0) && (
        <div className="flex items-center gap-2 rounded-lg border border-golden-hour/20 bg-golden-hour/6 px-3 py-2">
          {metricsLoading ? (
            <Spinner size="xs" color="mist" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-golden-hour/70 shrink-0" />
          )}
          <p className="text-[11px] text-mist/80">
            {metricsLoading
              ? "Loading growth, beta & payout data from cache…"
              : `${nullEnrichedCount} stock${nullEnrichedCount !== 1 ? "s" : ""} pending data — shown unfiltered until their page is browsed and the cache populates.`}
          </p>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-start">

        {/* Filter sidebar */}
        <Card className="p-4">
          <FilterPanel
            activeFilters={activeFilters}
            onSetFilter={handleSetFilter}
            onRemove={handleRemoveFilter}
            onClear={handleClear}
            filterCount={activeFilterCount}
          />
        </Card>

        {/* Table card */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2 px-1">
                    <Skeleton shape="circle" className="h-7 w-7 shrink-0" />
                    <Skeleton shape="line" className="h-3 w-20 flex-1" />
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Skeleton key={j} shape="line" className="h-3 w-12 hidden sm:block" />
                    ))}
                  </div>
                ))}
              </div>
            ) : filteredCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <SlidersHorizontal className="h-7 w-7 text-mist/20" />
                <p className="text-sm font-semibold text-snow-peak">No stocks match</p>
                <p className="text-xs text-mist">Try relaxing the filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-wolf-border/30">
                        {COLUMNS.map((col) => (
                          <ThCell
                            key={col.key}
                            col={col}
                            sort={sort}
                            onSort={toggleSort}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedPageRows.map((row, i) => (
                        <tr
                          key={row.ticker}
                          className={cn(
                            "border-b border-wolf-border/15 hover:bg-wolf-black/25 transition-colors",
                            i === enrichedPageRows.length - 1 && "border-b-0"
                          )}
                        >
                          {COLUMNS.map((col) => (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2.5 whitespace-nowrap",
                                col.align === "right" ? "text-right" : "text-left"
                              )}
                            >
                              {col.format(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-wolf-border/20 px-4 py-3">
                    <span className="text-[10px] text-mist">
                      {(safePage - 1) * PAGE_SIZE + 1}–
                      {Math.min(safePage * PAGE_SIZE, filteredCount)} of {filteredCount}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="flex h-7 w-7 items-center justify-center rounded border border-wolf-border/40 text-mist hover:border-wolf-border hover:text-snow-peak transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p =
                          totalPages <= 5
                            ? i + 1
                            : safePage <= 3
                              ? i + 1
                              : safePage >= totalPages - 2
                                ? totalPages - 4 + i
                                : safePage - 2 + i;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPage(p)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded border text-[11px] font-mono transition-all",
                              safePage === p
                                ? "border-sunset-orange/40 bg-sunset-orange/10 text-sunset-orange"
                                : "border-wolf-border/40 text-mist hover:border-wolf-border hover:text-snow-peak"
                            )}
                          >
                            {p}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="flex h-7 w-7 items-center justify-center rounded border border-wolf-border/40 text-mist hover:border-wolf-border hover:text-snow-peak transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Sync timestamp footer */}
            {!isLoading && (
              <div className="border-t border-wolf-border/15 px-4 py-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-mist/35">
                  Data from Yahoo Finance · TTM Adj. P/E uses Operating NOPAT ÷ diluted shares · Not financial advice
                </span>
                <span className="text-[10px] text-mist/35 shrink-0 tabular-nums">
                  {latestSyncTs
                    ? `Synced ${latestSyncTs.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ${latestSyncTs.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                    : "Sync time unavailable"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
