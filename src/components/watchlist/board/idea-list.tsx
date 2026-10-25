"use client";

import { memo } from "react";
import { ArrowUpRight, BellRing, CalendarClock, NotebookPen, Users } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn, enterDelay } from "@/lib/utils";
import type { Idea } from "./use-ideas";
import {
  eventText,
  fairSource,
  GapBar,
  gapText,
  money,
  pct,
  qualityTone,
  signedPct,
  STANCE_TEXT,
  yieldTone,
} from "./idea-bits";

// Company · price · fair value · quality · FCF yield · next event · signals.
const GRID = "md:grid md:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1.1fr)_minmax(0,0.8fr)] md:items-center md:gap-4";

/**
 * The list, one row per company, each opening its panel. The columns are the
 * questions a watchlist answers: how far from a buy, how good a business,
 * how much cash it throws off for the price, and what happens next.
 */
export function IdeaList({
  ideas,
  selected,
  onOpen,
}: {
  ideas: readonly Idea[];
  selected: string | null;
  onOpen: (ticker: string) => void;
}) {
  return (
    <div>
      <div
        className={cn(
          GRID,
          "hidden px-4 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-mist/80"
        )}
        aria-hidden
      >
        <span>Company</span>
        <span className="text-right">Price</span>
        <span>To fair value</span>
        <span className="text-right">Quality</span>
        <span className="text-right">FCF yield</span>
        <span>Next</span>
        <span className="text-right">Signals</span>
      </div>
      <ul className="space-y-1" aria-label="Companies on this list">
        {ideas.map((idea, i) => (
          <li key={idea.ticker} className="insight-enter" style={enterDelay(Math.min(i * 22, 260))}>
            <IdeaRow idea={idea} active={selected === idea.ticker} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const IdeaRow = memo(function IdeaRow({
  idea,
  active,
  onOpen,
}: {
  idea: Idea;
  active: boolean;
  onOpen: (ticker: string) => void;
}) {
  const currency = idea.quote?.currency;
  const fcfYield = idea.metrics?.fcfYield ?? null;
  return (
    <button
      type="button"
      onClick={() => onOpen(idea.ticker)}
      aria-haspopup="dialog"
      className={cn(
        GRID,
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-left ring-1 ring-inset",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        active
          ? "bg-sunset-orange/[0.06] ring-sunset-orange/35"
          : "bg-snow-peak/[0.02] ring-wolf-border/40 hover:bg-snow-peak/[0.045] hover:ring-wolf-border/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
      )}
    >
      {/* Company */}
      <span className="flex min-w-0 items-center gap-3">
        <TickerLogo ticker={idea.ticker} src={idea.logo} className="h-9 w-9 shrink-0 rounded-lg" />
        <span className="min-w-0">
          <span className="block font-mono text-[13px] font-semibold text-snow-peak">{idea.ticker}</span>
          {idea.pending ? (
            <span className="mt-1 block h-3 w-28 animate-pulse rounded bg-snow-peak/[0.05]" />
          ) : (
            <span className="block truncate text-xs text-mist">{idea.name}</span>
          )}
        </span>
      </span>

      {/* Price */}
      <span className="text-right">
        {idea.price != null ? (
          <>
            <span className="block font-mono text-[13px] tabular-nums text-snow-peak">{money(idea.price, currency)}</span>
            {idea.change != null ? (
              <span
                className={cn(
                  "block font-mono text-[11px] tabular-nums",
                  idea.change > 0 ? "text-bullish" : idea.change < 0 ? "text-bearish" : "text-mist"
                )}
              >
                {signedPct(idea.change)}
              </span>
            ) : null}
          </>
        ) : idea.pending ? (
          <span className="ml-auto block h-4 w-16 animate-pulse rounded bg-snow-peak/[0.05]" />
        ) : (
          <span className="text-xs text-mist">—</span>
        )}
      </span>

      {/* Fair value */}
      <span className="col-span-2 min-w-0 md:col-span-1">
        {idea.fair && idea.gap != null ? (
          <>
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-[12.5px] font-medium tabular-nums", STANCE_TEXT[idea.stance])}>
                {gapText(idea.gap, idea.fair, currency)}
              </span>
              <span className="shrink-0 text-[10.5px] text-mist/80">{fairSource(idea.fair)}</span>
            </span>
            <GapBar gap={idea.gap} stance={idea.stance} className="mt-1.5" />
          </>
        ) : idea.pending ? (
          <span className="block h-4 w-full animate-pulse rounded bg-snow-peak/[0.04]" />
        ) : (
          <span className="text-xs text-mist/80">
            No fair value yet · <span className="text-sunset-orange/90">set one</span>
          </span>
        )}
      </span>

      {/* Quality */}
      <span className="hidden text-right md:block">
        {idea.quality != null ? (
          <span className={cn("font-mono text-[13px] tabular-nums", qualityTone(idea.quality))}>
            {Math.round(idea.quality)}
          </span>
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>

      {/* FCF yield */}
      <span className="hidden text-right md:block">
        {idea.unmeasured ? (
          <span className="text-xs text-mist/60" title="Free cash flow does not measure a bank, insurer or landlord">
            n/m
          </span>
        ) : fcfYield != null ? (
          <span className={cn("font-mono text-[13px] tabular-nums", yieldTone(fcfYield))}>{pct(fcfYield)}</span>
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>

      {/* Next event */}
      <span className="hidden min-w-0 md:block">
        {idea.event ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 truncate text-xs",
              idea.event.kind === "earnings" && idea.event.days <= 7 ? "text-snow-peak" : "text-mist"
            )}
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-mist" />
            {eventText(idea.event)}
          </span>
        ) : (
          <span className="text-xs text-mist/60">—</span>
        )}
      </span>

      {/* Signals */}
      <span className="col-span-2 flex items-center gap-1.5 md:col-span-1 md:justify-end">
        <Signals idea={idea} />
      </span>
    </button>
  );
});

function Signals({ idea }: { idea: Idea }) {
  const s = idea.signal;
  return (
    <>
      {s?.cluster ? (
        <Mark tone="bg-sunset-orange/12 text-sunset-orange" label={`${s.buyers} insiders buying together`}>
          <Users className="h-3 w-3" />
        </Mark>
      ) : s && s.buys > 0 ? (
        <Mark tone="bg-bullish/12 text-bullish" label={`${s.buys} insider buy${s.buys === 1 ? "" : "s"} in the last year`}>
          <ArrowUpRight className="h-3 w-3" />
          <span className="font-mono text-[10px]">{s.buys}</span>
        </Mark>
      ) : null}
      {idea.alertHit ? (
        <Mark tone="bg-sunset-orange/12 text-sunset-orange" label="A price alert has been reached">
          <BellRing className="h-3 w-3" />
        </Mark>
      ) : null}
      {idea.notes.trim() ? (
        <Mark tone="bg-snow-peak/[0.06] text-mist" label="Has a thesis note">
          <NotebookPen className="h-3 w-3" />
        </Mark>
      ) : null}
    </>
  );
}

function Mark({ tone, label, children }: { tone: string; label: string; children: React.ReactNode }) {
  return (
    <span title={label} className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5", tone)}>
      {children}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function IdeaListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-[62px] items-center gap-3 rounded-xl bg-snow-peak/[0.02] px-4 ring-1 ring-inset ring-wolf-border/30">
          <span className="h-9 w-9 animate-pulse rounded-lg bg-snow-peak/[0.05]" />
          <span className="space-y-1.5">
            <span className="block h-3 w-12 animate-pulse rounded bg-snow-peak/[0.06]" />
            <span className="block h-3 w-28 animate-pulse rounded bg-snow-peak/[0.04]" />
          </span>
          <span className="ml-auto h-3 w-40 animate-pulse rounded bg-snow-peak/[0.04]" />
        </li>
      ))}
    </ul>
  );
}
