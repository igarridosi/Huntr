"use client";

import { useMemo, useState } from "react";
import { Lightbulb, Check } from "lucide-react";
import {
  useAllQuotes,
  useAllProfiles,
  useBatchPeriodPerformance,
  useBatchBuybackStrength,
  useMarketIndices,
  useMarketNews,
  useNewsAssets,
  useHuntingGroundMetrics,
} from "@/hooks/use-stock-data";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import {
  OpportunityRadar,
  type BreakoutMode,
  type PerformanceWindow,
} from "@/components/insights/opportunity-radar";
import { MarketNews } from "@/components/insights/market-news-row";
import type { SymbolInfo } from "@/components/insights/news-preview";
import { useNewsLayout } from "@/components/insights/use-news-layout";
import { HuntingGroundCard } from "@/components/insights/hunting-ground";
import { FearGreedCard } from "@/components/insights/fear-greed";
import { buildHuntingGround, HG_RULES, type HgCompany } from "@/lib/hunting-ground";
import { buildMarketCards, buildStockCards, MARKET_NEWS_SYMBOLS, pickNewsCandidates } from "@/lib/market-news";
import { cn } from "@/lib/utils";

/**
 * Yahoo's `fiftyTwoWeekHigh` is the intraday high over the trailing 52 weeks,
 * and that window includes today — so the live price can essentially never
 * exceed it. The previous `price >= fifty_two_week_high` test was therefore
 * unsatisfiable in practice (checked against the live feed: 0 of 12 large caps
 * passed, the closest sitting 0.72% below), which is why Break never listed a
 * single stock. Touching the high IS the breakout, so both modes are bands
 * measured below it, and they do not overlap.
 */
/** Each Radar signal keeps its top twelve, shown four at a time. */
const RADAR_DEPTH = 12;


/** Value + Growth bands; see where the list is built. */
const GARP_MIN_PE = 5;
const GARP_MAX_PE = 25;
const GARP_MIN_GROWTH = 0.05;
const GARP_MAX_GROWTH = 0.35;

const BREAKOUT_BAND = 0.01; // within 1% of the high — testing/breaking it
const APPROACH_BAND = 0.03; // 1–3% below — approaching it

