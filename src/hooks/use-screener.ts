"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useAllQuotes, useAllProfiles } from "@/hooks/use-stock-data";
import { fetchAllCachedScreenerMetrics } from "@/app/actions/stock";
import type {
  ScreenerRow,
  ActiveFilters,
  FilterId,
  SortState,
  SortKey,
  ScreenerPreset,
} from "@/types/screener";
import type { ScreenerMetrics } from "@/lib/api/cache";
import { STALE_TIMES } from "@/lib/constants";

// ─── URL ↔ State helpers (read-only; writing is handled by the page) ──────────

const VALID_FILTER_IDS = new Set<FilterId>([
  "market_cap", "pe_ratio", "dividend_yield", "revenue_growth",
  "earnings_growth", "fcf_yield", "from_52w_high", "range_52w", "payout_ratio",
  "quality_overall", "quality_profitability", "quality_financial_health", "quality_cash_generation",
]);

const VALID_SORT_KEYS = new Set<string>([
  "ticker", "name", "sector", "market_cap", "price", "pe_ratio",
  "normalized_pe", "dividend_yield", "earnings_growth", "revenue_growth",
  "fcf_yield", "from_52w_high_pct", "range_52w_pct", "payout_ratio",
  "quality_overall", "quality_profitability", "quality_financial_health", "quality_cash_generation",
]);

/**
 * Parse the `f` search param back into `ActiveFilters`.
 * Format: `id=min:max~id2=min2:max2`  (empty string = null)
 */
export function paramToFilters(s: string | null): ActiveFilters {
  if (!s) return {};
  const result: ActiveFilters = {};
  s.split("~").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const id = part.slice(0, eq) as FilterId;
    if (!VALID_FILTER_IDS.has(id)) return;
    const val = part.slice(eq + 1);
    const col = val.indexOf(":");
    if (col < 0) return;
    const minStr = val.slice(0, col);
    const maxStr = val.slice(col + 1);
    const min = minStr === "" ? null : Number(minStr);
    const max = maxStr === "" ? null : Number(maxStr);
    if ((min === null || isFinite(min)) && (max === null || isFinite(max))) {
      result[id] = { min, max };
    }
  });
  return result;
}

/**
 * Parse the `sort` search param back into `SortState`.
 * Format: `{key}:{dir}`
 */
export function paramToSort(s: string | null): SortState {
  const def: SortState = { key: "market_cap", dir: "desc" };
  if (!s) return def;
  const col = s.lastIndexOf(":");
  if (col < 0) return def;
  const key = s.slice(0, col);
  const dir = s.slice(col + 1);
  if (!VALID_SORT_KEYS.has(key)) return def;
  return { key: key as SortKey, dir: dir === "asc" ? "asc" : "desc" };
}

// ─── Fields that require per-ticker enrichment (not in batch quote) ──────────
// For these, null means "data not yet fetched". The filter uses a pass-through
// so the universe doesn't shrink to zero while the cache warms up.
// As users browse the screener page by page, more values get populated.
const ENRICHED_FIELDS = new Set<FilterId>([
  "earnings_growth", "revenue_growth", "payout_ratio",
  "fcf_yield",
  "quality_overall", "quality_profitability", "quality_financial_health", "quality_cash_generation",
]);

// ─── Build ScreenerRow from quote + profile ───────────────────────────────────

function buildScreenerRows(
  quotes: ReturnType<typeof useAllQuotes>["data"],
  profiles: ReturnType<typeof useAllProfiles>["data"]
): ScreenerRow[] {
  if (!quotes || !profiles) return [];

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.ticker, p])
  );

  return (quotes ?? []).map((q) => {
    const profile = profileMap[q.ticker];

    const range52wPct =
      q.fifty_two_week_high > q.fifty_two_week_low
        ? (q.price - q.fifty_two_week_low) /
          (q.fifty_two_week_high - q.fifty_two_week_low)
        : null;

    const from52wHighPct =
      q.fifty_two_week_high > 0
        ? q.price / q.fifty_two_week_high - 1
        : null;

    return {
      ticker: q.ticker,
      name: profile?.name ?? q.ticker,
      sector: profile?.sector ?? "Unknown",
      exchange: profile?.exchange ?? "US",
      logo_url: profile?.logo_url ?? undefined,

      price: q.price,
      market_cap: q.market_cap,

      pe_ratio: q.pe_ratio > 0 ? q.pe_ratio : null,
      normalized_pe: null,
      metrics_fetched_at: null,
      dividend_yield: q.dividend_yield > 0 ? q.dividend_yield : null,

      revenue_growth: q.revenue_growth ?? null,
      earnings_growth: q.earnings_growth ?? null,

      fifty_two_week_high: q.fifty_two_week_high,
      fifty_two_week_low: q.fifty_two_week_low,
      range_52w_pct: range52wPct,
      from_52w_high_pct: from52wHighPct,

      payout_ratio: q.payout_ratio && q.payout_ratio > 0 ? q.payout_ratio : null,
      avg_volume: q.avg_volume,

      // Enriched fields — null until financials are cached per-ticker
      fcf_yield:               null,
      quality_overall:         null,
      quality_profitability:   null,
      quality_financial_health:null,
      quality_cash_generation: null,
    };
  });
}

