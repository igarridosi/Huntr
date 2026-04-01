"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";

interface DCFFCFChartProps {
  result: DCFResult;
  baseRevenue: number;
  baseFCF: number;
}

function getRoundedYAxisDomain(values: number[]): [number, number] {
  const maxPos = Math.max(0, ...values);
  const minNeg = Math.min(0, ...values);
  const absMax = Math.max(maxPos, Math.abs(minNeg));

  if (absMax === 0) return [-1, 1];

  const billion = 1_000_000_000;
  const step =
    absMax >= 200 * billion
      ? 10 * billion
      : absMax >= 100 * billion
        ? 5 * billion
        : absMax >= 25 * billion
          ? 2 * billion
          : 1 * billion;

  const roundedMax = maxPos > 0 ? Math.ceil(maxPos / step) * step + step : step;
  const roundedMin = minNeg < 0 ? Math.floor(minNeg / step) * step - step : 0;

  return [roundedMin, roundedMax];
}

function formatShortCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;

  return `${sign}$${abs.toFixed(2)}`;
}

export function DCFFCFChart({ result, baseRevenue, baseFCF }: DCFFCFChartProps) {
  const chartData = [
    { period: "Base", value: baseFCF, revenue: baseRevenue, fcfMargin: result.projections[0]?.fcfMargin ?? 0, discountFactor: 1 },
    ...result.projections.map((p) => ({
      period: `Y${p.year}`,
      value: p.fcf,
      pvValue: p.pvFCF,
      discountDrag: p.pvFCF - p.fcf,
      revenue: p.revenue,
      fcfMargin: p.fcfMargin,
      discountFactor: p.discountFactor,
    })),
  ].map((point) => ({
    ...point,
    pvValue: point.pvValue ?? point.value,
    discountDrag: point.discountDrag ?? 0,
    revenue: point.revenue ?? 0,
    fcfMargin: point.fcfMargin ?? 0,
    discountFactor: point.discountFactor ?? 1,
  }));

  const compactHeight = chartData.length > 9 ? 300 : 260;
  const expandedHeight = chartData.length > 9 ? 520 : 460;

  const horizonChanges = useMemo(() => {
    const horizons = [1, 3, 5, 10];
    return horizons
      .map((year) => {
        const point = chartData.find((item) => item.period === `Y${year}`);
        if (!point || baseFCF === 0) return null;

        const change = (point.value - baseFCF) / Math.abs(baseFCF);
        return { label: `${year}Y`, change };
      })
      .filter((item): item is { label: string; change: number } => item !== null);
  }, [baseFCF, chartData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-mist uppercase tracking-wider font-medium">
          Projected Free Cash Flow
        </p>
        <ExpandChartDialog title="Projected Free Cash Flow">
          <FCFBreakdownChart data={chartData} height={expandedHeight} />
        </ExpandChartDialog>
      </div>
      <FCFBreakdownChart data={chartData} height={compactHeight} />

      {horizonChanges.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {horizonChanges.map((item) => {
            const positive = item.change >= 0;
            return (
              <span
                key={item.label}
                className={
                  positive
                    ? "inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-xs font-mono text-emerald-300"
                    : "inline-flex items-center gap-1 rounded-md border border-rose-400/20 bg-rose-500/15 px-2.5 py-1 text-xs font-mono text-rose-300"
                }
              >
                {item.label}: {item.change > 0 ? "+" : ""}{(item.change * 100).toFixed(1)}%
              </span>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-mist/80">
        Green bars show projected FCF from a base revenue of {formatCompactNumber(baseRevenue)}, red bars show discount drag over time, and the white line tracks present value of each future cash flow.
      </p>
    </div>
  );
}

function FCFBreakdownChart({
  data,
  height,
}: {
  data: Array<{
    period: string;
    value: number;
    pvValue: number;
    discountDrag: number;
    revenue: number;
    fcfMargin: number;
    discountFactor: number;
  }>;
  height: number;
}) {
  const yValues = data.flatMap((item) => [item.value, item.discountDrag, item.pvValue]);
  const yDomain = getRoundedYAxisDomain(yValues);

  return (
    <div className="rounded-xl border border-wolf-border/30 bg-wolf-black/20 p-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 14, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(125, 139, 153, 0.16)" />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9fb0bf", fontSize: 11 }}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9fb0bf", fontSize: 11 }}
            domain={yDomain}
            tickFormatter={(v: number) => {
              const compact = formatCompactNumber(Math.abs(v));
              return v < 0 ? `-${compact}` : compact;
            }}
          />
          <Tooltip
            cursor={{ stroke: "rgba(248,250,252,0.55)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;

              const row = payload[0]?.payload as {
                value: number;
                pvValue: number;
                discountDrag: number;
                revenue: number;
                fcfMargin: number;
                discountFactor: number;
              };

              return (
                <div className="max-w-[290px] rounded-xl border border-wolf-border/60 bg-wolf-black/95 p-3 shadow-xl">
                  <p className="text-sm font-semibold text-snow-peak mb-2">{label}</p>

                  <p className="text-[11px] text-emerald-300 font-mono">
                    Projected FCF: {formatShortCurrency(row.value)}
                  </p>
                  <p className="text-[10px] text-mist/90 mb-1">
                    Source: Revenue x FCF Margin ({formatShortCurrency(row.revenue)} x {formatCompactNumber(row.fcfMargin * 100)}%)
                  </p>

                  <p className="text-[11px] text-snow-peak font-mono">
                    Present Value: {formatShortCurrency(row.pvValue)}
                  </p>
                  <p className="text-[10px] text-mist/90 mb-1">
                    Source: Projected FCF x Discount Factor ({row.discountFactor.toFixed(4)})
                  </p>

                  <p className="text-[11px] text-rose-300 font-mono">
                    Discount Drag: {formatShortCurrency(Math.abs(row.discountDrag))}
                  </p>
                  <p className="text-[10px] text-mist/90">
                    Source: |Projected FCF - Present Value| (time-value of money impact)
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="rgba(248, 250, 252, 0.35)" strokeDasharray="2 4" />
          <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
          <Bar dataKey="discountDrag" fill="#ef4444" radius={[6, 6, 0, 0]} />
          <Line dataKey="pvValue" type="monotone" stroke="#f8fafc" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
