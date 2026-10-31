"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarClock, Map as MapIcon, Maximize2, X } from "lucide-react";
import { SelectMenu } from "@/components/ui/select-menu";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { SectionHeader } from "@/components/insights/section-header";
import { useStoredChoice } from "@/components/insights/use-stored-choice";
import { TrendMark } from "@/components/watchlist/board/idea-list";
import { eventText, GapBar, money, signedPct, STANCE_LABEL, STANCE_TEXT } from "@/components/watchlist/board/idea-bits";
import { useIdeas, type Idea } from "@/components/watchlist/board/use-ideas";
import { useScenarioChoices } from "@/components/watchlist/board/use-scenario-choice";
import { useDCFScenarios } from "@/hooks/use-dcf-scenarios";
import { useHydrated } from "@/hooks/use-hydrated";
import { useBatchDailyHistory, useBatchPeriodPerformance } from "@/hooks/use-stock-data";
import { useListEntries, useWatchlistStore } from "@/hooks/use-watchlist";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  GLANCE_ORDER,
  GLANCE_SORTS,
  offHigh as offHighOf,
  sortGlance,
  volumeRatio,
  type GlanceFigures,
  type GlanceSort,
} from "@/lib/watchlist/glance";
import { daysUntil, summarize } from "@/lib/watchlist/ideas";
import type { PriceAlert, WatchlistList } from "@/types/watchlist";

export interface WatchlistLens {
  lists: readonly WatchlistList[];
  activeListId: string;
  alerts: readonly PriceAlert[];
}

const SORT_GROUPS = [
  {
    label: "Today",
    options: [
      { value: "day-up" as const, label: "Top gainers today" },
      { value: "day-down" as const, label: "Top losers today" },
      { value: "volume" as const, label: "Heaviest volume today", keywords: "unusual activity" },
    ],
  },
  {
    label: "Trend",
    options: [
      { value: "month-up" as const, label: "Strongest 30 days", keywords: "momentum month" },
      { value: "month-down" as const, label: "Weakest 30 days", keywords: "momentum month" },
      { value: "ytd-up" as const, label: "Best year to date", keywords: "ytd" },
      { value: "ytd-down" as const, label: "Worst year to date", keywords: "ytd" },
    ],
  },
  {
    label: "Calendar",
    options: [{ value: "earnings" as const, label: "Next earnings report", keywords: "quarterly results" }],
  },
  {
    label: "Value",
    options: [
      { value: "closest" as const, label: "Closest to a buy", keywords: "fair value dcf target" },
      { value: "off-high" as const, label: "Furthest below 52-week high", keywords: "dip pullback drawdown" },
    ],
  },
];

/** What the list is ordered by, in a line under it. */
const SORT_NOTE: Record<GlanceSort, string> = {
  "day-up": "Today's biggest gainers first.",
  "day-down": "Today's biggest losers first.",
  volume: "Trading most heavily against its average first: a move with conviction behind it.",
  "month-up": "Strongest over the last 30 days first.",
  "month-down": "Weakest over the last 30 days first.",
  "ytd-up": "Best since the start of the year first.",
  "ytd-down": "Worst since the start of the year first.",
  earnings: "Reporting soonest first.",
  closest: "Furthest below your buy price first; companies without one last.",
  "off-high": "Furthest below their 52-week high first.",
};

/**
 * The fourth column shows whatever the list is ordered by, when the other
 * columns do not already: the last five days for today's and the month's
 * orders, the ordering figure for the rest.
 */
type Context = "week" | "ytd" | "volume" | "earnings" | "gap" | "offHigh";
const CONTEXT: Record<GlanceSort, Context> = {
  "day-up": "week",
  "day-down": "week",
  volume: "volume",
  "month-up": "week",
  "month-down": "week",
  "ytd-up": "ytd",
  "ytd-down": "ytd",
  earnings: "earnings",
  closest: "gap",
  "off-high": "offHigh",
};
const CONTEXT_LABEL: Record<Context, string> = {
  week: "5 days",
  ytd: "YTD",
  volume: "Volume",
  earnings: "Earnings",
  gap: "To buy",
  offHigh: "From high",
};
const NO_IDEAS: Idea[] = [];
const NO_ROWS: Row[] = [];
/** Enough placeholder rows to fill the tallest card. */
const PLACEHOLDER_ROWS = 12;

