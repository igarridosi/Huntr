"use client";

import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { buildSensitivityMatrix } from "@/lib/calculations/dcf";
import type { DCFInputs } from "@/lib/calculations/dcf";
import { cn } from "@/lib/utils";

interface DCFSensitivityProps {
  inputs: DCFInputs;
}

export function DCFSensitivity({ inputs }: DCFSensitivityProps) {
  const { wacc, terminalGrowthRate, currentPrice } = inputs;

  // Build ranges centered on current values
  const waccRange = useMemo(() => {
    const base = Math.round(wacc * 200) / 200; // Round to nearest 0.5%
    return [
      Math.max(0.04, base - 0.02),
      Math.max(0.04, base - 0.01),
      base,
      base + 0.01,
      base + 0.02,
    ];
  }, [wacc]);

  const tgRange = useMemo(() => {
    const base = Math.round(terminalGrowthRate * 200) / 200;
    return [
      Math.max(0, base - 0.01),
      Math.max(0, base - 0.005),
      base,
      Math.min(0.05, base + 0.005),
      Math.min(0.05, base + 0.01),
    ];
  }, [terminalGrowthRate]);

  const matrix = useMemo(
    () => buildSensitivityMatrix(inputs, waccRange, tgRange),
    [inputs, waccRange, tgRange]
  );

  // Find min/max for color scaling
  const values = matrix.map((c) => c.intrinsicValue).filter((v) => v > 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  function getCellColor(value: number): string {
    if (value <= 0) return "text-mist";
    const ratio = maxVal > minVal ? (value - minVal) / (maxVal - minVal) : 0.5;

    if (value >= currentPrice * 1.15) return "text-[#4DC990]";
    if (value >= currentPrice) return "text-[#4DC990]/70";
    if (value >= currentPrice * 0.85) return "text-golden-hour";
    return "text-bearish";
  }

  function getCellBg(w: number, tg: number): string {
    const isCurrentWACC = Math.abs(w - wacc) < 0.001;
    const isCurrentTG = Math.abs(tg - terminalGrowthRate) < 0.001;
    if (isCurrentWACC && isCurrentTG) return "bg-sunset-orange/15 ring-1 ring-sunset-orange/40";
    if (isCurrentWACC || isCurrentTG) return "bg-wolf-black/30";
    return "";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center">
        <thead>
          <tr>
            <th className="p-2 text-[9px] text-mist uppercase tracking-wider font-medium border-b border-wolf-border/30">
              WACC \ TGR
            </th>
            {tgRange.map((tg) => (
              <th
                key={tg}
                className={cn(
                  "p-2 text-[10px] font-mono font-medium border-b border-wolf-border/30",
                  Math.abs(tg - terminalGrowthRate) < 0.001
                    ? "text-sunset-orange"
                    : "text-mist"
                )}
              >
                {formatPercent(tg, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {waccRange.map((w) => (
            <tr key={w}>
              <td
                className={cn(
                  "p-2 text-[10px] font-mono font-medium border-r border-wolf-border/30",
                  Math.abs(w - wacc) < 0.001
                    ? "text-sunset-orange"
                    : "text-mist"
                )}
              >
                {formatPercent(w, 1)}
              </td>
              {tgRange.map((tg) => {
                const cell = matrix.find(
                  (c) =>
                    Math.abs(c.wacc - w) < 0.0001 &&
                    Math.abs(c.terminalGrowth - tg) < 0.0001
                );
                const value = cell?.intrinsicValue ?? 0;
                return (
                  <td
                    key={`${w}-${tg}`}
                    className={cn(
                      "p-2 text-xs font-mono font-bold tabular-nums transition-colors rounded",
                      getCellColor(value),
                      getCellBg(w, tg)
                    )}
                  >
                    {value > 0
                      ? formatCurrency(value, { decimals: 0 })
                      : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
