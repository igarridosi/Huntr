"use client";

import Link from "next/link";
import { memo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gem,
  Radar,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { CompactLabel } from "@/components/ui/compact-label";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatPercent } from "@/lib/utils";
import type { StockProfile, StockQuote } from "@/types/stock";

export type PerformanceWindow = "1D" | "1W" | "1M" | "YTD";
export type BreakoutMode = "near" | "break";

export type RadarRow = {
  quote: StockQuote;
  profile: StockProfile | undefined;
  dayChangePercent: number;
  periodChangePercent?: number;
  volumeRatio?: number;
  buybackPct?: number;
  breakoutPct?: number;
  peg?: number;
  epsGrowth?: number;
};

export interface RadarSignals {
  topGainers: RadarRow[];
  topLosers: RadarRow[];
  unusualVolume: RadarRow[];
  buybackLeaders: RadarRow[];
  breaking52WeekHigh: RadarRow[];
  valueGrowth: RadarRow[];
}

/** Same bands as the page's filter: Break ≤ 1% below the high, Near 1–3%. */
const BREAKOUT_BAND = 0.01;
const APPROACH_BAND = 0.03;
const SLOTS = 4;

const WINDOW_ITEMS = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "YTD", label: "YTD" },
] as const;

const BREAKOUT_ITEMS = [
  { key: "near", label: "Near" },
  { key: "break", label: "Break" },
] as const;

const WINDOW_PHRASE: Record<PerformanceWindow, string> = {
  "1D": "today",
  "1W": "over the past week",
  "1M": "over the past month",
  YTD: "year to date",
};

type Tone = "bull" | "bear" | "orange" | "gold" | "glacier" | "rose";

/**
 * Green and red are reserved for direction, so only the two momentum lists
 * use them. Each of the other four gets a hue of its own from the palette,
 * never shared, so a signal is recognisable by colour alone.
 */
