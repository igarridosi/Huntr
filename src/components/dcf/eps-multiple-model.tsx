"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useChartColors } from "@/hooks/use-chart-colors";
import { TrendingUp, TrendingDown, Calculator, Zap } from "lucide-react";

export interface EPSMultipleInputs {
  eps: number;
  growth: number;
  targetPE: number;
  targetReturn: number;
}

interface EPSMultipleModelProps {
  ticker: string;
  queryTicker: string;
  companyName?: string;
  companyMeta?: string;
  isPreparingData?: boolean;
  canAutoFill: boolean;
  onTickerSelect: (ticker: string) => void;
  onAutoFill: () => void;
  currentPrice: number;
  inputs: EPSMultipleInputs;
  onChange: (next: EPSMultipleInputs) => void;
}

const DEFAULT_HORIZON_YEARS = 5;

export function EPSMultipleModel({
  ticker,
  queryTicker,
  companyName,
  companyMeta,
  isPreparingData = false,
  canAutoFill,
  onTickerSelect,
  onAutoFill,
  currentPrice,
  inputs,
  onChange,
}: EPSMultipleModelProps) {
  const currentYear = new Date().getFullYear();

  const futureEPS = inputs.eps * Math.pow(1 + inputs.growth, DEFAULT_HORIZON_YEARS);
  const futureTargetPrice = futureEPS * inputs.targetPE;
  const intrinsicValue =
    futureTargetPrice / Math.pow(1 + inputs.targetReturn, DEFAULT_HORIZON_YEARS);

  const projectedAnnualReturnFromToday =
    currentPrice > 0
      ? Math.pow(futureTargetPrice / currentPrice, 1 / DEFAULT_HORIZON_YEARS) - 1
      : 0;
  const entryPriceForTargetReturn = intrinsicValue;

  const projectionData = Array.from({ length: DEFAULT_HORIZON_YEARS }, (_, i) => {
    const year = i + 1;
    const projectedEPS = inputs.eps * Math.pow(1 + inputs.growth, year);
    const projectedPrice = projectedEPS * inputs.targetPE;
    return {
      period: `Q1 ${currentYear + year}`,
      year,
      projectedPrice,
      projectedEPS,
    };
  });

  const upside =
    currentPrice > 0 ? (intrinsicValue - currentPrice) / currentPrice : 0;
  const marginOfSafety =
    intrinsicValue > 0 ? (intrinsicValue - currentPrice) / intrinsicValue : 0;

  const isUndervalued = upside > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 lg:self-start lg:sticky lg:top-4">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center gap-3">
                    <DCFTickerInput value={queryTicker} onSelect={onTickerSelect} />
                    {canAutoFill && (
                    <Button size="sm" onClick={onAutoFill} className="shrink-0">
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Auto-Fill
                    </Button>
                    )}
                </div>
                

                {queryTicker && companyName && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TickerLogo ticker={queryTicker} className="w-8 h-8 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-snow-peak truncate">
                        {companyName}
                      </p>
                      {companyMeta ? (
                        <p className="text-[11px] text-mist truncate">{companyMeta}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                
              </div>
            </CardContent>
          </Card>

          {isPreparingData && (
            <DataHuntingLoader ticker={queryTicker} compact />
          )}

          <Card className="lg:max-h-[calc(60vh-2rem)] lg:flex lg:flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              EPS Multiple Inputs
              <Badge variant="outline" className="text-[9px] font-mono">
                Simple
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-3 space-y-4">
            <SimpleInput
              label="EPS"
              helper="Current or normalized EPS"
              value={inputs.eps}
              step={0.01}
              min={0}
              onChange={(v) => onChange({ ...inputs, eps: Math.max(0, v) })}
            />
            <SimpleInput
              label="Growth"
              helper="Expected annual EPS growth"
              value={inputs.growth * 100}
              suffix="%"
              step={0.1}
              min={-50}
              max={100}
              onChange={(v) => onChange({ ...inputs, growth: v / 100 })}
            />
            <SimpleInput
              label="Target PE"
              helper={`Exit multiple in year ${DEFAULT_HORIZON_YEARS}`}
              value={inputs.targetPE}
              step={0.1}
              min={1}
              onChange={(v) => onChange({ ...inputs, targetPE: Math.max(1, v) })}
            />
            <SimpleInput
              label="Target Return"
              helper="Required annual return"
              value={inputs.targetReturn * 100}
              suffix="%"
              step={0.1}
              min={0}
              max={50}
              onChange={(v) => onChange({ ...inputs, targetReturn: v / 100 })}
            />

            <div className="rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                Formula
              </p>
              <p className="text-xs text-mist leading-relaxed">
                Fair Value = (EPS x (1 + Growth)^{DEFAULT_HORIZON_YEARS} x Target PE) / (1 + Target Return)^{DEFAULT_HORIZON_YEARS}
              </p>
            </div>
          </CardContent>
          </Card>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        <Card className="insight-enter" style={{ "--enter-delay": "0ms" } as React.CSSProperties}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">EPS Multiple Output</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Same verdict surface as the DCF model. Two models answering the
                same question should look identical when they agree, so the user
                is comparing numbers and not decoding two visual languages. */}
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset",
                isUndervalued
                  ? "bg-bullish/[0.06] ring-bullish/25"
                  : "bg-bearish/[0.06] ring-bearish/25"
              )}
            >
              <div className="absolute right-3 top-3">
                <Badge
                  variant={isUndervalued ? "bullish" : "bearish"}
                  className="font-mono text-[10px]"
                >
                  {isUndervalued ? "UNDERVALUED" : "OVERVALUED"}
                </Badge>
              </div>

              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/70">
                Intrinsic value · {ticker || "STOCK"}
              </p>
              <p className="mt-1.5 font-mono text-3xl font-semibold tabular-nums tracking-[-0.03em] text-snow-peak">
                {formatCurrency(intrinsicValue)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5">
                  {isUndervalued ? (
                    <TrendingUp className="h-4 w-4 text-bullish" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-bearish" />
                  )}
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold tabular-nums",
                      isUndervalued ? "text-bullish" : "text-bearish"
                    )}
                  >
                    {upside > 0 ? "+" : ""}
                    {formatPercent(upside, 1)}
                  </span>
                </div>
                <span className="text-xs text-mist">
                  vs. {formatCurrency(currentPrice)} current
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="insight-enter" style={{ "--enter-delay": "60ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Calculation Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
                <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                  Annual return from today&apos;s price
                </p>
                <p
                  className={cn(
                    "mt-1 font-mono text-lg font-semibold tabular-nums tracking-[-0.02em]",
                    projectedAnnualReturnFromToday >= 0 ? "text-bullish" : "text-bearish"
                  )}
                >
                  {projectedAnnualReturnFromToday > 0 ? "+" : ""}
                  {formatPercent(projectedAnnualReturnFromToday, 2)}
                </p>
              </div>
              <div className="rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
                <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                  Entry price for {formatPercent(inputs.targetReturn, 0)} return
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-[-0.02em] text-snow-peak">
                  {formatCurrency(entryPriceForTargetReturn)}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                  5Y Projected Price Path
                </p>
                <ExpandChartDialog title="5Y Projected Price Path">
                  <ProjectionLineChart data={projectionData} height={420} />
                </ExpandChartDialog>
              </div>
              <ProjectionLineChart data={projectionData} height={260} />
            </div>
          </CardContent>
        </Card>

        <Card className="insight-enter" style={{ "--enter-delay": "120ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Simple Projection Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Current EPS" value={inputs.eps.toFixed(2)} />
              <Metric
                label="5Y Forward EPS"
                value={futureEPS.toFixed(2)}
              />
              <Metric
                label="Future Target Price"
                value={formatCurrency(futureTargetPrice)}
              />
              <Metric
                label="Discounted Fair Value"
                value={formatCurrency(intrinsicValue)}
                strong
              />
              <Metric
                label="Margin of Safety"
                value={formatPercent(marginOfSafety, 1)}
              />
              <Metric
                label="Required Return"
                value={formatPercent(inputs.targetReturn, 1)}
              />
            </div>
          </CardContent>
        </Card>

        <p className="flex items-center gap-2 px-1 text-xs text-mist/70">
          <Calculator className="h-3.5 w-3.5 shrink-0 text-sunset-orange/70" />
          Modeled with a fixed {DEFAULT_HORIZON_YEARS}-year horizon for quick decision making.
        </p>
      </div>
    </div>
  );
}

function ProjectionLineChart({
  data,
  height,
}: {
  data: Array<{ period: string; projectedPrice: number }>;
  height: number;
}) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="2 3" stroke={c.grid} strokeOpacity={0.35} vertical={false} />
        <XAxis
          dataKey="period"
          axisLine={false}
          tickLine={false}
          tick={{ fill: c.tick, fontSize: 11 }}
          dy={8}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: c.tick, fontSize: 11 }}
          width={60}
          tickFormatter={(v: number) =>
            Intl.NumberFormat("en-US", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(v)
          }
        />
        <Tooltip
          cursor={{ stroke: c.bullish, strokeOpacity: 0.35, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            const value = Number(payload[0]?.value ?? 0);
            return (
              <div className="rounded-xl bg-wolf-surface/95 px-2.5 py-2 shadow-xl ring-1 ring-inset ring-wolf-border/70 backdrop-blur-sm">
                <p className="mb-0.5 text-[10px] text-mist">{label}</p>
                <p className="text-xs font-mono text-snow-peak">
                  Projected Price: {formatCurrency(value)}
                </p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="projectedPrice"
          stroke={c.bullish}
          strokeWidth={2.5}
          dot={{ r: 4, fill: c.bullish, stroke: c.dotStroke, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: c.bullish, stroke: c.dotStroke, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SimpleInput({
  label,
  helper,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  helper: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  // Mirror the bounds the range input itself falls back to, so the painted
  // track and the handle always agree. Computing only for explicitly bounded
  // inputs left EPS and target PE with an empty track under a handle that was
  // plainly somewhere in the middle.
  const rangeMin = min ?? 0;
  const rangeMax = max ?? 100;
  const fillPercent =
    rangeMax > rangeMin
      ? Math.min(100, Math.max(0, ((safeValue - rangeMin) / (rangeMax - rangeMin)) * 100))
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/70">
          {label}
        </Label>
        <span className="font-mono text-xs font-semibold tabular-nums tracking-[-0.01em] text-snow-peak">
          {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <Input
        type="number"
        value={safeValue}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        className="font-mono"
      />
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        style={{ "--range-fill": `${fillPercent}%` } as React.CSSProperties}
        className="huntr-range"
      />
      <p className="text-[10px] text-mist/70">{helper}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">{label}</p>
      <p className={cn("text-sm font-mono mt-1", strong ? "text-sunset-orange font-bold" : "text-snow-peak")}>
        {value}
      </p>
    </div>
  );
}
