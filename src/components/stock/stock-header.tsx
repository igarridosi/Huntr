"use client";

import { Activity, ArrowDownRight, ArrowUpRight, CalendarClock, Coins, Landmark, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompactLabel } from "@/components/ui/compact-label";
import { Skeleton } from "@/components/ui/skeleton";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { AddToWatchlist } from "@/components/watchlist/add-to-watchlist";
import { cn, formatCompactNumber, formatCurrency, formatPercent } from "@/lib/utils";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import type { MarketIndexQuote, StockProfile, StockQuote } from "@/types/stock";

interface StockHeaderProps {
  profile: StockProfile | null | undefined;
  quote: StockQuote | null | undefined;
  marketIndices?: MarketIndexQuote[];
  /** Reserve the index strip's space while it is still on its way. */
  marketIndicesLoading?: boolean;
  isLoading: boolean;
}

/**
 * The company at a glance, in two bands.
 *
 * The first is who it is and what it costs: identity on the left, the price
 * on the right where the eye ends the line, so both read in one sweep and
 * the header is a row shorter than when the price sat under the name. The
 * second is the figures a value investor checks first, each with its label
 * above its number in one row of equal cells, closing on where the price
 * sits in its 52-week range.
 *
 * The market indices, context rather than subject, are a slim strip above.
 */
export function StockHeader({
  profile,
  quote,
  marketIndices,
  marketIndicesLoading = false,
  isLoading,
}: StockHeaderProps) {
  // The same one-year query the price chart makes first, so the two share
  // one request.
  const ticker = profile?.ticker ?? quote?.ticker ?? "";
  const { data: history } = useBatchDailyHistory([ticker], "1Y", !!ticker);
  const closes = (history?.[ticker] ?? [])
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-SESSIONS_PER_YEAR)
    .map((row) => row.close)
    .filter((close) => Number.isFinite(close) && close > 0);

  if (!profile) {
    return <StockHeaderSkeleton marketIndices={marketIndices} marketIndicesLoading={marketIndicesLoading} />;
  }

  return (
    <div className="space-y-4">
      <MarketIndicesStrip indices={marketIndices} loading={marketIndicesLoading} />

      <div className="symbol-settle flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between" style={{ "--d": "40ms" } as React.CSSProperties}>
        <Identity profile={profile} />
        <div className="flex items-start justify-between gap-4 sm:justify-end">
          {quote ? <PriceBlock quote={quote} /> : isLoading ? <PriceBlockSkeleton /> : null}
          <div className="shrink-0 sm:pt-1">
            <AddToWatchlist ticker={profile.ticker} />
          </div>
        </div>
      </div>

      {quote ? (
        <StatsBand quote={quote} closes={closes} />
      ) : isLoading ? (
        <StatsBandSkeleton />
      ) : null}
    </div>
  );
}

