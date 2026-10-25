"use client";

import { useCallback, useMemo, useState } from "react";
import { List, Plus, ScatterChart, SearchAlert, Star } from "lucide-react";
import { useWatchlist, useWatchlistStore } from "@/hooks/use-watchlist";
import { useDCFScenarios } from "@/hooks/use-dcf-scenarios";
import { useBatchPeriodPerformance, useHuntingGroundMetrics, useInsiderSignals } from "@/hooks/use-stock-data";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { DipFinderPanel } from "@/components/dip-finder/dip-finder-panel";
import { EmptyState } from "@/components/watchlist/empty-state";
import { ImportExportActions } from "@/components/watchlist/import-export";
import { ListTabs } from "@/components/watchlist/board/list-tabs";
import { DaySummary } from "@/components/watchlist/board/day-summary";
import { IdeaList, IdeaListSkeleton } from "@/components/watchlist/board/idea-list";
import { IdeaPanel, type IdeaActions } from "@/components/watchlist/board/idea-panel";
import { useIdeas } from "@/components/watchlist/board/use-ideas";
import { HuntingGroundCard } from "@/components/insights/hunting-ground";
import { useStoredChoice } from "@/components/insights/use-stored-choice";
import { MaterialPanel } from "@/components/ui/material-panel";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { buildHuntingGround, type HgCompany } from "@/lib/hunting-ground";
import { sortIdeas, summarize, type IdeaSort } from "@/lib/watchlist/ideas";

type BoardView = "list" | "map" | "dips";

const SORTS: readonly IdeaSort[] = ["closest", "event", "quality"];
const SORT_ITEMS = [
  { key: "closest" as const, label: "Closest to buy" },
  { key: "event" as const, label: "Next event" },
  { key: "quality" as const, label: "Quality" },
];
const VIEWS: readonly BoardView[] = ["list", "map", "dips"];
const VIEW_ITEMS = [
  { key: "list" as const, label: "List", icon: <List className="h-3.5 w-3.5" /> },
  { key: "map" as const, label: "Map", icon: <ScatterChart className="h-3.5 w-3.5" /> },
  { key: "dips" as const, label: "Dip Finder", icon: <SearchAlert className="h-3.5 w-3.5" /> },
];
const NO_NEWS = new Set<string>();
const WATCHED = () => true;

/**
 * Watchlists, read as a list of ideas: each company against the price at
 * which the reader would buy it (their saved DCF, else the price they
 * typed), with the quality of the business, what comes next and what its
 * insiders are doing. Ordered by how close each is to a buy; one tap opens
 * everything about it. The Map places the same companies on The Hunting
 * Ground's quality and price axes.
 */