// ─── Merge enrichment metrics into base rows ──────────────────────────────────

function mergeMetrics(
  rows: ScreenerRow[],
  metrics: Record<string, ScreenerMetrics> | undefined
): ScreenerRow[] {
  if (!metrics) return rows;
  return rows.map((row) => {
    const m = metrics[row.ticker];
    if (!m) return row;
    // Helper: only override if enriched value is non-null
    const pick = <T>(enriched: T | null, base: T | null): T | null =>
      enriched !== null ? enriched : base;

    return {
      ...row,
      earnings_growth:         pick(m.earnings_growth,         row.earnings_growth),
      revenue_growth:          pick(m.revenue_growth,          row.revenue_growth),
      normalized_pe:           pick(m.normalized_pe,           row.normalized_pe),
      payout_ratio:            pick(m.payout_ratio,            row.payout_ratio),
      fcf_yield:               pick(m.fcf_yield,               row.fcf_yield),
      quality_overall:         pick(m.quality_overall,         row.quality_overall),
      quality_profitability:   pick(m.quality_profitability,   row.quality_profitability),
      quality_financial_health:pick(m.quality_financial_health,row.quality_financial_health),
      quality_cash_generation: pick(m.quality_cash_generation, row.quality_cash_generation),
      metrics_fetched_at:      m.fetched_at !== null ? m.fetched_at : row.metrics_fetched_at,
    };
  });
}

// ─── Filter application ───────────────────────────────────────────────────────

const FILTER_FIELD: Record<FilterId, keyof ScreenerRow> = {
  market_cap:               "market_cap",
  pe_ratio:                 "pe_ratio",
  dividend_yield:           "dividend_yield",
  revenue_growth:           "revenue_growth",
  earnings_growth:          "earnings_growth",
  fcf_yield:                "fcf_yield",
  from_52w_high:            "from_52w_high_pct",
  range_52w:                "range_52w_pct",
  payout_ratio:             "payout_ratio",
  quality_overall:          "quality_overall",
  quality_profitability:    "quality_profitability",
  quality_financial_health: "quality_financial_health",
  quality_cash_generation:  "quality_cash_generation",
};

function applyFilters(rows: ScreenerRow[], filters: ActiveFilters): ScreenerRow[] {
  return rows.filter((row) => {
    for (const [filterId, range] of Object.entries(filters) as [FilterId, { min: number | null; max: number | null }][]) {
      if (!range) continue;
      const field = FILTER_FIELD[filterId];
      const value = row[field] as number | null;

      if (value === null) {
        // For enriched fields, null means "data not yet cached" — pass through
        // so the universe doesn't shrink to zero while the cache is warming up.
        if (ENRICHED_FIELDS.has(filterId)) continue;

        // For always-available fields (P/E, market_cap, etc.):
        // null means genuinely not applicable — exclude if filter requires it.
        if (range.min !== null || range.max !== null) return false;
        continue;
      }

      if (range.min !== null && value < range.min) return false;
      if (range.max !== null && value > range.max) return false;
    }
    return true;
  });
}

