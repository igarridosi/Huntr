"use client";

import type { ReactNode } from "react";
import { CalendarClock, Crosshair, TrendingUp, Users } from "lucide-react";
import { cn, enterDelay } from "@/lib/utils";
import type { DaySummary as Summary, IdeaSort } from "@/lib/watchlist/ideas";
import { signedPct } from "./idea-bits";

/**
 * The list at a glance: what is in reach, what reports this week, whose
 * insiders are buying, and how the list moved today. A tile that matches a
 * sort orders the list by it.
 */
export function DaySummary({
  summary,
  insidersBuying,
  loading,
  sort,
  onSort,
}: {
  summary: Summary;
  insidersBuying: number | null;
  loading: boolean;
  sort: IdeaSort;
  onSort: (sort: IdeaSort) => void;
}) {
  const total = summary.inBuyZone + summary.near;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Tile
        index={0}
        icon={<Crosshair className="h-4 w-4" />}
        tone="text-bullish bg-bullish/10"
        label="In your buy zone"
        value={loading ? null : String(summary.inBuyZone)}
        note={
          loading
            ? ""
            : summary.near > 0
              ? `${summary.near} within 10%`
              : total === 0 && summary.unvalued > 0
                ? `${summary.unvalued} without a fair value`
                : "at or below fair value"
        }
        active={sort === "closest"}
        onClick={() => onSort("closest")}
      />
      <Tile
        index={1}
        icon={<CalendarClock className="h-4 w-4" />}
        tone="text-sunset-orange bg-sunset-orange/10"
        label="Earnings this week"
        value={loading ? null : String(summary.earningsThisWeek)}
        note="in the next 7 days"
        active={sort === "event"}
        onClick={() => onSort("event")}
      />
      <Tile
        index={2}
        icon={<Users className="h-4 w-4" />}
        tone="text-glacier bg-glacier/10"
        label="Insiders buying"
        value={insidersBuying == null ? null : String(insidersBuying)}
        note="open-market buys, last year"
      />
      <Tile
        index={3}
        icon={<TrendingUp className="h-4 w-4" />}
        tone="text-snow-peak bg-snow-peak/[0.06]"
        label="The list today"
        value={loading ? null : summary.today == null ? "—" : signedPct(summary.today)}
        valueTone={summary.today == null ? undefined : summary.today > 0 ? "text-bullish" : summary.today < 0 ? "text-bearish" : undefined}
        note="equal weighted, across the list"
      />
    </div>
  );
}

function Tile({
  index,
  icon,
  tone,
  label,
  value,
  valueTone,
  note,
  active,
  onClick,
}: {
  index: number;
  icon: ReactNode;
  tone: string;
  label: string;
  value: string | null;
  valueTone?: string;
  note: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>{icon}</span>
        <span className="text-[11.5px] text-mist">{label}</span>
      </span>
      {value == null ? (
        <span className="mt-3 block h-7 w-12 animate-pulse rounded-md bg-snow-peak/[0.05]" />
      ) : (
        <span className={cn("mt-2.5 block font-mono text-2xl font-semibold tabular-nums tracking-tight text-snow-peak", valueTone)}>
          {value}
        </span>
      )}
      <span className="mt-0.5 block truncate text-[11px] text-mist/80">{note || " "}</span>
    </>
  );
  const base = cn(
    "insight-enter block rounded-xl bg-wolf-surface/60 p-3.5 text-left ring-1 ring-inset sm:p-4",
    active ? "ring-sunset-orange/40" : "ring-wolf-border/50"
  );
  if (!onClick) {
    return (
      <div className={base} style={enterDelay(index * 40)}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="Order the list by this"
      className={cn(
        base,
        "transition-[background-color,box-shadow] duration-150 ease-out hover:bg-snow-peak/[0.04]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
      )}
      style={enterDelay(index * 40)}
    >
      {body}
    </button>
  );
}
