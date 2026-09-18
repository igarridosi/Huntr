"use client";

import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatMonthTick, withGranularity, type ChartSpec, type Granularity } from "@/lib/chart-builder";
import { PeriodSlider } from "./period-slider";

interface ChartControlsProps {
  spec: ChartSpec;
  /** Period-end dates on file for the chart's statements, or month ends for price-only charts. */
  dates: readonly string[];
  datesAreMonthly?: boolean;
  /** The window in effect, spec's or default. */
  range: { from: string | null; to: string | null };
  onChange: (next: ChartSpec, coalesce?: string) => void;
}

const GRANULARITY: ReadonlyArray<{ key: Granularity; label: string }> = [
  { key: "quarterly", label: "Quarterly" },
  { key: "ttm", label: "TTM" },
  { key: "annual", label: "Annual" },
];

/**
 * Granularity and the period window: one slider over the periods on file
 * (statement periods, or month ends when only prices are charted).
 */
export function ChartControls({ spec, dates, datesAreMonthly = false, range, onChange }: ChartControlsProps) {
  const isDefault = spec.range.from === null && spec.range.to === null;
  const setRange = (from: string | null, to: string | null) => onChange({ ...spec, range: { from, to } }, "range");

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
      {!datesAreMonthly && (
      <SegmentedTabs<Granularity>
        items={GRANULARITY}
        value={spec.granularity}
        onChange={(granularity) => onChange(withGranularity(spec, granularity))}
        ariaLabel="Period"
        size="sm"
        className="shrink-0"
      />
      )}
      {dates.length >= 2 && (
        <PeriodSlider
          dates={dates}
          from={range.from}
          to={range.to}
          granularity={spec.granularity}
          isDefault={isDefault}
          labelOf={datesAreMonthly ? (d) => formatMonthTick(Date.parse(d)) : undefined}
          onChange={setRange}
          onReset={() => onChange({ ...spec, range: { from: null, to: null } })}
        />
      )}
    </div>
  );
}
