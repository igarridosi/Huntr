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
import { Anchor, Info, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor={inputId}
            className="text-[11px] text-mist uppercase tracking-wider font-medium"
          >
            {label}
          </Label>
          {tooltip && (
            <div className="group relative">
              <Info className="w-3 h-3 text-mist/50 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-snow-peak bg-wolf-black border border-wolf-border rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <span className="text-xs font-mono font-bold text-snow-peak tabular-nums">
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
        className={cn(
          "w-full h-1.5 rounded-full appearance-none cursor-pointer",
          "bg-wolf-border/60",
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
          "[&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-sunset-orange",
          "[&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,140,66,0.4)]",
          "[&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-webkit-slider-thumb]:transition-shadow",
          "[&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(255,140,66,0.6)]",
          "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sunset-orange",
          "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        )}
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
          <h3 className="text-xs font-semibold text-snow-peak uppercase tracking-wider">
            Scenario
          </h3>
          <span className="text-[10px] text-mist">
            One-click regime switch
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-wolf-border/40 bg-wolf-black/40 p-1">
          {([
            { key: "bear", label: "Bear", Icon: TrendingDown },
            { key: "base", label: "Base", Icon: Anchor },
            { key: "bull", label: "Bull", Icon: TrendingUp },
          ] as const satisfies ReadonlyArray<{ key: DCFScenarioKey; label: string; Icon: LucideIcon }>).map((item) => {
            const isActive = activeScenario === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={!scenarios}
                onClick={() => onScenarioChange(item.key)}
                className={cn(
                  "h-8 rounded-md text-xs font-medium transition-all cursor-pointer",
                  "border border-transparent",
                  isActive
                    ? "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/30"
                    : "text-mist hover:text-snow-peak hover:bg-wolf-surface/70",
                  !scenarios && "opacity-40 cursor-not-allowed"
                )}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <item.Icon className="w-3.5 h-3.5" />
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        {scenarios && (
          <p className="text-[10px] text-mist/70">
            Switching scenario updates growth, margins and WACC assumptions in real time.
          </p>
        )}
      </div>

      <Separator />

      {/* Growth Assumptions */}
      <div>
        <h3 className="text-xs font-semibold text-snow-peak uppercase tracking-wider mb-3 flex items-center gap-2">
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
        <h3 className="text-xs font-semibold text-snow-peak uppercase tracking-wider mb-3 flex items-center gap-2">
          <div className="w-1 h-3 rounded-full bg-[#4DC990]" />
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
        <h3 className="text-xs font-semibold text-snow-peak uppercase tracking-wider mb-3 flex items-center gap-2">
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
