"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  BarChart3,
  BellRing,
  SearchAlert,
  BookOpen,
  DollarSign,
  LayoutGrid,
  Pencil,
  PieChart,
  Plus,
  Star,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import {
  useBatchPeriodPerformance,
} from "@/hooks/use-stock-data";
import {
  WatchlistTable,
  WatchlistTableSkeleton,
} from "../../../../components/watchlist/watchlist-table";
import { EmptyState } from "../../../../components/watchlist/empty-state";
import { HeatmapView } from "../../../../components/watchlist/heatmap-view";
import { ImportExportActions } from "../../../../components/watchlist/import-export";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { DipFinderPanel } from "@/components/dip-finder/dip-finder-panel";
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

const INBOX_READ_KEY = "huntr_watchlist_inbox_read_v1";

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
    setTargetPrice,
    alerts,
    addAlert,
    removeAlert,
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
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertTicker, setAlertTicker] = useState<string>("");
  const [alertType, setAlertType] = useState<"above" | "below">("below");
  const [alertPrice, setAlertPrice] = useState<string>("");
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isDipFinderOpen, setIsDipFinderOpen] = useState(false);
  const [dismissedInboxIds, setDismissedInboxIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(INBOX_READ_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string");
      }

      // Backward-compat migration from per-list map shape.
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, string[]>)
          .flat()
          .filter((value): value is string => typeof value === "string");
      }

      return [];
    } catch {
      return [];
    }
  });
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INBOX_READ_KEY, JSON.stringify(dismissedInboxIds));
  }, [dismissedInboxIds]);

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

  const activeAlertsByTicker = useMemo(() => {
    return alerts.reduce<Record<string, number>>((acc, alert) => {
      if (!alert.active) return acc;
      acc[alert.ticker] = (acc[alert.ticker] ?? 0) + 1;
      return acc;
    }, {});
  }, [alerts]);

  const primaryAlertByTicker = useMemo(() => {
    return alerts.reduce<Record<string, { price: number; type: "above" | "below" }>>((acc, alert) => {
      if (!alert.active) return acc;
      acc[alert.ticker] = { price: alert.price, type: alert.type };
      return acc;
    }, {});
  }, [alerts]);

  const notificationInbox = useMemo(() => {
    if (!entries) return [];

    const byTicker = new Map(entries.map((entry) => [entry.ticker, entry]));

    const alertNotifications = alerts
      .filter((alert) => alert.active)
      .map((alert) => {
        const entry = byTicker.get(alert.ticker);
        const price = entry?.quote?.price;
        if (price == null) return null;

        const triggered = alert.type === "below" ? price <= alert.price : price >= alert.price;
        if (!triggered) return null;

        return {
          id: `alert-${alert.id}`,
          ticker: alert.ticker,
          text:
            alert.type === "below"
              ? `${alert.ticker} reached alert below ${alert.price.toFixed(2)}`
              : `${alert.ticker} reached alert above ${alert.price.toFixed(2)}`,
        };
      })
      .filter((item): item is { id: string; ticker: string; text: string } => item !== null);

    const targetNotifications = entries
      .map((entry) => {
        if (entry.target_price == null || entry.quote == null) return null;
        if (entry.quote.price > entry.target_price) return null;

        return {
          id: `target-${entry.ticker}`,
          ticker: entry.ticker,
          text: `${entry.ticker} reached target ${entry.target_price.toFixed(2)}`,
        };
      })
      .filter((item): item is { id: string; ticker: string; text: string } => item !== null);

    return [...alertNotifications, ...targetNotifications];
  }, [alerts, entries]);

  useEffect(() => {
    if (isLoading) return;
    setDismissedInboxIds((prev) => prev.filter((id) => notificationInbox.some((item) => item.id === id)));
  }, [isLoading, notificationInbox]);

  const visibleInbox = useMemo(
    () => notificationInbox.filter((item) => !dismissedInboxIds.includes(item.id)),
    [dismissedInboxIds, notificationInbox]
  );

  const dipFinderItems = useMemo(() => {
    return (entries ?? [])
      .filter((entry) => (entry.quote?.price ?? 0) > 0)
      .map((entry) => ({
        ticker: entry.ticker,
        name: entry.profile?.name,
        sector: entry.profile?.sector,
        price: entry.quote?.price ?? 0,
      }));
  }, [entries]);

  const openAlertDialog = useCallback(
    (ticker: string, currentPrice: number, targetPrice: number | null) => {
      setAlertTicker(ticker);
      setAlertType("below");
      const base = targetPrice ?? currentPrice * 0.95;
      setAlertPrice(base.toFixed(2));
      setIsAlertDialogOpen(true);
    },
    []
  );

  const parsedAlertPrice = Number(alertPrice);
  const isValidAlertPrice = Number.isFinite(parsedAlertPrice) && parsedAlertPrice > 0;

  const saveTargetFromDialog = useCallback(() => {
    if (!isValidAlertPrice || !alertTicker) return;
    setTargetPrice(alertTicker, parsedAlertPrice);
    setIsAlertDialogOpen(false);
  }, [alertTicker, isValidAlertPrice, parsedAlertPrice, setTargetPrice]);

  const saveAlertFromDialog = useCallback(() => {
    if (!isValidAlertPrice || !alertTicker) return;
    addAlert({
      ticker: alertTicker,
      type: alertType,
      price: parsedAlertPrice,
      active: true,
    });
    setIsAlertDialogOpen(false);
  }, [addAlert, alertTicker, alertType, isValidAlertPrice, parsedAlertPrice]);

  const legendItems = useMemo(() => {
    if (view === "overview") {
      return [
        { term: "Trend", description: "30-day momentum label based on 1M performance." },
        { term: "Vol", description: "Relative volume versus average daily volume." },
        { term: "Events", description: "Closest upcoming earnings or ex-dividend event." },
        { term: "Target", description: "Your personal target price and current distance." },
      ];
    }

    if (view === "performance") {
      return [
        { term: "1D", description: "Price change over the last trading day." },
        { term: "1W", description: "Price change over the last 5 trading days." },
        { term: "1M", description: "Price change over roughly the last 30 days." },
        { term: "YTD", description: "Performance since the first trading day of the year." },
        { term: "Beta", description: "Volatility vs market. 1.0 means market-like behavior." },
      ];
    }

    if (view === "fundamental") {
      return [
        { term: "P/E", description: "Price-to-earnings ratio from trailing earnings." },
        { term: "Mkt Cap", description: "Total market value of the company equity." },
        { term: "EPS", description: "Earnings per share from trailing data." },
        { term: "Yield", description: "Annual dividend yield relative to current price." },
        { term: "52W Range", description: "Position between 52-week low and high." },
      ];
    }

    return [
      { term: "Yield", description: "Annual dividend as percentage of current price." },
      { term: "Annual Div", description: "Approximate annual cash dividend per share." },
      { term: "Payout Ratio", description: "Portion of earnings paid as dividends (dividends / net income)." },
      { term: "Ex-Div Date", description: "Buy before this date to qualify for the next dividend payment." },
    ];
  }, [view]);

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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`gap-1.5 text-xs border-sunset-orange/45 ${
                isDipFinderOpen
                  ? "bg-sunset-orange/18 text-sunset-orange"
                  : "text-sunset-orange hover:text-sunset-orange"
              }`}
              onClick={() => setIsDipFinderOpen((value) => !value)}
            >
              <SearchAlert className="h-3.5 w-3.5" />
              Dip Finder
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`gap-1.5 text-xs border-sunset-orange/35 ${
                isLegendOpen
                  ? "bg-sunset-orange/15 text-sunset-orange"
                  : "text-mist hover:text-sunset-orange"
              }`}
              onClick={() => setIsLegendOpen((value) => !value)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Legend
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`gap-1.5 text-xs border-sunset-orange/35 ${
                isInboxOpen
                  ? "bg-sunset-orange/15 text-sunset-orange"
                  : "text-mist hover:text-sunset-orange"
              }`}
              onClick={() => setIsInboxOpen((value) => !value)}
            >
              <BellRing className="h-3.5 w-3.5" />
              Inbox ({visibleInbox.length})
            </Button>
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
          {isDipFinderOpen ? (
            <div className="px-6 pt-5 pb-2">
              <DipFinderPanel
                title="Dip Finder"
                subtitle="Detect discounted opportunities in your watchlist"
                items={dipFinderItems}
              />
            </div>
          ) : null}

          {isInboxOpen ? (
            <div className="mx-6 mt-4 mb-6 rounded-xl border border-sunset-orange/35 bg-gradient-to-br from-sunset-orange/18 via-sunset-orange/8 to-wolf-black/15 px-4 py-3 shadow-[0_14px_26px_rgba(0,0,0,0.22)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-sunset-orange">
                  <BellRing className="h-3.5 w-3.5" />
                  Price Inbox ({visibleInbox.length})
                </div>
                {visibleInbox.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] border-sunset-orange/40 bg-wolf-black/30 text-sunset-orange hover:text-sunset-orange"
                    onClick={() =>
                      setDismissedInboxIds((prev) => [
                        ...new Set([...prev, ...visibleInbox.map((item) => item.id)]),
                      ])
                    }
                  >
                    Mark all as read
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {visibleInbox.length > 0 ? (
                  visibleInbox.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-md border border-sunset-orange/25 bg-wolf-black/30 px-2.5 py-2">
                      <div className="flex items-center gap-2.5">
                        <TickerLogo
                          ticker={item.ticker}
                          className="w-5 h-5"
                          imageClassName="rounded-md"
                          fallbackClassName="rounded-md text-[8px]"
                        />
                        <p className="text-[11px] text-snow-peak leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-mist/80">No triggered alerts yet. Configure a bell alert or target to start receiving notifications.</p>
                )}
              </div>
            </div>
          ) : null}

          {isLegendOpen ? (
            <div className="mx-6 mt-4 mb-4 rounded-lg border border-sunset-orange/25 bg-sunset-orange/10 px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-sunset-orange">
                <BookOpen className="h-3.5 w-3.5" />
                {VIEW_OPTIONS.find((option) => option.key === view)?.label} glossary
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {legendItems.map((item) => (
                  <p key={item.term} className="text-[11px] text-mist leading-relaxed">
                    <span className="font-mono text-snow-peak">{item.term}</span>: {item.description}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

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
              activeAlertsByTicker={activeAlertsByTicker}
              primaryAlertByTicker={primaryAlertByTicker}
              onConfigureAlert={openAlertDialog}
              onSetTargetPrice={setTargetPrice}
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

      <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
        <DialogContent className="max-w-md p-4">
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">Price Alert / Target</h3>
              <p className="text-xs text-mist mt-0.5">{alertTicker} notification and target settings</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-mist">Direction</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={alertType === "below" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAlertType("below")}
                >
                  Below
                </Button>
                <Button
                  type="button"
                  variant={alertType === "above" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAlertType("above")}
                >
                  Above
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-mist">Price</label>
              <Input
                value={alertPrice}
                onChange={(event) => setAlertPrice(event.target.value)}
                placeholder="e.g. 800"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const alertToRemove = alerts.find((a) => a.ticker === alertTicker && a.active);
                  if (alertToRemove) removeAlert(alertToRemove.id);
                  setTargetPrice(alertTicker, null);
                  setIsAlertDialogOpen(false);
                }}
              >
                Clear
              </Button>
              <Button type="button" variant="outline" onClick={saveTargetFromDialog} disabled={!isValidAlertPrice}>
                Save Target
              </Button>
              <Button type="button" onClick={saveAlertFromDialog} disabled={!isValidAlertPrice}>
                Save Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
