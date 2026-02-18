"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";
import type { FinancialPeriod } from "@/types/financials";

/**
 * Row definition for the financial table.
 * Each row has a label and a key to look up in the data objects.
 */
export interface FinancialRowDef {
  label: string;
  key: string;
  /** "currency" = format as USD, "number" = plain, "percent" = ×100% */
  format?: "currency" | "number" | "percent" | "eps";
  bold?: boolean;
  indent?: boolean;
}

interface FinancialTableProps<T extends FinancialPeriod> {
  data: T[];
  rows: FinancialRowDef[];
}

export function FinancialTable<T extends FinancialPeriod>({
  data,
  rows,
}: FinancialTableProps<T>) {
  if (!data.length) {
    return (
      <p className="text-sm text-mist py-8 text-center">
        No financial data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 bg-wolf-surface z-10 min-w-[180px]">
              Metric
            </TableHead>
            {data.map((period) => (
              <TableHead
                key={period.period}
                className="text-right min-w-[100px] font-mono"
              >
                {formatPeriodLabel(period.period)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.key}
              className={row.bold ? "font-semibold" : ""}
            >
              <TableCell
                className={`sticky left-0 bg-wolf-surface z-10 text-sm ${
                  row.indent ? "pl-8" : ""
                } ${row.bold ? "text-snow-peak" : "text-mist"}`}
              >
                {row.label}
              </TableCell>
              {data.map((period) => {
                const val = (period as Record<string, unknown>)[row.key];
                return (
                  <TableCell
                    key={period.period}
                    className="text-right font-mono font-tabular text-sm"
                  >
                    {formatCell(val, row.format)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Helpers ----

function formatPeriodLabel(period: string): string {
  // "FY2024" -> "'24", "Q3 2024" -> "Q3'24"
  return period
    .replace(/FY(\d{4})/, (_, y) => `'${y.slice(2)}`)
    .replace(/Q(\d)\s*(\d{4})/, (_, q, y) => `Q${q}'${y.slice(2)}`);
}

function formatCell(
  value: unknown,
  format?: "currency" | "number" | "percent" | "eps"
): string {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (isNaN(num)) return String(value);

  switch (format) {
    case "currency":
      return formatCompactNumber(num);
    case "eps":
      return formatCurrency(num);
    case "percent":
      return `${(num * 100).toFixed(1)}%`;
    case "number":
      return num.toLocaleString("en-US");
    default:
      return formatCompactNumber(num);
  }
}
