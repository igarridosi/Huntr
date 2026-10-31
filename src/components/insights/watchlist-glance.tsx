"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Maximize2, Star, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SelectMenu } from "@/components/ui/select-menu";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { SectionHeader } from "@/components/insights/section-header";
import { useStoredChoice } from "@/components/insights/use-stored-choice";
import { IdeaList, IdeaListSkeleton } from "@/components/watchlist/board/idea-list";
import { GapBar, money, signedPct, STANCE_LABEL, STANCE_TEXT } from "@/components/watchlist/board/idea-bits";
import { useIdeas, type Idea } from "@/components/watchlist/board/use-ideas";
import { useScenarioChoices } from "@/components/watchlist/board/use-scenario-choice";
import { useDCFScenarios } from "@/hooks/use-dcf-scenarios";
import { useHydrated } from "@/hooks/use-hydrated";
import { useBatchPeriodPerformance, useHuntingGroundMetrics, useInsiderSignals } from "@/hooks/use-stock-data";
import { useListEntries, useWatchlistStore } from "@/hooks/use-watchlist";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { sortIdeas, summarize, type IdeaSort } from "@/lib/watchlist/ideas";
import type { PriceAlert, WatchlistList } from "@/types/watchlist";

/** Two rows of tiles on a wide screen; the rest are in the full view. */
const GLANCE = 8;

const SORTS: readonly IdeaSort[] = ["closest", "event", "quality"];
const SORT_ITEMS = [
  { key: "closest" as const, label: "Closest to buy" },
  { key: "event" as const, label: "Next event" },
  { key: "quality" as const, label: "Quality" },
];

/**
 * One of the reader's watchlists on the Insights page: at a glance, its
 * companies' moves today and how far each sits from a buy, biggest moves
 * first; opened, the full list with the Watchlists page's columns. Which
 * list is remembered in this browser. Reads the same caches as the
 * Watchlists page, so a list open there costs nothing here.
 */
