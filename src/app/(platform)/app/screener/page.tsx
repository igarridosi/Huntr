"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Banknote, Crown, Gem, HandCoins, Rocket, Search, SlidersHorizontal, Tag, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaterialPanel } from "@/components/ui/material-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useScreener, filtersToParam, mergeMetrics } from "@/hooks/use-screener";
import { useScreenerMetrics } from "@/hooks/use-stock-data";
import { SCREENER_PRESETS, type FilterId } from "@/types/screener";
import { FILTER_BY_ID } from "@/lib/screener/filters";
import { AddFiltersDialog } from "@/components/screener/add-filters-dialog";
import { RangeFilterControl, SectorFilterControl } from "@/components/screener/filter-control";
import { ResultsTable, columnsFor } from "@/components/screener/results-table";

const PAGE_SIZE = 25;

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { Gem, Crown, TrendingUp, Banknote, HandCoins, Rocket, Tag };

function Screener() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const s = useScreener();
  const {
    isLoading,
    activeFilters,
    sort,
    search,
    sectors,
    activePresetId,
    filteredRows,
    filteredCount,
    totalCount,
    missingCount,
    narrowingCount,
  } = s;

  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get("pg") ?? "1", 10) || 1));

  // The whole screen lives in the URL: a link reopens it, and the back button
  // from a company returns to the same page of the same results.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const params = new URLSearchParams();
    const f = filtersToParam(activeFilters);
    if (f) params.set("f", f);
    if (sectors.length) params.set("sec", sectors.join("|"));
    if (search) params.set("q", search);
    if (sort.key !== "market_cap" || sort.dir !== "desc") params.set("sort", `${sort.key}:${sort.dir}`);
    if (activePresetId) params.set("preset", activePresetId);
    if (page > 1) params.set("pg", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [activeFilters, sectors, sort, search, activePresetId, page, router, pathname]);

  // Any change to what is shown starts again from the first page.
  const reset = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    setPage(1);
    fn(...args);
  };

  const activeIds = useMemo(() => Object.keys(activeFilters) as FilterId[], [activeFilters]);
  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);
  const columns = useMemo(() => columnsFor(activeIds, sort.key), [activeIds, sort.key]);

  const pages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(() => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredRows, safePage]);

  // The rows on screen are refreshed from Yahoo if their cache is missing,
  // so a ticker the weekly warm-up has not reached still fills in.
  const pageTickers = useMemo(() => pageRows.map((r) => r.ticker), [pageRows]);
  const { data: pageMetrics } = useScreenerMetrics(pageTickers, !isLoading && pageTickers.length > 0);
  const shownRows = useMemo(() => mergeMetrics(pageRows, pageMetrics), [pageRows, pageMetrics]);

  const toggleFilter = useCallback(
    (id: FilterId) => {
      setPage(1);
      if (activeSet.has(id)) s.removeFilter(id);
      else s.addFilter(id);
    },
    [activeSet, s]
  );

  const unknownFor = activeIds.filter((id) => FILTER_BY_ID.get(id)?.source === "cached" && (activeFilters[id]?.min !== null || activeFilters[id]?.max !== null));

  return (
    <div className="w-full space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sunset-orange/15 bg-sunset-orange/10">
            <SlidersHorizontal className="h-5 w-5 text-sunset-orange" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-snow-peak">Screener</h1>
            <p className="mt-0.5 text-xs tabular-nums text-mist" aria-live="polite">
              {isLoading ? "Loading the universe…" : narrowingCount || search ? `${filteredCount} of ${totalCount} US stocks match` : `${totalCount} US stocks`}
            </p>
          </div>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl bg-snow-peak/[0.04] px-3 ring-1 ring-inset ring-wolf-border/50 transition-shadow focus-within:ring-sunset-orange/50 sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-mist" aria-hidden />
          <input
            value={search}
            onChange={(e) => reset(s.setSearch)(e.target.value)}
            placeholder="Ticker, company or sector"
            aria-label="Search the screener"
            className="min-w-0 flex-1 bg-transparent text-sm text-snow-peak outline-none placeholder:text-mist/60"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => reset(s.setSearch)("")} className="text-mist hover:text-snow-peak">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      </header>

      {/* ── Strategies ─────────────────────────────────────────────────── */}
      <section aria-label="Start from a strategy">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {SCREENER_PRESETS.map((p) => {
            const Icon = PRESET_ICONS[p.icon] ?? Gem;
            const on = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => reset(s.applyPreset)(p)}
                aria-pressed={on}
                className={cn(
                  "group min-w-0 rounded-2xl p-3.5 text-left ring-1 ring-inset",
                  "transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] motion-reduce:active:scale-100",
                  on ? "bg-sunset-orange/[0.08] ring-sunset-orange/40" : "bg-wolf-surface/60 ring-wolf-border/50 hover:bg-wolf-surface hover:ring-wolf-border"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", on ? "bg-sunset-orange text-wolf-black" : "bg-snow-peak/[0.06] text-mist group-hover:text-snow-peak")}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className={cn("text-[13.5px] font-semibold", on ? "text-sunset-orange" : "text-snow-peak")}>{p.label}</span>
                </span>
                <span className="mt-2 line-clamp-2 block text-[12px] leading-snug text-mist">{p.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      {/* Above the results: its menus open over the table, and a blurred
          panel is a stacking context of its own, so without this the table
          painted over them. */}
      <MaterialPanel className="relative z-20 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AddFiltersDialog active={activeSet} coverage={s.coverage} onToggle={toggleFilter} />
            <p className="hidden text-xs text-mist sm:block">
              {activeIds.length === 0 ? "Pick a strategy above, or add the filters you care about." : "Set a value on each filter to narrow the list."}
            </p>
          </div>
          {activeIds.length || sectors.length || search ? (
            <button
              type="button"
              onClick={() => reset(s.clearFilters)()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-mist transition-colors hover:bg-snow-peak/[0.05] hover:text-snow-peak"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <SectorFilterControl sectors={s.sectorList} selected={sectors} onToggle={reset(s.toggleSector)} onClear={() => reset(s.setSectors)([])} />
          {activeIds.map((id) => {
            const spec = FILTER_BY_ID.get(id);
            const range = activeFilters[id];
            if (!spec || !range) return null;
            return (
              <RangeFilterControl
                // Re-mounted when the range changes from outside (a strategy), so its fields follow.
                key={`${id}:${range.min}:${range.max}`}
                spec={spec}
                range={range}
                onChange={(min, max) => reset(s.setFilter)(id, min, max)}
                onRemove={() => reset(s.removeFilter)(id)}
              />
            );
          })}
        </div>

        {missingCount > 0 && unknownFor.length > 0 ? (
          <p className="text-xs text-mist">
            {missingCount} {missingCount === 1 ? "stock has" : "stocks have"} no figure yet for{" "}
            {unknownFor.map((id) => FILTER_BY_ID.get(id)?.label).join(", ")} and {missingCount === 1 ? "is" : "are"} left out rather than guessed.
          </p>
        ) : null}
      </MaterialPanel>

      {/* ── Results ────────────────────────────────────────────────────── */}
      <MaterialPanel className="overflow-hidden p-0">
        {isLoading ? (
          <div className="space-y-3 p-5" aria-busy="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton shape="circle" className="h-8 w-8 shrink-0" />
                <Skeleton shape="line" className="h-3 w-28" />
                <div className="flex flex-1 justify-end gap-6">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <Skeleton key={j} shape="line" className="hidden h-3 w-14 sm:block" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : filteredCount === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <SlidersHorizontal className="h-8 w-8 text-mist/40" aria-hidden />
            <div>
              <p className="text-base font-semibold text-snow-peak">No stocks match this screen</p>
              <p className="mt-1 text-sm text-mist">Loosen a filter, or remove the last one you added.</p>
            </div>
            {activeIds.length ? (
              <button
                type="button"
                onClick={() => reset(s.removeFilter)(activeIds[activeIds.length - 1])}
                className="mt-1 h-9 rounded-xl bg-snow-peak/[0.06] px-4 text-[13px] font-medium text-snow-peak ring-1 ring-inset ring-wolf-border/60 transition-colors hover:bg-snow-peak/[0.1]"
              >
                Remove {FILTER_BY_ID.get(activeIds[activeIds.length - 1])?.label}
              </button>
            ) : null}
          </div>
        ) : (
          <ResultsTable
            rows={shownRows}
            columns={columns}
            sort={sort}
            onSort={reset(s.toggleSort)}
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredCount}
            onPage={setPage}
          />
        )}
      </MaterialPanel>

      <p className="text-[11px] text-mist/70">
        Prices and multiples from Yahoo Finance, refreshed on every visit; margins, returns and ratios from each company&apos;s latest filings, refreshed weekly. Not investment advice.
      </p>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={null}>
      <Screener />
    </Suspense>
  );
}
