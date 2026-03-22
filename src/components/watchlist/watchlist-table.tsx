"use client";

import Link from "next/link";
import {
  Trash2,
  Bell,
  BellRing,
  Coins,
  Activity,
  Rocket,
  PhoneCall,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  cn,
  formatCurrency,
  formatCompactNumber,
  formatPercent,
} from "@/lib/utils";
import type { WatchlistEntry, WatchlistView } from "@/types/watchlist";
import { TAG_COLORS } from "@/types/watchlist";

function deriveTags(entry: WatchlistEntry): string[] {
  if (entry.tags.length > 0) return entry.tags;

  const fallback: string[] = [];
  const quote = entry.quote;

  if (quote?.dividend_yield && quote.dividend_yield >= 0.025) {
    fallback.push("Dividend");
  }
  if (quote?.pe_ratio && quote.pe_ratio > 0 && quote.pe_ratio <= 18) {
    fallback.push("Value");
  }
  if (quote?.beta && quote.beta >= 1.3) {
    fallback.push("Volatile");
  }
  if (fallback.length === 0 && entry.profile?.sector) {
    fallback.push(entry.profile.sector);
  }

  return fallback.length > 0 ? fallback : ["Core"];
}

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

interface WatchlistTableProps {
  entries: WatchlistEntry[];
  view: WatchlistView;
  performanceData?: Record<string, Record<string, number>>;
  activeAlertsByTicker?: Record<string, number>;
  onConfigureAlert?: (ticker: string, currentPrice: number, targetPrice: number | null) => void;
  onSetTargetPrice?: (ticker: string, price: number | null) => void;
  onRemove: (ticker: string) => void;
  isRemoving: boolean;
}

function getMonthlyTrendMeta(monthChange: number) {
  if (monthChange >= 0.1) {
    return { Icon: Rocket, label: "Rocket", className: "text-emerald-400" };
  }
  if (monthChange >= 0.02) {
    return { Icon: TrendingUp, label: "Bull", className: "text-emerald-400" };
  }
  if (monthChange > -0.02) {
    return { Icon: Minus, label: "Neutral", className: "text-mist" };
  }
  if (monthChange > -0.1) {
    return { Icon: TrendingDown, label: "Bear", className: "text-bearish" };
  }
  return { Icon: TrendingDown, label: "Strong Bear", className: "text-bearish" };
}