/** A row: the company, its moves, and the extra columns of the full view. */
interface Row {
  idea: Idea;
  week: number | null;
  ytd: number | null;
  /** Daily closes over the last month, oldest first. */
  closes: number[] | null;
  /** What the list can be ordered by. */
  figures: GlanceFigures;
}

const figuresOf = (row: Row) => row.figures;

/**
 * The Hunting Ground's third view: one of the reader's watchlists, read for
 * how each company has been trading lately: today's move, the last five days
 * and the 30-day trend, biggest moves first. Expanded, the same companies
 * with where they sit in their 52-week range, the year so far, how heavily
 * they trade today and how far each is from a buy. Which list is remembered
 * in this browser; the quotes are the Watchlists page's own cache.
 *
 * `viewTabs` are the card's view switch, so the header keeps its place
 * whichever view is on.
 */
export function WatchlistPane({ lists, activeListId, alerts, viewTabs }: WatchlistLens & { viewTabs: ReactNode }) {
  const hydrated = useHydrated();
  const { isPending } = useWatchlistStore();
  const listIds = useMemo(() => lists.map((l) => l.id), [lists]);
  const fallback = listIds.includes(activeListId) ? activeListId : (listIds[0] ?? "");
  const [chosen, choose] = useStoredChoice<string>("huntr:insights-watchlist", listIds, fallback);
  const list = lists.find((l) => l.id === chosen) ?? lists[0];
  const [sort, setSort] = useStoredChoice<GlanceSort>("huntr:insights-watchlist-order", GLANCE_SORTS, "day-up");
  // The day the page opened: reports count from it.
  const [now] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => list?.items ?? [], [list]);
  const tickers = useMemo(() => items.map((i) => i.ticker.toUpperCase()), [items]);
  const entries = useListEntries(list);
  const { data: week, isPending: weekPending } = useBatchPeriodPerformance(tickers, "1W");
  const { data: monthly, isPending: monthPending } = useBatchPeriodPerformance(tickers, "1M");
  const { data: history, isPending: historyPending } = useBatchDailyHistory(tickers, "1M");
  const { data: ytd, isPending: ytdPending } = useBatchPeriodPerformance(tickers, "YTD");
  const { savedScenarios } = useDCFScenarios();
  const [choices] = useScenarioChoices();

  const ideas = useIdeas({
    items,
    entries: entries.data,
    saved: savedScenarios,
    metrics: undefined,
    signals: undefined,
    monthly,
    alerts,
    choices,
  });
  const rows = useMemo(
    () =>
      (hydrated ? ideas : NO_IDEAS).map((idea) => {
        const q = idea.quote;
        const ytdMove = ytd?.[idea.ticker] ?? null;
        return {
          idea,
          week: week?.[idea.ticker] ?? null,
          ytd: ytdMove,
          closes: history?.[idea.ticker]?.map((p) => p.close).filter((c) => c > 0) ?? null,
          figures: {
            change: idea.change,
            month: idea.month,
            ytd: ytdMove,
            volume: volumeRatio(q?.current_volume, q?.avg_volume),
            earningsDays: daysUntil(q?.next_earnings_date, now),
            gap: idea.gap,
            offHigh: offHighOf(idea.price, q?.fifty_two_week_high),
          },
        };
      }),
    [hydrated, ideas, week, ytd, history, now]
  );
  const sorted = useMemo(() => sortGlance(rows, sort, figuresOf), [rows, sort]);

  const summary = useMemo(() => summarize(ideas), [ideas]);
  const up = ideas.filter((i) => (i.change ?? 0) > 0).length;
  const down = ideas.filter((i) => (i.change ?? 0) < 0).length;
  // Until the list itself is known there is nothing to show but its shape;
  // once it is, the companies are on screen and only their figures wait.
  const listLoading = !hydrated || isPending;
  const pending = { week: weekPending, month: monthPending || historyPending, ytd: ytdPending };

  const subtitle = listLoading || (items.length > 0 && entries.isPending)
    ? "Your watchlist, lately"
    : items.length === 0
      ? `${list?.name ?? "Your watchlist"} has no companies yet`
      : [
          list?.name,
          `${up} up, ${down} down today`,
          summary.inBuyZone > 0 ? `${summary.inBuyZone} in the buy zone` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const listOptions = useMemo(
    () => [{ label: "Your watchlists", options: lists.map((l) => ({ value: l.id, label: l.name })) }],
    [lists]
  );
  const listSelect =
    hydrated && lists.length > 1 ? (
      <SelectMenu groups={listOptions} value={list?.id ?? ""} onChange={choose} ariaLabel="Watchlist shown" className="w-40" />
    ) : null;
  const sortSelect = (
    <SelectMenu groups={SORT_GROUPS} value={sort} onChange={setSort} ariaLabel="Order the list by" className="w-56" />
  );

  return (
    <>
      <SectionHeader icon={MapIcon} title="The Hunting Ground" subtitle={subtitle}>
        {viewTabs}
        {hydrated && items.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Open the full watchlist"
            title="Open the full watchlist"
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak sm:flex"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </SectionHeader>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {listSelect ?? <span />}
        {sortSelect}
      </div>

      {listLoading ? (
        <GlanceList rows={NO_ROWS} sort={sort} pending={pending} placeholder />
      ) : items.length === 0 ? (
        <p className="mt-6 text-[13px] text-mist">
          Add companies on the{" "}
          <Link href={ROUTES.APP_WATCHLISTS} className="font-medium text-sunset-orange hover:underline">
            Watchlists page
          </Link>{" "}
          to follow them here.
        </p>
      ) : (
        <GlanceList rows={sorted} sort={sort} pending={pending} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-mist">
        <span>{SORT_NOTE[sort]}</span>
        <Link href={ROUTES.APP_WATCHLISTS} className="ml-auto inline-flex items-center gap-1 font-medium transition-colors duration-150 hover:text-snow-peak">
          Watchlists <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {expanded && list ? (
        <ExpandedWatchlist
          title={list.name}
          subtitle={subtitle}
          rows={sorted}
          sortedBy={GLANCE_ORDER[sort].figure}
          controls={
            <>
              {listSelect}
              {sortSelect}
            </>
          }
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

// ── At a glance ────────────────────────────────────────────────────────────

const GLANCE_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,0.8fr)_minmax(0,0.55fr)_minmax(0,2.1fr)]";

/**
 * Today's move, the last five days and the 30-day trend, a row each. While
 * the list itself loads, its rows are drawn in outline; once it is known,
 * each company is on screen at once and only the figures still on their way
 * shimmer, in the shape they will take.
 */
function GlanceList({
  rows,
  sort,
  pending,
  placeholder = false,
}: {
  rows: readonly Row[];
  sort: GlanceSort;
  pending: { week: boolean; month: boolean; ytd: boolean };
  placeholder?: boolean;
}) {
  const { ref, edges, onScroll } = useScrollEdges<HTMLUListElement>(rows.length);
  const context = CONTEXT[sort];
  const figure = GLANCE_ORDER[sort].figure;
  // The ordering column's heading is lit, so the order explains itself.
  const lit = (on: boolean) => (on ? "text-sunset-orange" : undefined);
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className={cn(GLANCE_GRID, "hidden px-3 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-mist/80 sm:grid")} aria-hidden>
        <span>Company</span>
        <span className="text-right">Price</span>
        <span className={cn("text-right", lit(figure === "change"))}>Today</span>
        <span className={cn("text-right", lit(context !== "week"))}>{CONTEXT_LABEL[context]}</span>
        <span className={cn("pl-3", lit(figure === "month"))}>30 days</span>
      </div>
      {/* As tall as the card, whatever sets its height: the list is laid
          out over this box rather than in it, so a long list scrolls inside
          the card instead of stretching it (and the row beside it). */}
      <div className="relative min-h-[20rem] flex-1">
        <ul
          ref={ref}
          onScroll={onScroll}
          aria-busy={placeholder || undefined}
          className={cn(
            "scroll-quiet absolute -inset-x-1 inset-y-0 space-y-1 px-1",
            placeholder ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          {placeholder
            ? Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => <PlaceholderRow key={i} index={i} />)
            : null}
          {rows.map((row, i) => {
            const { idea, closes } = row;
            return (
              <li key={idea.ticker}>
                <Link
                  href={ROUTES.SYMBOL(idea.ticker)}
                  className={cn(
                    GLANCE_GRID,
                    "rounded-xl px-3 py-2.5 ring-1 ring-inset ring-transparent transition-colors duration-150 hover:bg-snow-peak/[0.035] hover:ring-wolf-border/50 focus-visible:outline-none focus-visible:ring-sunset-orange/60"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <TickerLogo ticker={idea.ticker} src={idea.logo} className="h-8 w-8 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight text-snow-peak">{idea.ticker}</span>
                      {idea.pending ? (
                        <Bone className="mt-1 h-2.5 w-20" delay={i * 90} />
                      ) : (
                        <span className="block truncate text-[11px] leading-snug text-mist">{idea.name}</span>
                      )}
                    </span>
                  </span>
                  <span className="hidden justify-end text-right font-mono text-[13px] tabular-nums text-snow-peak sm:flex">
                    {idea.pending ? <Bone className="h-3 w-14" delay={i * 90} /> : idea.price != null ? money(idea.price, idea.quote?.currency) : "—"}
                  </span>
                  <span className="flex justify-end">
                    {idea.pending ? <Bone className="h-[26px] w-[4.75rem] rounded-lg" delay={i * 90 + 40} /> : <DayChip change={idea.change} />}
                  </span>
                  <span className="hidden justify-end sm:flex">
                    <ContextCell row={row} context={context} pending={pending} delay={i * 90 + 80} />
                  </span>
                  <span className="col-span-2 mt-1.5 flex items-center gap-3 sm:col-span-1 sm:mt-0 sm:pl-3">
                    {pending.month ? (
                      <>
                        <Bone className="h-[3px] w-16" delay={i * 90 + 120} />
                        <Bone className="h-2.5 w-24" delay={i * 90 + 160} />
                      </>
                    ) : (
                      <>
                        <Sparkline closes={closes} />
                        <span className="whitespace-nowrap">
                          <TrendMark month={idea.month} />
                        </span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <EdgeFade side="top" shown={edges.top} />
        <EdgeFade side="bottom" shown={edges.bottom} />
      </div>
    </div>
  );
}

/**
 * Whether a scroller has more above or below what it shows. Measured on
 * scroll, on resize and when its rows change, a frame later so the new
 * layout is in.
 */
function useScrollEdges<T extends HTMLElement>(contentKey: number) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [onScroll, contentKey]);
  return { ref, edges, onScroll };
}

/**
 * A scroll edge: a narrow band where the rows soften into the card, only
 * there to say more of them wait beyond it. Gone once there is nothing more
 * that way.
 */
function EdgeFade({ side, shown }: { side: "top" | "bottom"; shown: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 transition-opacity duration-300 ease-[var(--ease-settle)] motion-reduce:transition-none",
        "backdrop-blur-[1.5px] [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
        side === "bottom"
          ? "bottom-0 h-7 bg-gradient-to-t from-wolf-surface/90 to-transparent [mask-image:linear-gradient(to_top,black,transparent)]"
          : "top-0 h-5 bg-gradient-to-b from-wolf-surface/80 to-transparent [mask-image:linear-gradient(to_bottom,black,transparent)]",
        shown ? "opacity-100" : "opacity-0"
      )}
    />
  );
}

/**
 * The last month's closes as a line, the path behind the 30-day figure: a
 * steady climb and a spike that faded read the same as a number, not here.
 * The dot is today.
 */
function Sparkline({ closes }: { closes: number[] | null }) {
  if (!closes || closes.length < 2) return <span className="hidden h-6 w-16 shrink-0 sm:block" />;
  const W = 64;
  const H = 24;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => [
    Math.round(((i / (closes.length - 1)) * (W - 4) + 2) * 100) / 100,
    Math.round((H - 3 - ((c - min) / span) * (H - 6)) * 100) / 100,
  ]);
  const rising = closes[closes.length - 1] >= closes[0];
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-6 w-16 shrink-0", rising ? "text-bullish" : "text-bearish")} aria-hidden>
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={lx} cy={ly} r={2} fill="currentColor" />
    </svg>
  );
}

/** Today's move, the one figure the eye should land on first. */
function DayChip({ change }: { change: number | null }) {
  if (change == null) return <span className="text-xs text-mist/60">—</span>;
  return (
    <span
      className={cn(
        "inline-block min-w-[4.75rem] rounded-lg px-2 py-1 text-center font-mono text-[13px] font-semibold tabular-nums",
        change > 0 ? "bg-bullish/12 text-bullish" : change < 0 ? "bg-bearish/12 text-bearish" : "bg-snow-peak/[0.05] text-mist"
      )}
    >
      {signedPct(change)}
    </span>
  );
}

/** The figure the list is ordered by, where the fixed columns do not show it. */
function ContextCell({
  row,
  context,
  pending,
  delay,
}: {
  row: Row;
  context: Context;
  pending: { week: boolean; ytd: boolean };
  delay: number;
}) {
  const { idea, figures } = row;
  const waiting =
    (context === "week" && pending.week) || (context === "ytd" && pending.ytd) || (context !== "week" && context !== "ytd" && idea.pending);
  if (waiting) return <Bone className="h-2.5 w-10" delay={delay} />;
  const muted = <span className="text-xs text-mist/60">—</span>;
  switch (context) {
    case "week":
      return <Move value={row.week} />;
    case "ytd":
      return <Move value={row.ytd} />;
    case "volume":
      return figures.volume != null ? <VolumeMark ratio={figures.volume} /> : muted;
    case "earnings": {
      const d = figures.earningsDays;
      if (d == null) return muted;
      return (
        <span className={cn("whitespace-nowrap text-[12px]", d <= 7 ? "font-medium text-golden-hour" : "text-mist")}>
          {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d}d`}
        </span>
      );
    }
    case "gap":
      return figures.gap != null ? (
        <span className={cn("font-mono text-[12px] tabular-nums", STANCE_TEXT[idea.stance])}>{signedPct(figures.gap, 0)}</span>
      ) : (
        muted
      );
    case "offHigh":
      return figures.offHigh != null ? (
        <span className="font-mono text-[12px] tabular-nums text-mist">
          {figures.offHigh >= -0.005 ? "High" : signedPct(figures.offHigh, 0)}
        </span>
      ) : (
        muted
      );
  }
}

/** Today's volume against its average; heavy days in the accent. */
function VolumeMark({ ratio }: { ratio: number }) {
  return (
    <span
      className={cn("font-mono text-[12px] tabular-nums", ratio >= 1.5 ? "font-semibold text-sunset-orange" : "text-mist")}
      title="Today's volume against its average"
    >
      {ratio.toFixed(1)}×
    </span>
  );
}

function Move({ value, decimals = 1 }: { value: number | null; decimals?: number }) {
  if (value == null) return <span className="text-xs text-mist/60">—</span>;
  return (
    <span className={cn("font-mono text-[12px] tabular-nums", value > 0 ? "text-bullish" : value < 0 ? "text-bearish" : "text-mist")}>
      {signedPct(value, decimals)}
    </span>
  );
}

/** A placeholder in the shape of what it stands for, with a sweep of light. */
function Bone({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <span
      aria-hidden
      className={cn("huntr-skeleton block rounded-full", className)}
      style={{ "--shimmer-delay": `${delay}ms` } as CSSProperties}
    />
  );
}

/** A row drawn in outline, in the list's own columns, before it is known. */
function PlaceholderRow({ index }: { index: number }) {
  const d = index * 90;
  return (
    <li aria-hidden className={cn(GLANCE_GRID, "px-3 py-2.5")}>
      <span className="flex items-center gap-2.5">
        <Bone className="h-8 w-8 shrink-0 rounded-lg" delay={d} />
        <span className="space-y-1.5">
          <Bone className="h-3 w-12" delay={d} />
          <Bone className="h-2.5 w-20" delay={d + 40} />
        </span>
      </span>
      <span className="hidden justify-end sm:flex">
        <Bone className="h-3 w-14" delay={d + 40} />
      </span>
      <span className="flex justify-end">
        <Bone className="h-[26px] w-[4.75rem] rounded-lg" delay={d + 80} />
      </span>
      <span className="hidden justify-end sm:flex">
        <Bone className="h-2.5 w-10" delay={d + 120} />
      </span>
      <span className="col-span-2 mt-1.5 flex items-center gap-3 sm:col-span-1 sm:mt-0 sm:pl-3">
        <Bone className="h-[3px] w-16" delay={d + 160} />
        <Bone className="h-2.5 w-24" delay={d + 200} />
      </span>
    </li>
  );
}

// ── The full view ──────────────────────────────────────────────────────────

const FULL_GRID =
  "md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.75fr)_minmax(0,0.6fr)_minmax(0,1.6fr)_minmax(0,0.6fr)_minmax(0,1.9fr)_minmax(0,0.55fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:items-center md:gap-x-4";

/**
 * Every company on the list, with what a glance leaves out: the year so far,
 * where the price sits between its 52-week low and high, today's volume
 * against its average (a heavy day says the move has conviction behind it),
 * the distance to the reader's buy price and the next date to watch.
 */
function ExpandedWatchlist({
  title,
  subtitle,
  rows,
  sortedBy,
  controls,
  onClose,
}: {
  title: string;
  subtitle: string;
  rows: readonly Row[];
  /** The figure the list is ordered by, whose heading is lit. */
  sortedBy: keyof GlanceFigures;
  controls: ReactNode;
  onClose: () => void;
}) {
  const lit = (figure: keyof GlanceFigures) => (sortedBy === figure ? "text-sunset-orange" : undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={`${title}, full view`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="hg-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(90rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 text-snow-peak backdrop:bg-transparent"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col rounded-2xl bg-wolf-surface p-4 shadow-2xl ring-1 ring-inset ring-wolf-border/70 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
              <MapIcon className="h-[18px] w-[18px] text-sunset-orange" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold leading-tight">{title}</p>
              <p className="truncate text-[11.5px] text-mist">{subtitle}</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {controls}
            <Link
              href={ROUTES.APP_WATCHLISTS}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak"
            >
              Watchlists <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close the full watchlist"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn(FULL_GRID, "mt-4 hidden px-4 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-mist/80")} aria-hidden>
          <span>Company</span>
          <span className="text-right">Price</span>
          <span className={cn("text-right", lit("change"))}>Today</span>
          <span className="text-right">5 days</span>
          <span className={cn("pl-3", lit("month"))}>30 days</span>
          <span className={cn("text-right", lit("ytd"))}>YTD</span>
          <span className={cn("pl-3", lit("offHigh"))}>52-week range</span>
          <span className={cn("text-right", lit("volume"))}>Volume</span>
          <span className={cn("pl-3", lit("gap"))}>To fair value</span>
          <span className={lit("earningsDays")}>Next</span>
        </div>

        <ul className="scroll-quiet -mx-1 mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 md:mt-0">
          {rows.map((row) => (
            <li key={row.idea.ticker}>
              <FullRow row={row} onOpen={() => router.push(ROUTES.SYMBOL(row.idea.ticker))} />
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}

function FullRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { idea, week, ytd } = row;
  const q = idea.quote;
  const currency = q?.currency;
  const volume = row.figures.volume;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        FULL_GRID,
        "grid w-full grid-cols-2 gap-y-2 rounded-xl bg-snow-peak/[0.02] px-4 py-3 text-left ring-1 ring-inset ring-wolf-border/30 transition-colors duration-150 hover:bg-snow-peak/[0.045] hover:ring-wolf-border/60 focus-visible:outline-none focus-visible:ring-sunset-orange/60"
      )}
    >
      <span className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
        <TickerLogo ticker={idea.ticker} src={idea.logo} className="h-8 w-8 shrink-0 rounded-lg" />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-snow-peak">{idea.ticker}</span>
          <span className="block truncate text-[11px] leading-snug text-mist">{idea.name}</span>
        </span>
      </span>
      <span className="text-right font-mono text-[13px] tabular-nums text-snow-peak">
        {idea.price != null ? money(idea.price, currency) : "—"}
      </span>
      <span className="text-right">
        <DayChip change={idea.change} />
      </span>
      <span className="text-right">
        <Move value={week} />
      </span>
      <span className="flex items-center gap-3 md:pl-3">
        <Sparkline closes={row.closes} />
        <span className="whitespace-nowrap"><TrendMark month={idea.month} /></span>
      </span>
      <span className="text-right">
        <Move value={ytd} />
      </span>
      <span className="md:pl-3">
        {q && q.fifty_two_week_high > 0 && q.fifty_two_week_low > 0 && idea.price != null ? (
          <RangeBar low={q.fifty_two_week_low} high={q.fifty_two_week_high} price={idea.price} currency={currency} />
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>
      <span className="text-right">
        {volume != null ? (
          <VolumeMark ratio={volume} />
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>
      <span className="min-w-0 md:pl-3">
        {idea.gap != null && idea.fair ? (
          <span className="block space-y-1">
            <span className="flex items-center justify-between gap-2 text-[11px]">
              <span className={cn("font-medium", STANCE_TEXT[idea.stance])}>{STANCE_LABEL[idea.stance]}</span>
              <span className="truncate font-mono tabular-nums text-mist">
                {signedPct(idea.gap, 0)} · {money(idea.fair.value, currency)}
              </span>
            </span>
            <GapBar gap={idea.gap} stance={idea.stance} />
          </span>
        ) : (
          <span className="text-[11px] text-mist/70">No fair value yet</span>
        )}
      </span>
      <span className="text-[11.5px] text-mist">
        {idea.event ? (
          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", idea.event.days <= 7 && "text-golden-hour")}>
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            {eventText(idea.event)}
          </span>
        ) : (
          <span className="text-mist/60">—</span>
        )}
      </span>
    </button>
  );
}

/** A range's end, to the dollar from $100 up: the bar is a sketch, not a quote. */
function rangeEnd(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
      minimumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return value.toFixed(value >= 100 ? 0 : 2);
  }
}

/**
 * Where the price sits between its 52-week low and high, drawn like the
 * product's other measures (the quality bars): a soft track, filled in the
 * accent from the low up to the price, with a short tick at the price. Each
 * end is named under it, and how far the price is below the high beside it.
 */
function RangeBar({ low, high, price, currency }: { low: number; high: number; price: number; currency?: string }) {
  const span = high - low;
  const at = span > 0 ? Math.min(1, Math.max(0, (price - low) / span)) : 1;
  const left = `${Math.round(at * 1000) / 10}%`;
  const off = offHighOf(price, high) ?? 0;
  return (
    <span className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="relative block h-2.5">
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-snow-peak/[0.08]">
            <span className="block h-full rounded-full bg-sunset-orange/80" style={{ width: left }} />
          </span>
          <span
            className="absolute top-0 h-2.5 w-[3px] -translate-x-1/2 rounded-full bg-snow-peak ring-2 ring-wolf-surface"
            style={{ left }}
          />
        </span>
        <span className="mt-1 flex justify-between gap-2 font-mono text-[10px] tabular-nums text-mist/80">
          <span title="52-week low">{rangeEnd(low, currency)}</span>
          <span title="52-week high">{rangeEnd(high, currency)}</span>
        </span>
      </span>
      <span className="w-10 shrink-0 pt-px text-right font-mono text-[11px] tabular-nums text-mist">
        {off >= -0.005 ? "High" : signedPct(off, 0)}
      </span>
    </span>
  );
}
