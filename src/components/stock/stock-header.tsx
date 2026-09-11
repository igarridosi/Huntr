"use client";

import { Badge } from "@/components/ui/badge";
import { CompactLabel } from "@/components/ui/compact-label";
import { Skeleton } from "@/components/ui/skeleton";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { AddToWatchlist } from "@/components/watchlist/add-to-watchlist";
import {
  formatCurrency,
  formatCompactNumber,
  formatPercent,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { MarketIndexQuote, StockProfile, StockQuote } from "@/types/stock";

function getRangeWidthClass(percent: number): string {
  const clamped = Math.min(Math.max(percent, 2), 98);
  if (clamped < 10) return "w-[8%]";
  if (clamped < 20) return "w-[18%]";
  if (clamped < 30) return "w-[28%]";
  if (clamped < 40) return "w-[38%]";
  if (clamped < 50) return "w-[48%]";
  if (clamped < 60) return "w-[58%]";
  if (clamped < 70) return "w-[68%]";
  if (clamped < 80) return "w-[78%]";
  if (clamped < 90) return "w-[88%]";
  return "w-[98%]";
}

interface StockHeaderProps {
  profile: StockProfile | null | undefined;
  quote: StockQuote | null | undefined;
  marketIndices?: MarketIndexQuote[];
  /** Reserve the index tiles' space while they are still on their way. */
  marketIndicesLoading?: boolean;
  isLoading: boolean;
}

export function StockHeader({
  profile,
  quote,
  marketIndices,
  marketIndicesLoading = false,
  isLoading,
}: StockHeaderProps) {
  if (!profile) {
    return (
      <StockHeaderSkeleton
        marketIndices={marketIndices}
        marketIndicesLoading={marketIndicesLoading}
      />
    );
  }

  // 52W range position
  const rangePercent =
    quote && quote.fifty_two_week_high !== quote.fifty_two_week_low
      ? ((quote.price - quote.fifty_two_week_low) /
          (quote.fifty_two_week_high - quote.fifty_two_week_low)) *
        100
      : 50;

  const dayChange = quote?.day_change ?? 0;
  const dayChangePercent = quote?.day_change_percent ?? 0;
  const changeDirection = dayChange >= 0;
  // Semantic tokens rather than a hardcoded hex, so light mode maps correctly.
  const changeColor = changeDirection ? "text-bullish" : "text-bearish";
  const changeSign = changeDirection ? "+" : "";
  const earningsText = formatEarningsDate(quote?.next_earnings_date);

  return (
    <div className="space-y-4">
      <MarketIndicesRow indices={marketIndices} loading={marketIndicesLoading} />

      {/* Top Row: Logo + Name + Watchlist */}
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Logo */}
          <TickerLogo
            ticker={profile.ticker}
            src={profile.logo_url}
            className="h-11 w-11 shrink-0 sm:h-[60px] sm:w-[60px]"
            imageClassName="rounded-[8px]"
            fallbackClassName="rounded-[8px]"
          />

          {/* Name + ticker — min-w-0 lets the long company name shrink instead
              of shoving the watchlist button off the right edge */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <h1 className="truncate text-lg font-bold tracking-tight text-snow-peak sm:text-2xl">
                <CompactLabel text={profile.name} />
              </h1>
              <Badge variant="secondary" className="font-mono text-xs">
                {profile.exchange}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono font-bold text-sunset-orange">
                {profile.ticker}
              </span>
              <span className="text-xs text-mist">·</span>
              <span className="text-xs text-mist">{profile.sector}</span>
              <span className="text-xs text-mist">·</span>
              <span className="text-xs text-mist">{profile.industry}</span>
            </div>
          </div>
        </div>

        {/* Watchlist button */}
        <div className="shrink-0">
          <AddToWatchlist ticker={profile.ticker} />
        </div>
      </div>

      {/* Price Row */}
      {quote ? (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          {/* Price */}
          <div>
            {/* Display size, so the tracking tightens — letters read too far
                apart as they grow. */}
            <p className="font-mono text-[34px] font-bold tabular-nums leading-none tracking-[-0.02em] text-snow-peak">
              {formatCurrency(quote.price)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "font-mono text-[13px] font-semibold tabular-nums leading-none",
                  changeColor
                )}
              >
                {changeSign}
                {formatCurrency(dayChange, { decimals: 2 })} ({changeSign}
                {formatPercent(dayChangePercent, 2)})
              </span>
              <span className="text-[11px] uppercase tracking-[0.08em] text-mist/60">Today</span>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-mist/50">
              Next earnings
              <span className="ml-1.5 font-mono text-[11px] normal-case tracking-[0.02em] text-mist/80">
                {earningsText}
              </span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <QuickStat label="Market Cap" value={formatCompactNumber(quote.market_cap)} />
            <QuickStat
              label="P/E"
              value={quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A"}
            />
            <QuickStat
              label="Div Yield"
              value={
                quote.dividend_yield > 0
                  ? formatPercent(quote.dividend_yield)
                  : "—"
              }
              highlight={quote.dividend_yield > 0}
            />
            <QuickStat label="Beta" value={quote.beta.toFixed(2)} />
          </div>

          {/* 52W Range */}
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums text-mist/70">
              {formatCurrency(quote.fifty_two_week_low, { decimals: 0 })}
            </span>
            <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-wolf-border/60">
              <div
                className={cn(
                  "absolute left-0 top-0 h-full rounded-full bg-sunset-orange/70",
                  getRangeWidthClass(rangePercent)
                )}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-mist/70">
              {formatCurrency(quote.fifty_two_week_high, { decimals: 0 })}
            </span>
            <span className="ml-1 text-[10px] uppercase tracking-[0.09em] text-mist/45">52W</span>
          </div>
        </div>
      ) : isLoading ? (
        <PriceRowSkeleton />
      ) : null}
    </div>
  );
}

function MarketIndicesRow({
  indices,
  loading,
}: {
  indices: MarketIndexQuote[] | undefined;
  loading: boolean;
}) {
  if (indices && indices.length > 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {indices.map((index) => (
          <MarketIndexTile key={index.symbol} index={index} />
        ))}
      </div>
    );
  }
  return loading ? <MarketIndexTilesSkeleton /> : null;
}

