"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  CircleHelp,
} from "lucide-react";
import {
  useAllQuotes,
  useAllProfiles,
  useBatchPeriodPerformance,
  useBatchBuybackStrength,
} from "@/hooks/use-stock-data";
import { ROUTES } from "@/lib/constants";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactNumber, formatCurrency, formatPercent } from "@/lib/utils";
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

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTab>("sp500");
  const [page, setPage] = useState(0);
  const [performanceWindow, setPerformanceWindow] = useState<PerformanceWindow>("1D");
  const [breakoutMode, setBreakoutMode] = useState<BreakoutMode>("near");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const PAGE_SIZE = 12;
  const { data: quotes = [], isLoading } = useAllQuotes();
  const { data: profiles = [] } = useAllProfiles();

  const profileMap = useMemo(
    () =>
      Object.fromEntries(profiles.map((p) => [p.ticker, p])),
    [profiles]
  );

  const insightRows = useMemo(() => {
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
        return withMeta.sort((a, b) => b.dayChangePercent - a.dayChangePercent);
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

  useEffect(() => {
    setPage(0);
  }, [activeTab]);

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
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.key
                      ? "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30"
                      : "bg-wolf-black/30 text-mist border-wolf-border/40 hover:text-snow-peak"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Badge variant="secondary" className="font-mono">
              {startItem}-{endItem} / {insightRows.length} ideas
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading || isPageTransitioning ? (
            <InsightsSkeleton />
          ) : (
            <>
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-2">
              {pagedRows.map(({ quote, profile, dayChangePercent }) => {
                const isPositive = dayChangePercent >= 0;

                return (
                  <li key={quote.ticker}>
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
                          Market Cap: {formatCompactNumber(quote.market_cap)}
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
                                ? "text-sunset-orange bg-sunset-orange/15"
                                : "text-[#FF4242] bg-[#FF4242]/15"
                            }`}
                          >
                          {isPositive ? "+" : ""}
                          {formatPercent(dayChangePercent, 2)}
                          </span>
                        </p>
                      </div>
                    </Link>
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

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-snow-peak">Opportunity Radar</h2>
              <p className="text-xs text-mist mt-0.5">Premium signals for faster stock discovery</p>
            </div>
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
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Lock className="h-3 w-3" /> Pro
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SignalColumn
              title="Top Gainers"
              rows={rankedSignals.topGainers}
              metric={performanceWindow}
              metricValue={(r) => formatPercent(r.periodChangePercent ?? 0, 2)}
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
            />
            <SignalColumn
              title="Buyback Leaders"
              rows={rankedSignals.buybackLeaders}
              metric="Buyback"
              metricValue={(r) => formatPercent((r as InsightRow & { buybackPct?: number }).buybackPct ?? 0, 2)}
              loading={isBuybackFetching}
            />
            <SignalColumn
              title="Breaking 52-Week High"
              rows={rankedSignals.breaking52WeekHigh}
              metric="Break"
              metricValue={(r) => formatPercent((r as InsightRow & { breakoutPct?: number }).breakoutPct ?? 0, 2)}
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
              infoText='Break = (Price / 52W High) -- 1. Positive means the stock is above its 52-week high (confirmed breakout, stronger). Negative means below the high; in Near mode, values closer to 0 are better.'
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
  loading = false,
  headerActions,
  infoText,
}: {
  title: string;
  rows: Array<InsightRow & { periodChangePercent?: number }>;
  metric: string;
  metricValue: (row: InsightRow & { periodChangePercent?: number }) => string;
  negativeMetric?: boolean;
  loading?: boolean;
  headerActions?: React.ReactNode;
  infoText?: string;
}) {
  return (
    <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-mist truncate">{title}</p>
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
              <span className={`text-xs font-mono font-semibold ${negativeMetric ? "text-[#FF4242]" : "text-sunset-orange"}`}>
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
