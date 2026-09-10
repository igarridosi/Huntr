"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { DEFAULT_CONVICTION_WEIGHTS } from "@/lib/calculations";
import type {
  ConvictionFactor,
  ConvictionWeights,
  DCFResult,
  DCFSimulationBundle,
} from "@/lib/calculations";
import type { ValuationGuard } from "@/lib/calculations/dcf-currency";
import {
  ChevronDown,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";

interface PositionDecisionEngineProps {
  result: DCFResult;
  /**
   * The one simulation the page ran.
   *
   * This component used to run its own, with a different seed and a different
   * iteration count from the Monte Carlo panel beside it, and the two then
   * printed different odds for the same event on the same screen. It no longer
   * computes anything it shares.
   */
  simulation: DCFSimulationBundle | null;
  weights: ConvictionWeights;
  onWeightsChange: (weights: ConvictionWeights) => void;
  /**
   * Whether the valuation underneath the score is usable at all.
   *
   * The score is a function of the upside, so a broken unit does not make it
   * uncertain - it makes it meaningless. Honda's yen-against-dollars run
   * scored a Strong Buy at 8-10% of capital, which is the most damaging thing
   * this page can output: a specific instruction to commit money, derived
   * from arithmetic across two currencies.
   */
  guard?: ValuationGuard;
}

export function PositionDecisionEngine({
  result,
  simulation,
  weights,
  onWeightsChange,
  guard,
}: PositionDecisionEngineProps) {
  const [showAudit, setShowAudit] = useState(false);

  if (!simulation) return null;

  // No signal, no score, no position size. Returning a muted panel rather than
  // nothing at all, so the absence is visibly deliberate: an empty space reads
  // as a loading state, and a reader who saw a verdict here yesterday would
  // assume it was still coming.
  if (guard && !guard.usable) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-snow-peak/[0.03] p-3.5 ring-1 ring-inset ring-wolf-border/40">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-mist" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-snow-peak">
            No position guidance for this result
          </p>
          <p className="text-[11px] leading-relaxed text-mist/80">
            The conviction score is built from the upside, so it cannot mean
            anything while the valuation does not.{" "}
            {guard.reason === "currency-mismatch"
              ? "Resolve the currency first."
              : "Check the currency, the share count and net debt."}
          </p>
        </div>
      </div>
    );
  }

  const { conviction, stress, probabilityAbovePrice, zones, reference } = simulation;

  const terminalWeight =
    result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : 0;

  // Four rungs of one scale, so they read as one scale: the same bullish hue
  // twice at different strengths for Buy and Strong Buy, then the caution and
  // the warning.
  const signalClass =
    conviction.signal === "Strong Buy"
      ? "text-bullish bg-bullish/15 ring-bullish/30"
      : conviction.signal === "Buy"
        ? "text-bullish/90 bg-bullish/10 ring-bullish/20"
        : conviction.signal === "Watch"
          ? "text-golden-hour bg-golden-hour/10 ring-golden-hour/30"
          : "text-bearish bg-bearish/15 ring-bearish/30";

  const stressHint =
    stress.source === "bear-scenario"
      ? `Set by your Bear scenario (${formatCurrency(stress.bearValue)}). The simulation's 5th percentile sits above it, at ${formatCurrency(stress.simulationP5)}.`
      : `Set by the simulation's 5th percentile (${formatCurrency(stress.simulationP5)}), which falls below your Bear scenario at ${formatCurrency(stress.bearValue)}.`;

  return (
    /* Container queries, not viewport ones.
       These grids asked how wide the *window* was. The window is 1900px and
       the column holding them is 500px, so four tiles were laid out as if
       there were room and each one wrapped into an unreadable stack. What
       matters is the width of the box they are in, which is what
       `@container` measures. */
    <div className="@container insight-enter space-y-4 rounded-xl bg-snow-peak/[0.025] p-4 ring-1 ring-inset ring-wolf-border/35">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wolf-border/25 pb-3">
        <div className="flex items-center gap-2">
          {conviction.signal === "Avoid" ? (
            <ShieldAlert className="h-4 w-4 text-bearish" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-bullish" />
          )}
          <span className="text-sm font-semibold text-snow-peak">
            Position Decision Engine
          </span>
        </div>
        <Badge
          className={cn(
            "border-transparent font-mono text-xs ring-1 ring-inset",
            signalClass
          )}
        >
          {conviction.signal}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-4">
        <EngineMetric
          label="Conviction Score"
          value={`${conviction.score.toFixed(0)}/100`}
          accent="text-snow-peak"
          hint={
            reference
              ? `Measured against ${formatCurrency(reference.intrinsicValuePerShare)} — the probability-weighted value of all three scenarios, not the one on screen. Change the scenario weights to move it.`
              : undefined
          }
        />
        <EngineMetric
          label="Suggested Position"
          value={conviction.positionSize}
          accent="text-snow-peak"
          icon={<Wallet className="h-3.5 w-3.5" />}
        />
        <EngineMetric
          label="Prob. Above Price"
          value={formatPercent(probabilityAbovePrice, 1)}
          accent={probabilityAbovePrice >= 0.5 ? "text-bullish" : "text-bearish"}
          hint="The same figure the simulation panel reports — both read one shared run."
        />
        <EngineMetric
          label="Stress Worst Case"
          value={formatCurrency(stress.value)}
          accent={stress.value >= result.currentPrice ? "text-bullish" : "text-bearish"}
          hint={stressHint}
        />
      </div>

      {/* The score has to be the same number whichever tab is open. It used to
          read the active scenario's upside, so S&P Global scored +23.8% on the
          Bull tab and -41.8% on the Bear one - the same company and the same
          assumptions, recommending different things depending on where you had
          last clicked. */}
      {reference ? (
        <p className="text-[10px] leading-relaxed text-mist/60">
          Scored on the weighted blend of all three scenarios:{" "}
          {reference.contributions
            .map(
              (contribution) =>
                `${contribution.key} ${formatPercent(contribution.weight, 0)}`
            )
            .join(" · ")}
          . Independent of the scenario you are viewing.
        </p>
      ) : null}

      {/* ── Audit trail ── */}
      <div className="rounded-xl bg-snow-peak/[0.03] ring-1 ring-inset ring-wolf-border/35">
        <button
          type="button"
          onClick={() => setShowAudit((previous) => !previous)}
          aria-expanded={showAudit}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left",
            "transition-[background-color,transform] duration-150 ease-out",
            "hover:bg-snow-peak/[0.04] active:scale-[0.99]",
            "motion-reduce:transition-none motion-reduce:active:scale-100"
          )}
        >
          <span className="text-xs font-medium text-snow-peak">
            How this score was built
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-mist transition-transform duration-150 ease-out",
              showAudit && "rotate-180",
              "motion-reduce:transition-none"
            )}
          />
        </button>

        {showAudit ? (
          <div className="space-y-3 border-t border-wolf-border/25 px-3 py-3">
            {conviction.factors.map((factor) => (
              <FactorRow
                key={factor.key}
                factor={factor}
                weight={weights[factor.key]}
                onWeightChange={(next) =>
                  onWeightsChange({ ...weights, [factor.key]: next })
                }
              />
            ))}

            <div className="flex items-center justify-between gap-3 border-t border-wolf-border/25 pt-3">
              <p className="font-mono text-xs tabular-nums text-snow-peak">
                Total: {conviction.score.toFixed(1)}/100
              </p>
              <button
                type="button"
                onClick={() => onWeightsChange(DEFAULT_CONVICTION_WEIGHTS)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-mist",
                  "ring-1 ring-inset ring-wolf-border/45",
                  "transition-[background-color,color,transform] duration-150 ease-out",
                  "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-[0.96]",
                  "motion-reduce:transition-none motion-reduce:active:scale-100"
                )}
              >
                <RotateCcw className="h-3 w-3" />
                Reset weights
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-3">
        {/* Two numbers read as a level to wait for. Once the band is far
            enough under the price that waiting is not the story, saying so in
            words beats quoting a range nobody should be anchoring on. */}
        <DecisionBox
          title="Value Entry Zone"
          subtitle={
            zones.relevant
              ? "Below the 25th percentile of outcomes"
              : "No relevant entry at this price"
          }
          value={
            zones.relevant
              ? `${formatCurrency(zones.entryLow)} - ${formatCurrency(zones.entryHigh)}`
              : `−${formatPercent(zones.gapToPrice, 0)} away`
          }
          tone={zones.relevant ? "amber" : "rose"}
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <DecisionBox
          title="Risk / Trim Zone"
          subtitle="Above the 75th percentile"
          value={formatCurrency(zones.trim)}
          tone="amber"
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
        />
        <DecisionBox
          title="Model Fragility"
          subtitle="Terminal value dependency"
          value={formatPercent(terminalWeight, 1)}
          tone={terminalWeight > 0.75 ? "rose" : terminalWeight > 0.55 ? "amber" : "teal"}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />
      </div>

      {/* These zones read the simulation rather than marking the central
          estimate up and down by a fixed percentage. That is what stopped an
          Avoid verdict from sitting next to an entry range containing the
          current price. */}
      <div className="space-y-2">
        {!zones.relevant ? (
          <div className="flex items-start gap-2 rounded-xl bg-bearish/[0.08] p-3 ring-1 ring-inset ring-bearish/30">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bearish" />
            <p className="text-[11px] leading-relaxed text-mist/85">
              This model puts fair value{" "}
              {formatPercent(zones.gapToPrice, 0)} below the current price, so
              there is no meaningful entry zone. A price range that far down is
              not a level to wait for — it is what the shares would be worth if
              these assumptions are right, and the gap is the disagreement.
            </p>
          </div>
        ) : null}

        {zones.relevant && zones.clampedForSignal ? (
          <div className="flex items-start gap-2 rounded-xl bg-golden-hour/[0.08] p-3 ring-1 ring-inset ring-golden-hour/30">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" />
            <p className="text-[11px] leading-relaxed text-mist/85">
              The entry ceiling has been pulled below today&apos;s price to stay
              consistent with the Avoid verdict. The distribution still puts a
              quarter of outcomes at or under the current price, so the zone is a
              boundary rather than a target.
            </p>
          </div>
        ) : null}

        <div className="rounded-xl bg-snow-peak/[0.05] p-3 text-xs leading-relaxed text-mist ring-1 ring-inset ring-wolf-border/35">
          The entry range runs from the worse of the bear case and the 10th
          percentile up to the 25th; the trim level is the 75th. They are a
          reading of your own assumptions, not a recommendation, and they move
          whenever those assumptions do.
        </div>
      </div>
    </div>
  );
}