export default function InsightsPage() {
  const [performanceWindow, setPerformanceWindow] = useState<PerformanceWindow>("1D");
  const [breakoutMode, setBreakoutMode] = useState<BreakoutMode>("near");
  const [pickerTicker, setPickerTicker] = useState<string | null>(null);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
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

  const premiumSignals = useMemo(() => {
    // Every company in the universe (all of them above $10B). It used to be
    // the largest 120 only, which cut the line near $120B: NKE (#291) and
    // LULU (#780) could never show up among the YTD losers however far they
    // fell. Period returns now come in batches, so ranking all of them is
    // cheap.
    const universe = quotes
      .filter((quote) => quote.market_cap > 10_000_000_000)
      .map((quote) => ({
        quote,
        profile: profileMap[quote.ticker],
        dayChangePercent: quote.day_change_percent ?? 0,
      }));

    // Growth at a reasonable price: forward P/E over expected EPS growth
    // (the PEG ratio), lowest first. Growth is next fiscal year's consensus
    // EPS against trailing EPS; revenue growth is not in the batch quotes.
    // The bands keep that comparison honest. Trailing EPS is GAAP and the
    // consensus is adjusted, so after a year of one-off charges the "growth"
    // reads 50%+ for nothing (insurers and banks topped the list that way);
    // 35% is the ceiling. Below a 5x forward P/E the estimate is usually
    // stale or in another currency.
    const valueGrowth = universe
      .flatMap((item) => {
        const { forward_pe: fpe, eps_ttm: ttm, eps_forward: fwd, pe_ratio: pe } = item.quote;
        if (!fpe || !ttm || !fwd || fpe < GARP_MIN_PE || fpe > GARP_MAX_PE || pe <= 0 || ttm <= 0 || fwd <= 0) return [];
        const growth = fwd / ttm - 1;
        if (growth < GARP_MIN_GROWTH || growth > GARP_MAX_GROWTH) return [];
        return [{ ...item, peg: fpe / (growth * 100), epsGrowth: growth }];
      })
      .sort((a, b) => a.peg - b.peg)
      .slice(0, RADAR_DEPTH);

    return { universe, valueGrowth };
  }, [quotes, profileMap]);

  // "Why it's moving", two rows (src/lib/market-news.ts). Markets: the
  // indices, gold, oil, the 10-year yield and bitcoin, asked for at once.
  // Stocks: the news behind the day's standout moves among large companies,
  // picked from the quotes already loaded.
  // Hidden by the reader: nothing is fetched for it.
  const [newsLayout, setNewsLayout] = useNewsLayout();
  const showNews = newsLayout !== "hidden";
  const { data: marketIndices = [] } = useMarketIndices();
  const { data: newsAssets = [], isLoading: isAssetsLoading } = useNewsAssets(showNews);
  const newsCandidates = useMemo(
    () =>
      pickNewsCandidates(
        premiumSignals.universe.map((item) => ({
          ticker: item.quote.ticker,
          name: item.profile?.name ?? item.quote.ticker,
          changePercent: item.dayChangePercent,
          marketCap: item.quote.market_cap,
          volumeRatio:
            item.quote.avg_volume > 0 ? (item.quote.current_volume ?? 0) / item.quote.avg_volume : 0,
        }))
      ),
    [premiumSignals.universe]
  );
  const marketNews = useMarketNews(MARKET_NEWS_SYMBOLS, showNews);
  const stockNews = useMarketNews(
    newsCandidates.map((candidate) => candidate.symbol),
    showNews && newsCandidates.length > 0
  );
  // What the rows and the preview can say about a symbol a story mentions.
  const newsSymbols = useMemo(() => {
    const out: Record<string, SymbolInfo> = {};
    for (const quote of quotes) {
      out[quote.ticker] = {
        name: profileMap[quote.ticker]?.name ?? quote.ticker,
        change: quote.day_change_percent ?? 0,
        logo: profileMap[quote.ticker]?.logo_url,
      };
    }
    for (const index of [...marketIndices, ...newsAssets]) {
      out[index.symbol] = { name: index.label, change: index.change_percent, isIndex: true };
    }
    return out;
  }, [quotes, profileMap, marketIndices, newsAssets]);
  // Built together so a story is shown once across both rows. Recency is
  // judged at the moment the headlines were fetched. The Markets row waits
  // for the assets' moves, which decide its order, rather than reshuffling.
  const { marketCards, stockCards } = useMemo(() => {
    const used = new Set<string>();
    const market =
      marketNews.data && !isAssetsLoading
        ? buildMarketCards(marketNews.data, marketNews.dataUpdatedAt, (s) => newsSymbols[s]?.change, used)
        : [];
    const stock = stockNews.data ? buildStockCards(newsCandidates, stockNews.data, stockNews.dataUpdatedAt, used) : [];
    return { marketCards: market, stockCards: stock };
  }, [marketNews.data, marketNews.dataUpdatedAt, isAssetsLoading, newsSymbols, stockNews.data, stockNews.dataUpdatedAt, newsCandidates]);

  const performanceTickers = useMemo(
    () => premiumSignals.universe.map((item) => item.quote.ticker),
    [premiumSignals.universe]
  );

  const { data: buybackStrength = {}, isFetching: isBuybackFetching } =
    useBatchBuybackStrength(
      performanceTickers,
      premiumSignals.universe.length > 0
    );

  const {
    data: periodPerformance = {},
    isFetching: isPerformanceFetching,
  } = useBatchPeriodPerformance(
    performanceTickers,
    performanceWindow,
    // 1D comes with the quotes already; asking again would re-fetch all of them.
    performanceWindow !== "1D" && premiumSignals.universe.length > 0
  );

  const isPerformanceLoading =
    performanceWindow !== "1D" &&
    (isPerformanceFetching ||
      Object.keys(periodPerformance).length < Math.min(performanceTickers.length, 8));

  const rankedSignals = useMemo(() => {
    // A stock with no figure for the window is left out rather than ranked
    // on its daily move: mixing the two put 1D changes into a YTD list.
    const rows = premiumSignals.universe.flatMap((item) => {
      const perf =
        performanceWindow === "1D"
          ? item.dayChangePercent
          : periodPerformance[item.quote.ticker];
      return typeof perf === "number" && Number.isFinite(perf)
        ? [{ ...item, periodChangePercent: perf }]
        : [];
    });

    const topGainers = rows
      .slice()
      .sort((a, b) => b.periodChangePercent - a.periodChangePercent)
      .slice(0, RADAR_DEPTH);

    const topLosers = rows
      .slice()
      .sort((a, b) => a.periodChangePercent - b.periodChangePercent)
      .slice(0, RADAR_DEPTH);

    // Volume is today's, whatever the momentum window: ranked on the whole
    // universe, so it does not wait for (or depend on) period returns.
    const unusualVolumeRanked = premiumSignals.universe
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
      // Up to 20x: the old 5x ceiling hid the real events (FICO traded 6.5x
      // on its drop); beyond 20x it is almost always a bad volume print.
      .filter((item) => item.volumeRatio >= 2 && item.volumeRatio <= 20)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, RADAR_DEPTH);

    const buybackLeaders = premiumSignals.universe
      .map((item) => ({
        ...item,
        buybackPct: buybackStrength[item.quote.ticker] ?? 0,
      }))
      .filter((item) => item.buybackPct > 0)
      .sort((a, b) => b.buybackPct - a.buybackPct)
      .slice(0, RADAR_DEPTH);

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
      .slice(0, RADAR_DEPTH);

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

  // The Hunting Ground: the largest companies from the quotes already loaded,
  // our quality score and free-cash-flow yield for them (cache reads only).
  const huntingCompanies = useMemo<HgCompany[]>(
    () =>
      quotes
        .filter((q) => q.market_cap >= HG_RULES.MIN_MARKET_CAP)
        .sort((a, b) => b.market_cap - a.market_cap)
        .slice(0, HG_RULES.MAX_COMPANIES)
        .map((q) => ({
          ticker: q.ticker,
          name: profileMap[q.ticker]?.name ?? q.ticker,
          // "Unknown" is a profile without a sector, not a sector to filter by.
          sector: profileMap[q.ticker]?.sector && profileMap[q.ticker]!.sector !== "Unknown" ? profileMap[q.ticker]!.sector : null,
          marketCap: q.market_cap,
          change: q.day_change_percent ?? 0,
          logo: profileMap[q.ticker]?.logo_url,
        })),
    [quotes, profileMap]
  );
  const huntingMetrics = useHuntingGroundMetrics(huntingCompanies.map((c) => c.ticker));
  const huntingGround = useMemo(
    () => (huntingMetrics.data ? buildHuntingGround(huntingCompanies, huntingMetrics.data) : null),
    [huntingCompanies, huntingMetrics.data]
  );
  // Companies with a story in the news row: ringed on the map.
  const newsTickers = useMemo(
    () => new Set(stockCards.flatMap((card) => (card.kind === "company" ? [card.candidate.symbol] : []))),
    [stockCards]
  );

  // One object across renders, so the memoised Radar skips the page's
  // unrelated re-renders.
  const radarSignals = useMemo(
    () => ({ ...rankedSignals, valueGrowth: premiumSignals.valueGrowth }),
    [rankedSignals, premiumSignals.valueGrowth]
  );

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

      {quotesError || profilesError ? (
        <ErrorState
          title="Could not load market data"
          message="Check your connection or try refreshing."
          variant="network"
          onRetry={() => {
            void refetchQuotes();
            void refetchProfiles();
          }}
        />
      ) : null}

      {/* The page's signature row: where the opportunities are (60) beside
          how investors feel about the market (40). Stacked below lg. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <HuntingGroundCard
          ground={huntingGround}
          loading={isLoading || huntingMetrics.isLoading}
          newsTickers={newsTickers}
          onWatch={openPickerForTicker}
          isWatched={isInWatchlist}
        />
        <FearGreedCard />
      </div>

      <MarketNews
        marketCards={marketCards}
        stockCards={stockCards}
        symbols={newsSymbols}
        marketLoading={marketNews.isLoading || isAssetsLoading}
        stockLoading={isLoading || stockNews.isLoading}
        now={Math.max(marketNews.dataUpdatedAt, stockNews.dataUpdatedAt)}
        layout={newsLayout}
        onLayoutChange={setNewsLayout}
      />

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

      <OpportunityRadar
        signals={radarSignals}
        performanceWindow={performanceWindow}
        onPerformanceWindowChange={setPerformanceWindow}
        breakoutMode={breakoutMode}
        onBreakoutModeChange={setBreakoutMode}
        performanceLoading={isPerformanceLoading}
        buybackLoading={isBuybackFetching}
      />
    </div>
  );
}
