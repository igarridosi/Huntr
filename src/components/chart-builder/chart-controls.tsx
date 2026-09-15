"use client";

import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";
import type { ChartSpec, Granularity } from "@/lib/chart-builder";

interface ChartControlsProps {
  spec: ChartSpec;
  onChange: (next: ChartSpec) => void;
}

const GRANULARITY: ReadonlyArray<{ key: Granularity; label: string }> = [
  { key: "annual", label: "Annual" },
  { key: "quarterly", label: "Quarterly" },
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

/** Granularity and date range: the two things that change what is fetched or bucketed. */
export function ChartControls({ spec, onChange }: ChartControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <SegmentedTabs<Granularity>
        items={GRANULARITY}
        value={spec.granularity}
        onChange={(granularity) => onChange({ ...spec, granularity })}
        ariaLabel="Granularity"
        size="sm"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
        <label htmlFor="cb-range-from">From</label>
        <input
          id="cb-range-from"
          type="month"
          className={monthInput}
          value={toMonth(spec.range.from)}
          max={toMonth(spec.range.to) || undefined}
          onChange={(e) => onChange({ ...spec, range: { ...spec.range, from: monthStart(e.target.value) } })}
        />
        <label htmlFor="cb-range-to">to</label>
        <input
          id="cb-range-to"
          type="month"
          className={monthInput}
          value={toMonth(spec.range.to)}
          min={toMonth(spec.range.from) || undefined}
          onChange={(e) => onChange({ ...spec, range: { ...spec.range, to: monthEnd(e.target.value) } })}
        />
        {(spec.range.from || spec.range.to) && (
          <button
            type="button"
            className="text-mist/85 underline-offset-2 hover:text-snow-peak hover:underline"
            onClick={() => onChange({ ...spec, range: { from: null, to: null } })}
          >
            All time
          </button>
        )}
      </div>
    </div>
  );
}