export function WatchlistTable({
  entries,
  view,
  performanceData = {},
  activeAlertsByTicker = {},
  onConfigureAlert,
  onSetTargetPrice,
  onRemove,
  isRemoving,
}: WatchlistTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[220px]">Company</TableHead>
          <TableHead className="text-right">Price</TableHead>

          {view === "overview" && (
            <>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="hidden sm:table-cell">
                <span className="inline-flex items-center gap-1">
                  Trend
                  <span className="text-[8px] font-normal text-mist/80">(Last 30 days)</span>
                </span>
              </TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="text-center hidden lg:table-cell">Vol</TableHead>
              <TableHead className="text-center hidden lg:table-cell">Events</TableHead>
              <TableHead className="text-right hidden xl:table-cell">Target</TableHead>
              <TableHead className="text-right hidden xl:table-cell">52W Range</TableHead>
            </>
          )}

          {view === "performance" && (
            <>
              <TableHead className="text-right">1D</TableHead>
              <TableHead className="text-right hidden sm:table-cell">1W</TableHead>
              <TableHead className="text-right hidden md:table-cell">1M</TableHead>
              <TableHead className="text-right hidden lg:table-cell">YTD</TableHead>
              <TableHead className="text-right hidden lg:table-cell">Beta</TableHead>
            </>
          )}

          {view === "fundamental" && (
            <>
              <TableHead className="text-right">P/E</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Mkt Cap</TableHead>
              <TableHead className="text-right hidden md:table-cell">EPS</TableHead>
              <TableHead className="text-right hidden md:table-cell">Yield</TableHead>
              <TableHead className="text-right hidden lg:table-cell">52W Range</TableHead>
            </>
          )}

          {view === "dividends" && (
            <>
              <TableHead className="text-right">Yield</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Annual Div</TableHead>
              <TableHead className="text-right hidden md:table-cell">Payout Ratio</TableHead>
              <TableHead className="text-right hidden lg:table-cell">Ex-Div Date</TableHead>
            </>
          )}

          <TableHead className="w-[70px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <WatchlistRow
            key={entry.ticker}
            entry={entry}
            view={view}
            performanceData={performanceData}
            activeAlertCount={activeAlertsByTicker[entry.ticker] ?? 0}
            onConfigureAlert={onConfigureAlert}
            onSetTargetPrice={onSetTargetPrice}
            onRemove={onRemove}
            isRemoving={isRemoving}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function WatchlistRow({
  entry,
  view,
  performanceData,
  activeAlertCount,
  onConfigureAlert,
  onSetTargetPrice,
  onRemove,
  isRemoving,
}: {
  entry: WatchlistEntry;
  view: WatchlistView;
  performanceData: Record<string, Record<string, number>>;
  activeAlertCount: number;
  onConfigureAlert?: (ticker: string, currentPrice: number, targetPrice: number | null) => void;
  onSetTargetPrice?: (ticker: string, price: number | null) => void;
  onRemove: (ticker: string) => void;
  isRemoving: boolean;
}) {
  const { ticker, profile, quote } = entry;
  const dayChange = quote?.day_change_percent ?? 0;
  const isPositive = dayChange >= 0;

  const volumeRatio =
    quote && quote.avg_volume > 0 && (quote.current_volume ?? 0) > 0
      ? (quote.current_volume ?? 0) / quote.avg_volume
      : 0;

  const earningsSoon = (() => {
    if (!quote?.next_earnings_date) return false;
    const diff = new Date(quote.next_earnings_date).getTime() - Date.now();
    return diff > 0 && diff < 14 * 24 * 60 * 60 * 1000;
  })();

  const rangePercent =
    quote && quote.fifty_two_week_high !== quote.fifty_two_week_low
      ? ((quote.price - quote.fifty_two_week_low) /
          (quote.fifty_two_week_high - quote.fifty_two_week_low)) *
        100
      : 50;

  const eps = quote && quote.pe_ratio > 0 ? quote.price / quote.pe_ratio : null;
  const annualDiv = quote && quote.dividend_yield > 0 ? quote.price * quote.dividend_yield : null;
  const payoutRatio = quote && quote.payout_ratio && quote.payout_ratio > 0 ? quote.payout_ratio : null;

  const perf1D = performanceData["1D"]?.[ticker] ?? dayChange;
  const perf1W = performanceData["1W"]?.[ticker] ?? 0;
  const perf1M = performanceData["1M"]?.[ticker] ?? 0;
  const perfYTD = performanceData["YTD"]?.[ticker] ?? 0;
  const trendMeta = getMonthlyTrendMeta(perf1M);
  const TrendIcon: LucideIcon = trendMeta.Icon;
  const displayTags = deriveTags(entry);

  const selectedEvent = (() => {
    const earningsDate = quote?.next_earnings_date
      ? new Date(`${quote.next_earnings_date}T00:00:00Z`)
      : null;
    const exDivDate = quote?.ex_dividend_date
      ? new Date(`${quote.ex_dividend_date}T00:00:00Z`)
      : null;

    const now = Date.now();
    const upcoming = [
      earningsDate && !Number.isNaN(earningsDate.getTime()) && earningsDate.getTime() >= now
        ? { type: "earnings" as const, date: earningsDate }
        : null,
      exDivDate && !Number.isNaN(exDivDate.getTime()) && exDivDate.getTime() >= now
        ? { type: "ex-div" as const, date: exDivDate }
        : null,
    ].filter((v): v is { type: "earnings" | "ex-div"; date: Date } => v !== null);

    if (upcoming.length > 0) {
      return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    }

    if (earningsDate && !Number.isNaN(earningsDate.getTime())) {
      return { type: "earnings" as const, date: earningsDate };
    }
    if (exDivDate && !Number.isNaN(exDivDate.getTime())) {
      return { type: "ex-div" as const, date: exDivDate };
    }

    return null;
  })();

  return (
    <TableRow className="group">
      <TableCell>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={ROUTES.SYMBOL(ticker)}
            className="flex min-w-0 items-center gap-3 hover:text-sunset-orange transition-colors"
          >
            <TickerLogo
              ticker={ticker}
              src={profile?.logo_url}
              className="w-9 h-9"
              imageClassName="rounded-[6px]"
              fallbackClassName="rounded-[6px] text-[10px]"
            />
            <div className="min-w-0">
              <p className="font-bold text-sm font-mono">{ticker}</p>
              <p className="text-xs text-mist truncate max-w-[130px]">{profile?.name ?? ticker}</p>
            </div>
          </Link>
          {quote ? (
            <button
              type="button"
              onClick={() => onConfigureAlert?.(ticker, quote.price, entry.target_price)}
              className="shrink-0 rounded-md border border-wolf-border/40 p-1 text-mist transition-colors hover:text-sunset-orange cursor-pointer"
              title={activeAlertCount > 0 ? `Alerts (${activeAlertCount})` : "Create price alert"}
              aria-label={`Configure alerts for ${ticker}`}
            >
              {activeAlertCount > 0 ? <BellRing className="h-3.5 w-3.5 text-sunset-orange" /> : <Bell className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="text-right">
        <p className="font-mono font-tabular text-sm font-medium text-snow-peak">
          {quote ? formatCurrency(quote.price) : "—"}
        </p>
        {view !== "overview" && quote && (
          <p className={`text-[10px] font-mono ${isPositive ? "text-emerald-400" : "text-bearish"}`}>
            {isPositive ? "+" : ""}
            {formatPercent(dayChange, 2)}
          </p>
        )}
      </TableCell>

      {view === "overview" && (
        <>
          <TableCell className="text-right">
            {quote ? (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold ${
                  isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-bearish bg-bearish/10"
                }`}
              >
                {isPositive ? "+" : ""}
                {formatPercent(dayChange, 2)}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${trendMeta.className}`}
              title={`30-day trend (${formatPercent(perf1M, 2)}): ${trendMeta.label}`}
            >
              <TrendIcon className="h-4 w-4" />
              <span className="hidden lg:inline">{trendMeta.label}</span>
            </span>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <div className="flex flex-wrap gap-1">
              {displayTags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${
                    TAG_COLORS[tag] ?? "bg-wolf-surface text-mist border-wolf-border"
                  }`}
                >
                  {tag}
                </span>
              ))}
              {displayTags.length > 2 && <span className="text-xs text-mist">+{displayTags.length - 2}</span>}
            </div>
          </TableCell>
          <TableCell className="text-center hidden lg:table-cell">
            {volumeRatio > 0 ? (
              <span
                className="text-xs font-mono text-mist inline-flex items-center gap-1"
                title={`Relative volume ${volumeRatio.toFixed(2)}x (current / avg daily)`}
              >
                {volumeRatio >= 1.5 ? <Activity className="h-3.5 w-3.5 text-golden-hour" /> : null}
                {volumeRatio.toFixed(1)}x
              </span>
            ) : (
              <span className="text-xs text-mist/60">—</span>
            )}
          </TableCell>
          <TableCell className="text-center hidden lg:table-cell">
            {selectedEvent ? (
              <span className={`inline-flex items-center gap-1 text-xs ${earningsSoon ? "text-emerald-400 font-semibold" : "text-mist"}`}>
                {selectedEvent.type === "earnings" ? <PhoneCall className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                {selectedEvent.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            ) : (
              <span className="text-xs text-mist/60">—</span>
            )}
          </TableCell>
          <TableCell className="text-right hidden xl:table-cell text-xs font-mono">
            {entry.target_price != null ? (
              <button
                type="button"
                onClick={() => onSetTargetPrice?.(ticker, null)}
                className="text-mist hover:text-snow-peak cursor-pointer"
                title="Clear target"
              >
                {formatCurrency(entry.target_price, { decimals: 2 })}
                {quote?.price
                  ? ` (${formatPercent((quote.price - entry.target_price) / entry.target_price, 1)})`
                  : ""}
              </button>
            ) : quote ? (
              <button
                type="button"
                onClick={() => onConfigureAlert?.(ticker, quote.price, entry.target_price)}
                className="text-mist/70 hover:text-snow-peak cursor-pointer"
              >
                Set
              </button>
            ) : (
              <span className="text-mist/50">—</span>
            )}
          </TableCell>
          <TableCell className="text-right hidden xl:table-cell">
            {quote ? (
              <Range52W
                low={quote.fifty_two_week_low}
                high={quote.fifty_two_week_high}
                percent={rangePercent}
              />
            ) : (
              "—"
            )}
          </TableCell>
        </>
      )}

      {view === "performance" && (
        <>
          <PerfCell value={perf1D} />
          <PerfCell value={perf1W} className="hidden sm:table-cell" />
          <PerfCell value={perf1M} className="hidden md:table-cell" />
          <PerfCell value={perfYTD} className="hidden lg:table-cell" />
          <TableCell className="text-right hidden lg:table-cell text-sm font-mono font-tabular text-mist">
            {quote ? quote.beta.toFixed(2) : "—"}
          </TableCell>
        </>
      )}

      {view === "fundamental" && (
        <>
          <TableCell className="text-right text-sm font-mono font-tabular">
            {quote ? (
              <span className={quote.pe_ratio > 40 ? "text-golden-hour" : quote.pe_ratio > 0 ? "text-snow-peak" : "text-mist"}>
                {quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A"}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="text-right hidden sm:table-cell text-sm text-mist font-mono font-tabular">
            {quote ? formatCompactNumber(quote.market_cap) : "—"}
          </TableCell>
          <TableCell className="text-right hidden md:table-cell text-sm font-mono font-tabular text-snow-peak">
            {eps !== null ? `$${eps.toFixed(2)}` : "—"}
          </TableCell>
          <TableCell className="text-right hidden md:table-cell text-sm font-mono font-tabular text-snow-peak">
            {quote && quote.dividend_yield > 0 ? formatPercent(quote.dividend_yield) : <span className="text-mist/50">—</span>}
          </TableCell>
          <TableCell className="text-right hidden lg:table-cell">
            {quote ? (
              <Range52W
                low={quote.fifty_two_week_low}
                high={quote.fifty_two_week_high}
                percent={rangePercent}
              />
            ) : (
              "—"
            )}
          </TableCell>
        </>
      )}

      {view === "dividends" && (
        <>
          <TableCell className="text-right text-sm font-mono font-tabular">
            {quote && quote.dividend_yield > 0 ? (
              <span className="text-snow-peak font-semibold">{formatPercent(quote.dividend_yield)}</span>
            ) : (
              <span className="text-mist/50">—</span>
            )}
          </TableCell>
          <TableCell className="text-right hidden sm:table-cell text-sm font-mono font-tabular text-snow-peak">
            {annualDiv ? formatCurrency(annualDiv) : "—"}
          </TableCell>
          <TableCell className="text-right hidden md:table-cell text-sm text-mist">
            {payoutRatio != null ? (
              <span className="font-mono text-xs text-snow-peak">{formatPercent(payoutRatio, 1)}</span>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="text-right hidden lg:table-cell">
            {quote?.ex_dividend_date ? (
              <span className="inline-flex items-center gap-1 font-mono text-xs text-mist">
                <Coins className="h-3 w-3" />
                {new Date(`${quote.ex_dividend_date}T00:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
        </>
      )}

      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-mist hover:text-bearish"
            onClick={() => onRemove(ticker)}
            disabled={isRemoving}
            aria-label={`Remove ${ticker}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PerfCell({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const isPos = value >= 0;
  return (
    <TableCell className={`text-right text-sm font-mono font-tabular ${className}`}>
      <span className={isPos ? "text-emerald-400" : "text-bearish"}>
        {isPos ? "+" : ""}
        {formatPercent(value, 2)}
      </span>
    </TableCell>
  );
}

function Range52W({
  low,
  high,
  percent,
}: {
  low: number;
  high: number;
  percent: number;
}) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="text-[10px] text-mist font-mono">{formatCurrency(low, { decimals: 0 })}</span>
      <div className="relative w-14 h-1.5 bg-wolf-border rounded-full overflow-hidden">
        <div
          className={cn(
            "absolute left-0 top-0 h-full bg-sunset-orange/60 rounded-full",
            getRangeWidthClass(percent)
          )}
        />
      </div>
      <span className="text-[10px] text-mist font-mono">{formatCurrency(high, { decimals: 0 })}</span>
    </div>
  );
}

export function WatchlistTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
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
