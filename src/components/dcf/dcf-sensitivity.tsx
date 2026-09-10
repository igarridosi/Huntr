"use client";

import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { buildSensitivityMatrix } from "@/lib/calculations/dcf";
import type { DCFInputs } from "@/lib/calculations/dcf";
import {
  buildOperatingSensitivity,
  buildSensitivityAxes,
  type SensitivityAxes,
} from "@/lib/calculations/dcf-transparency";
import { cn } from "@/lib/utils";

interface DCFSensitivityProps {
  inputs: DCFInputs;
  /**
   * Which pair of assumptions to vary.
   *
   * "financial" is the standard WACC against terminal growth grid. It is a
   * perfectly good grid and it says nothing whatsoever about the business,
   * because both axes are properties of the discount rate. "operating" varies
   * growth against terminal margin, which for most companies is where the
   * disagreement actually lives.
   */
  axes?: SensitivityAxes;
}

export function DCFSensitivity({ inputs, axes = "financial" }: DCFSensitivityProps) {
  const { currentPrice } = inputs;

  const config = useMemo(() => buildSensitivityAxes(inputs, axes), [inputs, axes]);

  /** One flat list of cells, whichever pair of axes is in play. */
  const cells = useMemo(() => {
    if (axes === "operating") {
      return buildOperatingSensitivity(inputs, config.rowValues, config.colValues).map(
        (cell) => ({
          row: cell.growth,
          col: cell.margin,
          value: cell.intrinsicValue,
        })
      );
    }
    return buildSensitivityMatrix(inputs, config.rowValues, config.colValues).map(
      (cell) => ({
        row: cell.wacc,
        col: cell.terminalGrowth,
        value: cell.intrinsicValue,
      })
    );
  }, [inputs, axes, config]);

  const currentRow = axes === "operating" ? inputs.growthRatePhase1 : inputs.wacc;
  const currentCol =
    axes === "operating" ? inputs.terminalFCFMargin : inputs.terminalGrowthRate;

  function getCellColor(value: number): string {
    if (value <= 0) return "text-mist";
    if (value >= currentPrice * 1.15) return "text-bullish";
    if (value >= currentPrice) return "text-bullish/70";
    if (value >= currentPrice * 0.85) return "text-golden-hour";
    return "text-bearish";
  }

  function getCellBg(row: number, col: number): string {
    const isCurrentRow = Math.abs(row - currentRow) < 0.001;
    const isCurrentCol = Math.abs(col - currentCol) < 0.001;
    if (isCurrentRow && isCurrentCol)
      return "bg-sunset-orange/15 ring-1 ring-inset ring-sunset-orange/40";
    // The row and column you are actually on should read as lifted toward you.
    // Darkening them pushed the live case behind every cell around it.
    if (isCurrentRow || isCurrentCol) return "bg-snow-peak/[0.05]";
    return "";
  }

  return (
    <div className="scroll-quiet overflow-x-auto">
      <table className="w-full border-collapse text-center">
        <thead>
          <tr>
            <th className="border-b border-wolf-border/30 p-2 text-[9px] font-medium uppercase tracking-[0.09em] text-mist/60">
              {config.rowLabel} \ {config.colLabel}
            </th>
            {config.colValues.map((col) => (
              <th
                key={col}
                className={cn(
                  "border-b border-wolf-border/30 p-2 font-mono text-[10px] font-medium",
                  Math.abs(col - currentCol) < 0.001
                    ? "text-sunset-orange"
                    : "text-mist"
                )}
              >
                {formatPercent(col, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.rowValues.map((row) => (
            <tr key={row}>
              <td
                className={cn(
                  "border-r border-wolf-border/30 p-2 font-mono text-[10px] font-medium",
                  Math.abs(row - currentRow) < 0.001
                    ? "text-sunset-orange"
                    : "text-mist"
                )}
              >
                {formatPercent(row, 1)}
              </td>
              {config.colValues.map((col) => {
                const cell = cells.find(
                  (candidate) =>
                    Math.abs(candidate.row - row) < 0.0001 &&
                    Math.abs(candidate.col - col) < 0.0001
                );
                const value = cell?.value ?? 0;
                return (
                  <td
                    key={`${row}-${col}`}
                    className={cn(
                      "rounded p-2 font-mono text-xs font-bold tabular-nums transition-colors",
                      getCellColor(value),
                      getCellBg(row, col)
                    )}
                  >
                    {value > 0 ? formatCurrency(value, { decimals: 0 }) : "—"}
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
