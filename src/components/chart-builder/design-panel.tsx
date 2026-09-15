"use client";

import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SelectMenu, type SelectMenuGroup } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import {
  CANVAS_THEMES,
  METRIC_GROUPS,
  SERIES_PALETTE,
  metricsInGroup,
  seriesInk,
  type AspectRatio,
  type AxisFormat,
  type CanvasTheme,
  type ChartSeries,
  type ChartSpec,
  type ChartStyle,
  type LegendPosition,
  type MetricId,
  type PeriodAlignment,
  type SeriesShape,
  type SeriesTransform,
  type StatementKind,
  type ValueLabels,
} from "@/lib/chart-builder";

export interface DataSourceState {
  /** Tickers whose statements come from the Alpha Vantage history. */
  deepTickers: string[];
  /** Statements the chart reads — what a load will ask for. */
  statements: readonly StatementKind[];
  loading: boolean;
  /** Why the deep source cannot be used right now, if it cannot. */
  blocked?: "throttled" | "not_configured" | null;
  onLoadDeep: () => void;
}

interface DesignPanelProps {
  spec: ChartSpec;
  onChange: (next: ChartSpec, coalesce?: string) => void;
  dataSource: DataSourceState;
}

const MIXED = "__mixed__" as const;

const TRANSFORMS: ReadonlyArray<{ value: SeriesTransform; label: string }> = [
  { value: "raw", label: "As reported" },
  { value: "per_share", label: "Per share" },
  { value: "ttm", label: "Trailing 12 months" },
  { value: "yoy", label: "Year-over-year %" },
  { value: "indexed", label: "Indexed to start %" },
];

const METRIC_GROUP_OPTIONS: ReadonlyArray<SelectMenuGroup<MetricId>> = METRIC_GROUPS.map((group) => ({
  label: group,
  options: metricsInGroup(group).map((m) => ({ value: m.id, label: m.label })),
}));

const AXIS_FORMATS: ReadonlyArray<SelectMenuGroup<AxisFormat>> = [
  {
    label: "Format",
    options: [
      { value: "auto", label: "Auto" },
      { value: "currency", label: "Currency" },
      { value: "percent", label: "Percent" },
      { value: "number", label: "Plain number" },
    ],
  },
];

/** The shared value of a series field, or MIXED when the series disagree. */
function common<K extends keyof ChartSeries>(series: ChartSeries[], key: K): ChartSeries[K] | typeof MIXED {
  if (series.length === 0) return MIXED;
  const first = series[0][key];
  return series.every((s) => s[key] === first) ? first : MIXED;
}

/**
 * Everything that applies to the whole chart. The first group edits the
 * series in bulk — metric, transform and shape are usually the same across
 * a comparison, so they are set once here and only overridden per series
 * in the inspector when a chart mixes them.
 */
