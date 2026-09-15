"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SelectMenu, type SelectMenuGroup } from "@/components/ui/select-menu";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import { cn } from "@/lib/utils";
import {
  MAX_SERIES,
  MAX_TICKERS,
  METRICS,
  METRIC_GROUPS,
  SERIES_PALETTE,
  createSeries,
  metricsInGroup,
  paletteColor,
  seriesInk,
  seriesLabel,
  type ChartSeries,
  type ChartSpec,
  type MetricId,
  type SeriesAxis,
  type SeriesShape,
  type SeriesTransform,
} from "@/lib/chart-builder";

interface SeriesPanelProps {
  spec: ChartSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: ChartSpec, coalesce?: string) => void;
}

const TRANSFORM_LABELS: Record<SeriesTransform, string> = {
  raw: "As reported",
  per_share: "Per share",
  ttm: "Trailing 12 months",
  yoy: "Year-over-year %",
  indexed: "Indexed to start %",
};

const SHAPES: ReadonlyArray<{ key: SeriesShape; label: string }> = [
  { key: "bar", label: "Bar" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
];
const AXES: ReadonlyArray<{ key: SeriesAxis; label: string }> = [
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

const METRIC_GROUP_OPTIONS: ReadonlyArray<SelectMenuGroup<MetricId>> = METRIC_GROUPS.map((group) => ({
  label: group,
  options: metricsInGroup(group).map((m) => ({ value: m.id, label: m.label })),
}));

/**
 * The list of series with an inspector that opens in place. One row open
 * at a time; the legend's selection and this panel's selection are the
 * same state, so clicking either brings the other along.
 */
export function SeriesPanel({ spec, selectedId, onSelect, onChange }: SeriesPanelProps) {
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const patch = (id: string, changes: Partial<ChartSeries>, coalesce?: string) =>
    onChange({ ...spec, series: spec.series.map((s) => (s.id === id ? { ...s, ...changes } : s)) }, coalesce);

  const tickerCount = new Set(spec.series.map((s) => s.ticker)).size;
  /** A new company only gets on when there is room for a fifth data source not to be needed. */
  const setTicker = (id: string, ticker: string) => {
    const others = new Set(spec.series.filter((s) => s.id !== id).map((s) => s.ticker));
    if (!others.has(ticker) && others.size >= MAX_TICKERS) {
      setLimitNote(`Up to ${MAX_TICKERS} companies per chart. Remove one to add ${ticker}.`);
      return;
    }
    setLimitNote(null);
    patch(id, { ticker });
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = spec.series.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= spec.series.length) return;
    const series = spec.series.slice();
    [series[i], series[j]] = [series[j], series[i]];
    onChange({ ...spec, series });
  };

  const remove = (id: string) => {
    onChange({ ...spec, series: spec.series.filter((s) => s.id !== id) });
    if (selectedId === id) onSelect(null);
  };

  const add = () => {
    if (spec.series.length >= MAX_SERIES) return;
    const last = spec.series[spec.series.length - 1];
    const next = createSeries({
      ticker: last?.ticker ?? "AAPL",
      metric: last?.metric ?? "revenue",
      shape: last?.shape ?? "bar",
      axis: last?.axis ?? "left",
      transform: last?.transform ?? "raw",
      color: paletteColor(spec.series.length),
    });
    onChange({ ...spec, series: [...spec.series, next] });
    onSelect(next.id);
  };

  const transformOptions = useMemo<ReadonlyArray<SelectMenuGroup<SeriesTransform>>>(
    () => [{ label: "Transform", options: (Object.keys(TRANSFORM_LABELS) as SeriesTransform[]).map((k) => ({ value: k, label: TRANSFORM_LABELS[k] })) }],
    []
  );

  return (
    <section aria-label="Series" className="rounded-2xl bg-wolf-surface p-3.5 ring-1 ring-inset ring-wolf-border/60">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/85">Series</h2>
        <span className="font-mono text-[10px] tabular-nums text-mist/85" title={`${tickerCount} of ${MAX_TICKERS} companies · ${spec.series.length} of ${MAX_SERIES} series`}>
          {tickerCount} / {MAX_TICKERS} co · {spec.series.length} / {MAX_SERIES}
        </span>
      </div>

      <ul role="list" className="flex flex-col gap-1">
        {spec.series.map((s, index) => {
          const open = selectedId === s.id;
          const def = METRICS[s.metric];
          const chips: string[] = [];
          if (s.shape !== "bar") chips.push(s.shape);
          if (s.axis === "right") chips.push("right");
          if (s.transform !== "raw") chips.push(TRANSFORM_LABELS[s.transform].split(" ")[0]);
          const ink = seriesInk(s.color, spec.style.theme);

          return (
            <li key={s.id} className={cn("rounded-xl transition-colors duration-150", open && "bg-wolf-black/60 ring-1 ring-inset ring-wolf-border/60")}>
              <div className={cn("flex items-center gap-2 rounded-xl pr-1", !open && "hover:bg-wolf-black/40")}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onSelect(open ? null : s.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
                >
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: ink }} />
                  <span className={cn("flex min-w-0 flex-col", s.hidden && "opacity-45")}>
                    <span className="truncate text-[13px] font-medium text-snow-peak">
                      <span className="font-mono">{s.ticker}</span>
                      <span className="mx-1.5 text-mist">·</span>
                      {def.label}
                    </span>
                    {chips.length > 0 && (
                      <span className="mt-0.5 flex gap-1">
                        {chips.map((c) => (
                          <span key={c} className="rounded bg-mist/10 px-1 font-mono text-[10px] leading-4 text-mist">
                            {c}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${seriesLabel(s)} up`} disabled={index === 0} onClick={() => move(s.id, -1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${seriesLabel(s)} down`} disabled={index === spec.series.length - 1} onClick={() => move(s.id, 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
                style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  {open && (
                    <div className="flex flex-col gap-3 px-2.5 pb-3 pt-1">
                      <Field label="Ticker">
                        <DCFTickerInput value={s.ticker} onSelect={(ticker) => setTicker(s.id, ticker)} />
                        {limitNote && selectedId === s.id && <p className="mt-1 text-[11px] text-golden-hour">{limitNote}</p>}
                      </Field>
                      <Field label="Metric">
                        <SelectMenu<MetricId>
                          groups={METRIC_GROUP_OPTIONS}
                          value={s.metric}
                          onChange={(metric) => patch(s.id, { metric })}
                          ariaLabel="Metric"
                        />
                      </Field>
                      <Field label="Transform">
                        <SelectMenu<SeriesTransform>
                          groups={transformOptions}
                          value={s.transform}
                          onChange={(transform) =>
                            patch(s.id, { transform, ...(transform === "indexed" && s.shape === "bar" ? { shape: "line" as const } : {}) })
                          }
                          ariaLabel="Transform"
                        />
                      </Field>
                      <div className="grid grid-cols-1 gap-3">
                        <Field label="Shape">
                          <SegmentedTabs<SeriesShape>
                            items={SHAPES}
                            value={s.shape}
                            onChange={(shape) => patch(s.id, { shape })}
                            ariaLabel="Shape"
                            size="sm"
                          />
                        </Field>
                        <Field label="Axis">
                          <SegmentedTabs<SeriesAxis>
                            items={AXES}
                            value={s.axis}
                            onChange={(axis) => patch(s.id, { axis })}
                            ariaLabel="Axis"
                            size="sm"
                          />
                        </Field>
                      </div>
                      <Field label="Color">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {SERIES_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={c}
                              aria-pressed={c.toUpperCase() === s.color.toUpperCase()}
                              onClick={() => patch(s.id, { color: c })}
                              className="h-5 w-5 rounded-md border-2 border-transparent transition-transform duration-100 hover:scale-110 aria-pressed:border-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
                              style={{ background: c }}
                            />
                          ))}
                          <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-md border-2 border-transparent bg-[conic-gradient(#FF8C42,#FFBF69,#34D399,#4DA3FF,#7C8CF8,#F472B6,#FF8C42)] hover:scale-110 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sunset-orange/60">
                            <span className="sr-only">Custom color</span>
                            <input
                              type="color"
                              value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#FF8C42"}
                              onChange={(e) => patch(s.id, { color: e.target.value.toUpperCase() }, `color:${s.id}`)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        </div>
                      </Field>
                      <div className="flex items-center justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => patch(s.id, { hidden: !s.hidden })}>
                          {s.hidden ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
                          {s.hidden ? "Show" : "Hide"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-mist hover:text-bearish" onClick={() => remove(s.id)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full border-dashed text-mist/85 hover:border-sunset-orange/50 hover:text-sunset-orange"
        onClick={add}
        disabled={spec.series.length >= MAX_SERIES}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add series
      </Button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.09em] text-mist">{label}</span>
      {children}
    </div>
  );
}
