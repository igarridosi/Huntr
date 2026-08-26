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
  isLoading: boolean;
}

export function StockHeader({
  profile,
  quote,
  marketIndices,
  isLoading,
}: StockHeaderProps) {
  if (!profile) {
    return <StockHeaderSkeleton />;
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
      {marketIndices && marketIndices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {marketIndices.map((index) => (
            <MarketIndexTile key={index.symbol} index={index} />
          ))}
        </div>
      )}

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
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-3xl font-bold font-mono font-tabular text-snow-peak/90 animate-pulse">
              Fetching live price...
            </p>
            <div className="mt-1 text-xs text-mist">
              Profile ready. Pulling quote and key metrics.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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

// ---- Skeleton ----
function StockHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-36" />
    </div>
  );
}
