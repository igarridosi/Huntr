"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { buildSensitivityMatrix, runMonteCarlo } from "@/lib/calculations";
import type { DCFInputs, DCFResult } from "@/lib/calculations";
import { ShieldAlert, ShieldCheck, Target, Wallet } from "lucide-react";

interface PositionDecisionEngineProps {
  inputs: DCFInputs;
  result: DCFResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function PositionDecisionEngine({ inputs, result }: PositionDecisionEngineProps) {
  const mc = useMemo(() => runMonteCarlo(inputs, 1200, 77), [inputs]);

  const stressSnapshot = useMemo(() => {
    const waccRange = [
      Math.max(0.04, inputs.wacc - 0.015),
      inputs.wacc,
      Math.min(0.25, inputs.wacc + 0.015),
    ];
    const tgRange = [
      Math.max(0, inputs.terminalGrowthRate - 0.005),
      inputs.terminalGrowthRate,
      Math.min(0.05, inputs.terminalGrowthRate + 0.005),
    ];

    const cells = buildSensitivityMatrix(inputs, waccRange, tgRange)
      .map((cell) => cell.intrinsicValue)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    const worstCase = cells[0] ?? 0;
    const medianCase = cells[Math.floor(cells.length / 2)] ?? result.intrinsicValuePerShare;

    return { worstCase, medianCase };
  }, [inputs, result.intrinsicValuePerShare]);

  const decision = useMemo(() => {
    const currentPrice = result.currentPrice;
    const upside = result.upside;
    const terminalWeight = result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : 0;
    const resilience =
      currentPrice > 0 ? (stressSnapshot.worstCase - currentPrice) / currentPrice : 0;

    const upsideScore = clamp(upside * 100, 0, 40);
    const probabilityScore = clamp((mc.probabilityAbovePrice - 0.4) * 100, 0, 35);
    const resilienceScore = clamp(resilience * 100 + 10, 0, 20);
    const terminalPenalty = terminalWeight > 0.75 ? clamp((terminalWeight - 0.75) * 120, 0, 15) : 0;

    const convictionScore = clamp(
      upsideScore + probabilityScore + resilienceScore - terminalPenalty,
      0,
      100
    );

    let signal: "Strong Buy" | "Buy" | "Watch" | "Avoid" = "Watch";
    if (convictionScore >= 75) signal = "Strong Buy";
    else if (convictionScore >= 55) signal = "Buy";
    else if (convictionScore < 35) signal = "Avoid";

    let positionSize = "1% - 2%";
    if (convictionScore >= 80) positionSize = "8% - 10%";
    else if (convictionScore >= 65) positionSize = "5% - 7%";
    else if (convictionScore >= 50) positionSize = "3% - 5%";
    else if (convictionScore < 35) positionSize = "0% - 1%";

    const fairValue = result.intrinsicValuePerShare;
    const valueBuyZone = fairValue * 0.8;
    const aggressiveEntry = fairValue * 0.9;
    const trimZone = fairValue * 1.15;

    return {
      signal,
      convictionScore,
      positionSize,
      valueBuyZone,
      aggressiveEntry,
      trimZone,
      resilience,
      terminalWeight,
    };
  }, [mc.probabilityAbovePrice, result, stressSnapshot.worstCase]);

  const signalClass =
    decision.signal === "Strong Buy"
      ? "text-emerald-300 bg-emerald-500/15 border-emerald-400/30"
      : decision.signal === "Buy"
        ? "text-emerald-200 bg-emerald-600/10 border-emerald-500/25"
        : decision.signal === "Watch"
          ? "text-golden-hour bg-golden-hour/10 border-golden-hour/30"
          : "text-rose-300 bg-rose-500/15 border-rose-400/30";

  return (
    <div className="space-y-4 rounded-xl border border-wolf-border/35 bg-gradient-to-br from-wolf-black/45 to-wolf-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wolf-border/25 pb-3">
        <div className="flex items-center gap-2">
          {decision.signal === "Avoid" ? (
            <ShieldAlert className="w-4 h-4 text-bearish" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-bullish" />
          )}
          <span className="text-sm font-semibold text-snow-peak">Position Decision Engine</span>
        </div>
        <Badge className={cn("border text-xs font-mono", signalClass)}>{decision.signal}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <EngineMetric label="Conviction Score" value={`${decision.convictionScore.toFixed(0)}/100`} accent="text-snow-peak" />
        <EngineMetric label="Suggested Position" value={decision.positionSize} accent="text-white" icon={<Wallet className="w-3.5 h-3.5" />} />
        <EngineMetric label="Prob. Above Price" value={formatPercent(mc.probabilityAbovePrice, 1)} accent={mc.probabilityAbovePrice >= 0.5 ? "text-bullish" : "text-bearish"} />
        <EngineMetric label="Stress Worst Case" value={formatCurrency(stressSnapshot.worstCase)} accent={stressSnapshot.worstCase >= result.currentPrice ? "text-bullish" : "text-bearish"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DecisionBox
          title="Value Entry Zone"
          subtitle="Target discount buy range"
          value={`${formatCurrency(decision.valueBuyZone)} - ${formatCurrency(decision.aggressiveEntry)}`}
          tone="amber"
          icon={<Target className="w-3.5 h-3.5" />}
        />
        <DecisionBox
          title="Risk / Trim Zone"
          subtitle="Consider reducing above"
          value={formatCurrency(decision.trimZone)}
          tone="amber"
          icon={<ShieldAlert className="w-3.5 h-3.5" />}
        />
        <DecisionBox
          title="Model Fragility"
          subtitle="Terminal value dependency"
          value={formatPercent(decision.terminalWeight, 1)}
          tone={decision.terminalWeight > 0.75 ? "rose" : decision.terminalWeight > 0.55 ? "amber" : "teal"}
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
        />
      </div>

      <div className="rounded-lg border border-wolf-border/30 bg-midnight-rock/40 p-3 text-xs text-mist leading-relaxed">
        Suggested size and entries are scenario-aware: upside, Monte Carlo hit-rate, stress-tested valuation floor, and terminal value concentration are combined into a single conviction framework.
      </div>
    </div>
  );
}

function EngineMetric({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-wolf-border/35 bg-midnight-rock/30 p-3 space-y-1">
      <p className="text-[10px] text-mist uppercase tracking-wider font-medium">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-mist">{icon}</span> : null}
        <p className={cn("text-sm font-mono font-bold", accent ?? "text-snow-peak")}>{value}</p>
      </div>
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
      ? "border-white/25 bg-white/8 text-golden-hour"
      : tone === "amber"
        ? "border-golden-hour/30 bg-golden-hour/8 text-golden-hour"
        : "border-rose-400/30 bg-rose-500/8 text-rose-200";

  return (
    <div className={cn("rounded-lg border bg-midnight-rock/30 p-3", toneClass)}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <p className="mt-1 text-[11px] text-mist/80">{subtitle}</p>
      <p className="mt-1.5 text-sm font-mono font-bold text-snow-peak">{value}</p>
    </div>
  );
}