export function DesignPanel({ spec, onChange, dataSource }: DesignPanelProps) {
  const style = (changes: Partial<ChartStyle>, coalesce?: string) => onChange({ ...spec, style: { ...spec.style, ...changes } }, coalesce);
  const bulk = (changes: Partial<ChartSeries>) => onChange({ ...spec, series: spec.series.map((s) => ({ ...s, ...changes })) });

  const metric = common(spec.series, "metric");
  const transform = common(spec.series, "transform");
  const shape = common(spec.series, "shape");
  const withMixed = <T extends string>(groups: ReadonlyArray<SelectMenuGroup<T>>, mixed: boolean): ReadonlyArray<SelectMenuGroup<T | typeof MIXED>> =>
    mixed ? [{ label: "", options: [{ value: MIXED, label: "Mixed — set for all" }] }, ...groups] : groups;

  const shapeItems: ReadonlyArray<{ key: SeriesShape | typeof MIXED; label: string }> = [
    ...(shape === MIXED ? [{ key: MIXED, label: "Mixed" }] : []),
    { key: "bar", label: "Bar" },
    { key: "line", label: "Line" },
    { key: "area", label: "Area" },
  ];

  const tickers = Array.from(new Set(spec.series.map((s) => s.ticker)));
  const missingDeep = tickers.filter((t) => !dataSource.deepTickers.includes(t));
  const allDeep = tickers.length > 0 && missingDeep.length === 0;
  const someDeep = dataSource.deepTickers.length > 0 && !allDeep;
  const statementNames: Record<StatementKind, string> = { income: "income statement", balance: "balance sheet", cashflow: "cash flow" };
  const askFor = dataSource.statements.map((k) => statementNames[k]).join(" + ");

  return (
    <section aria-label="Design" className="rounded-2xl bg-wolf-surface p-3.5 ring-1 ring-inset ring-wolf-border/60">
      <Group title="Data" first>
        <Row label="Metric">
          <SelectMenu<MetricId | typeof MIXED>
            groups={withMixed(METRIC_GROUP_OPTIONS, metric === MIXED)}
            value={metric}
            onChange={(v) => v !== MIXED && bulk({ metric: v })}
            ariaLabel="Metric for every series"
          />
        </Row>
        <Row label="Transform">
          <SelectMenu<SeriesTransform | typeof MIXED>
            groups={withMixed([{ label: "Transform", options: TRANSFORMS }], transform === MIXED)}
            value={transform}
            onChange={(v) => v !== MIXED && bulk({ transform: v })}
            ariaLabel="Transform for every series"
          />
        </Row>
        <Row label="Shape">
          <SegmentedTabs<SeriesShape | typeof MIXED>
            items={shapeItems}
            value={shape}
            onChange={(v) => v !== MIXED && bulk({ shape: v })}
            ariaLabel="Shape for every series"
            size="sm"
          />
        </Row>
        <Row label="Periods" hint="Common hides quarters that not every company has filed yet.">
          <SegmentedTabs<PeriodAlignment>
            items={[
              { key: "common", label: "Common" },
              { key: "all", label: "All" },
            ]}
            value={spec.align}
            onChange={(align) => onChange({ ...spec, align })}
            ariaLabel="Period alignment"
            size="sm"
          />
        </Row>
        <div className="flex flex-col gap-1.5">
          <Button
            variant={allDeep ? "ghost" : "secondary"}
            size="sm"
            className="w-full justify-start"
            disabled={dataSource.loading || allDeep || spec.series.length === 0}
            onClick={dataSource.onLoadDeep}
          >
            {dataSource.loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1.5 h-3.5 w-3.5" />}
            {allDeep ? "20-year history loaded" : someDeep ? `Load history for ${missingDeep.length} more` : "Load 20-year history"}
          </Button>
          <p className="px-1 text-[11px] leading-snug text-mist">
            {allDeep
              ? "Powered by Alpha Vantage · full statement history."
              : dataSource.blocked === "throttled"
                ? "Alpha Vantage is rate-limited right now; the rest stay on Yahoo Finance until it clears."
                : someDeep
                  ? `Alpha Vantage for ${dataSource.deepTickers.join(", ")}; Yahoo Finance for ${missingDeep.join(", ")}.${spec.align === "common" ? " With Periods on Common the chart shows only what every company has — load the rest or switch to All." : ""}`
                  : `Yahoo Finance · last few periods. Alpha Vantage adds up to 20 years — ${dataSource.statements.length || 1} call${dataSource.statements.length === 1 ? "" : "s"} per company (${askFor || "income statement"} only).`}
          </p>
        </div>
      </Group>

      <Group title="Canvas">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Canvas theme">
          {(Object.keys(CANVAS_THEMES) as CanvasTheme[]).map((key) => {
            const t = CANVAS_THEMES[key];
            const active = spec.style.theme === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${t.name} theme`}
                onClick={() => style({ theme: key })}
                className={cn(
                  "relative h-10 flex-1 overflow-hidden rounded-lg border-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                  active ? "border-sunset-orange" : "border-transparent ring-1 ring-inset ring-wolf-border/60"
                )}
                style={{ background: t.bg }}
              >
                <span className="absolute left-2 top-1 text-[9px] font-semibold uppercase tracking-[0.06em]" style={{ color: t.tick }}>
                  {t.name}
                </span>
                <span className="absolute bottom-1.5 left-2 right-2 flex h-3 items-end gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="flex-1 rounded-[1px]" style={{ background: seriesInk(SERIES_PALETTE[i], key), height: `${100 - i * 28}%` }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <Row label="Aspect">
          <SegmentedTabs<AspectRatio>
            items={[
              { key: "16:9", label: "16:9" },
              { key: "4:3", label: "4:3" },
              { key: "1:1", label: "1:1" },
            ]}
            value={spec.style.aspect}
            onChange={(aspect) => style({ aspect })}
            ariaLabel="Aspect ratio"
            size="sm"
          />
        </Row>
      </Group>

      <Group title="Legend & labels">
        <Row label="Legend">
          <SegmentedTabs<LegendPosition>
            items={[
              { key: "top", label: "Top" },
              { key: "bottom", label: "Bottom" },
              { key: "hidden", label: "Off" },
            ]}
            value={spec.style.legend}
            onChange={(legend) => style({ legend })}
            ariaLabel="Legend position"
            size="sm"
          />
        </Row>
        <Row label="Values">
          <SegmentedTabs<ValueLabels>
            items={[
              { key: "none", label: "None" },
              { key: "last", label: "Last" },
              { key: "ends", label: "Ends" },
              { key: "all", label: "All" },
            ]}
            value={spec.style.valueLabels}
            onChange={(valueLabels) => style({ valueLabels })}
            ariaLabel="Value labels"
            size="sm"
          />
        </Row>
        <Row label="Grid">
          <Switch checked={spec.style.grid} onChange={(grid) => style({ grid })} label="Grid" />
        </Row>
        <Row label="Watermark">
          <Switch checked={spec.style.watermark} onChange={(watermark) => style({ watermark })} label="Watermark" />
        </Row>
      </Group>

      <Group title="Bars & lines">
        <Row label="Stacked">
          <Switch checked={spec.style.stacked} onChange={(stacked) => style({ stacked })} label="Stack bars" />
        </Row>
        <Row label="Bar radius">
          <SegmentedTabs<"0" | "2" | "4">
            items={[
              { key: "0", label: "0" },
              { key: "2", label: "2" },
              { key: "4", label: "4" },
            ]}
            value={String(spec.style.barRadius) as "0" | "2" | "4"}
            onChange={(v) => style({ barRadius: Number(v) as 0 | 2 | 4 })}
            ariaLabel="Bar corner radius"
            size="sm"
          />
        </Row>
        <Row label="Line width">
          <SegmentedTabs<"1.5" | "2" | "2.5">
            items={[
              { key: "1.5", label: "1.5" },
              { key: "2", label: "2" },
              { key: "2.5", label: "2.5" },
            ]}
            value={String(spec.style.lineWidth) as "1.5" | "2" | "2.5"}
            onChange={(v) => style({ lineWidth: Number(v) as 1.5 | 2 | 2.5 })}
            ariaLabel="Line width"
            size="sm"
          />
        </Row>
      </Group>

      <Group title="Axes">
        <Row label="Left">
          <SelectMenu<AxisFormat> groups={AXIS_FORMATS} value={spec.style.yLeftFormat} onChange={(yLeftFormat) => style({ yLeftFormat })} ariaLabel="Left axis format" />
        </Row>
        <Row label="Right">
          <SelectMenu<AxisFormat> groups={AXIS_FORMATS} value={spec.style.yRightFormat} onChange={(yRightFormat) => style({ yRightFormat })} ariaLabel="Right axis format" />
        </Row>
      </Group>
    </section>
  );
}

function Group({ title, first = false, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2.5 py-3", !first && "border-t border-wolf-border/60", first && "pt-0.5")}>
      <h2 className="px-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/85">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2 px-1">
      <span className="text-xs text-mist/85" title={hint}>
        {label}
      </span>
      <div className="flex min-w-0 justify-end [&>*]:min-w-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full ring-1 ring-inset ring-wolf-border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
        checked ? "bg-sunset-orange/25" : "bg-wolf-black"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-[transform,background-color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
          checked ? "translate-x-4 bg-sunset-orange" : "bg-mist"
        )}
      />
    </button>
  );
}
