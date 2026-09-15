"use client";

import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";
import type { ChartSpec, Granularity } from "@/lib/chart-builder";
import { PeriodSlider } from "./period-slider";

interface ChartControlsProps {
  spec: ChartSpec;
  /** Period-end dates on file for the chart's statements. */
  dates: readonly string[];
  /** The window in effect, spec's or default. */
  range: { from: string | null; to: string | null };
  onChange: (next: ChartSpec, coalesce?: string) => void;
}

const GRANULARITY: ReadonlyArray<{ key: Granularity; label: string }> = [
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
];

const toMonth = (iso: string | null) => (iso ? iso.slice(0, 7) : "");
const monthStart = (m: string) => (m ? `${m}-01` : null);
const monthEnd = (m: string) => {
  if (!m) return null;
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${m}-${String(last).padStart(2, "0")}`;
};

const monthInput = cn(
  "h-8 min-w-0 max-w-[9.5rem] rounded-lg bg-wolf-surface px-2 font-mono text-xs tabular-nums text-snow-peak ring-1 ring-inset ring-wolf-border/60",
  "focus:outline-none focus:ring-2 focus:ring-sunset-orange/50 [color-scheme:dark]"
);

/**
 * Granularity and the period window. Statement charts get the slider over
 * the periods on file; a price-only chart, whose axis is daily, keeps the
 * month inputs.
 */
export function ChartControls({ spec, dates, range, onChange }: ChartControlsProps) {
  const isDefault = spec.range.from === null && spec.range.to === null;
  const setRange = (from: string | null, to: string | null) => onChange({ ...spec, range: { from, to } }, "range");

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
      <SegmentedTabs<Granularity>
        items={GRANULARITY}
        value={spec.granularity}
        onChange={(granularity) => onChange({ ...spec, granularity })}
        ariaLabel="Granularity"
        size="sm"
        className="shrink-0"
      />
      {dates.length >= 2 ? (
        <PeriodSlider
          dates={dates}
          from={range.from}
          to={range.to}
          granularity={spec.granularity}
          isDefault={isDefault}
          onChange={setRange}
          onReset={() => onChange({ ...spec, range: { from: null, to: null } })}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
          <label htmlFor="cb-range-from">From</label>
          <input
            id="cb-range-from"
            type="month"
            className={monthInput}
            value={toMonth(spec.range.from)}
            max={toMonth(spec.range.to) || undefined}
            onChange={(e) => setRange(monthStart(e.target.value), spec.range.to)}
          />
          <label htmlFor="cb-range-to">to</label>
          <input
            id="cb-range-to"
            type="month"
            className={monthInput}
            value={toMonth(spec.range.to)}
            min={toMonth(spec.range.from) || undefined}
            onChange={(e) => setRange(spec.range.from, monthEnd(e.target.value))}
          />
          {!isDefault && (
            <button type="button" className="text-mist/85 underline-offset-2 hover:text-snow-peak hover:underline" onClick={() => setRange(null, null)}>
              All time
            </button>
          )}
        </div>
      )}
    </div>
  );
}
