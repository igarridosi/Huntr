"use client";

import Link from "next/link";
import { useMemo, useState, memo } from "react";
import {
  Lightbulb,
  ChevronLeft,
  ChevronRight,
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
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { ROUTES } from "@/lib/constants";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { CompactLabel } from "@/components/ui/compact-label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatCompactNumber, formatCurrency, formatPercent } from "@/lib/utils";
import type { StockProfile, StockQuote } from "@/types/stock";

type InsightTab = "sp500" | "trending" | "growth" | "dividend";
type PerformanceWindow = "1D" | "1W" | "1M" | "YTD";
type BreakoutMode = "near" | "break";

/**
 * Yahoo's `fiftyTwoWeekHigh` is the intraday high over the trailing 52 weeks,
 * and that window includes today — so the live price can essentially never
 * exceed it. The previous `price >= fifty_two_week_high` test was therefore
 * unsatisfiable in practice (checked against the live feed: 0 of 12 large caps
 * passed, the closest sitting 0.72% below), which is why Break never listed a
 * single stock. Touching the high IS the breakout, so both modes are bands
 * measured below it, and they do not overlap.
 */
const BREAKOUT_BAND = 0.01; // within 1% of the high — testing/breaking it
const APPROACH_BAND = 0.03; // 1–3% below — approaching it

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
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  /**
   * Paging can be fired faster than any entrance can finish, so it gets the
   * quick directional slide and no per-row stagger — a cascade there would be
   * motion fighting the interaction. A stagger is reserved for the moments a
   * genuinely different set of stocks arrives: first load and tab switches.
   */
  const [enterMode, setEnterMode] = useState<"stagger" | "page">("stagger");
  const [isRevProxyLegendOpen, setIsRevProxyLegendOpen] = useState(false);
  const [pickerTicker, setPickerTicker] = useState<string | null>(null);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const PAGE_SIZE = 12;
  const { data: quotes = [], isLoading, isError: quotesError, refetch: refetchQuotes } = useAllQuotes();
  const { data: profiles = [], isError: profilesError, refetch: refetchProfiles } = useAllProfiles();
  const { lists, addTicker, removeTicker, isInWatchlist } = useWatchlist();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();

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
            ? item.breakoutPct >= -BREAKOUT_BAND
            : item.breakoutPct >= -APPROACH_BAND &&
              item.breakoutPct < -BREAKOUT_BAND) &&
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
    if (!user) {
      openGate("watchlist");
      return;
    }
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

  /**
   * The rows are already in memory — this is client-side slicing, so the page
   * changes on the click. The previous version waited 120ms to swap, 280ms to
   * clear a transition flag, and dropped any click that arrived in between,
   * all while showing a loading skeleton for data that never left the client.
   */
  const handlePageChange = (direction: "prev" | "next") => {
    setPageDirection(direction === "next" ? 1 : -1);
    setEnterMode("page");
    setPage((prev) =>
      direction === "prev"
        ? Math.max(0, prev - 1)
        : Math.min(pageCount - 1, prev + 1)
    );
  };

  return (
    // suppressHydrationWarning: browser extensions (e.g. Honey/BIS) inject
    // attributes like `bis_skin_checked` that don't exist server-side.
    <div className="space-y-6 w-full" suppressHydrationWarning>
      {/* Tracking is size-specific: the title is large enough that letters read
          too far apart at 0, so it tightens; the caption sits near 0. */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/20">
          <Lightbulb className="h-[18px] w-[18px] text-sunset-orange" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-snow-peak">
            Insights
          </h1>
          <p className="mt-0.5 text-[13px] leading-snug text-mist">
            Market ideas and trending opportunities
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* Stacked on phones: side by side, the counter squeezed the tab
              strip into a stub and left the native scrollbar on show. */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div
              className={cn(
                "order-2 flex items-center gap-2 overflow-x-auto overscroll-x-contain sm:order-1",
                "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                "[mask-image:linear-gradient(to_right,black_0,black_calc(100%-24px),transparent_100%)] sm:[mask-image:none]"
              )}
            >
              <SegmentedTabs
                items={tabs}
                value={activeTab}
                ariaLabel="Insight category"
                onChange={(key) => {
                  setActiveTab(key);
                  setEnterMode("stagger");
                  setPage(0);
                }}
              />
              {activeTab === "growth" && (
                <button
                  type="button"
                  onClick={() => setIsRevProxyLegendOpen((value) => !value)}
                  aria-expanded={isRevProxyLegendOpen}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px]",
                    "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                    "motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-8",
                    isRevProxyLegendOpen
                      ? "bg-sunset-orange/10 text-sunset-orange"
                      : "text-mist hover:bg-wolf-black/40 hover:text-snow-peak"
                  )}
                >
                  <CircleHelp className="h-3.5 w-3.5" /> Rev Proxy
                </button>
              )}
            </div>
            {/* A bordered badge competed with the tab control beside it; plain
                tabular figures carry the same information more quietly. */}
            <p className="order-1 shrink-0 self-start font-mono text-[12px] tracking-[0.02em] tabular-nums text-mist/70 sm:order-2 sm:self-auto">
              {startItem}&ndash;{endItem}
              <span className="text-mist/40"> of </span>
              {insightRows.length}
            </p>
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
          {(quotesError || profilesError) ? (
            <ErrorState
              title="Could not load market data"
              message="Check your connection or try refreshing."
              variant="network"
              onRetry={() => { void refetchQuotes(); void refetchProfiles(); }}
              className="m-4"
            />
          ) : isLoading ? (
            <InsightsSkeleton />
          ) : (
            <>
              <ul
                key={`${activeTab}-${currentPage}`}
                className={cn(
                  "grid grid-cols-1 gap-1.5 p-2 md:grid-cols-2 xl:grid-cols-3",
                  enterMode === "page" &&
                    (pageDirection === 1 ? "animate-insight-next" : "animate-insight-prev")
                )}
              >
              {pagedRows.map(({ quote, profile, dayChangePercent }, rowIndex) => {
                const isPositive = dayChangePercent >= 0;
                const contextMetric = getContextMetric({ quote, profile, dayChangePercent }, activeTab);
                const inAnyWatchlist = isInWatchlist(quote.ticker);

                return (
                  <li
                    key={quote.ticker}
                    className={cn("group/row relative", enterMode === "stagger" && "insight-enter")}
                    // Capped so the twelfth row is not still waiting long after
                    // the first has settled.
                    style={
                      enterMode === "stagger"
                        ? ({ "--enter-delay": `${Math.min(rowIndex * 25, 200)}ms` } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {/* Raised surfaces get lighter, not darker: the row now sits
                        above the card instead of being punched into it. */}
                    <Link
                      href={ROUTES.SYMBOL(quote.ticker)}
                      className={cn(
                        "flex h-full items-center gap-3 rounded-xl bg-snow-peak/[0.025] py-3 pl-3 pr-[3.25rem]",
                        "ring-1 ring-inset ring-wolf-border/40",
                        "transition-[background-color,box-shadow,transform] duration-150 ease-out",
                        "hover:bg-snow-peak/[0.05] hover:ring-wolf-border/70",
                        // Acknowledgement on pointer-down — the only feedback
                        // touch ever gets, since it has no hover.
                        "active:scale-[0.985] active:bg-snow-peak/[0.07]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                        "motion-reduce:transition-none motion-reduce:active:scale-100"
                      )}
                    >
                      <TickerLogo
                        ticker={quote.ticker}
                        src={profile?.logo_url}
                        className="h-9 w-9"
                        imageClassName="rounded-lg"
                        fallbackClassName="rounded-lg text-[10px]"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold leading-tight tracking-[-0.01em] text-snow-peak">
                          {quote.ticker}
                        </p>
                        <p className="mt-1 truncate text-[12px] leading-tight text-mist">
                          <CompactLabel text={profile?.name ?? quote.ticker} />
                        </p>
                        <p className="mt-1.5 truncate text-[10px] uppercase leading-tight tracking-[0.08em] text-mist/50">
                          {contextMetric.label}
                          <span className="ml-1.5 font-mono text-[11px] normal-case tracking-[0.02em] text-mist/80">
                            {contextMetric.value}
                          </span>
                        </p>
                      </div>

                      {/* Price and its change read as one figure, so they stack
                          together and centre against the row rather than being
                          split across two of the left column's baselines. */}
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[15px] font-semibold leading-none tabular-nums text-snow-peak">
                          {formatCurrency(quote.price)}
                        </p>
                        <p
                          className={cn(
                            "mt-1.5 font-mono text-[12px] font-semibold leading-none tabular-nums",
                            isPositive ? "text-bullish" : "text-bearish"
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {formatPercent(dayChangePercent, 2)}
                        </p>
                      </div>
                    </Link>

                    {/* Persistent, not hover-revealed: the old button was
                        `hidden sm:…` behind group-hover, so touch could never
                        reach the watchlist from this screen at all. */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openPickerForTicker(quote.ticker);
                      }}
                      className={cn(
                        "absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg",
                        "transition-[color,background-color,transform] duration-150 ease-out",
                        "active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                        "motion-reduce:transition-none motion-reduce:active:scale-100",
                        inAnyWatchlist
                          ? "text-sunset-orange hover:bg-sunset-orange/10"
                          : "text-mist/35 hover:bg-snow-peak/[0.06] hover:text-sunset-orange"
                      )}
                      title={inAnyWatchlist ? "In a watchlist" : "Add to watchlist"}
                      aria-label={
                        inAnyWatchlist
                          ? `${quote.ticker} is in a watchlist`
                          : `Add ${quote.ticker} to a watchlist`
                      }
                      aria-pressed={inAnyWatchlist}
                    >
                      <Star className={cn("h-4 w-4", inAnyWatchlist && "fill-current")} />
                    </button>
                  </li>
                );
              })}
              </ul>

              {/* A soft edge where content meets the pager, rather than a hard
                  1px rule cutting the card in two. */}
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-wolf-black/25 to-transparent"
                />
                <p className="relative font-mono text-[11px] tracking-[0.02em] tabular-nums text-mist/70">
                  Page {currentPage + 1}
                  <span className="text-mist/40"> of </span>
                  {pageCount}
                </p>
                <div className="relative flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePageChange("prev")}
                    disabled={currentPage === 0}
                    aria-label="Previous page"
                    className={cn(
                      "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-mist",
                      "transition-[color,background-color,transform] duration-150 ease-out",
                      "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90",
                      "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                      "motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-8 sm:w-8"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange("next")}
                    disabled={currentPage >= pageCount - 1}
                    aria-label="Next page"
                    className={cn(
                      "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-mist",
                      "transition-[color,background-color,transform] duration-150 ease-out",
                      "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90",
                      "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                      "motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-8 sm:w-8"
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 mt-2 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl bg-snow-peak/[0.02] p-3 ring-1 ring-inset ring-wolf-border/40 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.08em] text-mist/60">
                  <CompactLabel text="Price Momentum Window (Top Gainers / Top Losers)" />
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg bg-wolf-black/40 p-0.5 ring-1 ring-inset ring-wolf-border/40">
                    {performanceWindows.map((window) => (
                      <button
                        key={window}
                        type="button"
                        onClick={() => setPerformanceWindow(window)}
                        aria-pressed={performanceWindow === window}
                        className={cn(
                          "min-h-8 cursor-pointer rounded-md px-2.5 font-mono text-[10px] tracking-[0.02em]",
                          "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]",
                          "motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-7 sm:px-2",
                          performanceWindow === window
                            ? "bg-sunset-orange/12 text-sunset-orange"
                            : "text-mist hover:text-snow-peak"
                        )}
                      >
                        {window}
                      </button>
                    ))}
                  </div>
                  {(isPerformanceLoading || isBuybackFetching) && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-mist">
                      <Spinner size="xs" color="mist" /> updating
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
              metric={breakoutMode === "near" ? "Away" : "At high"}
              metricValue={(r) => {
                const raw = (r as InsightRow & { breakoutPct?: number }).breakoutPct ?? 0;
                // Both bands sit below the high, so the distance is always
                // shown as a magnitude — a negative number under a "breaking
                // out" heading reads as a contradiction.
                return formatPercent(Math.abs(raw), 2);
              }}
              headerActions={
                <div className="flex items-center gap-0.5 rounded-lg bg-wolf-black/40 p-0.5 ring-1 ring-inset ring-wolf-border/40">
                  {(["near", "break"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBreakoutMode(mode)}
                      aria-pressed={breakoutMode === mode}
                      className={cn(
                        "min-h-8 cursor-pointer rounded-md px-2.5 font-mono text-[10px] capitalize tracking-[0.02em] sm:min-h-7 sm:px-2",
                        "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]",
                        "motion-reduce:transition-none motion-reduce:active:scale-100",
                        breakoutMode === mode
                          ? "bg-sunset-orange/12 text-sunset-orange"
                          : "text-mist hover:text-snow-peak"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              }
              infoText="Distance to the 52-week high, as (Price / 52W High) - 1. Break lists stocks within 1% of the high — the ones testing it now. Near lists those 1–3% below, still approaching. The 52-week high already includes today's trading, so a price above it is not something this data can show."
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

const SignalColumn = memo(function SignalColumn({
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
    <div className="rounded-xl bg-snow-peak/[0.02] p-3 ring-1 ring-inset ring-wolf-border/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-mist/70">{title}</p>
            {subtitle ? <p className="mt-0.5 text-[10px] text-mist/50">{subtitle}</p> : null}
          </div>
          {infoText && (
            <span className="group relative inline-flex shrink-0">
              {/* Focusable, so the explanation is reachable by tap and by
                  keyboard — hover alone left it invisible on touch. */}
              <button
                type="button"
                aria-label={`About ${title}`}
                // Padding grows the hit area to ~34px while the negative margin
                // keeps the header row the same height it was.
                className="-m-2.5 inline-flex cursor-help items-center justify-center rounded p-2.5 text-mist/60 transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sunset-orange sm:-m-1 sm:p-1"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-7 z-20 w-64 rounded-lg bg-wolf-black/95 p-2.5 text-[10px] leading-relaxed text-mist opacity-0 shadow-xl ring-1 ring-inset ring-wolf-border/60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:top-5"
              >
                {infoText}
              </span>
            </span>
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
          rows.map((row, index) => (
            <Link
              key={`${title}-${row.quote.ticker}`}
              href={ROUTES.SYMBOL(row.quote.ticker)}
              // Four rows at most here, so a slightly wider step still lands
              // well inside the same budget as the main grid.
              style={{ "--enter-delay": `${index * 40}ms` } as React.CSSProperties}
              className={cn(
                "insight-enter",
                "flex items-center gap-2.5 rounded-lg px-2 py-2",
                "transition-[background-color,transform] duration-150 ease-out",
                "hover:bg-snow-peak/[0.05] active:scale-[0.985] active:bg-snow-peak/[0.07]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                "motion-reduce:transition-none motion-reduce:active:scale-100"
              )}
            >
              <TickerLogo
                ticker={row.quote.ticker}
                src={row.profile?.logo_url}
                className="h-6 w-6"
                imageClassName="rounded-[5px]"
                fallbackClassName="rounded-[5px] text-[9px]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight tracking-[-0.01em] text-snow-peak">{row.quote.ticker}</p>
                <p className="truncate text-[10px] leading-tight text-mist/70">
                  <CompactLabel text={row.profile?.name ?? row.quote.ticker} />
                </p>
              </div>
              <span className="shrink-0 text-right leading-tight">
                <span className="block text-[9px] uppercase tracking-[0.08em] text-mist/45">{metric}</span>
                <span
                  className={cn(
                    "block font-mono text-[12px] font-semibold tabular-nums",
                    metricColorClass ?? (negativeMetric ? "text-bearish" : "text-sunset-orange")
                  )}
                >
                  {metricValue(row)}
                </span>
              </span>
            </Link>
          ))
        ) : (
          <p className="text-xs text-mist/70">No signals available right now.</p>
        )}
      </div>
    </div>
  );
});
SignalColumn.displayName = "SignalColumn";

function InsightsSkeleton() {
  return (
    // Mirrors the real row's geometry, so nothing jumps when data lands.
    <div className="grid grid-cols-1 gap-1.5 p-2 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl bg-snow-peak/[0.02] py-3 pl-3 pr-[3.25rem] ring-1 ring-inset ring-wolf-border/40"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="mt-1.5 h-3 w-24" />
            <Skeleton className="mt-2 h-2.5 w-28" />
          </div>
          <div className="shrink-0">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-2 ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