/**
 * One line of the audit trail: what was measured, what it scored, and the
 * weight the user can argue with.
 */
function FactorRow({
  factor,
  weight,
  onWeightChange,
}: {
  factor: ConvictionFactor;
  weight: number;
  onWeightChange: (weight: number) => void;
}) {
  const fill = factor.maxPoints > 0 ? Math.abs(factor.points) / factor.maxPoints : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-snow-peak">{factor.label}</p>
        <p
          className={cn(
            "shrink-0 font-mono text-xs tabular-nums",
            factor.isPenalty ? "text-bearish" : "text-bullish"
          )}
        >
          {factor.points >= 0 ? "+" : ""}
          {factor.points.toFixed(1)}
          <span className="text-mist/50"> / {factor.maxPoints.toFixed(0)}</span>
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-mist/75">{factor.description}</p>

      <div className="h-1 overflow-hidden rounded-full bg-snow-peak/[0.06]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none",
            factor.isPenalty ? "bg-bearish" : "bg-bullish"
          )}
          style={{ width: `${Math.min(100, fill * 100)}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.09em] text-mist/50">
          Weight
        </span>
        <input
          type="range"
          min={0}
          max={60}
          step={5}
          value={weight}
          onChange={(event) => onWeightChange(Number(event.target.value))}
          aria-label={`Weight for ${factor.label}`}
          className="h-1 flex-1 cursor-pointer accent-sunset-orange"
        />
        <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-mist">
          {weight}
        </span>
      </div>
    </div>
  );
}

function EngineMetric({
  label,
  value,
  accent,
  icon,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      className="space-y-1 rounded-xl bg-snow-peak/[0.05] p-3 ring-1 ring-inset ring-wolf-border/35"
      title={hint}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-mist">{icon}</span> : null}
        <p className={cn("font-mono text-sm font-bold tabular-nums", accent ?? "text-snow-peak")}>
          {value}
        </p>
      </div>
      {hint ? (
        <p className="text-[10px] leading-relaxed text-mist/60">{hint}</p>
      ) : null}
    </div>
  );
}

function DecisionBox({
  title,
  subtitle,
  value,
  tone,
  icon,
}: {
  title: string;
  subtitle: string;
  value: string;
  tone: "teal" | "amber" | "rose";
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === "teal"
      ? "ring-bullish/30 bg-bullish/[0.07] text-bullish"
      : tone === "amber"
        ? "ring-golden-hour/30 bg-golden-hour/[0.07] text-golden-hour"
        : "ring-bearish/30 bg-bearish/[0.07] text-bearish";

  return (
    <div className={cn("rounded-lg p-3 ring-1 ring-inset", toneClass)}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <p className="mt-1 text-[11px] text-mist/80">{subtitle}</p>
      <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-snow-peak">
        {value}
      </p>
    </div>
  );
}
