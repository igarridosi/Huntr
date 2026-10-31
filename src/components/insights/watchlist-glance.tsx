"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarClock, Map as MapIcon, Maximize2, X } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
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
import { summarize } from "@/lib/watchlist/ideas";
import type { PriceAlert, WatchlistList } from "@/types/watchlist";

export interface WatchlistLens {
  lists: readonly WatchlistList[];
  activeListId: string;
  alerts: readonly PriceAlert[];
}

type Sort = "today" | "week" | "month";
const SORTS: readonly Sort[] = ["today", "week", "month"];
const SORT_ITEMS = [
  { key: "today" as const, label: "Today" },
  { key: "week" as const, label: "5 days" },
  { key: "month" as const, label: "30 days" },
];
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
}

/** Biggest moves first, either way, over the chosen window. */
function byMove(rows: readonly Row[], sort: Sort): Row[] {
  const move = (r: Row) => (sort === "today" ? r.idea.change : sort === "week" ? r.week : r.idea.month);
  return [...rows].sort((a, b) => Math.abs(move(b) ?? 0) - Math.abs(move(a) ?? 0));
}

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
  const [sort, setSort] = useStoredChoice<Sort>("huntr:insights-watchlist-sort", SORTS, "today");
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => list?.items ?? [], [list]);
  const tickers = useMemo(() => items.map((i) => i.ticker.toUpperCase()), [items]);
  const entries = useListEntries(list);
  const { data: week, isPending: weekPending } = useBatchPeriodPerformance(tickers, "1W");
  const { data: monthly, isPending: monthPending } = useBatchPeriodPerformance(tickers, "1M");
  const { data: history, isPending: historyPending } = useBatchDailyHistory(tickers, "1M");
  // The year so far is a column of the full view only.
  const { data: ytd } = useBatchPeriodPerformance(tickers, "YTD", expanded);
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
      (hydrated ? ideas : NO_IDEAS).map((idea) => ({
        idea,
        week: week?.[idea.ticker] ?? null,
        ytd: ytd?.[idea.ticker] ?? null,
        closes: history?.[idea.ticker]?.map((p) => p.close).filter((c) => c > 0) ?? null,
      })),
    [hydrated, ideas, week, ytd, history]
  );
  const sorted = useMemo(() => byMove(rows, sort), [rows, sort]);

  const summary = useMemo(() => summarize(ideas), [ideas]);
  const up = ideas.filter((i) => (i.change ?? 0) > 0).length;
  const down = ideas.filter((i) => (i.change ?? 0) < 0).length;
  // Until the list itself is known there is nothing to show but its shape;
  // once it is, the companies are on screen and only their figures wait.
  const listLoading = !hydrated || isPending;
  const pending = { week: weekPending, month: monthPending || historyPending };

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
        <SegmentedTabs items={SORT_ITEMS} value={sort} onChange={setSort} ariaLabel="Biggest moves over" size="sm" />
      </div>

      {listLoading ? (
        <GlanceList rows={NO_ROWS} pending={pending} placeholder />
      ) : items.length === 0 ? (
        <p className="mt-6 text-[13px] text-mist">
          Add companies on the{" "}
          <Link href={ROUTES.APP_WATCHLISTS} className="font-medium text-sunset-orange hover:underline">
            Watchlists page
          </Link>{" "}
          to follow them here.
        </p>
      ) : (
        <GlanceList rows={sorted} pending={pending} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-mist">
        <span>Biggest moves first, either way. 30 days: the trend in a word.</span>
        <Link href={ROUTES.APP_WATCHLISTS} className="ml-auto inline-flex items-center gap-1 font-medium transition-colors duration-150 hover:text-snow-peak">
          Watchlists <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {expanded && list ? (
        <ExpandedWatchlist
          title={list.name}
          subtitle={subtitle}
          rows={sorted}
          controls={
            <>
              {listSelect}
              <SegmentedTabs items={SORT_ITEMS} value={sort} onChange={setSort} ariaLabel="Biggest moves over" size="sm" />
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
  pending,
  placeholder = false,
}: {
  rows: readonly Row[];
  pending: { week: boolean; month: boolean };
  placeholder?: boolean;
}) {
  const { ref, edges, onScroll } = useScrollEdges<HTMLUListElement>(rows.length);
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className={cn(GLANCE_GRID, "hidden px-3 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-mist/80 sm:grid")} aria-hidden>
        <span>Company</span>
        <span className="text-right">Price</span>
        <span className="text-right">Today</span>
        <span className="text-right">5 days</span>
        <span className="pl-3">30 days</span>
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
          {rows.map(({ idea, week, closes }, i) => (
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
                  {pending.week ? <Bone className="h-2.5 w-10" delay={i * 90 + 80} /> : <Move value={week} />}
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
          ))}
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
  "md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.75fr)_minmax(0,0.6fr)_minmax(0,1.7fr)_minmax(0,0.6fr)_minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,1.5fr)_minmax(0,1fr)] md:items-center md:gap-x-4";

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
  controls,
  onClose,
}: {
  title: string;
  subtitle: string;
  rows: readonly Row[];
  controls: ReactNode;
  onClose: () => void;
}) {
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
          <span className="text-right">Today</span>
          <span className="text-right">5 days</span>
          <span className="pl-3">30 days</span>
          <span className="text-right">YTD</span>
          <span className="pl-3">52-week range</span>
          <span className="text-right">Volume</span>
          <span className="pl-3">To fair value</span>
          <span>Next</span>
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
  const volume = q && q.avg_volume > 0 && q.current_volume ? q.current_volume / q.avg_volume : null;
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
          <RangeBar low={q.fifty_two_week_low} high={q.fifty_two_week_high} price={idea.price} />
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>
      <span className="text-right">
        {volume != null ? (
          <span
            className={cn("font-mono text-[12px] tabular-nums", volume >= 1.5 ? "font-semibold text-sunset-orange" : "text-mist")}
            title="Today's volume against its average"
          >
            {volume.toFixed(1)}×
          </span>
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

/**
 * Where the price sits between its 52-week low and high: a hairline for the
 * year's range, the part below the price drawn a little brighter, and a
 * short tick at the price. How far it is below the high beside it.
 */
function RangeBar({ low, high, price }: { low: number; high: number; price: number }) {
  const span = high - low;
  const at = span > 0 ? Math.min(1, Math.max(0, (price - low) / span)) : 1;
  const left = `${Math.round(at * 1000) / 10}%`;
  const offHigh = high > 0 ? price / high - 1 : 0;
  return (
    <span className="flex items-center gap-3" title={`52-week low ${low.toFixed(2)} · high ${high.toFixed(2)}`}>
      <span className="relative h-3 min-w-0 flex-1">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-snow-peak/15" />
        <span className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-snow-peak/45" style={{ width: left }} />
        <span className="absolute top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-snow-peak" style={{ left }} />
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-mist">
        {offHigh >= -0.005 ? "High" : signedPct(offHigh, 0)}
      </span>
    </span>
  );
}
