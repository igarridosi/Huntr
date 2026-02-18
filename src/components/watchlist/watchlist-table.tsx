"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants";
import {
  formatCurrency,
  formatCompactNumber,
  formatPercent,
} from "@/lib/utils";
import type { WatchlistEntry } from "@/hooks/use-watchlist";

interface WatchlistTableProps {
  entries: WatchlistEntry[];
  onRemove: (ticker: string) => void;
  isRemoving: boolean;
}

export function WatchlistTable({
  entries,
  onRemove,
  isRemoving,
}: WatchlistTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[200px]">Company</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right hidden sm:table-cell">
            Market Cap
          </TableHead>
          <TableHead className="text-right hidden md:table-cell">
            P/E
          </TableHead>
          <TableHead className="text-right hidden md:table-cell">
            Div Yield
          </TableHead>
          <TableHead className="text-right hidden lg:table-cell">
            52W Range
          </TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <WatchlistRow
            key={entry.ticker}
            entry={entry}
            onRemove={onRemove}
            isRemoving={isRemoving}
          />
        ))}
      </TableBody>
    </Table>
  );
}

// ---- Individual Row ----

function WatchlistRow({
  entry,
  onRemove,
  isRemoving,
}: {
  entry: WatchlistEntry;
  onRemove: (ticker: string) => void;
  isRemoving: boolean;
}) {
  const { ticker, profile, quote } = entry;

  // Calculate 52W range position
  const rangePercent =
    quote && quote.fifty_two_week_high !== quote.fifty_two_week_low
      ? ((quote.price - quote.fifty_two_week_low) /
          (quote.fifty_two_week_high - quote.fifty_two_week_low)) *
        100
      : 50;

  return (
    <TableRow className="group">
      {/* Company */}
      <TableCell>
        <Link
          href={ROUTES.SYMBOL(ticker)}
          className="flex items-center gap-3 hover:text-sunset-orange transition-colors"
        >
          <TickerLogo
            ticker={ticker}
            src={profile?.logo_url}
            className="w-11 h-11"
            imageClassName="rounded-[8px]"
            fallbackClassName="rounded-[8px] text-xs"
          />
          <div className="min-w-0">
            <p className="font-bold text-sm font-mono">{ticker}</p>
            <p className="text-xs text-mist truncate max-w-[140px]">
              {profile?.name ?? ticker}
            </p>
          </div>
        </Link>
      </TableCell>

      {/* Price */}
      <TableCell className="text-right font-mono font-tabular text-sm font-medium">
        {quote ? formatCurrency(quote.price) : "—"}
      </TableCell>

      {/* Market Cap */}
      <TableCell className="text-right hidden sm:table-cell text-sm text-mist font-mono font-tabular">
        {quote ? formatCompactNumber(quote.market_cap) : "—"}
      </TableCell>

      {/* P/E Ratio */}
      <TableCell className="text-right hidden md:table-cell text-sm font-mono font-tabular">
        {quote ? (
          <span
            className={
              quote.pe_ratio > 40
                ? "text-golden-hour"
                : quote.pe_ratio > 0
                  ? "text-snow-peak"
                  : "text-mist"
            }
          >
            {quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A"}
          </span>
        ) : (
          "—"
        )}
      </TableCell>

      {/* Dividend Yield */}
      <TableCell className="text-right hidden md:table-cell text-sm font-mono font-tabular">
        {quote ? (
          <span
            className={
              quote.dividend_yield > 0
                ? "text-sunset-orange"
                : "text-mist/50"
            }
          >
            {quote.dividend_yield > 0
              ? formatPercent(quote.dividend_yield)
              : "—"}
          </span>
        ) : (
          "—"
        )}
      </TableCell>

      {/* 52W Range */}
      <TableCell className="text-right hidden lg:table-cell">
        {quote ? (
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[10px] text-mist font-mono">
              {formatCurrency(quote.fifty_two_week_low, { decimals: 0 })}
            </span>
            <div className="relative w-16 h-1.5 bg-wolf-border rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-sunset-orange/60 rounded-full"
                style={{ width: `${Math.min(Math.max(rangePercent, 2), 98)}%` }}
              />
            </div>
            <span className="text-[10px] text-mist font-mono">
              {formatCurrency(quote.fifty_two_week_high, { decimals: 0 })}
            </span>
          </div>
        ) : (
          "—"
        )}
      </TableCell>

      {/* Remove */}
      <TableCell>
        <Button
          variant="ghost"
          size="icon-sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-mist hover:text-bearish"
          onClick={() => onRemove(ticker)}
          disabled={isRemoving}
          aria-label={`Remove ${ticker} from watchlist`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ---- Loading Skeleton ----

export function WatchlistTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16 hidden sm:block" />
          <Skeleton className="h-4 w-12 hidden md:block" />
        </div>
      ))}
    </div>
  );
}