function Identity({ profile }: { profile: StockProfile }) {
  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
      <TickerLogo
        ticker={profile.ticker}
        src={profile.logo_url}
        className="h-11 w-11 shrink-0 sm:h-14 sm:w-14"
        imageClassName="rounded-xl"
        fallbackClassName="rounded-xl"
      />
      {/* min-w-0 lets a long company name shrink instead of pushing the
          price off the row. */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <h1 className="truncate text-xl font-bold leading-tight tracking-[-0.02em] text-snow-peak sm:text-[26px]">
            <CompactLabel text={profile.name} />
          </h1>
          <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
            {profile.exchange}
          </Badge>
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-[12.5px] text-mist">
          <span className="font-mono text-[13px] font-bold text-sunset-orange">{profile.ticker}</span>
          {profile.sector ? <span className="truncate">{profile.sector}</span> : null}
          {profile.industry ? (
            <>
              <span aria-hidden className="h-3 w-px shrink-0 bg-wolf-border" />
              <span className="truncate">{profile.industry}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function PriceBlock({ quote }: { quote: StockQuote }) {
  const dayChange = quote.day_change ?? 0;
  const dayChangePercent = quote.day_change_percent ?? 0;
  const up = dayChange >= 0;
  const sign = up ? "+" : "";

  return (
    <div className="sm:text-right">
      {/* Display size, so the tracking tightens: letters read too far apart
          as they grow. */}
      <p className="font-mono text-[32px] font-bold tabular-nums leading-none tracking-[-0.03em] text-snow-peak sm:text-[38px]">
        {formatCurrency(quote.price)}
      </p>
      <p className="mt-2 flex items-center gap-2 sm:justify-end">
        <span className={cn("font-mono text-[13px] font-semibold tabular-nums leading-none", up ? "text-bullish" : "text-bearish")}>
          {sign}
          {formatCurrency(dayChange, { decimals: 2 })} ({sign}
          {formatPercent(dayChangePercent, 2)})
        </span>
        <span className="text-[11px] text-mist/80">today</span>
      </p>
    </div>
  );
}

function StatsBand({ quote, closes }: { quote: StockQuote; closes: number[] }) {
  const stats: Array<{ label: string; value: string; icon: typeof Landmark; accent?: boolean }> = [
    { label: "Market cap", value: formatCompactNumber(quote.market_cap), icon: Landmark },
    { label: "P/E", value: quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A", icon: Scale },
    {
      label: "Dividend yield",
      value: quote.dividend_yield > 0 ? formatPercent(quote.dividend_yield) : "None",
      icon: Coins,
      accent: quote.dividend_yield > 0,
    },
    { label: "Beta", value: quote.beta ? quote.beta.toFixed(2) : "N/A", icon: Activity },
    { label: "Next earnings", value: formatEarningsDate(quote.next_earnings_date), icon: CalendarClock },
  ];

  // 60/40: the figures on the open page, no box around them (the boxed
  // cells read as empty forms), each anchored by a small icon tile; the
  // price map in its own panel beside them.
  return (
    <div className="symbol-enter grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6" style={{ "--d": "120ms" } as React.CSSProperties}>
      {/* Even space around and between the figures: spread edge to edge
          they stood too far apart and touched the sides. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:flex lg:items-center lg:justify-evenly lg:gap-x-6 lg:px-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-snow-peak/[0.04] text-mist ring-1 ring-inset ring-wolf-border/50">
              <stat.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dt className="truncate text-[11.5px] text-mist">{stat.label}</dt>
              <dd
                className={cn(
                  "mt-0.5 whitespace-nowrap font-mono text-[16px] font-semibold tabular-nums leading-tight tracking-[-0.01em]",
                  stat.accent ? "text-sunset-orange" : "text-snow-peak"
                )}
              >
                {stat.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <RangeCell quote={quote} closes={closes} />
    </div>
  );
}

/** Price levels the 52-week range is cut into. */
const RANGE_BINS = 40;
const SESSIONS_PER_YEAR = 252;

/**
 * The 52-week range as a price map: across the range from low to high, how
 * many sessions closed at each level. Tall bars are prices the stock kept
 * coming back to (where buyers and sellers agreed for weeks), thin ones are
 * levels it only passed through. The bar holding today's price is lit, so
 * the reader sees at once whether the stock sits in familiar territory or
 * out on an edge it rarely visits, with the distances to both extremes.
 *
 * Built from the daily closes the price chart already loads (same query),
 * so it costs no request of its own. Until they arrive, the same frame
 * with an even floor, so nothing moves when the bars rise.
 */
function RangeCell({ quote, closes }: { quote: StockQuote; closes: number[] }) {
  const low = quote.fifty_two_week_low;
  const high = quote.fifty_two_week_high;
  const span = high - low;
  const position = span > 0 ? Math.min(Math.max((quote.price - low) / span, 0), 1) : 0.5;
  const current = Math.min(RANGE_BINS - 1, Math.floor(position * RANGE_BINS));

  const counts = new Array<number>(RANGE_BINS).fill(0);
  if (span > 0) {
    for (const close of closes) {
      const at = Math.floor(((close - low) / span) * RANGE_BINS);
      counts[Math.min(RANGE_BINS - 1, Math.max(0, at))] += 1;
    }
  }
  const peak = Math.max(...counts, 1);
  const hasMap = closes.length > 20;
  const fromHigh = high > 0 ? quote.price / high - 1 : null;
  const fromLow = low > 0 ? quote.price / low - 1 : null;
  const binWidth = span / RANGE_BINS;

  return (
    <div className="min-w-0 rounded-xl border border-wolf-border/50 bg-wolf-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[11px] text-mist/85">52-week price map</p>
        <p className="shrink-0 font-mono text-[11px] tabular-nums text-mist/85">{Math.round(position * 100)}% up the range</p>
      </div>

      {/* The bars mount when the closes arrive, so their rise is the
          arrival; until then a quiet placeholder of the same size. */}
      {!hasMap ? (
        <Skeleton className="mt-2 h-9 w-full rounded-md" />
      ) : (
        <div
          className="mt-2 flex h-9 items-end gap-px"
          role="img"
          aria-label={`Price ${formatCurrency(quote.price)}, ${Math.round(position * 100)}% of the way from the 52-week low to the high`}
        >
          {counts.map((count, i) => {
            const isNow = i === current;
            const from = low + binWidth * i;
            return (
              <span
                key={i}
                title={`${formatCurrency(from, { decimals: 0 })}-${formatCurrency(from + binWidth, { decimals: 0 })}: ${count} sessions`}
                className={cn(
                  "symbol-bar flex-1 origin-bottom rounded-t-[2px]",
                  isNow ? "bg-sunset-orange" : i < current ? "bg-snow-peak/22" : "bg-snow-peak/10"
                )}
                style={{ height: `${Math.max(8, (count / peak) * 100)}%`, "--i": i } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}

      {/* Each end with how far the price is from it. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-3 font-mono text-[11px] tabular-nums">
        <span className="text-mist">
          {formatCurrency(low, { decimals: 0 })}
          {fromLow != null ? <span className="ml-1.5 text-bullish/90">{`+${formatPercent(fromLow, 1)}`}</span> : null}
        </span>
        <span className="text-mist">
          {fromHigh != null ? (
            <span className={cn("mr-1.5", fromHigh >= -0.005 ? "text-sunset-orange" : "text-mist/90")}>
              {fromHigh >= -0.005 ? "at high" : formatPercent(fromHigh, 1)}
            </span>
          ) : null}
          {formatCurrency(high, { decimals: 0 })}
        </span>
      </div>
    </div>
  );
}

function MarketIndicesStrip({ indices, loading }: { indices: MarketIndexQuote[] | undefined; loading: boolean }) {
  if (!(indices && indices.length > 0)) {
    return loading ? <MarketIndicesStripSkeleton /> : null;
  }
  return (
    // On a phone only the moves: three prices would wrap to three lines.
    <div className="symbol-enter flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 sm:gap-x-8" style={{ "--d": "0ms" } as React.CSSProperties}>
      {indices.map((index) => {
        const up = index.change_percent >= 0;
        return (
          <div key={index.symbol} className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-mist/85">{index.label}</span>
            <span className="hidden font-mono text-[12px] tabular-nums text-snow-peak/90 sm:inline">
              {formatCurrency(index.price, { decimals: 2 })}
            </span>
            {/* The move is what the strip is for, so it gets a tinted chip
                and an arrow, not just a coloured number. */}
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ring-1 ring-inset",
                up ? "bg-bullish/12 text-bullish ring-bullish/25" : "bg-bearish/12 text-bearish ring-bearish/25"
              )}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatPercent(Math.abs(index.change_percent), 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatEarningsDate(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  // The value is a YYYY-MM-DD calendar date, parsed as UTC midnight. Format
  // it in UTC too, or a viewer west of Greenwich sees the day before, and
  // the server-rendered HTML would not match the client's.
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

// ---- Skeletons ----
// Each keeps the box of the block it stands in for, so nothing moves when
// the data lands.

function MarketIndicesStripSkeleton() {
  return (
    <div aria-hidden className="flex h-[22px] items-center justify-center gap-8">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} shape="line" className="h-3 w-40" />
      ))}
    </div>
  );
}

function PriceBlockSkeleton() {
  return (
    <div aria-hidden className="flex flex-col sm:items-end">
      <Skeleton shape="line" className="h-8 w-40 sm:h-[38px]" />
      <Skeleton shape="line" className="mt-2 h-[13px] w-36" />
    </div>
  );
}

function StatsBandSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div>
              <Skeleton shape="line" className="h-3 w-16" />
              <Skeleton shape="line" className="mt-1.5 h-[18px] w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-wolf-border/50 bg-wolf-surface px-4 py-3">
        <Skeleton shape="line" className="h-3 w-28" />
        <Skeleton className="mt-2 h-9 w-full rounded-md" />
        <Skeleton shape="line" className="mt-2 h-3 w-full" />
      </div>
    </div>
  );
}

export function StockHeaderSkeleton({
  marketIndices,
  marketIndicesLoading,
}: {
  marketIndices: MarketIndexQuote[] | undefined;
  marketIndicesLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <MarketIndicesStrip indices={marketIndices} loading={marketIndicesLoading} />
      <div aria-hidden className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl sm:h-14 sm:w-14" />
          <div className="min-w-0">
            <Skeleton shape="line" className="h-6 w-48 sm:h-7 sm:w-64" />
            <Skeleton shape="line" className="mt-2 h-3.5 w-56" />
          </div>
        </div>
        <div className="flex items-start gap-4">
          <PriceBlockSkeleton />
          <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
        </div>
      </div>
      <StatsBandSkeleton />
    </div>
  );
}
