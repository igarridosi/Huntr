"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPercent, formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";
import { cn } from "@/lib/utils";

interface DCFProjectionTableProps {
  result: DCFResult;
}

export function DCFProjectionTable({ result }: DCFProjectionTableProps) {
  const { projections, terminalValue, pvTerminalValue } = result;

  return (
    // The card around this table runs its own entrance on a delay, so a
    // cascade counted from mount would play out entirely behind an ancestor
    // still at opacity 0 — motion nobody sees. Custom properties inherit, so
    // the wrapper copies whatever delay the card was given into --enter-base
    // and the rows count from there: the card materialises and the rows fill
    // into it. Nothing here needs to know what that delay is.
    <div
      className="scroll-quiet overflow-x-auto"
      style={{ "--enter-base": "var(--enter-delay, 0ms)" } as React.CSSProperties}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px] uppercase tracking-[0.09em]">
              Year
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em]">
              Phase
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              Revenue
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              Growth
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              FCF Margin
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              Free Cash Flow
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              Discount Factor
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-[0.09em] text-right">
              PV of FCF
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projections.map((p, rowIndex) => (
            <TableRow
              key={p.year}
              // Rows resolve top-down so the eye follows the projection the way
              // it reads it. Capped at 200ms: past that the tail of a ten-year
              // model is just waiting, not being led.
              style={{ "--enter-delay": `calc(var(--enter-base) + ${Math.min(rowIndex * 25, 200)}ms)` } as React.CSSProperties}
              className={cn(
                "insight-enter transition-colors",
                p.phase === 1
                  ? "hover:bg-sunset-orange/5"
                  : "hover:bg-bullish/5"
              )}
            >
              <TableCell className="font-mono text-xs font-medium text-snow-peak">
                Y{p.year}
              </TableCell>
              <TableCell>
                <Badge
                  variant={p.phase === 1 ? "golden" : "secondary"}
                  className="text-[9px] px-1.5"
                >
                  {p.phase === 1 ? "Growth" : "Stable"}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums text-snow-peak/80">
                {formatCompactNumber(p.revenue)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                <span
                  className={cn(
                    p.revenueGrowth >= 0 ? "text-bullish" : "text-bearish"
                  )}
                >
                  {formatPercent(p.revenueGrowth, 1)}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums text-snow-peak/80">
                {formatPercent(p.fcfMargin, 1)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums text-snow-peak">
                {formatCompactNumber(p.fcf)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums text-mist">
                {p.discountFactor.toFixed(4)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums font-medium text-snow-peak">
                {formatCompactNumber(p.pvFCF)}
              </TableCell>
            </TableRow>
          ))}
          {/* Terminal Value Row */}
          {/* The terminal value is a different kind of number — a formula, not
              a projected year — so it earns a real break in the table rather
              than another striped row. It lands last, after the years it sums
              up. */}
          <TableRow
            style={{ "--enter-delay": `calc(var(--enter-base) + ${Math.min(projections.length * 25, 200) + 40}ms)` } as React.CSSProperties}
            className="insight-enter border-t border-sunset-orange/25 bg-sunset-orange/5"
          >
            <TableCell className="font-mono text-xs font-bold text-sunset-orange">
              TV
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-[9px] px-1.5 text-sunset-orange border-sunset-orange/30">
                Terminal
              </Badge>
            </TableCell>
            <TableCell colSpan={3} className="text-right text-[10px] text-mist">
              Gordon Growth Model
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-sunset-orange">
              {formatCompactNumber(terminalValue)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums text-mist">
              —
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-sunset-orange">
              {formatCompactNumber(pvTerminalValue)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
