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
import { useChartColors } from "@/hooks/use-chart-colors";
import { cn, formatCompactNumber } from "@/lib/utils";
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
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
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
  const c = useChartColors();
  const yValues = data.flatMap((item) => [item.fcf, item.pvFcf]);
  const yDomain = getRoundedYAxisDomain(yValues);

  return (
    // The chips used to sit *inside* the fixed-height box that also held a
    // 100%-height ResponsiveContainer, so the container ate the whole box and
    // the chips were pushed out through the bottom of the card. They are a
    // sibling now: a flex column gives the chart whatever is left after the
    // chips take their natural height, so the two can never total more than
    // the box. The cap in vh keeps the expanded chart inside a short viewport
    // rather than running off the end of the dialog.
    <div
      className="m-2 flex flex-col rounded-xl bg-snow-peak/[0.02] p-2 ring-1 ring-inset ring-wolf-border/30"
      style={{ height: `min(${height}px, 62vh)` }}
    >
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 14, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} strokeOpacity={0.35} />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: c.tick, fontSize: 11 }}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: c.tick, fontSize: 11 }}
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
                // Recharts keeps the tooltip inside the chart box, so a 210px
                // card swallowed a phone-width chart whole.
                <div className="min-w-[136px] rounded-xl bg-wolf-black/95 p-2.5 shadow-xl ring-1 ring-inset ring-wolf-border/70 backdrop-blur-sm sm:min-w-[210px] sm:p-3">
                  <p className="text-sm font-semibold text-snow-peak mb-2">{label}</p>

                  <p className="text-[11px] text-bullish font-mono">
                    Free Cash Flow: {formatShortCurrency(row.fcf)}
                  </p>
                  <p className="text-[11px] text-snow-peak font-mono">
                    Present Value: {formatShortCurrency(row.pvFcf)}
                  </p>
                  <p className={
                    changeVsBase >= 0
                      ? "text-[11px] text-bullish font-mono"
                      : "text-[11px] text-bearish font-mono"
                  }>
                    Vs Base: {changeVsBase >= 0 ? "+" : ""}{(changeVsBase * 100).toFixed(1)}%
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke={c.tick} strokeOpacity={0.4} strokeDasharray="2 4" />
          {/* Eleven bars at full saturation shouted the loudest thing on the
              card, and what they shout is only "positive" — which the axis
              already says. They are the projection, the assumption you fed in;
              the orange line is the discounted answer you came for. Dropping
              the fill to a wash puts the figure back in front of the ground.
              A negative year keeps more weight because it is the exception and
              genuinely wants to be noticed. */}
          <Bar dataKey="fcf" radius={[6, 6, 0, 0]}>
            {data.map((item) => {
              const negative = item.fcf < 0;
              return (
                <Cell
                  key={`fcf-${item.period}`}
                  fill={negative ? c.bearish : c.bullish}
                  fillOpacity={negative ? 0.42 : 0.26}
                />
              );
            })}
          </Bar>
          <Line
            dataKey="pvFcf"
            type="monotone"
            stroke={c.primary}
            strokeWidth={2.5}
            dot={{ r: 2 }}
            activeDot={{ r: 4, stroke: c.dotStroke, strokeWidth: 2 }}
          />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* One row, always. Wrapping is what pushed these out of the card, so
          they share the width evenly and shed padding instead of folding. */}
      {horizonChanges.length > 0 ? (
        <div className="mt-2 flex w-full shrink-0 flex-nowrap items-center justify-center gap-1 sm:gap-2">
          {horizonChanges.map((item) => {
            const positive = item.change >= 0;
            return (
              <span
                key={item.label}
                className={cn(
                  "inline-flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 py-1 font-mono text-[10px] tabular-nums sm:px-2.5 sm:text-xs",
                  positive
                    ? "bg-bullish/15 text-bullish ring-1 ring-inset ring-bullish/25"
                    : "bg-bearish/15 text-bearish ring-1 ring-inset ring-bearish/25"
                )}
              >
                {item.label}: {item.change > 0 ? "+" : ""}{(item.change * 100).toFixed(1)}%
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-snow-peak/[0.025] px-3 py-2 ring-1 ring-inset ring-wolf-border/35">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">{label}</p>
      <p className="mt-0.5 text-sm font-mono font-semibold text-snow-peak">{value}</p>
    </div>
  );
}
