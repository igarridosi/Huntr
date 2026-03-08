"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { runMonteCarlo } from "@/lib/calculations/dcf";
import type { DCFInputs, MonteCarloResult } from "@/lib/calculations/dcf";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp } from "lucide-react";

interface DCFMonteCarloProps {
  inputs: DCFInputs;
  iterations?: number;
}

export function DCFMonteCarlo({
  inputs,
  iterations = 2000,
}: DCFMonteCarloProps) {
  const mc: MonteCarloResult = useMemo(
    () => runMonteCarlo(inputs, iterations),
    [inputs, iterations]
  );

  // Build histogram buckets
  const histogram = useMemo(() => {
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

  const maxCount = Math.max(...histogram.map((b) => b.count));
  const { currentPrice } = inputs;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2">
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
      <div className="relative rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-4">
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
                        ? "bg-[#4DC990]/70"
                        : "bg-bearish/50",
                    "group-hover:opacity-80"
                  )}
                  style={{ height: `${Math.max(1, height)}%` }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[9px] font-mono text-snow-peak bg-wolf-black border border-wolf-border rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
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
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[8px] font-mono text-golden-hour bg-wolf-black/90 border border-golden-hour/30 rounded whitespace-nowrap">
                Price
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom Summary */}
      <div className="flex items-center justify-between rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#4DC990]" />
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
      <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3 space-y-2">
        <p className="text-[10px] text-mist uppercase tracking-wider font-medium">
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

      <p className="text-[9px] text-mist/40 text-center">
        {iterations.toLocaleString()} simulations · Gaussian perturbation on growth, margins & WACC
      </p>
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
    <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-2 text-center">
      <p className="text-[9px] text-mist uppercase tracking-wider font-medium">
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
  median,
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
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#4DC990]/40 to-[#4DC990]/20" style={{ left: '0%', right: '0%' }} />
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
