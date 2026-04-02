"use client";

import { useMemo } from "react";
import {
  Bar,
  Cell,
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

interface FCFChartPoint {
  period: string;
  fcf: number;
  pvFcf: number;
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
  const chartData = useMemo<FCFChartPoint[]>(() => {
    return [
      {
        period: "Base",
        fcf: baseFCF,
        pvFcf: baseFCF,
      },
      ...result.projections.map((p) => ({
        period: `Y${p.year}`,
        fcf: p.fcf,
        pvFcf: p.pvFCF,
      })),
    ];
  }, [baseFCF, baseRevenue, result.projections]);

  const compactHeight = chartData.length > 9 ? 300 : 260;
  const expandedHeight = chartData.length > 9 ? 520 : 460;

  const horizonChanges = useMemo(() => {
    const horizons = [1, 3, 5, 10];
    return horizons
      .map((year) => {
        const point = chartData.find((item) => item.period === `Y${year}`);
        if (!point || baseFCF === 0) return null;

        const change = (point.fcf - baseFCF) / Math.abs(baseFCF);
        return { label: `${year}Y`, change };
      })
      .filter((item): item is { label: string; change: number } => item !== null);
  }, [baseFCF, chartData]);

  const latestPoint = chartData[chartData.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-mist uppercase tracking-wider font-medium">
          Projected Free Cash Flow
        </p>
        <ExpandChartDialog title="Projected Free Cash Flow">
          <FCFBreakdownChart data={chartData} height={expandedHeight} horizonChanges={horizonChanges} />
        </ExpandChartDialog>
      </div>
      <FCFBreakdownChart data={chartData} height={compactHeight} horizonChanges={horizonChanges} />

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <InfoTile label="Base FCF" value={formatShortCurrency(baseFCF)} />
        <InfoTile label="Latest Projected FCF" value={formatShortCurrency(latestPoint?.fcf ?? 0)} />
        <InfoTile label="Latest Present Value" value={formatShortCurrency(latestPoint?.pvFcf ?? 0)} />
      </div>

      <p className="mt-2 text-[11px] text-mist/80">
        Bars show projected Free Cash Flow by year. The white line shows each year&apos;s discounted present value.
      </p>
    </div>
  );
}

function FCFBreakdownChart({
  data,
  height,
  horizonChanges,
}: {
  data: FCFChartPoint[];
  height: number;
  horizonChanges: Array<{ label: string; change: number }>;
}) {
  const yValues = data.flatMap((item) => [item.fcf, item.pvFcf]);
  const yDomain = getRoundedYAxisDomain(yValues);
  const chartHeight = horizonChanges.length > 0 ? Math.max(140, height - 38) : height;

  return (
    <div className="rounded-xl border border-wolf-border/30 bg-wolf-black/20 p-2 m-2" style={{ height: height + height/20 }}>
      <div style={{ height: chartHeight }}>
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
                fcf: number;
                pvFcf: number;
              };

              const base = data[0]?.fcf ?? 0;
              const changeVsBase = base !== 0 ? (row.fcf - base) / Math.abs(base) : 0;

              return (
                <div className="rounded-xl border border-wolf-border/60 bg-wolf-black/95 p-3 shadow-xl min-w-[210px]">
                  <p className="text-sm font-semibold text-snow-peak mb-2">{label}</p>

                  <p className="text-[11px] text-emerald-300 font-mono">
                    Free Cash Flow: {formatShortCurrency(row.fcf)}
                  </p>
                  <p className="text-[11px] text-snow-peak font-mono">
                    Present Value: {formatShortCurrency(row.pvFcf)}
                  </p>
                  <p className={
                    changeVsBase >= 0
                      ? "text-[11px] text-emerald-300 font-mono"
                      : "text-[11px] text-rose-300 font-mono"
                  }>
                    Vs Base: {changeVsBase >= 0 ? "+" : ""}{(changeVsBase * 100).toFixed(1)}%
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="rgba(248, 250, 252, 0.35)" strokeDasharray="2 4" />
          <Bar dataKey="fcf" radius={[6, 6, 0, 0]}>
            {data.map((item) => (
              <Cell
                key={`fcf-${item.period}`}
                fill={item.fcf >= 0 ? "#10b981" : "#ef4444"}
              />
            ))}
          </Bar>
          <Line dataKey="pvFcf" type="monotone" stroke="#f8fafc" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
        {horizonChanges.length > 0 ? (
        <div className="flex flex-wrap justify-center items-center w-full gap-2">
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
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-wolf-border/35 bg-midnight-rock/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-mist font-medium">{label}</p>
      <p className="mt-0.5 text-sm font-mono font-semibold text-snow-peak">{value}</p>
    </div>
  );
}
