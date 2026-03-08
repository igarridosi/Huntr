"use client";

import { AreaChart } from "@/components/charts/area-chart";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";

interface DCFFCFChartProps {
  result: DCFResult;
  baseRevenue: number;
  baseFCF: number;
}

export function DCFFCFChart({ result, baseRevenue, baseFCF }: DCFFCFChartProps) {
  const chartData = [
    { period: "Base", value: baseFCF },
    ...result.projections.map((p) => ({
      period: `Y${p.year}`,
      value: p.fcf,
    })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-mist uppercase tracking-wider font-medium">
          Projected Free Cash Flow
        </p>
        <ExpandChartDialog title="Projected Free Cash Flow">
          <AreaChart
            data={chartData}
            dataKey="value"
            xAxisKey="period"
            height={420}
            color="#4DC990"
            formatter={(v) => formatCompactNumber(v)}
          />
        </ExpandChartDialog>
      </div>
      <AreaChart
        data={chartData}
        dataKey="value"
        xAxisKey="period"
        height={200}
        color="#4DC990"
        formatter={(v) => formatCompactNumber(v)}
      />
    </div>
  );
}
