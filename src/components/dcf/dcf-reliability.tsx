"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Reliability, ReliabilityGrade } from "@/lib/dcf/reliability";

const GRADE_TONE: Record<ReliabilityGrade, { text: string; ring: string; bar: string; reading: string }> = {
  A: { text: "text-bullish", ring: "ring-bullish/30 bg-bullish/[0.06]", bar: "bg-bullish", reading: "Built on filed figures, a model that fits, and assumptions with room either side." },
  B: { text: "text-bullish", ring: "ring-bullish/25 bg-bullish/[0.04]", bar: "bg-bullish/80", reading: "Usable. Read the points below before leaning on the figure." },
  C: { text: "text-golden-hour", ring: "ring-golden-hour/30 bg-golden-hour/[0.06]", bar: "bg-golden-hour", reading: "Indicative only: the figure rests on inputs or assumptions that need checking." },
  D: { text: "text-bearish", ring: "ring-bearish/30 bg-bearish/[0.06]", bar: "bg-bearish", reading: "Not a figure to act on: the data or the model does not hold for this company." },
};

/**
 * How far the valuation can be trusted, in one line, with the three blocks
 * and the deductions that cost the most underneath. Informative: it says
 * nothing about whether the stock is cheap.
 */
export function DCFReliability({ reliability }: { reliability: Reliability }) {
  const [open, setOpen] = useState(false);
  const tone = GRADE_TONE[reliability.grade];

  return (
    <div className={cn("space-y-2.5 rounded-xl p-3 ring-1 ring-inset", tone.ring)}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ShieldCheck className={cn("h-4 w-4 shrink-0", tone.text)} aria-hidden />
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">Model reliability</span>
            <span className="block text-[10px] leading-snug text-mist/75">{tone.reading}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className={cn("font-mono text-xl font-semibold tabular-nums", tone.text)}>{reliability.score}</span>
          <span className={cn("font-mono text-xs font-semibold", tone.text)}>{reliability.grade}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 self-center text-mist transition-transform duration-150", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {reliability.detractors.length > 0 ? (
        <ul className="space-y-1">
          {reliability.detractors.map((d) => (
            <li key={`${d.block}-${d.label}`} className="text-[10px] leading-snug">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-mist/85">{d.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-mist/60">−{d.totalPoints.toFixed(0)}</span>
              </span>
              {d.fix ? <span className="block text-mist/55">{d.fix}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="space-y-2.5 border-t border-wolf-border/25 pt-2.5">
          {reliability.blocks.map((b) => (
            <div key={b.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="font-medium text-snow-peak">
                  {b.label} <span className="font-normal text-mist/50">· {Math.round(b.weight * 100)}%</span>
                </span>
                <span className="font-mono tabular-nums text-mist/80">{Math.round(b.score)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-snow-peak/[0.06]">
                <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${b.score}%` }} />
              </div>
              {b.deductions.length === 0 ? (
                <p className="text-[10px] text-mist/55">Nothing deducted.</p>
              ) : (
                <ul className="space-y-0.5">
                  {b.deductions.map((d) => (
                    <li key={d.label} className="flex items-baseline justify-between gap-2 text-[10px] leading-snug text-mist/70">
                      <span>{d.label}</span>
                      <span className="shrink-0 font-mono tabular-nums text-mist/50">−{d.points.toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-mist/50">
            Measures how far the calculation can be trusted, not whether the stock is cheap.
          </p>
        </div>
      ) : null}
    </div>
  );
}
