"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toCalendarBucket, type Granularity } from "@/lib/chart-builder";

interface PeriodSliderProps {
  /** Every period-end date the chart could show, sorted ascending. */
  dates: readonly string[];
  /** The window in effect (nulls mean the ends). */
  from: string | null;
  to: string | null;
  granularity: Granularity;
  /** True while the window is the automatic default, not the user's. */
  isDefault: boolean;
  onChange: (from: string | null, to: string | null) => void;
  onReset: () => void;
}

const HANDLE = 16;

/**
 * Two handles over the periods on file, one dot per period: the window is
 * chosen by dragging on the actual dates rather than typing months. The
 * handles track the pointer 1:1 and snap to the nearest period on every
 * move, so the chart follows the drag rather than the release.
 */
export function PeriodSlider({ dates, from, to, granularity, isDefault, onChange, onReset }: PeriodSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"from" | "to" | null>(null);
  const n = dates.length;

  const indexOf = useCallback(
    (date: string | null, side: "from" | "to") => {
      if (n === 0) return 0;
      if (date === null) return side === "from" ? 0 : n - 1;
      if (side === "from") {
        const i = dates.findIndex((d) => d >= date);
        return i === -1 ? n - 1 : i;
      }
      let i = n - 1;
      while (i > 0 && dates[i] > date) i--;
      return i;
    },
    [dates, n]
  );
  const i0 = indexOf(from, "from");
  const i1 = Math.max(i0, indexOf(to, "to"));
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const label = (date: string) => toCalendarBucket(date, granularity)?.label ?? date;

  // Year ticks under the track, thinned so they never collide.
  const yearTicks = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ i: number; year: string }> = [];
    dates.forEach((d, i) => {
      const y = d.slice(0, 4);
      if (!seen.has(y)) {
        seen.add(y);
        out.push({ i, year: y });
      }
    });
    const every = Math.max(1, Math.ceil(out.length / 8));
    return out.filter((_, k) => k % every === 0);
  }, [dates]);

  const indexAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el || n <= 1) return 0;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return Math.round((x / r.width) * (n - 1));
  };

  const commit = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    onChange(lo === 0 ? dates[0] : dates[lo], hi === n - 1 ? dates[n - 1] : dates[hi]);
  };

  const startDrag = (side: "from" | "to") => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(side);
  };
  const moveDrag = (side: "from" | "to") => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragging !== side) return;
    const i = indexAt(e.clientX);
    if (side === "from") commit(Math.min(i, i1), i1);
    else commit(i0, Math.max(i, i0));
  };
  const endDrag = () => setDragging(null);

  const keyDrag = (side: "from" | "to") => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -n : e.key === "End" ? n : 0;
    if (!step) return;
    e.preventDefault();
    if (side === "from") commit(Math.min(Math.max(0, i0 + step), i1), i1);
    else commit(i0, Math.max(Math.min(n - 1, i1 + step), i0));
  };

  if (n < 2) return null;

  const chip = (text: string, side: "from" | "to") => (
    <span className="inline-flex h-7 items-center gap-1 rounded-md bg-wolf-surface px-2 font-mono text-[11px] tabular-nums text-snow-peak ring-1 ring-inset ring-wolf-border/60">
      {text}
      {!isDefault && (
        <button
          type="button"
          aria-label={side === "from" ? "Reset start" : "Reset end"}
          onClick={() => (side === "from" ? onChange(null, to) : onChange(from, null))}
          className="ml-0.5 rounded text-mist hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );

  return (
    <div className="flex w-full items-center gap-3">
      {chip(label(dates[i0]), "from")}
      <div className="relative min-w-0 flex-1 px-2 pb-4 pt-2">
        <div ref={trackRef} className="relative h-1.5 rounded-full bg-wolf-border/60">
          {/* Selected span */}
          <div className="absolute inset-y-0 rounded-full bg-sunset-orange/70" style={{ left: `${pct(i0)}%`, right: `${100 - pct(i1)}%` }} />
          {/* One dot per period */}
          {dates.map((d, i) => (
            <span
              key={d}
              aria-hidden
              className={cn("absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full", i >= i0 && i <= i1 ? "bg-wolf-black/60" : "bg-mist/40")}
              style={{ left: `${pct(i)}%` }}
            />
          ))}
          {(["from", "to"] as const).map((side) => {
            const i = side === "from" ? i0 : i1;
            return (
              <button
                key={side}
                type="button"
                role="slider"
                aria-label={side === "from" ? "Start period" : "End period"}
                aria-valuemin={0}
                aria-valuemax={n - 1}
                aria-valuenow={i}
                aria-valuetext={label(dates[i])}
                onPointerDown={startDrag(side)}
                onPointerMove={moveDrag(side)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={keyDrag(side)}
                className={cn(
                  "absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-sunset-orange bg-wolf-black transition-transform duration-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                  dragging === side ? "scale-110 cursor-grabbing" : "hover:scale-110"
                )}
                style={{ left: `${pct(i)}%`, width: HANDLE, height: HANDLE }}
              />
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-2 top-6 h-4">
          {yearTicks.map(({ i, year }) => (
            <span key={year} className="absolute -translate-x-1/2 font-mono text-[10px] tabular-nums text-mist" style={{ left: `${pct(i)}%` }}>
              {year}
            </span>
          ))}
        </div>
      </div>
      {chip(label(dates[i1]), "to")}
      {!isDefault && (
        <button type="button" onClick={onReset} className="text-xs text-mist/85 underline-offset-2 hover:text-snow-peak hover:underline">
          Default
        </button>
      )}
    </div>
  );
}
