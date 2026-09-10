"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";
import {
  impliedExitMultiple,
  readTerminalWeight,
} from "@/lib/calculations/dcf-transparency";
import type { ValuationGuard } from "@/lib/calculations/dcf-currency";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import { AlertTriangle } from "lucide-react";
import { TrendingUp, TrendingDown, Shield, Target, Building2, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

interface DCFResultsProps {
  result: DCFResult;
  ticker: string;
  /** Needed for the implied exit multiple, which the result alone does not carry. */
  wacc: number;
  terminalGrowthRate: number;
  /**
   * The balance-sheet figures behind the valuation. Passed so the checks that
   * invalidate the headline number can sit next to it rather than inside a
   * panel someone has to open: a share count that does not reconcile makes
   * every per-share figure here wrong, and a stale balance sheet makes the
   * bridge describe a company that no longer exists.
   */
  fields?: SourcedDCFFields | null;
  /**
   * Whether the figure may be shown at all.
   *
   * Passed in rather than computed here because the same verdict has to
   * suppress the decision engine and travel into the export: a valuation the
   * interface refuses to show must not reappear as a signal two panels down.
   */
  guard?: ValuationGuard;
}

/**
 * One title per reason. A two-branch conditional silently mislabelled the
 * third reason as the last one, which put "Result outside the plausible range"
 * above a message about missing debt.
 */
const BLOCK_TITLES: Record<NonNullable<ValuationGuard["reason"]>, string> = {
  "currency-mismatch": "Currency mismatch — no valuation shown",
  "unresolved-balance-sheet": "Missing balance-sheet data — no valuation shown",
  "implausible-upside": "Result outside the plausible range",
};

export function DCFResults({
  result,
  ticker,
  wacc,
  terminalGrowthRate,
  fields,
  guard,
}: DCFResultsProps) {
  const isUndervalued = result.upside > 0;
  const valueTrend = useValueTrend(result.intrinsicValuePerShare);
  const terminalWeight =
    result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : 0;
  const terminalReading = readTerminalWeight(
    result.pvTerminalValue,
    result.enterpriseValue
  );
  const exitMultiple = impliedExitMultiple(wacc, terminalGrowthRate);

  return (
    <div className="@container space-y-4">
      {/* ── Checks that invalidate the figure below ──
          These were buried in an expandable panel, which is the wrong place
          for something that makes the headline wrong. If the share count does
          not reconcile with the market cap, every per-share figure on this
          card is off by the same proportion. */}
      {/* ── When the model may not answer ──
          Shown instead of the headline, not beside it. A number this size is
          read before any caption under it, so printing "+566%" next to a
          caveat still delivers the +566%: Honda produced exactly that, with a
          Strong Buy and a suggested 8-10% position, off a yen revenue base
          compared to a dollar ADR price. The figure has to be absent. */}
      {guard && !guard.usable ? (
        <div className="rounded-2xl bg-bearish/[0.07] p-5 ring-1 ring-inset ring-bearish/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bearish" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-bearish">
                {BLOCK_TITLES[guard.reason ?? "implausible-upside"]}
              </p>
              <p className="text-[11px] leading-relaxed text-mist/85">
                {guard.message}
              </p>
              {guard.currencyMismatch ? (
                <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
                  <div className="flex justify-between gap-4">
                    <span className="text-mist">Statements</span>
                    <span className="text-snow-peak">{guard.financialCurrency}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-mist">Share price</span>
                    <span className="text-snow-peak">{guard.priceCurrency}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* The single answer the page exists to give. It is the only surface here
          carrying colour, so the verdict is legible before any number is read;
          everything below is the arithmetic behind it. */}
      <div
        hidden={!!guard && !guard.usable}
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
          {/* The unit, stated. Every figure on this card is in it, and until
              now nothing on screen said which one it was. */}
          {guard?.currency ? ` · ${guard.currency}` : ""}
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

      {/* The figures below are two kinds. Enterprise value, equity value and
          the bridge are arithmetic on the statements alone, so they stay
          readable in the reporting currency and are what makes a bad result
          diagnosable. Margin of safety is the price comparison again wearing a
          different label, so it goes with the headline: it read 99.6% on the
          yen-against-dollars run, which is the same false claim restated. */}
      {guard && !guard.usable && guard.currency ? (
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
          Figures below in {guard.currency}, from the statements
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
        {!guard || guard.usable ? (
          <MetricTile
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Margin of Safety"
            value={formatPercent(result.marginOfSafety, 1)}
            variant={result.marginOfSafety > 0 ? "bullish" : "bearish"}
            delay={40}
          />
        ) : null}
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
          {/* Gordon Growth states the terminal value as a spread between two
              rates, which is abstract enough that an indefensible assumption
              does not look like one. Restated as a multiple it can be held
              against multiples you have actually seen. */}
          {exitMultiple !== null ? (
            <div className="flex items-baseline justify-between gap-3 pl-3">
              <span className="text-[10px] text-mist/60">
                Implied exit multiple on FCF
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  exitMultiple > 20 ? "text-golden-hour" : "text-mist"
                )}
                title="1 / (WACC − terminal growth). Above about 20x, the spread is doing more work than the cash flows."
              >
                {exitMultiple.toFixed(1)}x
              </span>
            </div>
          ) : null}
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
        {/* The bar was a number without a threshold, which is a decoration.
            What it measures - how much of the answer is a perpetuity rather
            than projected cash - is one of the few honest readings of how much
            the model is guessing. */}
        <p
          className={cn(
            "mt-2 text-[10px] leading-relaxed",
            terminalReading.band === "healthy"
              ? "text-bullish/80"
              : terminalReading.band === "elevated"
                ? "text-golden-hour/80"
                : "text-bearish/85"
          )}
        >
          {terminalReading.message}
        </p>
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
