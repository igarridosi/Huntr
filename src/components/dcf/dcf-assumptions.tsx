"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPercent } from "@/lib/utils";
import type { HistoricalBand } from "@/lib/calculations/dcf-anchors";
import type {
  DCFInputs,
  DCFScenarioKey,
  DCFScenarioSet,
  FCFMarginMode,
  WACCEstimate,
} from "@/lib/calculations/dcf";
import { Anchor, Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { reconcileWACC } from "@/lib/calculations/dcf-transparency";

/**
 * The three margin paths, with what each one actually assumes.
 *
 * Named for what they do to the projection rather than for the maths, because
 * the difference between them is a difference in claim about the business, not
 * in formula.
 */
const MARGIN_MODES: ReadonlyArray<{
  key: FCFMarginMode;
  label: string;
  hint: string;
}> = [
  {
    key: "constant",
    label: "Constant",
    hint: "Projected years keep today margin. The terminal margin touches only the terminal value.",
  },
  {
    key: "linear",
    label: "Linear",
    hint: "Margin moves in a straight line from today to terminal across the horizon. This is what the model has always done.",
  },
  {
    key: "converge",
    label: "Gradual",
    hint: "Margin improves slowly at first and lands on terminal at the end. The most conservative route to the same destination.",
  },
];

interface DCFAssumptionsProps {
  inputs: DCFInputs;
  /** Realised ranges for the assumptions that have a record to be judged against. */
  bands?: {
    growthPhase1?: HistoricalBand | null;
    baseMargin?: HistoricalBand | null;
    terminalMargin?: HistoricalBand | null;
  };
  waccEstimate: WACCEstimate | null;
  scenarios: DCFScenarioSet | null;
  activeScenario: DCFScenarioKey;
  onScenarioChange: (scenario: DCFScenarioKey) => void;
  onChange: (inputs: DCFInputs) => void;
}

/**
 * The figure beside a slider, typed rather than dragged.
 *
 * Percentages are entered the way people say them - 23.7 for 23.7% - because
 * asking for 0.237 in a field that displays "23.7%" is a trap. Committing on
 * blur and on Enter rather than on every keystroke keeps a half-typed "1" from
 * being read as 1% and re-running the whole model.
 */
function EditableValue({
  value,
  display,
  format,
  min,
  max,
  suffix,
  label,
  onCommit,
}: {
  value: number;
  display: string;
  format: "percent" | "number" | "currency" | "years";
  min: number;
  max: number;
  suffix?: string;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const scale = format === "percent" ? 100 : 1;

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(/[%,\s$]/g, ""));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    // Clamped to the slider's own range: the model is only defined over it,
    // and silently accepting a value the control cannot represent would put
    // the handle and the number in different places.
    onCommit(Math.min(max, Math.max(min, parsed / scale)));
  };

  return (
    <span className="flex items-baseline gap-0.5">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} value`}
        value={draft ?? display}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setDraft(String(+(value * scale).toFixed(4)))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "w-[4.5rem] rounded-md bg-transparent px-1 py-0.5 text-right",
          "font-mono text-xs font-semibold tabular-nums tracking-[-0.01em] text-snow-peak",
          "ring-1 ring-inset ring-transparent",
          "transition-[background-color,box-shadow] duration-150 ease-out",
          "hover:bg-snow-peak/[0.05] hover:ring-wolf-border/40",
          "focus:bg-wolf-black/60 focus:outline-none focus:ring-sunset-orange/55",
          "motion-reduce:transition-none"
        )}
      />
      {suffix && <span className="text-mist text-xs">{suffix}</span>}
    </span>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = "percent",
  suffix,
  tooltip,
  band,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: "percent" | "number" | "currency" | "years";
  suffix?: string;
  tooltip?: string;
  /** The company own record for this metric, drawn under the control. */
  band?: HistoricalBand | null;
}) {
  const inputId = useId();

  const displayValue = (() => {
    switch (format) {
      case "percent":
        return formatPercent(value, 1);
      case "years":
        return `${value}`;
      case "number":
        return value.toFixed(1);
      case "currency":
        return `$${value.toLocaleString()}`;
    }
  })();

  const fillPercent =
    max > min
      ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor={inputId}
            className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/70"
          >
            {label}
          </Label>
          {tooltip && (
            <span className="group relative inline-flex">
              {/* A focusable trigger, not a bare icon: hover alone left this
                  explanation unreachable on touch and by keyboard. */}
              <button
                type="button"
                aria-label={`What is ${label}?`}
                className="inline-flex h-6 w-6 cursor-help items-center justify-center rounded text-mist/50 transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sunset-orange sm:h-3 sm:w-3"
              >
                <Info className="h-3 w-3" />
              </button>
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[13rem] -translate-x-1/2 rounded-lg bg-wolf-black/95 px-2 py-1.5 text-[10px] leading-snug text-snow-peak shadow-xl ring-1 ring-inset ring-wolf-border/70 backdrop-blur-sm",
                  // Grows from the icon it belongs to rather than fading in
                  // place, so the explanation is visibly tied to its trigger.
                  // `nowrap` used to push it off the panel edge on narrow columns.
                  "origin-bottom scale-95 opacity-0 transition-[opacity,transform] duration-150 ease-settle",
                  "group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 group-active:scale-100 group-active:opacity-100",
                  "motion-reduce:transition-opacity motion-reduce:scale-100"
                )}
              >
                {tooltip}
              </span>
            </span>
          )}
        </div>
        {/* Editable, not just displayed.
            A slider cannot set a precise value: clicking its track positions
            by pixel proportion, so a click a few pixels off produces an
            arbitrary number that only the label reveals. That is how a bull
            case ended up with a starting margin far below the one intended.
            The number was always here - it just was not something you could
            type into. */}
        <EditableValue
          value={value}
          display={displayValue}
          format={format}
          min={min}
          max={max}
          suffix={suffix}
          label={label}
          onCommit={onChange}
        />
      </div>
      <input
        id={inputId}
        type="range"
        aria-label={label}
        title={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        // How far along its own range this assumption sits. The track paints
        // that fraction, so the control shows a proportion and not just a
        // handle position.
        style={{ "--range-fill": `${fillPercent}%` } as React.CSSProperties}
        className="huntr-range"
      />
      <div className="flex justify-between text-[9px] text-mist/40 font-mono">
        <span>{format === "percent" ? formatPercent(min, 0) : min}</span>
        <span>{format === "percent" ? formatPercent(max, 0) : max}</span>
      </div>
      {band ? <HistoricalBandStrip band={band} /> : null}
    </div>
  );
}

/**
 * What the company has actually done with this metric, under the slider that
 * assumes its future.
 *
 * The slider's own range is arbitrary - it exists so the control is usable, not
 * because those bounds mean anything. This strip is the range that does mean
 * something, and putting it directly underneath is what makes an assumption
 * outside the record obvious instead of merely available.
 */
function HistoricalBandStrip({ band }: { band: HistoricalBand }) {
  const medianPosition =
    band.max > band.min ? ((band.median - band.min) / (band.max - band.min)) * 100 : 50;

  return (
    <div className="space-y-1 pt-0.5">
      <div className="relative h-1.5 rounded-full bg-snow-peak/[0.06]">
        {/* The recorded span. The marker is clamped to the ends, so when the
            assumption leaves the record it parks on the edge and turns amber
            rather than disappearing off the side. */}
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-mist/20" />
        <div
          className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-mist/50"
          style={{ left: `${medianPosition}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm",
            band.beyondRecord ? "bg-golden-hour" : "bg-sunset-orange"
          )}
          style={{ left: `${band.position * 100}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px] text-mist/40">
        <span>{formatPercent(band.min, 1)}</span>
        <span className={cn(band.beyondRecord && "text-golden-hour/80")}>
          {band.beyondRecord
            ? "outside the record"
            : `${band.sampleSize}y range · med ${formatPercent(band.median, 1)}`}
        </span>
        <span>{formatPercent(band.max, 1)}</span>
      </div>
    </div>
  );
}

export function DCFAssumptions({
  inputs,
  bands,
  waccEstimate,
  scenarios,
  activeScenario,
  onScenarioChange,
  onChange,
}: DCFAssumptionsProps) {
  const update = (partial: Partial<DCFInputs>) =>
    onChange({ ...inputs, ...partial });

  // Linear is the model's long-standing behaviour, so an input set that never
  // specified a path keeps the numbers it always produced.
  const marginMode: FCFMarginMode = inputs.fcfMarginMode ?? "linear";
  const waccReconciliation = reconcileWACC(inputs.wacc, waccEstimate);

  return (
    <div className="space-y-5">
      {/* Scenario Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.09em] text-snow-peak">
            Scenario
          </h3>
          <span className="text-[10px] text-mist">
            One-click regime switch
          </span>
        </div>
        {/* Was a hand-rolled grid that swapped one option's background for
            another's. It sat directly under the page's own segmented control
            and looked identical to it, so behaving differently — jumping where
            the other travels — made two controls that are the same thing feel
            like two unrelated widgets. One indicator that moves also says
            which regime you came from. */}
        <SegmentedTabs
          size="sm"
          className="grid w-full grid-cols-3"
          ariaLabel="Valuation scenario"
          value={activeScenario}
          onChange={onScenarioChange}
          disabled={!scenarios}
          items={[
            { key: "bear", label: "Bear", icon: <TrendingDown className="h-3.5 w-3.5" /> },
            { key: "base", label: "Base", icon: <Anchor className="h-3.5 w-3.5" /> },
            { key: "bull", label: "Bull", icon: <TrendingUp className="h-3.5 w-3.5" /> },
          ] as const satisfies ReadonlyArray<{ key: DCFScenarioKey; label: string; icon: React.ReactNode }>}
        />
        {scenarios && (
          <p className="text-[10px] text-mist/70">
            Switching scenario updates growth, margins and WACC assumptions in real time.
          </p>
        )}

      </div>

      <Separator />

      {/* Growth Assumptions */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-snow-peak">
          <div className="w-1 h-3 rounded-full bg-sunset-orange" />
          Growth Assumptions
        </h3>
        <div className="space-y-4">
          <SliderInput
            label="Phase 1 Growth"
            value={inputs.growthRatePhase1}
            onChange={(v) => update({ growthRatePhase1: v })}
            band={bands?.growthPhase1}
            min={-0.1}
            max={0.5}
            step={0.005}
            tooltip="Revenue growth rate during high-growth phase"
          />
          <SliderInput
            label="Phase 1 Duration"
            value={inputs.yearsPhase1}
            onChange={(v) => update({ yearsPhase1: v })}
            min={1}
            max={10}
            step={1}
            format="years"
            suffix="yrs"
            tooltip="Number of years in high-growth phase"
          />
          <SliderInput
            label="Phase 2 Growth"
            value={inputs.growthRatePhase2}
            onChange={(v) => update({ growthRatePhase2: v })}
            min={-0.05}
            max={0.2}
            step={0.005}
            tooltip="Revenue growth during stable/mature phase"
          />
          <SliderInput
            label="Phase 2 Duration"
            value={inputs.yearsPhase2}
            onChange={(v) => update({ yearsPhase2: v })}
            min={1}
            max={10}
            step={1}
            format="years"
            suffix="yrs"
            tooltip="Number of years in stable phase"
          />
        </div>
      </div>

      <Separator />

      {/* Margin Assumptions */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-snow-peak">
          <div className="h-3 w-1 rounded-full bg-bullish" />
          Margin Assumptions
        </h3>
        <div className="space-y-4">
          <SliderInput
            label="Current FCF Margin"
            value={inputs.baseFCFMargin}
            onChange={(v) => update({ baseFCFMargin: v })}
            band={bands?.baseMargin}
            min={-0.2}
            max={0.5}
            step={0.005}
            tooltip="Free cash flow as % of revenue (current)"
          />
          <SliderInput
            label={
              marginMode === "constant"
                ? "Terminal FCF Margin (terminal value only)"
                : "Terminal FCF Margin (drives every year)"
            }
            value={inputs.terminalFCFMargin}
            onChange={(v) => update({ terminalFCFMargin: v })}
            band={bands?.terminalMargin}
            min={-0.1}
            max={0.5}
            step={0.005}
            tooltip={
              marginMode === "constant"
                ? "Applied to the terminal value only. Projected years hold the current margin."
                : "Not just a terminal-value input: the margin travels from current to this figure across every projected year, which makes this one of the most leveraged sliders here."
            }
          />

          {/* Which path the margin takes was never visible, and it changes what
              this panel means: under interpolation the terminal margin is not a
              terminal-value input at all, it drags all ten years with it. */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
              Margin path
            </p>
            <div className="flex items-center gap-1 rounded-lg bg-snow-peak/[0.04] p-1 ring-1 ring-inset ring-wolf-border/40">
              {MARGIN_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => update({ fcfMarginMode: mode.key })}
                  title={mode.hint}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-[11px] font-medium",
                    "transition-[background-color,color,transform] duration-150 ease-out",
                    "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                    marginMode === mode.key
                      ? "bg-sunset-orange/15 text-sunset-orange"
                      : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-mist/60">
              {MARGIN_MODES.find((mode) => mode.key === marginMode)?.hint}
            </p>
          </div>
        </div>
      </div>

      <Separator />


      {/* Discount Rate */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-snow-peak">
          <div className="w-1 h-3 rounded-full bg-golden-hour" />
          Discount Rate
        </h3>
        <div className="space-y-4">
          <SliderInput
            label="WACC"
            value={inputs.wacc}
            onChange={(v) => update({ wacc: v })}
            min={0.04}
            max={0.2}
            step={0.0025}
            tooltip="Weighted average cost of capital"
          />

          {/* End-of-year discounting assumes every dollar of a year's cash
              arrives on 31 December. It does not; it arrives through the year.
              Discounting at t - 0.5 is the standard banking convention and
              worth roughly 4-5% on the valuation, so it is offered rather than
              imposed - and off by default, so saved scenarios keep their
              numbers. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-snow-peak/[0.03] p-2.5 ring-1 ring-inset ring-wolf-border/40">
            <input
              type="checkbox"
              checked={inputs.midYearConvention ?? false}
              onChange={(event) =>
                update({ midYearConvention: event.target.checked })
              }
              className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-sunset-orange"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-snow-peak">
                Mid-year convention
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-mist/70">
                Discount at t &minus; 0.5 instead of t, treating cash as arriving
                through the year rather than on its last day. Typically lifts the
                valuation 4&ndash;5%.
              </span>
            </span>
          </label>
          {waccEstimate && (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px] font-mono">
                Ke: {formatPercent(waccEstimate.costOfEquity, 1)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                Kd: {formatPercent(waccEstimate.costOfDebt, 1)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                E/V: {formatPercent(waccEstimate.weightEquity, 0)}
              </Badge>
            </div>
          )}

          {/* The slider and the components underneath were never connected. You
              could sit on a 9.5% WACC while Ke, Kd and the weights implied
              11.5%, and nothing on screen would disagree. Since WACC is usually
              the input that moves the answer most, that gap can invalidate a
              whole valuation quietly — the model looks internally consistent
              precisely because the contradiction is never stated. */}
          {waccReconciliation?.isOverride && waccReconciliation.calculated !== null ? (
            <p className="font-mono text-[11px] text-bearish">
              Override: {formatPercent(waccReconciliation.applied, 1)} (calculated:{" "}
              {formatPercent(waccReconciliation.calculated, 1)})
            </p>
          ) : null}

          {waccReconciliation?.isAllEquity && waccReconciliation.isOverride ? (
            <p className="text-[10px] leading-relaxed text-mist/70">
              This company carries no meaningful debt, so the weighted average
              should converge on the cost of equity. If it has not, check the
              capital structure was recalculated for this ticker.
            </p>
          ) : null}
          <SliderInput
            label="Terminal Growth"
            value={inputs.terminalGrowthRate}
            onChange={(v) => update({ terminalGrowthRate: v })}
            min={0.0}
            max={0.05}
            step={0.0025}
            tooltip="Perpetuity growth rate (typically GDP-like: 2-3%)"
          />
        </div>
      </div>
    </div>
  );
}
