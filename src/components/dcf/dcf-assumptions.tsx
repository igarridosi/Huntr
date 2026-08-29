"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPercent } from "@/lib/utils";
import type {
  DCFInputs,
  DCFScenarioKey,
  DCFScenarioSet,
  WACCEstimate,
} from "@/lib/calculations/dcf";
import { Anchor, Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

interface DCFAssumptionsProps {
  inputs: DCFInputs;
  waccEstimate: WACCEstimate | null;
  scenarios: DCFScenarioSet | null;
  activeScenario: DCFScenarioKey;
  onScenarioChange: (scenario: DCFScenarioKey) => void;
  onChange: (inputs: DCFInputs) => void;
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
        <span className="font-mono text-xs font-semibold tabular-nums tracking-[-0.01em] text-snow-peak">
          {displayValue}
          {suffix && <span className="text-mist ml-0.5">{suffix}</span>}
        </span>
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
    </div>
  );
}

export function DCFAssumptions({
  inputs,
  waccEstimate,
  scenarios,
  activeScenario,
  onScenarioChange,
  onChange,
}: DCFAssumptionsProps) {
  const update = (partial: Partial<DCFInputs>) =>
    onChange({ ...inputs, ...partial });

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
            min={-0.2}
            max={0.5}
            step={0.005}
            tooltip="Free cash flow as % of revenue (current)"
          />
          <SliderInput
            label="Terminal FCF Margin"
            value={inputs.terminalFCFMargin}
            onChange={(v) => update({ terminalFCFMargin: v })}
            min={-0.1}
            max={0.5}
            step={0.005}
            tooltip="Expected FCF margin at maturity"
          />
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
