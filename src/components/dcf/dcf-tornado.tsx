"use client";

import { useMemo } from "react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { buildTornado } from "@/lib/calculations/dcf-transparency";
import type { DCFInputs } from "@/lib/calculations";

interface DCFTornadoProps {
  inputs: DCFInputs;
}

/**
 * What actually moves the answer, ranked.
 *
 * The sensitivity matrix takes two variables at a time and both of them are
 * financial. This takes every input on its own, which is the question you
 * should ask before refining anything: there is no point agonising over a
 * margin assumption worth 3% of the valuation while the growth rate is worth
 * 40%. It tells you where to spend research effort, not what the answer is.
 */
export function DCFTornado({ inputs }: DCFTornadoProps) {
  const bars = useMemo(() => buildTornado(inputs), [inputs]);

  if (bars.length === 0) return null;

  // Every bar is drawn against the widest swing, so the lengths are comparable
  // rather than each one filling its own row.
  const widest = Math.max(...bars.map((bar) => bar.swing), 0.0001);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-mist/80">
        How far the valuation moves when each assumption is pushed either way on
        its own — a point for rates, two for margins. The order is where your
        research time is worth spending.
      </p>

      <div className="space-y-2.5">
        {bars.map((bar, index) => {
          const downside = Math.min(bar.lowValue, bar.highValue);
          const upside = Math.max(bar.lowValue, bar.highValue);
          const share = bar.swing / widest;

          return (
            <div
              key={bar.key}
              className="insight-enter space-y-1"
              style={{ "--enter-delay": `${index * 30}ms` } as React.CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-snow-peak">{bar.label}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-mist">
                  ±{formatPercent(bar.delta, bar.delta < 0.02 ? 0 : 0)} →{" "}
                  <span className="text-snow-peak">
                    {formatPercent(bar.swing, 1)}
                  </span>
                </span>
              </div>

              {/* A single bar centred on the base case: the two halves are the
                  downside and upside of the same move, so the asymmetry between
                  them is visible rather than needing to be worked out. */}
              <div className="relative h-2.5 overflow-hidden rounded-full bg-snow-peak/[0.05]">
                <div
                  className="absolute inset-y-0 left-1/2 rounded-l-full bg-bearish/60"
                  style={{ width: `${(share * 100) / 2}%`, transform: "translateX(-100%)" }}
                />
                <div
                  className="absolute inset-y-0 left-1/2 rounded-r-full bg-bullish/60"
                  style={{ width: `${(share * 100) / 2}%` }}
                />
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-snow-peak/30" />
              </div>

              <div className="flex justify-between font-mono text-[9px] text-mist/50">
                <span>{formatCurrency(downside, { decimals: 0 })}</span>
                <span className={cn(index === 0 && "text-golden-hour/80")}>
                  {index === 0 ? "largest single lever" : ""}
                </span>
                <span>{formatCurrency(upside, { decimals: 0 })}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
