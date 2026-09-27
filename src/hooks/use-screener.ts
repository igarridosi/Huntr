"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useAllQuotes, useAllProfiles } from "@/hooks/use-stock-data";
import { fetchAllCachedScreenerMetrics } from "@/app/actions/stock";
import type { ScreenerRow, ActiveFilters, FilterId, SortState, SortKey, ScreenerPreset } from "@/types/screener";
import type { ScreenerMetrics } from "@/lib/api/cache";
import { toGicsSector } from "@/lib/screener/sectors";
import { STALE_TIMES } from "@/lib/constants";
import { FILTERS, FILTER_BY_ID, fieldOf } from "@/lib/screener/filters";

// ─── URL ↔ state (read here; the page writes) ─────────────────────────────────

const VALID_FILTER_IDS = new Set<FilterId>(FILTERS.map((f) => f.id));

const VALID_SORT_KEYS = new Set<string>([
  "ticker", "name", "sector", "price", "normalized_pe",
  ...FILTERS.map((f) => f.field as string),
]);

/** `id=min:max~id2=min2:max2` (empty = open end) → filters, in the order written. */
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
    if ((min === null || isFinite(min)) && (max === null || isFinite(max))) result[id] = { min, max };
  });
  return result;
}

export function filtersToParam(filters: ActiveFilters): string {
  return Object.entries(filters)
    .map(([id, r]) => `${id}=${r?.min ?? ""}:${r?.max ?? ""}`)
    .join("~");
}

/** `{key}:{dir}` → sort. */
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

// ─── Rows ─────────────────────────────────────────────────────────────────────

/** A finite positive number, else null: a zero or negative multiple is "none", not a value. */
const positive = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const finite = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function buildScreenerRows(
  quotes: ReturnType<typeof useAllQuotes>["data"],
  profiles: ReturnType<typeof useAllProfiles>["data"]
): ScreenerRow[] {
  if (!quotes || !profiles) return [];
  const profileMap = Object.fromEntries(profiles.map((p) => [p.ticker, p]));

  return quotes.map((q) => {
    const profile = profileMap[q.ticker];
    const epsTtm = finite(q.eps_ttm);
    const epsFwd = finite(q.eps_forward);
    // Growth from a loss or a near-zero base is not a percentage anyone can use.
    const expected = epsTtm !== null && epsTtm > 0.05 && epsFwd !== null ? epsFwd / epsTtm - 1 : null;
    const ma200 = positive(q.two_hundred_day_average);

    return {
      ticker: q.ticker,
      name: profile?.name ?? q.ticker,
      // The tickers table mixes naming schemes ("Technology", "Information
      // Technology") and says "Unknown" for half the universe; everything is
      // set on the eleven GICS sectors, and the cached profile fills the rest.
      sector: toGicsSector(profile?.sector) ?? "Other",
      exchange: profile?.exchange ?? "US",
      logo_url: profile?.logo_url ?? undefined,

      price: q.price,
      market_cap: q.market_cap,

      pe_ratio: positive(q.pe_ratio),
      normalized_pe: null,
      metrics_fetched_at: null,
      dividend_yield: positive(q.dividend_yield),

      revenue_growth: finite(q.revenue_growth),
      earnings_growth: finite(q.earnings_growth),

      fifty_two_week_high: q.fifty_two_week_high,
      fifty_two_week_low: q.fifty_two_week_low,
      range_52w_pct:
        q.fifty_two_week_high > q.fifty_two_week_low ? (q.price - q.fifty_two_week_low) / (q.fifty_two_week_high - q.fifty_two_week_low) : null,
      from_52w_high_pct: q.fifty_two_week_high > 0 ? q.price / q.fifty_two_week_high - 1 : null,

      payout_ratio: positive(q.payout_ratio),
      avg_volume: q.avg_volume,

      forward_pe: positive(q.forward_pe),
      price_to_book: positive(q.price_to_book),
      expected_eps_growth: expected !== null && Math.abs(expected) <= 5 ? expected : null,
      vs_200dma: ma200 !== null && q.price > 0 ? q.price / ma200 - 1 : null,
      change_52w: finite(q.fifty_two_week_change),
      analyst_rating: positive(q.analyst_rating),

      // Filled from the cache below.
      fcf_yield: null,
      quality_overall: null,
      quality_profitability: null,
      quality_financial_health: null,
      quality_cash_generation: null,
      price_to_sales: null,
      ev_to_ebitda: null,
      gross_margin: null,
      operating_margin: null,
      net_margin: null,
      roe: null,
      debt_to_equity: null,
      current_ratio: null,
      target_upside: null,
    };
  });
}