export default function WatchlistsPage() {
  const {
    data: entries,
    isError,
    lists,
    activeList,
    setActiveList,
    createList,
    renameList,
    deleteList,
    removeTicker,
    setTargetPrice,
    updateNotes,
    alerts,
    addAlert,
    removeAlert,
    exportToCSV,
    importFromCSV,
  } = useWatchlist();
  // The list itself, which is all the rows need to be on screen.
  const { isPending: listPending } = useWatchlistStore();
  const { savedScenarios } = useDCFScenarios();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();

  const [sort, setSort] = useStoredChoice<IdeaSort>("huntr:watchlist-sort", SORTS, "closest");
  const [view, setView] = useStoredChoice<BoardView>("huntr:watchlist-view", VIEWS, "list");
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => activeList?.items ?? [], [activeList]);
  const tickers = useMemo(() => items.map((i) => i.ticker.toUpperCase()), [items]);
  const metrics = useHuntingGroundMetrics(tickers);
  const signals = useInsiderSignals(tickers);
  const { data: monthly } = useBatchPeriodPerformance(tickers, "1M");

  const ideas = useIdeas({
    items,
    entries,
    saved: savedScenarios,
    metrics: metrics.data,
    signals: signals.data,
    monthly,
    alerts,
  });
  const sorted = useMemo(() => sortIdeas(ideas, sort), [ideas, sort]);
  const summary = useMemo(() => summarize(ideas), [ideas]);
  const quotesPending = ideas.some((i) => i.pending);
  const insidersBuying = signals.data ? ideas.filter((i) => (i.signal?.buys ?? 0) > 0).length : null;

  const ground = useMemo(() => {
    if (!metrics.data) return null;
    const companies: HgCompany[] = ideas.flatMap((i) =>
      i.quote
        ? [{ ticker: i.ticker, name: i.name, sector: i.sector, marketCap: i.quote.market_cap ?? 0, change: i.change ?? 0, logo: i.logo }]
        : []
    );
    return buildHuntingGround(companies, metrics.data, { minMarketCap: 0, maxCompanies: Infinity });
  }, [ideas, metrics.data]);

  // The panel is for keeping work on a company (a buy price, a thesis,
  // alerts): without an account there is nowhere to keep it, so the
  // invitation opens instead, rather than behind a panel it cannot save.
  const openCompany = useCallback(
    (ticker: string) => {
      if (!user) {
        openGate("watchlist");
        return;
      }
      setOpen(ticker);
    },
    [user, openGate]
  );

  const dipItems = useMemo(
    () => ideas.flatMap((i) => (i.price != null ? [{ ticker: i.ticker, name: i.name, sector: i.sector ?? undefined, price: i.price }] : [])),
    [ideas]
  );

  const openSearch = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  }, []);

  const actions = useMemo<IdeaActions>(
    () => ({ setTargetPrice, updateNotes, addAlert, removeAlert, removeTicker: (t) => removeTicker(t) }),
    [setTargetPrice, updateNotes, addAlert, removeAlert, removeTicker]
  );

  const openIdea = ideas.find((i) => i.ticker === open) ?? null;
  const isEmpty = !listPending && items.length === 0;

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="insight-enter flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
            <Star className="h-5 w-5 text-sunset-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-snow-peak">Watchlists</h1>
            <p className="mt-0.5 text-xs text-mist">Your ideas, and how close each one is to a buy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportActions onExport={exportToCSV} onImport={importFromCSV} listName={activeList?.name ?? "watchlist"} />
          <Button size="sm" className="gap-1.5 text-xs" onClick={openSearch}>
            <Plus className="h-3.5 w-3.5" /> Add stock
          </Button>
        </div>
      </div>

      <ListTabs
        lists={lists}
        activeId={activeList?.id ?? ""}
        onSelect={(id) => {
          setOpen(null);
          setActiveList(id);
        }}
        onCreate={createList}
        onRename={renameList}
        onDelete={deleteList}
      />

      {isError && items.length > 0 && !entries?.length ? (
        <ErrorState
          title="Could not load the prices"
          message="Your list is safe; its quotes could not be retrieved. Check your connection."
          variant="server"
        />
      ) : null}

      {isEmpty ? (
        <MaterialPanel>
          <EmptyState onSearchClick={openSearch} />
        </MaterialPanel>
      ) : (
        <>
          <DaySummary
            summary={summary}
            insidersBuying={insidersBuying}
            loading={listPending || quotesPending}
            sort={sort}
            onSort={(s) => {
              setSort(s);
              setView("list");
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            {view === "list" ? (
              <SegmentedTabs items={SORT_ITEMS} value={sort} onChange={setSort} ariaLabel="Order the list by" size="sm" />
            ) : view === "map" ? (
              <p className="text-xs text-mist">Quality across, cheaper up. Tap a company to open it.</p>
            ) : (
              <p className="text-xs text-mist">How far each price sits from its recent level: the deepest pullbacks first.</p>
            )}
            <SegmentedTabs items={VIEW_ITEMS} value={view} onChange={setView} ariaLabel="View" size="sm" />
          </div>

          {view === "list" ? (
            <MaterialPanel className="p-2 sm:p-3">
              {listPending ? <IdeaListSkeleton /> : <IdeaList ideas={sorted} selected={open} onOpen={openCompany} />}
              {!listPending && summary.unvalued > 0 && !quotesPending ? (
                <p className="px-4 pb-1 pt-3 text-[11.5px] text-mist/80">
                  {summary.unvalued} {summary.unvalued === 1 ? "company has" : "companies have"} no fair value yet. Open one to type a
                  buy price or build a DCF.
                </p>
              ) : null}
            </MaterialPanel>
          ) : view === "map" ? (
            <HuntingGroundCard
              ground={ground}
              loading={metrics.isLoading || quotesPending}
              newsTickers={NO_NEWS}
              onWatch={openCompany}
              isWatched={WATCHED}
              scope="watchlist"
            />
          ) : (
            <DipFinderPanel title="Dip Finder" subtitle="Discounted prices across this list" items={dipItems} />
          )}
        </>
      )}

      {openIdea ? (
        <IdeaPanel idea={openIdea} listName={activeList?.name ?? "this list"} actions={actions} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
