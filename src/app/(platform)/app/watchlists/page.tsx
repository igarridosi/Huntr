"use client";

import { useCallback, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  BarChart3,
  DollarSign,
  LayoutGrid,
  Pencil,
  PieChart,
  Plus,
  Star,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import {
  useBatchPeriodPerformance,
} from "@/hooks/use-stock-data";
import {
  WatchlistTable,
  WatchlistTableSkeleton,
} from "@/components/watchlist/watchlist-table";
import { EmptyState } from "@/components/watchlist/empty-state";
import { HeatmapView } from "@/components/watchlist/heatmap-view";
import { ImportExportActions } from "@/components/watchlist/import-export";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { WatchlistView } from "@/types/watchlist";

const VIEW_OPTIONS: Array<{
  key: WatchlistView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "fundamental", label: "Fundamental", icon: BarChart3 },
  { key: "dividends", label: "Dividends", icon: DollarSign },
];

export default function WatchlistsPage() {
  const {
    data: entries,
    isLoading,
    lists,
    activeListId,
    activeList,
    setActiveList,
    createList,
    renameList,
    deleteList,
    removeTicker,
    exportToCSV,
    importFromCSV,
    isRemoving,
  } = useWatchlist();

  const [view, setView] = useState<WatchlistView>("overview");
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isCreateListDialogOpen, setIsCreateListDialogOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState("");

  const tickers = useMemo(() => entries?.map((entry) => entry.ticker) ?? [], [entries]);

  const { data: perf1D = {} } = useBatchPeriodPerformance(
    tickers,
    "1D",
    tickers.length > 0
  );
  const { data: perf1W = {} } = useBatchPeriodPerformance(
    tickers,
    "1W",
    tickers.length > 0 && view === "performance"
  );
  const { data: perf1M = {} } = useBatchPeriodPerformance(
    tickers,
    "1M",
    tickers.length > 0
  );
  const { data: perfYTD = {} } = useBatchPeriodPerformance(
    tickers,
    "YTD",
    tickers.length > 0 && view === "performance"
  );

  const performanceData = useMemo(
    () => ({ "1D": perf1D, "1W": perf1W, "1M": perf1M, YTD: perfYTD }),
    [perf1D, perf1W, perf1M, perfYTD]
  );

  const handleSearchClick = useCallback(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      })
    );
  }, []);

  const handleCreateList = () => {
    if (newListName.trim()) {
      createList(newListName.trim());
      setNewListName("");
      setIsCreateListDialogOpen(false);
    }
  };

  const handleRenameList = (id: string) => {
    if (editListName.trim()) {
      renameList(id, editListName.trim());
      setEditingListId(null);
      setEditListName("");
    }
  };

  const isEmpty = !isLoading && (!entries || entries.length === 0);

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
            <Star className="w-5 h-5 text-sunset-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-snow-peak">
              Watchlists
            </h1>
            <p className="text-xs text-mist mt-0.5">
              Track, analyze and organize your investment ideas
            </p>
          </div>
        </div>
        {!isEmpty && (
          <Badge variant="secondary" className="font-mono">
            {entries?.length ?? 0} stocks
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {lists.map((list) => (
          <div key={list.id} className="relative group flex items-center">
            {editingListId === list.id ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editListName}
                  onChange={(event) => setEditListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRenameList(list.id);
                    if (event.key === "Escape") setEditingListId(null);
                  }}
                  className="h-8 w-32 text-xs"
                  autoFocus
                />
                <Button variant="ghost" size="icon-sm" onClick={() => handleRenameList(list.id)}>
                  <Plus className="h-3 w-3 rotate-45" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActiveList(list.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  activeListId === list.id
                    ? "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30"
                    : "bg-wolf-black/30 text-mist border-wolf-border/40 hover:text-snow-peak"
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${activeListId === list.id ? "bg-sunset-orange" : "bg-mist/60"}`} />
                {list.name}
                <span className="text-[10px] text-mist/60 font-mono">{list.items.length}</span>
              </button>
            )}

            {list.id !== "default" && editingListId !== list.id ? (
              <div className="hidden group-hover:flex items-center gap-0.5 ml-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingListId(list.id);
                    setEditListName(list.name);
                  }}
                  aria-label={`Rename ${list.name}`}
                  title={`Rename ${list.name}`}
                  className="p-1 text-mist hover:text-snow-peak cursor-pointer"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteList(list.id)}
                  aria-label={`Delete ${list.name}`}
                  title={`Delete ${list.name}`}
                  className="p-1 text-mist hover:text-bearish cursor-pointer"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setIsCreateListDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-dashed border-wolf-border/40 text-mist hover:text-snow-peak hover:border-sunset-orange/30 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3 w-3" /> New List
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-wolf-border/30">
          <div className="flex items-center gap-1 rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setView(option.key);
                  setHeatmapMode(false);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  view === option.key && !heatmapMode
                    ? "bg-sunset-orange/15 text-sunset-orange"
                    : "text-mist hover:text-snow-peak"
                }`}
              >
                <option.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHeatmapMode((value) => !value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                heatmapMode
                  ? "bg-sunset-orange/15 text-sunset-orange"
                  : "text-mist hover:text-snow-peak"
              }`}
            >
              <PieChart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Heatmap</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ImportExportActions
              onExport={exportToCSV}
              onImport={importFromCSV}
              listName={activeList?.name ?? "watchlist"}
            />
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleSearchClick}>
              <Plus className="h-3.5 w-3.5" /> Add Stock
            </Button>
          </div>
        </div>

        <CardContent className="p-0 pb-2">
          {isLoading ? (
            <WatchlistTableSkeleton />
          ) : isEmpty ? (
            <EmptyState onSearchClick={handleSearchClick} />
          ) : heatmapMode ? (
            <HeatmapView entries={entries!} performanceData={perf1D} />
          ) : (
            <WatchlistTable
              entries={entries!}
              view={view}
              performanceData={performanceData}
              onRemove={removeTicker}
              isRemoving={isRemoving}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateListDialogOpen} onOpenChange={setIsCreateListDialogOpen}>
        <DialogContent className="max-w-md p-4">
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">Create Watchlist</h3>
              <p className="text-xs text-mist mt-0.5">Give your list a clear name</p>
            </div>
            <Input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateList();
              }}
              placeholder="e.g. Dividend Ideas"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsCreateListDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateList}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
