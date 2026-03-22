"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  CircleHelp,
  Star,
  Check,
} from "lucide-react";
import {
  useAllQuotes,
  useAllProfiles,
  useBatchPeriodPerformance,
  useBatchBuybackStrength,
} from "@/hooks/use-stock-data";
import { useWatchlist } from "@/hooks/use-watchlist";
import { ROUTES } from "@/lib/constants";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, formatCompactNumber, formatCurrency, formatPercent } from "@/lib/utils";
import type { StockProfile, StockQuote } from "@/types/stock";

type InsightTab = "sp500" | "trending" | "growth" | "dividend";
type PerformanceWindow = "1D" | "1W" | "1M" | "YTD";
type BreakoutMode = "near" | "break";

const tabs: { key: InsightTab; label: string }[] = [
  { key: "sp500", label: "S&P 500" },
  { key: "trending", label: "Most Trending" },
  { key: "growth", label: "Growth" },
  { key: "dividend", label: "Dividend" },
];

type InsightRow = {
  quote: StockQuote;
  profile: StockProfile | undefined;
  dayChangePercent: number;
};

const performanceWindows: PerformanceWindow[] = ["1D", "1W", "1M", "YTD"];

function getContextMetric(row: InsightRow, activeTab: InsightTab): { label: string; value: string } {
  if (activeTab === "dividend") {
    return {
      label: "Yield",
      value: row.quote.dividend_yield > 0 ? formatPercent(row.quote.dividend_yield, 2) : "N/A",
    };
  }

  if (activeTab === "growth") {
    if (row.quote.revenue_growth != null && row.quote.revenue_growth !== 0) {
      return { label: "Rev Growth", value: formatPercent(row.quote.revenue_growth, 1) };
    }
    if (row.quote.earnings_growth != null && row.quote.earnings_growth !== 0) {
      return { label: "Earnings G", value: formatPercent(row.quote.earnings_growth, 1) };
    }
    const volumeRatio =
      row.quote.avg_volume > 0 && (row.quote.current_volume ?? 0) > 0
        ? (row.quote.current_volume ?? 0) / row.quote.avg_volume
        : 1;
    const boundedPrice = Math.min(Math.max(row.dayChangePercent, -0.2), 0.2);
    const boundedVolume = Math.min(Math.max(volumeRatio - 1, -0.8), 1.5);
    const proxyGrowth = Math.min(Math.max(boundedPrice * 0.7 + boundedVolume * 0.08, -0.3), 0.3);
    return { label: "Rev Proxy*", value: formatPercent(proxyGrowth, 1) };
  }

  if (activeTab === "trending") {
    const ratio =
      row.quote.avg_volume > 0 && (row.quote.current_volume ?? 0) > 0
        ? (row.quote.current_volume ?? 0) / row.quote.avg_volume
        : 0;
    return ratio > 0
      ? { label: "Vol", value: `${ratio.toFixed(1)}x` }
      : { label: "Market Cap", value: formatCompactNumber(row.quote.market_cap) };
  }

  return { label: "Market Cap", value: formatCompactNumber(row.quote.market_cap) };
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTab>("sp500");
  const [page, setPage] = useState(0);
  const [performanceWindow, setPerformanceWindow] = useState<PerformanceWindow>("1D");
  const [breakoutMode, setBreakoutMode] = useState<BreakoutMode>("near");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [isRevProxyLegendOpen, setIsRevProxyLegendOpen] = useState(false);
  const [pickerTicker, setPickerTicker] = useState<string | null>(null);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const PAGE_SIZE = 12;
  const { data: quotes = [], isLoading } = useAllQuotes();
  const { data: profiles = [] } = useAllProfiles();
  const { lists, addTicker, removeTicker, isInWatchlist } = useWatchlist();

  const profileMap = useMemo(
    () =>
      Object.fromEntries(profiles.map((p) => [p.ticker, p])),
    [profiles]
  );

  const insightRows = useMemo(() => {
    const getGrowthScore = (row: { quote: StockQuote; dayChangePercent: number }) => {
      if (row.quote.revenue_growth != null && row.quote.revenue_growth !== 0) return row.quote.revenue_growth;
      if (row.quote.earnings_growth != null && row.quote.earnings_growth !== 0) return row.quote.earnings_growth * 0.8;
      const volumeRatio =
        row.quote.avg_volume > 0 && (row.quote.current_volume ?? 0) > 0
          ? (row.quote.current_volume ?? 0) / row.quote.avg_volume
          : 1;
      const boundedPrice = Math.min(Math.max(row.dayChangePercent, -0.2), 0.2);
      const boundedVolume = Math.min(Math.max(volumeRatio - 1, -0.8), 1.5);
      return Math.min(Math.max(boundedPrice * 0.7 + boundedVolume * 0.08, -0.3), 0.3);
    };

    const withMeta = quotes.map((quote) => {
      const profile = profileMap[quote.ticker];
      const dayChangePercent = quote.day_change_percent ?? 0;
      return {
        quote,
        profile,
        dayChangePercent,
      };
    });

    switch (activeTab) {
      case "trending":
        return withMeta.sort((a, b) => b.quote.avg_volume - a.quote.avg_volume);
      case "growth":
        return withMeta.sort((a, b) => getGrowthScore(b) - getGrowthScore(a));
      case "dividend":
        return withMeta
          .filter((item) => item.quote.dividend_yield > 0)
          .sort((a, b) => b.quote.dividend_yield - a.quote.dividend_yield);
      case "sp500":
      default:
        return withMeta.sort((a, b) => b.quote.market_cap - a.quote.market_cap);
    }
  }, [quotes, profileMap, activeTab]);

  const pageCount = Math.max(1, Math.ceil(insightRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  const pagedRows = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return insightRows.slice(start, start + PAGE_SIZE);
  }, [insightRows, currentPage]);

  const premiumSignals = useMemo(() => {
    const universe = quotes
      .filter((quote) => quote.market_cap > 10_000_000_000)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 120)
      .map((quote) => ({
        quote,
        profile: profileMap[quote.ticker],
        dayChangePercent: quote.day_change_percent ?? 0,
      }));

    const incomeLeaders = universe
      .filter((item) => item.quote.dividend_yield > 0)
      .sort((a, b) => b.quote.dividend_yield - a.quote.dividend_yield)
      .slice(0, 4);

    return { universe, incomeLeaders };
  }, [quotes, profileMap]);

  const performanceTickers = useMemo(
    () => premiumSignals.universe.map((item) => item.quote.ticker),
    [premiumSignals.universe]
  );

  const { data: buybackStrength = {}, isFetching: isBuybackFetching } =
    useBatchBuybackStrength(
      performanceTickers.slice(0, 80),
      premiumSignals.universe.length > 0
    );

  const {
    data: periodPerformance = {},
    isFetching: isPerformanceFetching,
  } = useBatchPeriodPerformance(
    performanceTickers,
    performanceWindow,
    premiumSignals.universe.length > 0
  );

  const isPerformanceLoading =
    performanceWindow !== "1D" &&
    (isPerformanceFetching ||
      Object.keys(periodPerformance).length < Math.min(performanceTickers.length, 8));

  const rankedSignals = useMemo(() => {
    const rows = premiumSignals.universe.map((item) => {
      const perf =
        performanceWindow === "1D"
          ? item.dayChangePercent
          : (periodPerformance[item.quote.ticker] ?? item.dayChangePercent);

      return {
        ...item,
        periodChangePercent: perf,
      };
    });

    const topGainers = rows
      .slice()
      .sort((a, b) => b.periodChangePercent - a.periodChangePercent)
      .slice(0, 4);

    const topLosers = rows
      .slice()
      .sort((a, b) => a.periodChangePercent - b.periodChangePercent)
      .slice(0, 4);

    const unusualVolumeRanked = rows
      .filter((item) => item.quote.avg_volume > 0 && (item.quote.current_volume ?? 0) > 0)
      .map((item) => {
        const dayVolume = Math.max(item.quote.current_volume ?? 0, 1);
        const baseline = Math.max(item.quote.avg_volume, 1);
        const ratio = dayVolume / baseline;
        return {
          ...item,
          volumeRatio: ratio,
        };
      })
      .filter((item) => item.volumeRatio >= 2 && item.volumeRatio <= 5)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, 4);

    const buybackLeaders = rows
      .map((item) => ({
        ...item,
        buybackPct: buybackStrength[item.quote.ticker] ?? 0,
      }))
      .filter((item) => item.buybackPct > 0)
      .sort((a, b) => b.buybackPct - a.buybackPct)
      .slice(0, 4);

    const breaking52WeekHigh = rows
      .map((item) => {
        const high52 = item.quote.fifty_two_week_high;
        const breakoutPct =
          high52 > 0 ? item.quote.price / high52 - 1 : -1;

        return {
          ...item,
          breakoutPct,
        };
      })
      .filter(
        (item) =>
          item.quote.fifty_two_week_high > 0 &&
          (breakoutMode === "break"
            ? item.quote.price >= item.quote.fifty_two_week_high
            : item.quote.price >= item.quote.fifty_two_week_high * 0.97 &&
              item.quote.price < item.quote.fifty_two_week_high) &&
          item.periodChangePercent > 0
      )
      .sort((a, b) => b.breakoutPct - a.breakoutPct)
      .slice(0, 4);

    return {
      topGainers,
      topLosers,
      unusualVolume: unusualVolumeRanked,
      buybackLeaders,
      breaking52WeekHigh,
    };
  }, [
    premiumSignals.universe,
    periodPerformance,
    performanceWindow,
    breakoutMode,
    buybackStrength,
  ]);

  const startItem =
    insightRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const endItem = Math.min((currentPage + 1) * PAGE_SIZE, insightRows.length);

  const listMembershipForPicker = useMemo(() => {
    if (!pickerTicker) return [] as Array<{ id: string; name: string; isSelected: boolean }>;
    const upperTicker = pickerTicker.toUpperCase();
    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      isSelected: list.items.some((item) => item.ticker === upperTicker),
    }));
  }, [lists, pickerTicker]);

  const openPickerForTicker = (ticker: string) => {
    setPickerTicker(ticker);
    const upperTicker = ticker.toUpperCase();
    setSelectedLists(
      lists
        .filter((list) => list.items.some((item) => item.ticker === upperTicker))
        .map((list) => list.id)
    );
  };

  const savePickerSelection = () => {
    if (!pickerTicker) return;
    const upperTicker = pickerTicker.toUpperCase();

    for (const list of listMembershipForPicker) {
      const shouldBeInList = selectedLists.includes(list.id);
      if (shouldBeInList && !list.isSelected) addTicker(upperTicker, list.id);
      if (!shouldBeInList && list.isSelected) removeTicker(upperTicker, list.id);
    }

    setPickerTicker(null);
  };

  const handlePageChange = (direction: "prev" | "next") => {
    if (isPageTransitioning) return;
    if (direction === "prev" && currentPage === 0) return;
    if (direction === "next" && currentPage >= pageCount - 1) return;

    setIsPageTransitioning(true);
    setTimeout(() => {
      setPage((prev) =>
        direction === "prev"
          ? Math.max(0, prev - 1)
          : Math.min(pageCount - 1, prev + 1)
      );
    }, 120);

    setTimeout(() => {
      setIsPageTransitioning(false);
    }, 280);
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <Lightbulb className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">
            Insights
          </h1>
          <p className="text-xs text-mist mt-0.5">
            Market ideas and trending opportunities
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setPage(0);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.key
                      ? "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30"
                      : "bg-wolf-black/30 text-mist border-wolf-border/40 hover:text-snow-peak"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {activeTab === "growth" && (
                <button
                  type="button"
                  onClick={() => setIsRevProxyLegendOpen((value) => !value)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap",
                    isRevProxyLegendOpen
                      ? "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30"
                      : "bg-wolf-black/30 text-mist border-wolf-border/40 hover:text-snow-peak"
                  )}
                >
                  <CircleHelp className="h-3.5 w-3.5" /> Rev Proxy
                </button>
              )}
            </div>
            <Badge variant="secondary" className="font-mono">
              {startItem}-{endItem} / {insightRows.length} ideas
            </Badge>
          </div>

          {activeTab === "growth" && isRevProxyLegendOpen && (
            <div className="mt-3 rounded-lg border border-sunset-orange/30 bg-sunset-orange/10 px-3 py-2 text-[11px] text-mist leading-relaxed">
              <p>
                <span className="font-semibold text-snow-peak">Rev Proxy*</span> is a fallback growth signal used when official revenue growth is unavailable.
                It blends short-term momentum with abnormal volume pressure.
              </p>
              <p className="mt-1">
                Formula (bounded): <span className="font-mono text-snow-peak">0.7 x price_momentum + 0.08 x (volume_ratio - 1)</span>.
                Higher values suggest stronger growth appetite and demand. Lower or negative values indicate weaker growth traction.
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading || isPageTransitioning ? (
            <InsightsSkeleton />
          ) : (
            <>
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-2">
              {pagedRows.map(({ quote, profile, dayChangePercent }) => {
                const isPositive = dayChangePercent >= 0;
                const contextMetric = getContextMetric({ quote, profile, dayChangePercent }, activeTab);
                const inAnyWatchlist = isInWatchlist(quote.ticker);

                return (
                  <li key={quote.ticker} className="group relative overflow-hidden">
                    <Link
                      href={ROUTES.SYMBOL(quote.ticker)}
                      className="flex items-center gap-3 rounded-lg border border-wolf-border/40 bg-wolf-black/25 px-3 py-3.5 hover:bg-wolf-black/40 transition-colors h-full"
                    >
                      <TickerLogo
                        ticker={quote.ticker}
                        src={profile?.logo_url}
                        className="h-9 w-9"
                        imageClassName="rounded-[6px]"
                        fallbackClassName="rounded-[6px] text-[10px]"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-tight font-semibold text-snow-peak truncate">
                          {quote.ticker}
                        </p>
                        <p className="text-xs text-mist truncate mt-0.5">
                          {profile?.name ?? quote.ticker}
                        </p>
                        <p className="text-[11px] text-mist/75 font-mono mt-1">
                          {contextMetric.label}: {contextMetric.value}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-base font-semibold text-snow-peak font-mono font-tabular leading-tight">
                          {formatCurrency(quote.price)}
                        </p>
                        <p className="text-[11px] font-semibold font-mono mt-1">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded ${
                              isPositive
                                ? "text-emerald-400 bg-emerald-500/15"
                                : "text-[#FF4242] bg-[#FF4242]/15"
                            }`}
                          >
                          {isPositive ? "+" : ""}
                          {formatPercent(dayChangePercent, 2)}
                          </span>
                        </p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openPickerForTicker(quote.ticker);
                      }}
                      className={`absolute left-1/2 top-2 z-10 inline-flex -translate-x-1/2 translate-y-4 items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-all duration-200 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto ${
                        inAnyWatchlist
                          ? "border-sunset-orange/35 bg-sunset-orange/12 text-sunset-orange"
                          : "border-wolf-border/50 bg-wolf-black/70 text-mist hover:text-sunset-orange"
                      }`}
                      title={inAnyWatchlist ? "Already in a watchlist" : "Add to watchlist"}
                      aria-label={inAnyWatchlist ? `${quote.ticker} already in a watchlist` : `Add ${quote.ticker} to watchlist`}
                    >
                      {inAnyWatchlist ? <Check className="h-3 w-3" /> : <Star className="h-3.5 w-3.5" />}
                      {inAnyWatchlist ? "Added" : ""}
                    </button>
                  </li>
                );
              })}
              </ul>

              <div className="flex items-center justify-between border-t border-wolf-border/30 px-3 py-2.5">
                <p className="text-[11px] text-mist font-mono">
                  Page {currentPage + 1} of {pageCount}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange("prev")}
                    disabled={currentPage === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-wolf-border/40 px-2 py-1 text-xs text-mist hover:text-snow-peak disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange("next")}
                    disabled={currentPage >= pageCount - 1}
                    className="inline-flex items-center gap-1 rounded-md border border-wolf-border/40 px-2 py-1 text-xs text-mist hover:text-snow-peak disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={pickerTicker !== null} onOpenChange={(open) => !open && setPickerTicker(null)}>
        <DialogContent className="max-w-md p-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">Add {pickerTicker ?? "Ticker"} to Watchlists</h3>
              <p className="text-xs text-mist mt-0.5">Select one or more lists</p>
            </div>

            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {listMembershipForPicker.map((list) => {
                const checked = selectedLists.includes(list.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() =>
                      setSelectedLists((prev) =>
                        prev.includes(list.id)
                          ? prev.filter((id) => id !== list.id)
                          : [...prev, list.id]
                      )
                    }
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors",
                      checked
                        ? "border-sunset-orange/40 bg-sunset-orange/10 text-sunset-orange"
                        : "border-wolf-border/50 bg-wolf-black/30 text-mist hover:text-snow-peak"
                    )}
                  >
                    <span>{list.name}</span>
                    {checked ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPickerTicker(null)}>Cancel</Button>
              <Button onClick={savePickerSelection}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-snow-peak">Opportunity Radar</h2>
              <p className="text-xs text-mist mt-0.5">Premium signals for faster stock discovery</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Lock className="h-3 w-3" /> Pro
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 mt-2 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-mist">Price Momentum Window (Top Gainers / Top Losers)</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-md border border-wolf-border/40 bg-wolf-black/30 p-1">
                    {performanceWindows.map((window) => (
                      <button
                        key={window}
                        type="button"
                        onClick={() => setPerformanceWindow(window)}
                        className={`px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                          performanceWindow === window
                            ? "bg-sunset-orange/15 text-sunset-orange"
                            : "text-mist hover:text-snow-peak"
                        }`}
                      >
                        {window}
                      </button>
                    ))}
                  </div>
                  {(isPerformanceLoading || isBuybackFetching) && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-mist">
                      <Loader2 className="h-3 w-3 animate-spin" /> updating
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SignalColumn
              title="Top Gainers"
              rows={rankedSignals.topGainers}
              metric={performanceWindow}
              metricValue={(r) => formatPercent(r.periodChangePercent ?? 0, 2)}
              metricColorClass="text-emerald-400"
              loading={isPerformanceLoading}
            />
            <SignalColumn
              title="Top Losers"
              rows={rankedSignals.topLosers}
              metric={performanceWindow}
              metricValue={(r) => formatPercent(r.periodChangePercent ?? 0, 2)}
              negativeMetric
              loading={isPerformanceLoading}
            />
            <SignalColumn
              title="Unusual Volume"
              rows={rankedSignals.unusualVolume}
              metric="Vol"
              metricValue={(r) => `${((r as InsightRow & { volumeRatio?: number }).volumeRatio ?? 0).toFixed(1)}x`}
              infoText="Shows stocks trading between 2x and 5x their average daily volume baseline."
            />
            <SignalColumn
              title="Buyback Leaders"
              rows={rankedSignals.buybackLeaders}
              metric="Buyback"
              metricValue={(r) => formatPercent((r as InsightRow & { buybackPct?: number }).buybackPct ?? 0, 2)}
              subtitle="TTM"
              loading={isBuybackFetching}
            />
            <SignalColumn
              title="Breaking 52-Week High"
              rows={rankedSignals.breaking52WeekHigh}
              metric={breakoutMode === "near" ? "Away" : "Break"}
              metricValue={(r) => {
                const raw = (r as InsightRow & { breakoutPct?: number }).breakoutPct ?? 0;
                return formatPercent(breakoutMode === "near" ? Math.abs(raw) : raw, 2);
              }}
              headerActions={
                <div className="flex items-center gap-1 rounded-md border border-wolf-border/40 bg-wolf-black/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setBreakoutMode("near")}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                      breakoutMode === "near"
                        ? "bg-sunset-orange/15 text-sunset-orange"
                        : "text-mist hover:text-snow-peak"
                    }`}
                  >
                    Near
                  </button>
                  <button
                    type="button"
                    onClick={() => setBreakoutMode("break")}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                      breakoutMode === "break"
                        ? "bg-sunset-orange/15 text-sunset-orange"
                        : "text-mist hover:text-snow-peak"
                    }`}
                  >
                    Break
                  </button>
                </div>
              }
              infoText='Break = (Price / 52W High) - 1. In Near mode we show distance to the breakout. In Break mode values are positive and indicate how far above the 52W high the stock is.'
            />
            <SignalColumn
              title="Income Leaders"
              rows={premiumSignals.incomeLeaders}
              metric="Yield"
              metricValue={(r) => formatPercent(r.quote.dividend_yield, 2)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SignalColumn({
  title,
  rows,
  metric,
  metricValue,
  negativeMetric = false,
  metricColorClass,
  loading = false,
  headerActions,
  infoText,
  subtitle,
}: {
  title: string;
  rows: Array<InsightRow & { periodChangePercent?: number }>;
  metric: string;
  metricValue: (row: InsightRow & { periodChangePercent?: number }) => string;
  negativeMetric?: boolean;
  metricColorClass?: string;
  loading?: boolean;
  headerActions?: React.ReactNode;
  infoText?: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-mist truncate">{title}</p>
            {subtitle ? <p className="text-[10px] text-mist/70 mt-0.5">{subtitle}</p> : null}
          </div>
          {infoText && (
            <div className="relative group shrink-0">
              <CircleHelp className="h-3.5 w-3.5 text-mist/70 hover:text-snow-peak" />
              <div className="pointer-events-none absolute right-0 top-5 z-20 hidden w-64 rounded-md border border-wolf-border/60 bg-wolf-black/95 p-2 text-[10px] leading-relaxed text-mist shadow-lg group-hover:block">
                {infoText}
              </div>
            </div>
          )}
        </div>
        {headerActions}
      </div>
      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`${title}-loading-${index}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 animate-pulse"
            >
              <Skeleton className="h-5 w-5 rounded-[4px]" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <Skeleton className="h-3 w-14" />
            </div>
          ))
        ) : rows.length > 0 ? (
          rows.map((row) => (
            <Link
              key={`${title}-${row.quote.ticker}`}
              href={ROUTES.SYMBOL(row.quote.ticker)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-wolf-black/35 transition-colors"
            >
              <TickerLogo
                ticker={row.quote.ticker}
                src={row.profile?.logo_url}
                className="h-5 w-5"
                imageClassName="rounded-[4px]"
                fallbackClassName="rounded-[4px] text-[9px]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-snow-peak truncate">{row.quote.ticker}</p>
                <p className="text-[10px] text-mist truncate">{row.profile?.name ?? row.quote.ticker}</p>
              </div>
              <span className={`text-xs font-mono font-semibold ${metricColorClass ?? (negativeMetric ? "text-[#FF4242]" : "text-sunset-orange")}`}>
                {metric}: {metricValue(row)}
              </span>
            </Link>
          ))
        ) : (
          <p className="text-xs text-mist/70">No signals available right now.</p>
        )}
      </div>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-wolf-border/40 bg-wolf-black/25 px-3 py-3.5">
          <Skeleton className="h-9 w-9 rounded-[6px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-12 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