function MarketIndexTile({ index }: { index: MarketIndexQuote }) {
  const isPositive = index.change_percent >= 0;
  const sign = isPositive ? "+" : "";

  return (
    // Raised reads lighter than the page, matching the Insights grid.
    <div className="insight-enter rounded-xl bg-snow-peak/[0.025] px-3 py-2.5 ring-1 ring-inset ring-wolf-border/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
          {index.label}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            isPositive ? "text-bullish" : "text-bearish"
          )}
        >
          {sign}
          {formatPercent(index.change_percent, 2)}
        </span>
      </div>
      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums leading-none text-snow-peak">
        {formatCurrency(index.price, { decimals: 2 })}
      </p>
    </div>
  );
}

function formatEarningsDate(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

// ---- Quick Stat ----
function QuickStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.09em] text-mist/60">{label}</span>
      <span
        className={cn(
          "font-mono text-[13px] font-semibold tabular-nums",
          highlight ? "text-sunset-orange" : "text-snow-peak"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---- Skeletons ----
// Each one keeps the wrapper classes of the block it stands in for, so the
// header is the same height before and after the data lands. The line
// heights are the rendered heights of the text they replace.

function MarketIndexTilesSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-snow-peak/[0.025] px-3 py-2.5 ring-1 ring-inset ring-wolf-border/40"
        >
          <div className="flex h-[15px] items-center justify-between gap-2">
            <Skeleton shape="line" className="h-2.5 w-14" />
            <Skeleton shape="line" className="h-2.5 w-10" />
          </div>
          <Skeleton shape="line" className="mt-1 h-[15px] w-20" />
        </div>
      ))}
    </div>
  );
}

function PriceRowSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <div>
        <Skeleton shape="line" className="h-[34px] w-36" />
        <Skeleton shape="line" className="mt-2 h-[13px] w-40" />
        <Skeleton shape="line" className="mt-2 h-5 w-44" />
      </div>
      {/* Each stat renders 18px tall; on a phone they wrap onto two rows. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="line" className="h-[18px] w-20" />
        ))}
      </div>
      <div className="ml-auto flex h-4 items-center gap-2">
        <Skeleton shape="line" className="h-4 w-8" />
        <Skeleton shape="line" className="h-1.5 w-24 rounded-full" />
        <Skeleton shape="line" className="h-4 w-8" />
        <Skeleton shape="line" className="ml-1 h-3 w-7" />
      </div>
    </div>
  );
}

function StockHeaderSkeleton({
  marketIndices,
  marketIndicesLoading,
}: {
  marketIndices: MarketIndexQuote[] | undefined;
  marketIndicesLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Real tiles when they are already cached, so the profile skeleton
          and the loaded header share the same top edge. */}
      <MarketIndicesRow indices={marketIndices} loading={marketIndicesLoading} />
      <div aria-hidden className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-[8px] sm:h-[60px] sm:w-[60px]" />
          <div className="min-w-0">
            <div className="flex h-7 items-center gap-2 sm:h-8 sm:gap-2.5">
              <Skeleton shape="line" className="h-5 w-40 sm:h-6 sm:w-56" />
              <Skeleton shape="badge" className="h-5 w-16" />
            </div>
            {/* Sector · industry wraps to a second line on a phone. */}
            <div className="mt-1 flex h-8 items-center gap-2 sm:h-4">
              <Skeleton shape="line" className="h-3.5 w-12" />
              <Skeleton shape="line" className="h-3 w-24" />
              <Skeleton shape="line" className="h-3 w-28" />
            </div>
          </div>
        </div>
        <Skeleton className="h-9 w-20 shrink-0 rounded-md sm:h-8" />
      </div>
      <PriceRowSkeleton />
    </div>
  );
}