const TONE: Record<Tone, { text: string; tile: string }> = {
  bull: { text: "text-bullish", tile: "bg-bullish/[0.1] ring-bullish/25 text-bullish" },
  bear: { text: "text-bearish", tile: "bg-bearish/[0.1] ring-bearish/25 text-bearish" },
  orange: { text: "text-sunset-orange", tile: "bg-sunset-orange/[0.1] ring-sunset-orange/25 text-sunset-orange" },
  gold: { text: "text-golden-hour", tile: "bg-golden-hour/[0.1] ring-golden-hour/25 text-golden-hour" },
  glacier: { text: "text-glacier", tile: "bg-glacier/[0.1] ring-glacier/25 text-glacier" },
  rose: { text: "text-dusk-rose", tile: "bg-dusk-rose/[0.1] ring-dusk-rose/25 text-dusk-rose" },
};

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${formatPercent(value, 2)}`;
}

export function OpportunityRadar({
  signals,
  performanceWindow,
  onPerformanceWindowChange,
  breakoutMode,
  onBreakoutModeChange,
  performanceLoading,
  buybackLoading,
}: {
  signals: RadarSignals;
  performanceWindow: PerformanceWindow;
  onPerformanceWindowChange: (window: PerformanceWindow) => void;
  breakoutMode: BreakoutMode;
  onBreakoutModeChange: (mode: BreakoutMode) => void;
  performanceLoading: boolean;
  buybackLoading: boolean;
}) {
  const updating = performanceLoading || buybackLoading;
  const phrase = WINDOW_PHRASE[performanceWindow];

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        {/* Header: what this is on the left, the one control that reshapes
            the momentum signals on the right, where the eye ends the line. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
              <Radar className="h-5 w-5 text-sunset-orange" />

            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.015em] text-snow-peak">
                Opportunity Radar
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-mist">
                {updating ? "Updating signals" : "Six signals"} across the largest caps
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {updating && <Spinner size="xs" color="mist" />}
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-mist/60 md:inline">
              Momentum
            </span>
            <SegmentedTabs
              items={WINDOW_ITEMS}
              value={performanceWindow}
              onChange={onPerformanceWindowChange}
              ariaLabel="Momentum window"
              size="sm"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SignalCard
            title="Top Gainers"
            description={`Strongest moves ${phrase}`}
            icon={TrendingUp}
            tone="bull"
            rows={signals.topGainers}
            value={(r) => r.periodChangePercent ?? 0}
            format={signedPercent}
            loading={performanceLoading}
          />
          <SignalCard
            title="52-Week High"
            description={breakoutMode === "break" ? "Testing their high right now" : "Closing in on their high"}
            icon={ArrowUpToLine}
            tone="orange"
            rows={signals.breaking52WeekHigh}
            loading={performanceLoading}
            value={(r) => Math.abs(r.breakoutPct ?? 0)}
            format={(v) => `${formatPercent(v, 2)} away`}
            info={`Distance to the 52-week high, as (Price / 52W High) − 1, among stocks up over the window. Break: within ${BREAKOUT_BAND * 100}% of the high. Near: ${BREAKOUT_BAND * 100}–${APPROACH_BAND * 100}% below. The 52-week high already includes today, so a price above it cannot show up in this data.`}
            action={
              <SegmentedTabs
                items={BREAKOUT_ITEMS}
                value={breakoutMode}
                onChange={onBreakoutModeChange}
                ariaLabel="52-week high mode"
                size="sm"
              />
            }
          />
          <SignalCard
            title="Value + Growth"
            description="Cheapest for the growth expected"
            icon={Gem}
            tone="gold"
            rows={signals.valueGrowth}
            value={(r) => r.peg ?? 0}
            format={(v) => `PEG ${v.toFixed(2)}`}
            info="Growth at a reasonable price. PEG = forward P/E ÷ expected EPS growth (next fiscal year's consensus EPS against trailing EPS), lowest first. Only profitable companies with a forward P/E of 5–25 and expected growth of 5–35%: above 35% it is usually a one-off charge in the trailing figure, not real growth. Under 1 is traditionally read as cheap for its growth."
          />
          <SignalCard
            title="Top Losers"
            description={`Steepest drops ${phrase}`}
            icon={TrendingDown}
            tone="bear"
            rows={signals.topLosers}
            value={(r) => r.periodChangePercent ?? 0}
            format={signedPercent}
            loading={performanceLoading}
          />
          <SignalCard
            title="Unusual Volume"
            description="Trading well above their usual pace"
            icon={Activity}
            tone="glacier"
            rows={signals.unusualVolume}
            value={(r) => r.volumeRatio ?? 0}
            format={(v) => `${v.toFixed(1)}×`}
            info="Today's volume against the average daily volume, between 2× and 20×. Above 20× is almost always a bad print. While the market is open, today's volume is still accumulating, so ratios grow through the session."
          />
          <SignalCard
            title="Buyback Leaders"
            description="Biggest cut in share count, last fiscal year"
            info="Fall in the diluted average share count from one fiscal year to the next. Companies with fewer than three years of filings are left out, since an IPO or a share-class conversion moves that count for reasons unrelated to buybacks; so are drops above 20%, which are data errors or restructurings."
            icon={Repeat}
            tone="rose"
            rows={signals.buybackLeaders}
            value={(r) => r.buybackPct ?? 0}
            format={(v) => formatPercent(v, 2)}
            loading={buybackLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const SignalCard = memo(function SignalCard({
  title,
  description,
  icon: Icon,
  tone,
  rows,
  value,
  format,
  loading = false,
  info,
  action,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  rows: RadarRow[];
  value: (row: RadarRow) => number;
  format: (value: number) => string;
  loading?: boolean;
  info?: string;
  action?: ReactNode;
}) {
  const t = TONE[tone];
  // Back to the first page whenever the list itself changes (a new window,
  // Near/Break), so a re-ranked list never opens on its second half.
  const [paging, setPaging] = useState({ rows, page: 0 });
  if (paging.rows !== rows) setPaging({ rows, page: 0 });
  const pageCount = Math.max(1, Math.ceil(rows.length / SLOTS));
  const page = Math.min(paging.page, pageCount - 1);
  const visible = rows.slice(page * SLOTS, page * SLOTS + SLOTS);
  const goTo = (next: number) => setPaging({ rows, page: next });

  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-2xl bg-snow-peak/[0.02] p-3.5 ring-1 ring-inset ring-wolf-border/40 transition-[box-shadow,background-color] duration-200 hover:bg-snow-peak/[0.03] hover:ring-wolf-border/60"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", t.tile)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-snow-peak">{title}</h3>
              {info && <InfoTip label={title} text={info} />}
            </div>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-mist/70">{description}</p>
          </div>
        </div>
        {action}
      </header>

      <ol className="mt-3 flex flex-1 flex-col gap-0.5">
        {loading ? (
          Array.from({ length: SLOTS }).map((_, i) => (
            <li key={i} className="flex items-center gap-2.5 px-2 py-2">
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-7 w-7 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <Skeleton className="h-3.5 w-14" />
            </li>
          ))
        ) : rows.length > 0 ? (
          visible.map((row, index) => {
            const v = value(row);
            const rank = page * SLOTS + index + 1;
            return (
              <li
                key={`${page}-${row.quote.ticker}`}
                className="insight-enter"
                style={{ "--enter-delay": `${index * 40}ms` } as CSSProperties}
              >
                <Link
                  href={ROUTES.SYMBOL(row.quote.ticker)}
                  className={cn(
                    "group/row flex items-center gap-2.5 rounded-lg px-2 py-2",
                    "transition-[background-color,transform] duration-150 ease-out",
                    "hover:bg-snow-peak/[0.05] active:scale-[0.985] active:bg-snow-peak/[0.07]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                    "motion-reduce:transition-none motion-reduce:active:scale-100"
                  )}
                >
                  <span className="w-3 shrink-0 text-center font-mono text-[10px] tabular-nums text-mist/40">
                    {rank}
                  </span>
                  <TickerLogo
                    ticker={row.quote.ticker}
                    src={row.profile?.logo_url}
                    className="h-7 w-7"
                    imageClassName="rounded-md"
                    fallbackClassName="rounded-md text-[9px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold leading-tight tracking-[-0.01em] text-snow-peak">
                      {row.quote.ticker}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] leading-tight text-mist/60">
                      <CompactLabel text={row.profile?.name ?? row.quote.ticker} />
                    </p>
                  </div>
                  <span className={cn("shrink-0 pl-1 text-right font-mono text-[12.5px] font-semibold tabular-nums", t.text)}>
                    {format(v)}
                  </span>
                </Link>
              </li>
            );
          })
        ) : (
          <li className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-wolf-border/50 px-4 py-6 text-center">
            <Icon className="h-4 w-4 text-mist/40" />
            <p className="text-[11.5px] text-mist/70">No stock clears this filter right now.</p>
          </li>
        )}
      </ol>

      {!loading && pageCount > 1 && (
        <footer className="mt-2 flex items-center justify-between border-t border-wolf-border/30 pt-2">
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-full transition-[width,background-color] duration-200",
                  i === page ? "w-4 bg-snow-peak/50" : "w-1.5 bg-snow-peak/15"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] tabular-nums text-mist/60">
              {page * SLOTS + 1}–{page * SLOTS + visible.length}
              <span className="text-mist/35"> of </span>
              {rows.length}
            </span>
            <PagerButton label={`Previous ${title}`} disabled={page === 0} onClick={() => goTo(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </PagerButton>
            <PagerButton label={`More ${title}`} disabled={page >= pageCount - 1} onClick={() => goTo(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </PagerButton>
          </div>
        </footer>
      )}
    </section>
  );
});
SignalCard.displayName = "SignalCard";

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-mist",
        "transition-[color,background-color,transform] duration-150 ease-out",
        "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-90",
        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
        "motion-reduce:transition-none motion-reduce:active:scale-100"
      )}
    >
      {children}
    </button>
  );
}

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      {/* Focusable, so the explanation is reachable by tap and by keyboard. */}
      <button
        type="button"
        aria-label={`About ${label}`}
        className="-m-1 inline-flex cursor-help items-center justify-center rounded p-1 text-mist/50 transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sunset-orange"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-6 z-20 w-64 rounded-lg bg-wolf-black/95 p-2.5 text-[11px] leading-relaxed text-mist opacity-0 shadow-xl ring-1 ring-inset ring-wolf-border/60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
