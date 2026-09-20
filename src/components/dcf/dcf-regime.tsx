"use client";

import { Compass } from "lucide-react";
import { cn, formatCompactNumber } from "@/lib/utils";
import type { PaydownYear, Regime } from "@/lib/dcf/regime";

interface DCFRegimeProps {
  regimes: Regime[];
  /** Shown under a "Leveraged" label: the debt repaid year by year from the projected flows. */
  paydown: { schedule: PaydownYear[]; yearsToRepay: number | null; debt: number } | null;
}

/**
 * What kind of company this is, from its own statements, and what that
 * means for the tab in use. Empty when nothing stands out — an ordinary
 * operating business is what the two-stage model is built for, and
 * saying so once is enough.
 */
export function DCFRegime({ regimes, paydown }: DCFRegimeProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">Regime</p>
      {regimes.length === 0 ? (
        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-mist/70">
          <Compass className="mt-px h-3 w-3 shrink-0 text-bullish" aria-hidden />
          An operating business with steady capex, ordinary leverage and a history that describes it: the two-stage DCF fits.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {regimes.map((r) => (
            <li key={r.id} className="rounded-lg bg-golden-hour/[0.06] px-2.5 py-2 ring-1 ring-inset ring-golden-hour/25">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-golden-hour">{r.label}</span>
                {r.tab ? (
                  <span className={cn("rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]", r.tab === "EPS Multiple" ? "bg-sunset-orange/15 text-sunset-orange" : "bg-snow-peak/[0.06] text-mist")}>
                    use {r.tab}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-mist/70">{r.detail}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-mist/85">{r.recommendation}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-mist/60">Watch: {r.watch}</p>
              {r.id === "leveraged" && paydown ? (
                <div className="mt-2 rounded-md bg-wolf-black/40 p-2">
                  <p className="text-[10px] text-mist/70">
                    Debt of ${formatCompactNumber(paydown.debt)} against the projected flows:{" "}
                    {paydown.yearsToRepay === null ? "not repaid within the horizon" : paydown.yearsToRepay === 0 ? "none to repay" : `repaid in year ${paydown.yearsToRepay}`}.
                  </p>
                  <table className="mt-1 w-full font-mono text-[9px] tabular-nums text-mist/70">
                    <thead>
                      <tr className="text-mist/50">
                        <th className="text-left font-normal">Yr</th>
                        <th className="text-right font-normal">FCF</th>
                        <th className="text-right font-normal">Repaid</th>
                        <th className="text-right font-normal">Debt left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paydown.schedule.slice(0, 5).map((y) => (
                        <tr key={y.year}>
                          <td>{y.year}</td>
                          <td className="text-right">{formatCompactNumber(y.freeCashFlow)}</td>
                          <td className="text-right">{formatCompactNumber(y.repaid)}</td>
                          <td className="text-right">{formatCompactNumber(y.debtEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
