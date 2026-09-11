"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { DEFAULT_GROWTH_MARGIN_CORRELATION, DEFAULT_MC_WEIGHTS } from "@/lib/calculations";
import type { MonteCarloResult, MonteCarloWeights } from "@/lib/calculations/dcf";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

interface DCFMonteCarloProps {
  /**
   * The simulation the page ran. This panel used to run its own alongside the
   * decision engine running a second one, with a different seed and a
   * different iteration count, so the two printed different odds for the same
   * event. Both now read one run.
   */
  monteCarlo: MonteCarloResult | null;
  /** Today price, for the reference line and the hit-rate shading. */
  currentPrice: number;
  /** How likely each scenario is. These drive the sampling, so they belong here. */
  weights: MonteCarloWeights;
  onWeightsChange: (weights: MonteCarloWeights) => void;
  /** How tightly growth and margin move together, 0 to 1. */
  correlation: number;
  onCorrelationChange: (correlation: number) => void;
}

export function DCFMonteCarlo({
  monteCarlo,
  currentPrice,
  weights,
  onWeightsChange,
  correlation,
  onCorrelationChange,
}: DCFMonteCarloProps) {
  const mc = monteCarlo;
  const [showSettings, setShowSettings] = useState(false);

  // Build histogram buckets
  const histogram = useMemo(() => {
    if (!mc) return [];
    const numBuckets = 30;
    const min = mc.p10 * 0.8;
    const max = mc.p90 * 1.2;
    const bucketWidth = (max - min) / numBuckets;
    const buckets: { min: number; max: number; count: number; mid: number }[] =
      [];

    for (let i = 0; i < numBuckets; i++) {
      const lo = min + i * bucketWidth;
      const hi = lo + bucketWidth;
      buckets.push({
        min: lo,
        max: hi,
        mid: (lo + hi) / 2,
        count: mc.simulations.filter((v) => v >= lo && v < hi).length,
      });
    }

    return buckets;
  }, [mc]);

  const maxCount = histogram.length > 0 ? Math.max(...histogram.map((b) => b.count)) : 0;

  if (!mc) return null;

  const coherence = mc.coherence;
  const totalWeight = weights.bear + weights.base + weights.bull;
  const misparameterised =
    coherence !== undefined && (!coherence.p10CoversBear || !coherence.p90CoversBull);

  return (
    <div className="@container space-y-4">
      {/* The check the plan asks for, run on every simulation rather than left
          to a test suite. A P10 above the hand-built bear case means the
          sampling is not covering the downside, and the range below should not
          be read as trustworthy until it is. Non-blocking: it informs. */}
      {misparameterised && coherence ? (
        <div className="flex items-start gap-2 rounded-xl bg-golden-hour/[0.08] p-3 ring-1 ring-inset ring-golden-hour/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-golden-hour">
              This range may understate the risk
            </p>
            <p className="text-[11px] leading-relaxed text-mist/85">
              {!coherence.p10CoversBear
                ? `The 10th percentile (${formatCurrency(mc.p10, { decimals: 0 })}) sits above your Bear scenario (${formatCurrency(coherence.bearValue, { decimals: 0 })}). A tenth percentile better than your pessimistic case means the simulation is not reaching the downside.`
                : `The 90th percentile (${formatCurrency(mc.p90, { decimals: 0 })}) falls short of your Bull scenario (${formatCurrency(coherence.bullValue, { decimals: 0 })}). The simulation is not reaching the upside you built.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <StatBox label="Mean" value={formatCurrency(mc.mean, { decimals: 0 })} />
        <StatBox
          label="Median"
          value={formatCurrency(mc.median, { decimals: 0 })}
        />
        <StatBox
          label="P10"
          value={formatCurrency(mc.p10, { decimals: 0 })}
          dim
        />
        <StatBox
          label="P90"
          value={formatCurrency(mc.p90, { decimals: 0 })}
          dim
        />
      </div>

      {/* Histogram */}
      <div className="relative rounded-xl bg-snow-peak/[0.025] p-4 ring-1 ring-inset ring-wolf-border/35">
        <div className="flex items-end gap-px h-[140px]">
          {histogram.map((bucket, i) => {
            const height =
              maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
            const isAbovePrice = bucket.mid >= currentPrice;
            const isPriceInBucket =
              currentPrice >= bucket.min && currentPrice < bucket.max;

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-stretch justify-end h-full relative group"
              >
                <div
                  className={cn(
                    "rounded-sm transition-all",
                    isPriceInBucket
                      ? "bg-golden-hour"
                      : isAbovePrice
                        ? "bg-bullish/70"
                        : "bg-bearish/50",
                    "group-hover:opacity-80"
                  )}
                  style={{ height: `${Math.max(1, height)}%` }}
                />
                {/* Tooltip */}
                {/* group-active covers touch: the value shows while the finger
                    is held on the bar, since there is no hover to rely on. */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-wolf-black/95 px-2 py-1 font-mono text-[9px] ring-1 ring-inset ring-wolf-border/70 backdrop-blur-sm text-snow-peak opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
                  {formatCurrency(bucket.mid, { decimals: 0 })} ({bucket.count})
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Price Line */}
        {(() => {
          const min = histogram[0]?.min ?? 0;
          const max = histogram[histogram.length - 1]?.max ?? 1;
          const pos =
            max > min
              ? ((currentPrice - min) / (max - min)) * 100
              : 50;
          if (pos < 0 || pos > 100) return null;
          return (
            <div
              className="absolute top-4 bottom-4 w-px bg-golden-hour/60 z-10"
              style={{ left: `calc(${pos}% + 16px)` }}
            >
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-wolf-black/90 px-1.5 py-0.5 font-mono text-[8px] text-golden-hour ring-1 ring-inset ring-golden-hour/30">
                Price
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom Summary */}
      <div className="flex items-center justify-between rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-bullish" />
          <span className="text-[11px] text-mist">
            Probability above current price
          </span>
        </div>
        <Badge
          variant={mc.probabilityAbovePrice >= 0.5 ? "bullish" : "bearish"}
          className="font-mono text-xs"
        >
          {formatPercent(mc.probabilityAbovePrice, 1)}
        </Badge>
      </div>

      {/* Confidence Interval */}
      <div className="space-y-2 rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35">
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
          Confidence Intervals
        </p>
        <div className="space-y-1.5">
          <ConfidenceBar
            label="80% CI"
            low={mc.p10}
            high={mc.p90}
            current={currentPrice}
            median={mc.median}
          />
          <ConfidenceBar
            label="50% CI"
            low={mc.p25}
            high={mc.p75}
            current={currentPrice}
            median={mc.median}
          />
        </div>
        <div className="flex justify-between text-[9px] text-mist/50 font-mono pt-1">
          <span>{formatCurrency(mc.p10, { decimals: 0 })}</span>
          <span>{formatCurrency(mc.median, { decimals: 0 })}</span>
          <span>{formatCurrency(mc.p90, { decimals: 0 })}</span>
        </div>
      </div>

      {/* ── Sampling assumptions ──
          These decide the shape of every number above, so they belong beside
          the histogram rather than buried in code. Collapsed by default: the
          defaults are reasonable, and the point is that they are visible and
          arguable, not that everyone must set them. */}
      {coherence ? (
        <div className="rounded-xl bg-snow-peak/[0.03] ring-1 ring-inset ring-wolf-border/35">
          <button
            type="button"
            onClick={() => setShowSettings((previous) => !previous)}
            aria-expanded={showSettings}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left",
              "transition-[background-color,transform] duration-150 ease-out",
              "hover:bg-snow-peak/[0.04] active:scale-[0.99]",
              "motion-reduce:transition-none motion-reduce:active:scale-100"
            )}
          >
            <span className="text-xs font-medium text-snow-peak">
              Sampling assumptions
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-mist transition-transform duration-150 ease-out",
                showSettings && "rotate-180",
                "motion-reduce:transition-none"
              )}
            />
          </button>

          {showSettings ? (
            <div className="space-y-4 border-t border-wolf-border/25 px-3 py-3">
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                  How likely is each scenario?
                </p>
                {(["bear", "base", "bull"] as const).map((key) => (
                  <WeightSlider
                    key={key}
                    label={key === "bear" ? "Bear" : key === "base" ? "Base" : "Bull"}
                    value={weights[key]}
                    share={
                      totalWeight > 0 ? weights[key] / totalWeight : 0
                    }
                    onChange={(next) => onWeightsChange({ ...weights, [key]: next })}
                  />
                ))}
                <p className="text-[10px] leading-relaxed text-mist/60">
                  Relative, not percentages — they are normalised, so 1 / 2 / 1 and
                  25 / 50 / 25 mean the same thing.
                </p>
              </div>

              <div className="space-y-1.5 border-t border-wolf-border/25 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                    Growth / margin correlation
                  </p>
                  <span className="font-mono text-[11px] tabular-nums text-snow-peak">
                    {correlation.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={correlation}
                  onChange={(event) => onCorrelationChange(Number(event.target.value))}
                  aria-label="Growth and margin correlation"
                  className="h-1 w-full cursor-pointer accent-sunset-orange"
                />
                <p className="text-[10px] leading-relaxed text-mist/60">
                  At 0 the two are drawn independently, which lets collapsing
                  demand pair with expanding margin and quietly cancels the worst
                  cases. Raise it and the downside tail lengthens.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onWeightsChange(DEFAULT_MC_WEIGHTS);
                  onCorrelationChange(DEFAULT_GROWTH_MARGIN_CORRELATION);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-mist",
                  "ring-1 ring-inset ring-wolf-border/45",
                  "transition-[background-color,color,transform] duration-150 ease-out",
                  "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-[0.96]",
                  "motion-reduce:transition-none motion-reduce:active:scale-100"
                )}
              >
                <RotateCcw className="h-3 w-3" />
                Reset to 25 / 50 / 25
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The method line has to describe the method. It said "Gaussian
          perturbation" long after that stopped being what runs, which is
          exactly the kind of quiet mismatch that makes a number look more
          rigorous than it is. */}
      <p className="text-center text-[9px] text-mist/40">
        {mc.simulations.length.toLocaleString()} simulations ·{" "}
        {coherence
          ? "sampled across Bear / Base / Bull, triangular draws, growth and margin correlated"
          : "gaussian perturbation on growth, margins & WACC"}
      </p>
    </div>
  );
}

/**
 * One scenario probability, shown as both the raw weight and the share it
 * works out to.
 *
 * The share is what actually matters to the simulation, and it moves as the
 * other two change — so showing only the number you dragged would hide half of
 * what you just did.
 */
function WeightSlider({
  label,
  value,
  share,
  onChange,
}: {
  label: string;
  value: number;
  share: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-8 shrink-0 text-[11px] text-mist">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} scenario probability`}
        className="h-1 flex-1 cursor-pointer accent-sunset-orange"
      />
      <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-snow-peak">
        {formatPercent(share, 0)}
      </span>
    </div>
  );
}

function StatBox({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-xl bg-snow-peak/[0.025] p-2 text-center ring-1 ring-inset ring-wolf-border/35">
      <p className="text-[9px] font-medium uppercase tracking-[0.09em] text-mist/60">
        {label}
      </p>
      <p
        className={cn(
          "text-xs font-mono font-bold tabular-nums mt-0.5",
          dim ? "text-snow-peak/60" : "text-snow-peak"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ConfidenceBar({
  label,
  low,
  high,
  current,
}: {
  label: string;
  low: number;
  high: number;
  current: number;
  median: number;
}) {
  const range = high - low;
  const currentPos =
    range > 0
      ? Math.max(0, Math.min(100, ((current - low) / range) * 100))
      : 50;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-mist font-mono w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-wolf-border/30 relative overflow-visible">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-bullish/40 to-bullish/20" style={{ left: '0%', right: '0%' }} />
        {currentPos >= 0 && currentPos <= 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 rounded-sm bg-golden-hour"
            style={{ left: `${currentPos}%` }}
          />
        )}
      </div>
    </div>
  );
}
