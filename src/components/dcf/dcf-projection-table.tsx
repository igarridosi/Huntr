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
import { formatCurrency, formatPercent, formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";
import { cn } from "@/lib/utils";

interface DCFProjectionTableProps {
  result: DCFResult;
}

export function DCFProjectionTable({ result }: DCFProjectionTableProps) {
  const { projections, terminalValue, pvTerminalValue } = result;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px] uppercase tracking-wider">
              Year
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">
              Phase
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Revenue
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Growth
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              FCF Margin
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Free Cash Flow
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Discount Factor
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              PV of FCF
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projections.map((p) => (
            <TableRow
              key={p.year}
              className={cn(
                "transition-colors",
                p.phase === 1
                  ? "hover:bg-sunset-orange/5"
                  : "hover:bg-[#4DC990]/5"
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
                    p.revenueGrowth >= 0 ? "text-[#4DC990]" : "text-bearish"
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
          <TableRow className="border-t-2 border-sunset-orange/20 bg-sunset-orange/5">
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
