"use client";

import { cn } from "@/lib/utils";
import { CANVAS_THEMES, seriesInk, seriesLabel, type ChartSeries, type ChartSpec } from "@/lib/chart-builder";

interface ChartLegendProps {
  spec: ChartSpec;
  pendingTickers: string[];
  selectedId: string | null;
  /** Entry under the pointer; the others step back with the plot. */
  hoverId: string | null;
  onToggle: (id: string) => void;
  onIsolate: (id: string) => void;
  onSelect: (id: string) => void;
  /** Pointer over a legend entry: the canvas fades the other series. */
  onHover: (id: string | null) => void;
}

/**
 * The legend is a control, not a caption: click hides a series, Alt-click
 * isolates it, and either way the series panel follows the selection.
 * Rendered as HTML rather than a Recharts legend so it can do that.
 */
export function ChartLegend({ spec, pendingTickers, selectedId, hoverId, onToggle, onIsolate, onSelect, onHover }: ChartLegendProps) {
  if (spec.style.legend === "hidden" || spec.series.length === 0) return null;
  const theme = CANVAS_THEMES[spec.style.theme];

  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2",
        spec.style.legend === "top" ? "mb-1 mt-3" : "mt-2 order-last"
      )}
      aria-label="Series"
    >
      {spec.series.map((s: ChartSeries) => {
        const pending = pendingTickers.includes(s.ticker);
        const ink = seriesInk(s.color, spec.style.theme);
        const hovered = hoverId === s.id;
        const stepped = hoverId !== null && !hovered && !s.hidden;
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={!s.hidden}
              title="Click to hide · Alt+click to isolate"
              onClick={(e) => {
                onSelect(s.id);
                if (e.altKey) onIsolate(s.id);
                else onToggle(s.id);
              }}
              onMouseEnter={() => onHover(s.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(s.id)}
              onBlur={() => onHover(null)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[12.5px] transition-[opacity,background-color,transform] duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                s.hidden && "opacity-35",
                stepped && "opacity-50",
                selectedId === s.id && "ring-1 ring-inset"
              )}
              style={{
                color: theme.legendText,
                background: hovered ? `${theme.grid}66` : "transparent",
                ...(selectedId === s.id ? { boxShadow: `inset 0 0 0 1px ${theme.grid}` } : {}),
              }}
            >
              <span
                aria-hidden
                className={cn(
                  "shrink-0 rounded-[3px] transition-[transform,box-shadow] duration-200 ease-out",
                  s.shape === "bar" ? "h-3 w-3" : "h-[3px] w-4 rounded-full",
                  hovered && "scale-110",
                  pending && "animate-pulse"
                )}
                style={{
                  background: s.hidden ? theme.tick : pending ? theme.grid : ink,
                  boxShadow: s.shape === "area" ? `0 4px 0 -1px ${ink}55` : hovered && !s.hidden ? `0 0 0 3px ${ink}33` : undefined,
                }}
              />
              <span className="font-mono text-[12px] tabular-nums">{seriesLabel(s)}</span>
              {pending && <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: theme.tick }}>loading</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