function applySortAndFilter(
  rows: ScreenerRow[],
  filters: ActiveFilters,
  sort: SortState,
  search: string
): ScreenerRow[] {
  let result = applyFilters(rows, filters);

  // Text search
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q)
    );
  }

  // Sort — nulls always last
  result = [...result].sort((a, b) => {
    const aVal = a[sort.key];
    const bVal = b[sort.key];

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sort.dir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    const diff = (aVal as number) - (bVal as number);
    return sort.dir === "asc" ? diff : -diff;
  });

  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScreener() {
  const { data: quotes = [], isLoading: quotesLoading } = useAllQuotes();
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const searchParams = useSearchParams();

  const isLoading = quotesLoading || profilesLoading;

  // Initialise from URL params so browser back/forward restores full screener state.
  // These initialisers run only once (on mount); subsequent URL sync is done by the page.
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() =>
    paramToFilters(searchParams.get("f"))
  );
  const [sort, setSort] = useState<SortState>(() =>
    paramToSort(searchParams.get("sort"))
  );
  const [search, setSearch] = useState<string>(() =>
    searchParams.get("q") ?? ""
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(() =>
    searchParams.get("preset") ?? null
  );

  // Base rows from batch quote (enriched fields start as null)
  const baseRows = useMemo(
    () => buildScreenerRows(quotes, profiles),
    [quotes, profiles]
  );

  // All ticker symbols — stable reference
  const allTickers = useMemo(
    () => baseRows.map((r) => r.ticker),
    [baseRows]
  );

  // Fetch earnings/revenue growth + FCF yield + quality scores for ALL tickers from Supabase cache ONLY.
  // This is ONE Supabase SELECT IN query — safe with 864+ tickers, no Yahoo calls.
  // For tickers not yet in cache (no prior getStockQuote call), values stay null.
  // Per-page enrichment via useScreenerMetrics in the screener page fills gaps progressively.
  const { data: allMetrics, isLoading: metricsLoading } = useQuery<Record<string, ScreenerMetrics>>({
    queryKey: ["screener", "metrics", "all", allTickers.join(",")],
    queryFn: () => fetchAllCachedScreenerMetrics(allTickers),
    staleTime: STALE_TIMES.FINANCIALS, // 15 min
    enabled: allTickers.length > 0,
  });

  // Merge enrichment into base rows → used for both filtering AND display
  const allRows = useMemo(
    () => mergeMetrics(baseRows, allMetrics),
    [baseRows, allMetrics]
  );

  const filteredRows = useMemo(
    () => applySortAndFilter(allRows, activeFilters, sort, search),
    [allRows, activeFilters, sort, search]
  );

  // How many stocks in current filter results still have null enriched data
  const enrichedFieldsActive = useMemo(
    () => Object.keys(activeFilters).some((id) => ENRICHED_FIELDS.has(id as FilterId)),
    [activeFilters]
  );

  const nullEnrichedCount = useMemo(() => {
    if (!enrichedFieldsActive) return 0;
    const activeEnriched = Object.keys(activeFilters).filter((id) =>
      ENRICHED_FIELDS.has(id as FilterId)
    ) as FilterId[];
    const fieldToRow: Record<FilterId, keyof ScreenerRow> = {
      earnings_growth:          "earnings_growth",
      revenue_growth:           "revenue_growth",
      payout_ratio:             "payout_ratio",
      fcf_yield:                "fcf_yield",
      quality_overall:          "quality_overall",
      quality_profitability:    "quality_profitability",
      quality_financial_health: "quality_financial_health",
      quality_cash_generation:  "quality_cash_generation",
      // Non-enriched — included for type completeness
      market_cap:      "market_cap",
      pe_ratio:        "pe_ratio",
      dividend_yield:  "dividend_yield",
      from_52w_high:   "from_52w_high_pct",
      range_52w:       "range_52w_pct",
    };
    return filteredRows.filter((r) =>
      activeEnriched.some((id) => r[fieldToRow[id]] === null)
    ).length;
  }, [filteredRows, enrichedFieldsActive, activeFilters]);

  const setFilter = useCallback((id: FilterId, min: number | null, max: number | null) => {
    setActiveFilters((prev) => {
      if (min === null && max === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { min, max } };
    });
    setActivePresetId(null);
  }, []);

  const removeFilter = useCallback((id: FilterId) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActivePresetId(null);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters({});
    setSearch("");
    setActivePresetId(null);
  }, []);

  const applyPreset = useCallback((preset: ScreenerPreset) => {
    setActiveFilters(preset.filters);
    setSort({ key: preset.sortBy, dir: preset.sortDir });
    setSearch("");
    setActivePresetId(preset.id);
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }, []);

  const activeFilterCount = Object.keys(activeFilters).length;

  return {
    isLoading,
    metricsLoading,
    allRows,
    filteredRows,
    totalCount: allRows.length,
    filteredCount: filteredRows.length,
    activeFilters,
    activeFilterCount,
    activePresetId,
    sort,
    search,
    nullEnrichedCount,
    enrichedFieldsActive,
    /** Exposed so screener page can merge per-page enrichment with display rows */
    mergeMetricsIntoRows: (rows: ScreenerRow[], metrics: Record<string, ScreenerMetrics> | undefined) =>
      mergeMetrics(rows, metrics),
    setFilter,
    removeFilter,
    clearFilters,
    applyPreset,
    toggleSort,
    setSearch,
  };
}
