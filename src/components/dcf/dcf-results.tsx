"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";
import { TrendingUp, TrendingDown, Shield, Target, Building2, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

interface DCFResultsProps {
  result: DCFResult;
  ticker: string;
}

export function DCFResults({ result, ticker }: DCFResultsProps) {
  const isUndervalued = result.upside > 0;
  const valueTrend = useValueTrend(result.intrinsicValuePerShare);
  const terminalWeight =
    result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : 0;

  return (
    <div className="space-y-4">
      {/* The single answer the page exists to give. It is the only surface here
          carrying colour, so the verdict is legible before any number is read;
          everything below is the arithmetic behind it. */}
      <div
        className={cn(
          "insight-enter relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset",
          isUndervalued
            ? "bg-bullish/[0.06] ring-bullish/25"
            : "bg-bearish/[0.06] ring-bearish/25"
        )}
        style={{ "--enter-delay": "0ms" } as React.CSSProperties}
      >
        <div className="absolute right-3 top-3">
          <Badge variant={isUndervalued ? "bullish" : "bearish"} className="font-mono text-[10px]">
            {isUndervalued ? "UNDERVALUED" : "OVERVALUED"}
          </Badge>
        </div>

        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/70">
          Intrinsic value · {ticker}
        </p>
        {/* Tracking tightens as the number grows — at 30px the default spacing
            reads as gaps between digits rather than one figure. */}
        <p className="mt-1.5 font-mono text-3xl font-semibold tabular-nums tracking-[-0.03em] text-snow-peak">
          <span className="value-trend" data-trend={valueTrend ?? undefined}>
            {formatCurrency(result.intrinsicValuePerShare)}
          </span>
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
              {result.upside > 0 ? "+" : ""}
              {formatPercent(result.upside, 1)}
            </span>
          </div>
          <span className="text-xs text-mist">
            vs. {formatCurrency(result.currentPrice)} current
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile
          icon={<Shield className="h-3.5 w-3.5" />}
          label="Margin of Safety"
          value={formatPercent(result.marginOfSafety, 1)}
          variant={result.marginOfSafety > 0 ? "bullish" : "bearish"}
          delay={40}
        />
        <MetricTile
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Enterprise Value"
          value={formatCompactNumber(result.enterpriseValue)}
          delay={75}
        />
        <MetricTile
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="Equity Value"
          value={formatCompactNumber(result.equityValue)}
          delay={110}
        />
        <MetricTile
          icon={<Target className="h-3.5 w-3.5" />}
          label="Net Debt"
          value={formatCompactNumber(result.netDebt)}
          delay={145}
        />
      </div>

      <Panel label="Value Bridge" delay={190}>
        <div className="space-y-2">
          <BridgeRow label="PV of Projected FCFs" value={result.sumPVFCF} />
          <BridgeRow label="PV of Terminal Value" value={result.pvTerminalValue} />
          <Divider />
          <BridgeRow label="Enterprise Value" value={result.enterpriseValue} bold />
          <BridgeRow label="Less: Net Debt" value={-result.netDebt} />
          <Divider />
          <BridgeRow label="Equity Value" value={result.equityValue} bold />
        </div>
      </Panel>

      <Panel
        label="Terminal Value Weight"
        delay={230}
        trailing={
          <span className="font-mono text-xs font-semibold tabular-nums text-golden-hour">
            {result.enterpriseValue > 0 ? formatPercent(terminalWeight, 1) : "N/A"}
          </span>
        }
      >
        {/* The bar eases to its width rather than snapping, so the split between
            near-term cash flows and the terminal assumption reads as a
            proportion being measured out. */}
        <div className="h-2 overflow-hidden rounded-full bg-snow-peak/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sunset-orange to-golden-hour transition-[width] duration-[600ms] ease-settle motion-reduce:transition-none"
            style={{ width: `${Math.min(100, terminalWeight * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-mist/50">
          <span>FCFs</span>
          <span>Terminal</span>
        </div>
      </Panel>
    </div>
  );
}

/**
 * A raised sub-surface inside an already-raised card.
 *
 * These were sunken (`bg-wolf-black/40` plus a border) — darker than the card
 * holding them, which inverts the depth cue: the layer nearer the viewer should
 * catch more light, not less. A faint light wash with an inset ring reads as
 * sitting on top without adding a second hard outline.
 */
function Panel({
  label,
  children,
  trailing,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      className="insight-enter rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35"
      style={{ "--enter-delay": `${delay}ms` } as React.CSSProperties}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
          {label}
        </p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-wolf-border/35" />;
}

/**
 * Which way a continuously changing number is currently heading, or null once
 * it has been still for a moment.
 *
 * Switching scenario tweens the model's inputs, so the figure is recomputed
 * every frame for the length of that tween. Reading the direction from the
 * frame-to-frame delta means the accent tracks the data instead of being fired
 * by an event: an interrupted switch just changes direction, and a value that
 * lands back where it started never flashes at all. The 260ms grace is a
 * little longer than a frame gap so the accent holds steady through the tween
 * and releases once, at the end.
 */
function useValueTrend(value: number): "up" | "down" | null {
  const previous = useRef(value);
  const [trend, setTrend] = useState<"up" | "down" | null>(null);
  const releaseRef = useRef<number | null>(null);

  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;

    // Sub-cent drift is rounding, not a move.
    if (Math.abs(delta) < 0.005) return;

    setTrend(delta > 0 ? "up" : "down");

    if (releaseRef.current !== null) window.clearTimeout(releaseRef.current);
    releaseRef.current = window.setTimeout(() => setTrend(null), 260);
  }, [value]);

  useEffect(
    () => () => {
      if (releaseRef.current !== null) window.clearTimeout(releaseRef.current);
    },
    []
  );

  return trend;
}

function MetricTile({
  icon,
  label,
  value,
  variant = "default",
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "default" | "bullish" | "bearish";
  delay: number;
}) {
  return (
    <div
      className="insight-enter space-y-1 rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/35"
      style={{ "--enter-delay": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5 text-mist/60">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.09em]">{label}</span>
      </div>
      <p
        className={cn(
          "font-mono text-sm font-semibold tabular-nums tracking-[-0.01em]",
          variant === "bullish" && "text-bullish",
          variant === "bearish" && "text-bearish",
          variant === "default" && "text-snow-peak"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function BridgeRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-xs", bold ? "font-medium text-snow-peak" : "text-mist")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          bold ? "font-semibold text-snow-peak" : "text-snow-peak/80"
        )}
      >
        {formatCompactNumber(value)}
      </span>
    </div>
  );
}
