"use client";

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface AreaChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xAxisKey?: string;
  height?: number;
  color?: string;
  gradientId?: string;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
  showGrid?: boolean;
  showYAxis?: boolean;
  tightX?: boolean;
  xTickInterval?: number | "preserveStartEnd";
}

/**
 * Wolf-themed Recharts AreaChart with orange gradient fill.
 */
export function AreaChart({
  data,
  dataKey,
  xAxisKey = "period",
  height = 280,
  color = "#FF8C42",
  gradientId,
  formatter,
  labelFormatter,
  showGrid = true,
  showYAxis = true,
  tightX = false,
  xTickInterval,
}: AreaChartProps) {
  const gId = gradientId ?? `gradient-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 8, right: tightX ? 0 : 8, left: tightX ? 0 : 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

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
          interval={xTickInterval}
          padding={tightX ? { left: 0, right: 0 } : undefined}
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

        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: color,
            stroke: "#0B1416",
            strokeWidth: 2,
          }}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
