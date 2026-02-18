"use client";

import { Badge } from "@/components/ui/badge";
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
  if (isLoading || !profile) {
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
  const changeColor = changeDirection ? "text-sunset-orange" : "text-[#FF4242]";
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <TickerLogo
            ticker={profile.ticker}
            src={profile.logo_url}
            className="w-[60px] h-[60px]"
            imageClassName="rounded-[8px]"
            fallbackClassName="rounded-[8px]"
          />

          {/* Name + ticker */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-snow-peak">
                {profile.name}
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
        <AddToWatchlist ticker={profile.ticker} />
      </div>

      {/* Price Row */}
      {quote && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          {/* Price */}
          <div>
            <p className="text-3xl font-bold font-mono font-tabular text-snow-peak">
              {formatCurrency(quote.price)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "text-xs font-mono font-tabular font-semibold",
                  changeColor
                )}
              >
                {changeSign}
                {formatCurrency(dayChange, { decimals: 2 })} ({changeSign}
                {formatPercent(dayChangePercent, 2)})
              </span>
              <span className="text-xs text-mist">Today</span>
            </div>
            <div className="mt-0.5 text-xs text-mist">
              Next earnings: <span className="text-snow-peak">{earningsText}</span>
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
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-mist font-mono">
              {formatCurrency(quote.fifty_two_week_low, { decimals: 0 })}
            </span>
            <div className="relative w-20 h-1.5 bg-wolf-border rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-sunset-orange/60 rounded-full"
                style={{ width: `${Math.min(Math.max(rangePercent, 2), 98)}%` }}
              />
            </div>
            <span className="text-[10px] text-mist font-mono">
              {formatCurrency(quote.fifty_two_week_high, { decimals: 0 })}
            </span>
            <span className="text-[10px] text-mist/50 ml-1">52W</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketIndexTile({ index }: { index: MarketIndexQuote }) {
  const isPositive = index.change_percent >= 0;
  const sign = isPositive ? "+" : "";

  return (
    <div className="rounded-lg border border-wolf-border/60 bg-wolf-black/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-mist font-medium">
          {index.label}
        </span>
        <span
          className={cn(
            "text-[11px] font-mono font-semibold",
            isPositive ? "text-sunset-orange" : "text-[#FF4242]"
          )}
        >
          {sign}
          {formatPercent(index.change_percent, 2)}
        </span>
      </div>
      <p className="mt-1 text-sm font-mono font-tabular font-semibold text-snow-peak">
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
      <span className="text-xs text-mist">{label}</span>
      <span
        className={`font-mono font-medium text-xs font-tabular ${
          highlight ? "text-sunset-orange" : "text-snow-peak"
        }`}
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
