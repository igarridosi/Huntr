"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Cell,
  Bar,
  BarChart,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchEarningsDetailData } from "@/app/actions/stock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EarningsHistoryPoint } from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";

type HoverSeries = "epsEstimate" | "epsReported" | "revEstimate" | "revReported";

interface FormattedEarningsPoint {
  quarter: string;
  releaseDate: string | null;
  estimate: number | null;
  reported: number | null;
  surprise: number | null;
  revenueEstimate: number | null;
  revenue: number | null;
  sortTs: number;
}

function quarterLabelFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function quarterLabelToTimestamp(label: string): number {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!match) return 0;

  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return Date.UTC(year, (quarter - 1) * 3, 1);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function nonZeroNumberOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return Math.abs(parsed) > 1e-9 ? parsed : null;
}

function inferSurprise(actual: number | null, estimate: number | null): number | null {
  if (
    actual == null ||
    estimate == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(estimate) ||
    Math.abs(estimate) < 1e-9
  ) {
    return null;
  }

  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function formatEarningsData(
  yahooFinancials: CompanyFinancials["income_statement"]["quarterly"] | undefined,
  history: EarningsHistoryPoint[] | undefined
): FormattedEarningsPoint[] {
  const merged = new Map<string, FormattedEarningsPoint>();

  for (const point of history ?? []) {
    const quarter = /^Q[1-4]\s\d{4}$/.test(point.quarter)
      ? point.quarter
      : point.report_date
        ? quarterLabelFromDate(point.report_date)
        : point.quarter;

    const rawActual = numberOrNull(point.eps_actual);
    const estimate = numberOrNull(point.eps_estimate);
    const reportTs = point.report_date
      ? new Date(`${point.report_date}T00:00:00Z`).getTime()
      : null;
    const isFutureReport = reportTs != null && Number.isFinite(reportTs) && reportTs > Date.now();
    const actual = isFutureReport && rawActual === 0 && estimate != null ? null : rawActual;

    merged.set(quarter, {
      quarter,
      releaseDate: point.report_date ?? null,
      estimate,
      reported: actual,
      surprise: inferSurprise(actual, estimate),
      revenueEstimate: numberOrNull(point.revenue_estimate),
      revenue: numberOrNull(point.revenue_actual),
      sortTs: point.report_date
        ? new Date(`${point.report_date}T00:00:00Z`).getTime()
        : quarterLabelToTimestamp(quarter),
    });
  }

  for (const row of yahooFinancials ?? []) {
    const quarter = /^Q[1-4]\s\d{4}$/.test(row.period)
      ? row.period
      : quarterLabelFromDate(row.date);

    const existing = merged.get(quarter);
    const sortTs = quarterLabelToTimestamp(quarter);
    const epsFromFinancials =
      nonZeroNumberOrNull(row.eps_diluted) ?? nonZeroNumberOrNull(row.eps_basic);

    if (existing) {
      if (existing.revenue == null) {
        existing.revenue = numberOrNull(row.revenue);
      }
      if (existing.reported == null && epsFromFinancials != null) {
        existing.reported = epsFromFinancials;
        existing.surprise = existing.surprise ?? inferSurprise(existing.reported, existing.estimate);
      }
      if (!existing.releaseDate) {
        existing.releaseDate = row.date;
      }
      existing.sortTs = Math.max(existing.sortTs, sortTs);
      continue;
    }

    merged.set(quarter, {
      quarter,
      releaseDate: row.date ?? null,
      estimate: null,
      reported: epsFromFinancials,
      surprise: null,
      revenueEstimate: null,
      revenue: numberOrNull(row.revenue),
      sortTs,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.sortTs - a.sortTs)
    .slice(0, 16);
}

function formatQuarterTick(quarter: string): string {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(quarter.trim());
  if (!match) return quarter;
  return `Q${match[1]} '${match[2].slice(2)}`;
}

function formatMoneyCompact(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
  return `$${compact}`;
}

function formatEps(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function floorRevenueAxisMin(dataMin: number): number {
  if (!Number.isFinite(dataMin)) return 0;
  if (dataMin <= 0) return Math.floor(dataMin);

  const padded = dataMin * 0.9;
  if (padded >= 100) return Math.floor(padded / 10) * 10;
  if (padded >= 10) return Math.floor(padded);
  if (padded >= 1) return Math.floor(padded * 10) / 10;
  return Math.max(0, Math.floor(padded * 100) / 100);
}

function formatRevenueAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `$${compact}`;
}

function getHoverText(
  row: FormattedEarningsPoint,
  series: HoverSeries | null
): { label: string; value: string } | null {
  if (!series) return null;

  if (series === "epsEstimate") {
    if (row.estimate == null) return null;
    return {
      label: `EPS Estimate for ${row.quarter}`,
      value: formatEps(row.estimate),
    };
  }

  if (series === "epsReported") {
    if (row.reported == null) return null;
    return {
      label: `EPS for ${row.quarter}`,
      value: formatEps(row.reported),
    };
  }

  if (series === "revEstimate") {
    if (row.revenueEstimate == null) return null;
    return {
      label: `Revenue Estimate for ${row.quarter}`,
      value: formatMoneyCompact(row.revenueEstimate),
    };
  }

  if (row.revenue == null) return null;
  return {
    label: `Revenue for ${row.quarter}`,
    value: formatMoneyCompact(row.revenue),
  };
}

function EarningsHoverTooltip({
  active,
  payload,
  hoverSeries,
}: {
  active?: boolean;
  payload?: Array<{ payload: FormattedEarningsPoint }>;
  hoverSeries: HoverSeries | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const hoverText = getHoverText(row, hoverSeries);
  if (!hoverText) return null;

  return (
    <div className="rounded-lg border border-wolf-border/70 bg-[#0A1417]/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="text-snow-peak">
        {hoverText.label} <span className="font-semibold">{hoverText.value}</span>
      </p>
    </div>
  );
}

export default function SymbolEarningsPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverSeries, setHoverSeries] = useState<HoverSeries | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["symbol", "earnings-detail", ticker],
    queryFn: () => fetchEarningsDetailData(ticker),
    staleTime: 15 * 60 * 1000,
    enabled: !!ticker,
  });

  const rows = useMemo(() => {
    if (!data) return [];

    return formatEarningsData(
      data.financials?.income_statement.quarterly,
      data.insight?.history
    );
  }, [data]);

  const rowsDesc = rows;
  const chartRows = [...rowsDesc].reverse();

  const latestReported = rowsDesc.find(
    (row) => row.reported != null || row.revenue != null
  );

  const nextEstimate = rowsDesc.find(
    (row) =>
      (row.estimate != null || row.revenueEstimate != null) &&
      row.reported == null &&
      row.revenue == null
  );

  const revenueRows = chartRows.map((row) => ({
    ...row,
    revenueBar: row.revenue ?? row.revenueEstimate,
    revenueBarIsEstimate: row.revenue == null && row.revenueEstimate != null,
  }));

  const onPointHover = (index: number, series: HoverSeries) => {
    setHoveredIndex(index);
    setHoverSeries(series);
  };

  const onPointLeave = () => {
    setHoveredIndex(null);
    setHoverSeries(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data || rowsDesc.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <p className="text-lg font-bold text-snow-peak">
            Earnings data unavailable for {ticker}
          </p>
          <p className="text-sm text-mist">
            Try again in a moment. We refresh fundamentals after each earnings cycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Recent Earnings Quarters</CardTitle>
            <Badge variant="outline" className="text-xs border-wolf-border/70 text-mist">
              {data.insight?.source?.toUpperCase() ?? "MIXED"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-mist/80">Latest Reported</p>
              <p className="text-sm font-semibold text-snow-peak mt-1">
                {latestReported?.quarter ?? "-"}
              </p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-mist/80">Next EPS Estimate</p>
              <p className="text-sm font-semibold text-snow-peak mt-1">
                {formatEps(nextEstimate?.estimate ?? null)}
              </p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-mist/80">Next Revenue Estimate</p>
              <p className="text-sm font-semibold text-snow-peak mt-1">
                {formatMoneyCompact(nextEstimate?.revenueEstimate ?? null)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3 mt-3">
            <p className="text-[11px] uppercase tracking-wider text-mist/80">Next Release Date</p>
            <p className="text-sm font-semibold text-snow-peak mt-1">
              {formatDate(nextEstimate?.releaseDate ?? null)}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-wolf-border/40 bg-[#081317] p-3" onMouseLeave={onPointLeave}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-snow-peak">EPS</p>
                <Badge variant="outline" className="text-[11px] border-wolf-border/70 text-mist">Estimate vs Reported</Badge>
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 20, right: 12, left: 0, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" opacity={0.3} />
                    <XAxis
                      dataKey="quarter"
                      tick={{ fill: "#8C9DA1", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2A3B40" }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      tickMargin={10}
                      height={58}
                      padding={{ left: 8, right: 8 }}
                      tickFormatter={formatQuarterTick}
                    />
                    <YAxis
                      tick={{ fill: "#8C9DA1", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2A3B40" }}
                      width={52}
                    />
                    <Tooltip cursor={false} content={<EarningsHoverTooltip hoverSeries={hoverSeries} />} />

                    <Scatter
                      dataKey="estimate"
                      fill="none"
                      stroke="#6b7280"
                      strokeWidth={2}
                      shape={(props: unknown) => {
                        const p = props as { cx?: number; cy?: number; index?: number };
                        const active = p.index === hoveredIndex && hoverSeries === "epsEstimate";
                        return (
                          <circle
                            cx={p.cx}
                            cy={p.cy}
                            r={active ? 8 : 7}
                            fill="none"
                            stroke="#6b7280"
                            strokeWidth={active ? 2.8 : 2}
                            onMouseEnter={() => {
                              if (typeof p.index === "number") onPointHover(p.index, "epsEstimate");
                            }}
                          />
                        );
                      }}
                    />

                    <Scatter
                      dataKey="reported"
                      shape={(props: unknown) => {
                        const p = props as {
                          cx?: number;
                          cy?: number;
                          payload?: FormattedEarningsPoint;
                          index?: number;
                          yAxis?: { scale?: (value: number) => number };
                        };

                        const row = p.payload;
                        if (!row || row.reported == null) return null;

                        const beat =
                          row.estimate != null
                            ? row.reported >= row.estimate
                            : (row.surprise ?? 0) >= 0;
                        const color = beat ? "#10b981" : "#f43f5e";
                        const active = p.index === hoveredIndex && hoverSeries === "epsReported";
                        const estimateCy =
                          row.estimate != null && p.yAxis?.scale
                            ? p.yAxis.scale(row.estimate)
                            : p.cy;

                        return (
                          <g>
                            <line
                              x1={p.cx}
                              y1={estimateCy}
                              x2={p.cx}
                              y2={p.cy}
                              stroke="#4b5563"
                              strokeWidth={1}
                            />
                            <circle
                              cx={p.cx}
                              cy={p.cy}
                              r={active ? 8 : 7}
                              fill={color}
                              stroke={color}
                              strokeWidth={active ? 2.4 : 1.2}
                              onMouseEnter={() => {
                                if (typeof p.index === "number") onPointHover(p.index, "epsReported");
                              }}
                            />
                          </g>
                        );
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-wolf-border/40 bg-[#081317] p-3" onMouseLeave={onPointLeave}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-snow-peak">Revenue</p>
                <Badge variant="outline" className="text-[11px] border-wolf-border/70 text-mist">Reported + Next Estimate</Badge>
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueRows} margin={{ top: 20, right: 12, left: 6, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" opacity={0.3} />
                    <XAxis
                      dataKey="quarter"
                      tick={{ fill: "#8C9DA1", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2A3B40" }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      tickMargin={10}
                      height={58}
                      padding={{ left: 8, right: 8 }}
                      tickFormatter={formatQuarterTick}
                    />
                    <YAxis
                      tick={{ fill: "#8C9DA1", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#2A3B40" }}
                      width={70}
                      domain={[(dataMin: number) => floorRevenueAxisMin(dataMin), "auto"]}
                      tickFormatter={formatRevenueAxisTick}
                    />
                    <Tooltip cursor={false} content={<EarningsHoverTooltip hoverSeries={hoverSeries} />} />

                    <Bar dataKey="revenueBar" radius={[4, 4, 0, 0]} barSize={18}>
                      {revenueRows.map((row, idx) => (
                        <Cell
                          key={`rev-cell-${row.quarter}-${idx}`}
                          fill={row.revenueBarIsEstimate ? "#7D8697" : "#f97316"}
                          opacity={row.revenueBarIsEstimate ? 0.72 : 0.92}
                          onMouseEnter={() => onPointHover(idx, row.revenueBarIsEstimate ? "revEstimate" : "revReported")}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <div className="overflow-x-auto rounded-lg border border-wolf-border/40">
              <table className="w-full text-sm">
                <thead className="bg-wolf-black/40 text-mist text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Quarter</th>
                    <th className="text-left px-3 py-2">Release Date</th>
                    <th className="text-right px-3 py-2">Estimate</th>
                    <th className="text-right px-3 py-2">Reported</th>
                    <th className="text-right px-3 py-2">Surprise %</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsDesc.slice(0, 10).map((row) => (
                    <tr key={`eps-${row.quarter}`} className="border-t border-wolf-border/30">
                      <td className="px-3 py-2.5 text-snow-peak font-semibold">{row.quarter}</td>
                      <td className="px-3 py-2.5 text-mist">{formatDate(row.releaseDate)}</td>
                      <td className="px-3 py-2.5 text-right text-mist">{formatEps(row.estimate)}</td>
                      <td className="px-3 py-2.5 text-right text-snow-peak">{formatEps(row.reported)}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium ${
                          row.surprise == null
                            ? "text-mist"
                            : row.surprise >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                        }`}
                      >
                        {formatPercent(row.surprise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-wolf-border/40">
              <table className="w-full text-sm">
                <thead className="bg-wolf-black/40 text-mist text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Quarter</th>
                    <th className="text-left px-3 py-2">Release Date</th>
                    <th className="text-right px-3 py-2">Revenue</th>
                    <th className="text-right px-3 py-2">QoQ %</th>
                    <th className="text-right px-3 py-2">YoY %</th>
                    <th className="text-right px-3 py-2">TTM Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsDesc.slice(0, 10).map((row, idx, arr) => {
                    const previous = arr[idx + 1];
                    const sameQuarterPrevYear = arr[idx + 4];

                    const qoq =
                      row.revenue != null &&
                      previous?.revenue != null &&
                      Math.abs(previous.revenue) > 1e-9
                        ? ((row.revenue - previous.revenue) / Math.abs(previous.revenue)) * 100
                        : null;

                    const yoy =
                      row.revenue != null &&
                      sameQuarterPrevYear?.revenue != null &&
                      Math.abs(sameQuarterPrevYear.revenue) > 1e-9
                        ? ((row.revenue - sameQuarterPrevYear.revenue) / Math.abs(sameQuarterPrevYear.revenue)) * 100
                        : null;

                    const ttmWindow = arr.slice(idx, idx + 4);
                    const ttmRev =
                      ttmWindow.length === 4 && ttmWindow.every((item) => item.revenue != null)
                        ? ttmWindow.reduce((acc, item) => acc + (item.revenue ?? 0), 0)
                        : null;

                    return (
                      <tr key={`rev-${row.quarter}`} className="border-t border-wolf-border/30">
                        <td className="px-3 py-2.5 text-snow-peak font-semibold">{row.quarter}</td>
                        <td className="px-3 py-2.5 text-mist">{formatDate(row.releaseDate)}</td>
                        <td className="px-3 py-2.5 text-right text-snow-peak">{formatMoneyCompact(row.revenue)}</td>
                        <td
                          className={`px-3 py-2.5 text-right font-medium ${
                            qoq == null ? "text-mist" : qoq >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatPercent(qoq)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-medium ${
                            yoy == null ? "text-mist" : yoy >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatPercent(yoy)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-mist">{formatMoneyCompact(ttmRev)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