export function mergeMetrics(rows: ScreenerRow[], metrics: Record<string, ScreenerMetrics> | undefined): ScreenerRow[] {
  if (!metrics) return rows;
  return rows.map((row) => {
    const m = metrics[row.ticker];
    if (!m) return row;
    const pick = <T,>(enriched: T | null | undefined, base: T | null): T | null => (enriched !== null && enriched !== undefined ? enriched : base);
    return {
      ...row,
      sector: row.sector === "Other" && m.sector ? m.sector : row.sector,
      earnings_growth: pick(m.earnings_growth, row.earnings_growth),
      revenue_growth: pick(m.revenue_growth, row.revenue_growth),
      normalized_pe: pick(m.normalized_pe, row.normalized_pe),
      payout_ratio: pick(m.payout_ratio, row.payout_ratio),
      fcf_yield: pick(m.fcf_yield, row.fcf_yield),
      quality_overall: pick(m.quality_overall, row.quality_overall),
      quality_profitability: pick(m.quality_profitability, row.quality_profitability),
      quality_financial_health: pick(m.quality_financial_health, row.quality_financial_health),
      quality_cash_generation: pick(m.quality_cash_generation, row.quality_cash_generation),
      price_to_sales: pick(positive(m.price_to_sales), row.price_to_sales),
      ev_to_ebitda: pick(positive(m.ev_to_ebitda), row.ev_to_ebitda),
      gross_margin: pick(m.gross_margin, row.gross_margin),
      operating_margin: pick(m.operating_margin, row.operating_margin),
      net_margin: pick(m.net_margin, row.net_margin),
      roe: pick(m.roe, row.roe),
      debt_to_equity: pick(m.debt_to_equity, row.debt_to_equity),
      current_ratio: pick(positive(m.current_ratio), row.current_ratio),
      target_upside: pick(m.target_upside, row.target_upside),
      metrics_fetched_at: m.fetched_at !== null ? m.fetched_at : row.metrics_fetched_at,
    };
  });
}

// ─── Filtering ────────────────────────────────────────────────────────────────

type Verdict = "in" | "out" | "missing";

/**
 * Whether a row passes. "missing" is a row that fails only because a filter
 * has no value for it: it is not shown (a screen promises every row meets
 * every filter), but it is counted, so the page can say how many are
 * unknown rather than pretend they failed.
 */
export function judge(row: ScreenerRow, filters: ActiveFilters, sectors: readonly string[]): Verdict {
  if (sectors.length > 0 && !sectors.includes(row.sector)) return "out";
  let missing = false;
  for (const [id, range] of Object.entries(filters) as [FilterId, { min: number | null; max: number | null }][]) {
    // A filter just added, with no bounds yet, shows its column and narrows nothing.
    if (!range || (range.min === null && range.max === null)) continue;
    const value = row[fieldOf(id)] as number | null;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      missing = true;
      continue;
    }
    if (range.min !== null && value < range.min) return "out";
    if (range.max !== null && value > range.max) return "out";
  }
  return missing ? "missing" : "in";
}

function matchesSearch(row: ScreenerRow, q: string): boolean {
  return row.ticker.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || row.sector.toLowerCase().includes(q);
}

