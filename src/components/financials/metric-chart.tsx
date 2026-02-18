"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { formatCurrency } from "@/lib/utils";

interface MetricChartProps {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  xAxisKey?: string;
  type?: "area" | "bar";
  color?: string;
  height?: number;
}

/**
 * Reusable metric trend chart card.
 * Used in Financials tab to show Revenue, Net Income, FCF trends.
 */
export function MetricChart({
  title,
  data,
  dataKey,
  xAxisKey = "period",
  type = "area",
  color = "#FF8C42",
  height = 220,
}: MetricChartProps) {
  if (!data.length) return null;

  const ChartComponent = type === "bar" ? BarChart : AreaChart;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <ExpandChartDialog title={title}>
            <ChartComponent
              data={data}
              dataKey={dataKey}
              xAxisKey={xAxisKey}
              height={420}
              color={color}
              formatter={(v) => formatCurrency(v, { compact: true })}
            />
          </ExpandChartDialog>
        </div>
      </CardHeader>
      <CardContent>
        <ChartComponent
          data={data}
          dataKey={dataKey}
          xAxisKey={xAxisKey}
          height={height}
          color={color}
          formatter={(v) => formatCurrency(v, { compact: true })}
        />
      </CardContent>
    </Card>
  );
}
