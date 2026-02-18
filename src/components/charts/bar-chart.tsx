"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface BarChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xAxisKey?: string;
  height?: number;
  color?: string;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
  showGrid?: boolean;
  showYAxis?: boolean;
}

/**
 * Wolf-themed Recharts BarChart with sunset-orange bars.
 */
export function BarChart({
  data,
  dataKey,
  xAxisKey = "period",
  height = 280,
  color = "#FF8C42",
  formatter,
  labelFormatter,
  showGrid = true,
  showYAxis = true,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="8%"
        barGap={2}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#2A3B40"
            strokeOpacity={0.4}
            vertical={false}
          />
        )}

        <XAxis
          dataKey={xAxisKey}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8C9DA1", fontSize: 11 }}
          dy={8}
        />

        {showYAxis && (
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8C9DA1", fontSize: 11 }}
            width={60}
            tickFormatter={(v: number) =>
              Intl.NumberFormat("en-US", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(v)
            }
          />
        )}

        <Tooltip
          cursor={false}
          content={
            <ChartTooltip formatter={formatter} labelFormatter={labelFormatter} />
          }
        />

        <Bar
          dataKey={dataKey}
          fill={color}
          radius={[4, 4, 0, 0]}
          minPointSize={2}
          activeBar={{ fill: color, fillOpacity: 0.85 }}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
