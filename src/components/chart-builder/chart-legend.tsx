"use client";

import { cn } from "@/lib/utils";
import { CANVAS_THEMES, formatDate, formatValue, seriesInk, seriesLabel, type ChartSeries, type ChartSpec, type ResolvedChart } from "@/lib/chart-builder";

interface ChartLegendProps {
  spec: ChartSpec;
  chart: ResolvedChart;
  /** Row of `chart.points` under the pointer; null reads out the latest values. */
  hoverRow: number | null;
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
 * The legend is a control and the readout. Click hides a series, Alt-click
 * isolates it, and either way the series panel follows the selection. Each
 * entry also carries a value: the latest one at rest, the hovered period's
 * while the pointer is over the plot — so nothing has to float over the
 * chart to tell you a number. Rendered as HTML rather than a Recharts
 * legend so it can do all that.
 */
export function ChartLegend({ spec, chart, hoverRow, pendingTickers, selectedId, hoverId, onToggle, onIsolate, onSelect, onHover }: ChartLegendProps) {
  if (spec.style.legend === "hidden" || spec.series.length === 0) return null;
  const theme = CANVAS_THEMES[spec.style.theme];

  const rows = chart.points;
  const row = hoverRow !== null && rows[hoverRow] ? hoverRow : rows.length - 1;
  const period =
    rows.length === 0 ? "" : chart.xMode === "time" ? formatDate(rows[row].x) : (chart.xLabels[row] ?? "");
  /**
   * The value to read out for a series at `row`. On the time axis a
   * statement series only has values at its period midpoints, so the last
   * one reported at or before the hovered day is the honest answer; on the
   * category axis a gap is a gap.
   */
  const valueAt = (id: string): string => {
    const resolved = chart.series.find((r) => r.id === id);
    if (!resolved || rows.length === 0) return "";
    let v = rows[row]?.[id] ?? null;
    if (v === null && chart.xMode === "time") {
      for (let i = row - 1; i >= 0 && v === null; i--) v = rows[i][id] ?? null;
    }
    return v === null ? "—" : formatValue(resolved.unit, v);
  };

  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2",
        spec.style.legend === "top" ? "mb-1 mt-3" : "mt-2 order-last"
      )}
      aria-label="Series"
    >
      {period && (
        <li aria-live="polite" className="font-mono text-[11px] tabular-nums" style={{ color: theme.tick }}>
          {period}
        </li>
      )}
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
              <span className="font-mono text-[12px] tabular-nums">{seriesLabel(s, spec.granularity)}</span>
              {pending ? (
                <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: theme.tick }}>loading</span>
              ) : (
                <span className="min-w-[5ch] text-right font-mono text-[12px] font-semibold tabular-nums" style={{ color: theme.title }}>
                  {valueAt(s.id)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