export function WatchlistGlanceCard({
  lists,
  activeListId,
  alerts,
}: {
  lists: readonly WatchlistList[];
  activeListId: string;
  alerts: readonly PriceAlert[];
}) {
  const hydrated = useHydrated();
  const { isPending } = useWatchlistStore();
  const listIds = useMemo(() => lists.map((l) => l.id), [lists]);
  const fallback = listIds.includes(activeListId) ? activeListId : (listIds[0] ?? "");
  const [chosen, choose] = useStoredChoice<string>("huntr:insights-watchlist", listIds, fallback);
  const list = lists.find((l) => l.id === chosen) ?? lists[0];
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => list?.items ?? [], [list]);
  const tickers = useMemo(() => items.map((i) => i.ticker.toUpperCase()), [items]);
  const entries = useListEntries(list);
  const { data: monthly } = useBatchPeriodPerformance(tickers, "1M");
  // Quality, cash yield and insiders are columns of the full view only.
  const metrics = useHuntingGroundMetrics(expanded ? tickers : []);
  const signals = useInsiderSignals(expanded ? tickers : []);
  const { savedScenarios } = useDCFScenarios();
  const [choices] = useScenarioChoices();

  const ideas = useIdeas({
    items,
    entries: entries.data,
    saved: savedScenarios,
    metrics: metrics.data,
    signals: signals.data,
    monthly,
    alerts,
    choices,
  });

  // Biggest moves first, either way: what changed today is what a glance is for.
  const glance = useMemo(
    () => [...ideas].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0)).slice(0, GLANCE),
    [ideas]
  );
  const summary = useMemo(() => summarize(ideas), [ideas]);
  const up = ideas.filter((i) => (i.change ?? 0) > 0).length;
  const down = ideas.filter((i) => (i.change ?? 0) < 0).length;
  const loading = !hydrated || isPending || (items.length > 0 && entries.isPending);

  const subtitle = loading
    ? "Your companies today"
    : items.length === 0
      ? "Nothing on this list yet"
      : [
          `${items.length} ${items.length === 1 ? "company" : "companies"}`,
          `${up} up, ${down} down today`,
          summary.inBuyZone > 0 ? `${summary.inBuyZone} in the buy zone` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const listOptions = useMemo(
    () => [{ label: "Your watchlists", options: lists.map((l) => ({ value: l.id, label: l.name })) }],
    [lists]
  );

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <SectionHeader icon={Star} title={list?.name ?? "Watchlist"} subtitle={subtitle}>
          {hydrated && lists.length > 1 ? (
            <SelectMenu groups={listOptions} value={list?.id ?? ""} onChange={choose} ariaLabel="Watchlist shown" className="w-44" />
          ) : null}
          {hydrated && items.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Open the full watchlist"
              title="Open the full watchlist"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </SectionHeader>

        {loading ? (
          <GlanceSkeleton />
        ) : items.length === 0 ? (
          <p className="mt-5 text-[13px] text-mist">
            Add companies on the{" "}
            <Link href={ROUTES.APP_WATCHLISTS} className="font-medium text-sunset-orange hover:underline">
              Watchlists page
            </Link>{" "}
            to follow them here.
          </p>
        ) : (
          <>
            <ul className="mt-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-4">
              {glance.map((idea) => (
                <li key={idea.ticker}>
                  <GlanceTile idea={idea} />
                </li>
              ))}
            </ul>
            {ideas.length > GLANCE ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-3 text-[12px] font-medium text-mist transition-colors duration-150 hover:text-snow-peak"
              >
                {ideas.length - GLANCE} more on this list
              </button>
            ) : null}
          </>
        )}
      </CardContent>

      {expanded && list ? (
        <ExpandedWatchlist
          list={list}
          ideas={ideas}
          loading={entries.isPending}
          subtitle={subtitle}
          listSelect={
            lists.length > 1 ? (
              <SelectMenu groups={listOptions} value={list.id} onChange={choose} ariaLabel="Watchlist shown" className="w-44" />
            ) : null
          }
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </Card>
  );
}

/** A company at a glance: today's move, the price, and how far from a buy. */
function GlanceTile({ idea }: { idea: Idea }) {
  const currency = idea.quote?.currency;
  const change = idea.change;
  return (
    <Link
      href={ROUTES.SYMBOL(idea.ticker)}
      className="group flex h-full flex-col gap-3 rounded-xl bg-snow-peak/[0.02] p-3 ring-1 ring-inset ring-wolf-border/40 transition-colors duration-150 hover:bg-snow-peak/[0.045] hover:ring-wolf-border/70 focus-visible:outline-none focus-visible:ring-sunset-orange/60"
    >
      <div className="flex items-center gap-2.5">
        <TickerLogo ticker={idea.ticker} src={idea.logo} className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-snow-peak">{idea.ticker}</p>
          <p className="truncate text-[11px] leading-snug text-mist">{idea.name}</p>
        </div>
        {change != null ? (
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
              change > 0 ? "bg-bullish/10 text-bullish" : change < 0 ? "bg-bearish/10 text-bearish" : "bg-snow-peak/[0.05] text-mist"
            )}
          >
            {signedPct(change)}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-snow-peak">
          {idea.price != null ? money(idea.price, currency) : "—"}
        </span>
        {idea.month != null ? (
          <span className="font-mono text-[10.5px] tabular-nums text-mist" title="Move over the last 30 days">
            30d <span className={idea.month >= 0 ? "text-bullish" : "text-bearish"}>{signedPct(idea.month, 1)}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-auto space-y-1.5">
        {idea.gap != null && idea.fair ? (
          <>
            <GapBar gap={idea.gap} stance={idea.stance} />
            <p className="flex items-center justify-between gap-2 text-[11px]">
              <span className={cn("font-medium", STANCE_TEXT[idea.stance])}>{STANCE_LABEL[idea.stance]}</span>
              <span className="truncate text-mist">
                {Math.abs(idea.gap * 100).toFixed(0)}% {idea.gap <= 0 ? "below" : "above"} {money(idea.fair.value, currency)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-[11px] text-mist/70">No fair value yet</p>
        )}
      </div>
    </Link>
  );
}

function GlanceSkeleton() {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="h-[124px] animate-pulse rounded-xl bg-snow-peak/[0.025] ring-1 ring-inset ring-wolf-border/30" />
      ))}
    </ul>
  );
}

/**
 * The whole list, with the Watchlists page's columns: price against fair
 * value, quality, cash yield, the last 30 days, what comes next and what
 * insiders are doing. A company opens its own page; keeping work on it
 * (a buy price, a thesis) is the Watchlists page's job, one link away.
 */
function ExpandedWatchlist({
  list,
  ideas,
  loading,
  subtitle,
  listSelect,
  onClose,
}: {
  list: WatchlistList;
  ideas: readonly Idea[];
  loading: boolean;
  subtitle: string;
  listSelect: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [sort, setSort] = useStoredChoice<IdeaSort>("huntr:watchlist-sort", SORTS, "closest");
  const sorted = useMemo(() => sortIdeas(ideas, sort), [ideas, sort]);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={`${list.name}, full view`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="hg-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(80rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 text-snow-peak backdrop:bg-transparent"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col rounded-2xl bg-wolf-surface p-4 shadow-2xl ring-1 ring-inset ring-wolf-border/70 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
              <Star className="h-[18px] w-[18px] text-sunset-orange" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold leading-tight">{list.name}</p>
              <p className="truncate text-[11.5px] text-mist">{subtitle}</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {listSelect}
            <SegmentedTabs items={SORT_ITEMS} value={sort} onChange={setSort} ariaLabel="Order the list by" size="sm" />
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

        <div className="scroll-quiet -mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <IdeaListSkeleton />
          ) : (
            <IdeaList ideas={sorted} selected={null} onOpen={(ticker) => router.push(ROUTES.SYMBOL(ticker))} />
          )}
        </div>
      </div>
    </dialog>
  );
}