function sortRows(rows: ScreenerRow[], sort: SortState): ScreenerRow[] {
  return [...rows].sort((a, b) => {
    const aVal = a[sort.key];
    const bVal = b[sort.key];
    // Missing values last, whichever way the sort runs.
    if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") return sort.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    const diff = (aVal as number) - (bVal as number);
    return sort.dir === "asc" ? diff : -diff;
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScreener() {
  const { data: quotes = [], isLoading: quotesLoading } = useAllQuotes();
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const searchParams = useSearchParams();
  const isLoading = quotesLoading || profilesLoading;

  // State starts from the URL so a shared link or the back button restores the screen.
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => paramToFilters(searchParams.get("f")));
  const [sort, setSort] = useState<SortState>(() => paramToSort(searchParams.get("sort")));
  const [search, setSearch] = useState<string>(() => searchParams.get("q") ?? "");
  const [sectors, setSectors] = useState<string[]>(() => (searchParams.get("sec") ?? "").split("|").filter(Boolean));
  const [activePresetId, setActivePresetId] = useState<string | null>(() => searchParams.get("preset") ?? null);

  const baseRows = useMemo(() => buildScreenerRows(quotes, profiles), [quotes, profiles]);
  const allTickers = useMemo(() => baseRows.map((r) => r.ticker), [baseRows]);

  // One Supabase read for the whole universe: margins, returns, leverage,
  // FCF yield and quality scores from the cache the pre-warm crons fill.
  const { data: allMetrics, isLoading: metricsLoading } = useQuery<Record<string, ScreenerMetrics>>({
    queryKey: ["screener", "metrics", "all", allTickers.length],
    queryFn: () => fetchAllCachedScreenerMetrics(allTickers),
    staleTime: STALE_TIMES.FINANCIALS,
    enabled: allTickers.length > 0,
  });

  const allRows = useMemo(() => mergeMetrics(baseRows, allMetrics), [baseRows, allMetrics]);

  const sectorList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows) counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [allRows]);

  const { filteredRows, missingCount } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kept: ScreenerRow[] = [];
    let missing = 0;
    for (const row of allRows) {
      if (q && !matchesSearch(row, q)) continue;
      const verdict = judge(row, activeFilters, sectors);
      if (verdict === "in") kept.push(row);
      else if (verdict === "missing") missing++;
    }
    return { filteredRows: sortRows(kept, sort), missingCount: missing };
  }, [allRows, activeFilters, sectors, search, sort]);

  /** How many rows have a value for a filter: the share of the universe it can judge. */
  const coverage = useCallback(
    (id: FilterId) => {
      const field = fieldOf(id);
      let n = 0;
      for (const r of allRows) {
        const v = r[field];
        if (typeof v === "number" && Number.isFinite(v)) n++;
      }
      return allRows.length ? n / allRows.length : 0;
    },
    [allRows]
  );

  const setFilter = useCallback((id: FilterId, min: number | null, max: number | null) => {
    setActiveFilters((prev) => ({ ...prev, [id]: { min, max } }));
    setActivePresetId(null);
  }, []);

  /** Adds a filter with no bounds yet: it shows as a control and a column, and narrows nothing until set. */
  const addFilter = useCallback((id: FilterId) => {
    setActiveFilters((prev) => (id in prev ? prev : { ...prev, [id]: { min: null, max: null } }));
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
    setSectors([]);
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
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: FILTER_BY_ID.get(key as FilterId)?.better === "low" ? "asc" : "desc" }));
  }, []);

  const toggleSector = useCallback((name: string) => {
    setSectors((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
    setActivePresetId(null);
  }, []);

  const narrowing = Object.values(activeFilters).filter((r) => r && (r.min !== null || r.max !== null)).length + (sectors.length ? 1 : 0);

  return {
    isLoading,
    metricsLoading,
    allRows,
    filteredRows,
    totalCount: allRows.length,
    filteredCount: filteredRows.length,
    missingCount,
    activeFilters,
    /** Filters that actually narrow the list (a filter just added has no bounds yet). */
    narrowingCount: narrowing,
    activePresetId,
    sort,
    search,
    sectors,
    sectorList,
    coverage,
    setFilter,
    addFilter,
    removeFilter,
    clearFilters,
    applyPreset,
    toggleSort,
    setSearch,
    toggleSector,
    setSectors,
  };
}
