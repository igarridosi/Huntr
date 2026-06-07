"use client";

import { useParams } from "next/navigation";
import {
  useStockQuote,
  useFinancials,
} from "@/hooks/use-stock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { AreaChart } from "@/components/charts/area-chart";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { MetricChart } from "@/components/financials/metric-chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  formatPercent,
  formatCompactNumber,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useChartColors } from "@/hooks/use-chart-colors";
import {
  calculateROIC,
  calculateFCFYield,
  calculateAllCAGRs,
} from "@/lib/calculations";

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export default function ValuationPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const c = useChartColors();
  const { data: quote, isLoading: qLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: fLoading } = useFinancials(ticker);

  const isLoading = qLoading || fLoading;

  if (isLoading) return <ValuationSkeleton />;

  if (!quote || !financials) {
    return (
      <p className="text-sm text-mist py-8 text-center">
        No valuation data found for {ticker}.
      </p>
    );
  }

  const annualIncome = sortByDateAsc(financials.income_statement.annual);
  const annualBalance = sortByDateAsc(financials.balance_sheet.annual);
  const annualCashFlow = sortByDateAsc(financials.cash_flow.annual);

  const latest = annualIncome.at(-1);
  const latestBal = annualBalance.at(-1);
  const latestCF = annualCashFlow.at(-1);

  // ---- Valuation Metrics ----
  const marketCap = quote.market_cap;
  const ps = latest ? marketCap / latest.revenue : null;
  const pb = latestBal && latestBal.total_equity > 0
    ? marketCap / latestBal.total_equity
    : null;
  const evEbitda = (() => {
    if (!latest || !latestBal || latest.ebitda <= 0) return null;
    const ev =
      marketCap +
      latestBal.long_term_debt -
      latestBal.cash_and_equivalents;
    return ev / latest.ebitda;
  })();

  const roic =
    latest && latestBal
      ? calculateROIC({
          operating_income: latest.operating_income,
          income_tax: latest.income_tax,
          pre_tax_income: latest.pre_tax_income,
          total_equity: latestBal.total_equity,
          long_term_debt: latestBal.long_term_debt,
          cash_and_equivalents: latestBal.cash_and_equivalents,
        })
      : null;

  const fcfYield = latestCF
    ? calculateFCFYield(
        latestCF.free_cash_flow,
        quote.price,
        quote.shares_outstanding
      )
    : null;

  // Rule 1 — P/E anomaly check (< 5x on large-cap → potential one-time gain distortion)
  const peValue = quote.pe_ratio > 0 ? quote.pe_ratio : null;
  const peAnomaly = peValue !== null && peValue < 5 && marketCap >= 10_000_000_000;

  // Rule 4 — Fundamentals period label
  const latestPeriod = latest?.period ?? annualIncome.at(-1)?.period ?? "Latest available";

  const metrics = [
    // Rule 1 — explicit TTM + anomaly flag
    {
      label: peAnomaly ? "P/E (TTM) ⚠" : "P/E (TTM, GAAP)",
      value: peValue !== null ? `${peValue.toFixed(1)}x` : "N/A",
      note: peAnomaly ? "< 5x — verify for one-time non-operating gains" : undefined,
    },
    { label: "P/S (TTM)", value: ps !== null ? `${ps.toFixed(1)}x` : "N/A" },
    { label: "P/B (TTM)", value: pb !== null ? `${pb.toFixed(1)}x` : "N/A" },
    { label: "EV/EBITDA (TTM)", value: evEbitda !== null ? `${evEbitda.toFixed(1)}x` : "N/A" },
    { label: "ROIC (TTM)", value: roic !== null ? formatPercent(roic) : "N/A" },
    { label: "FCF Yield (TTM)", value: fcfYield !== null ? formatPercent(fcfYield) : "N/A" },
    { label: "Market Cap", value: formatCompactNumber(marketCap) },
    {
      label: "Enterprise Value",
      value: latestBal
        ? formatCompactNumber(
            marketCap + latestBal.long_term_debt - latestBal.cash_and_equivalents
          )
        : "N/A",
    },
  ];

  // ---- Historical P/E (approximate: current price ÷ historical EPS) ----
  // Note: uses current price as proxy — shows how today's price compares to
  // each year's earnings power, approximating historical P/E expansion/contraction.
  const historicalPE = sortByDateAsc(annualIncome)
    .filter((is) => is.eps_diluted > 0)
    .map((is) => ({
      period: is.period.replace("FY", ""),
      pe: +(quote.price / is.eps_diluted).toFixed(1),
      date: is.date,
    }));

  const currentPE = quote.pe_ratio > 0 ? quote.pe_ratio : null;

  const avgPE =
    historicalPE.length > 0
      ? historicalPE.reduce((sum, h) => sum + h.pe, 0) / historicalPE.length
      : null;

  const stdDevPE = (() => {
    if (historicalPE.length < 3 || avgPE === null) return null;
    const variance =
      historicalPE.reduce((s, h) => s + (h.pe - avgPE) ** 2, 0) /
      historicalPE.length;
    return Math.sqrt(variance);
  })();

  const minPE = historicalPE.length > 0
    ? Math.min(...historicalPE.map((h) => h.pe))
    : null;
  const maxPE = historicalPE.length > 0
    ? Math.max(...historicalPE.map((h) => h.pe))
    : null;

  // Percentile of current P/E vs history
  const pePercentile = (() => {
    if (!currentPE || historicalPE.length < 3) return null;
    const below = historicalPE.filter((h) => h.pe <= currentPE).length;
    return Math.round((below / historicalPE.length) * 100);
  })();

  // Implied fair value range based on avg ± 1σ P/E × current EPS
  const latestEPS = annualIncome.at(-1)?.eps_diluted ?? null;
  const impliedFairValue = (() => {
    if (!latestEPS || latestEPS <= 0 || !avgPE) return null;
    return {
      low: avgPE && stdDevPE ? +((avgPE - stdDevPE) * latestEPS).toFixed(2) : null,
      mid: +(avgPE * latestEPS).toFixed(2),
      high: avgPE && stdDevPE ? +((avgPE + stdDevPE) * latestEPS).toFixed(2) : null,
    };
  })();

  // Valuation bands chart data: each year + band region
  const bandsChartData = historicalPE.map((h) => ({
    period: h.period,
    pe: h.pe,
    avgBand: avgPE
      ? [
          stdDevPE ? +(avgPE - stdDevPE).toFixed(1) : avgPE,
          stdDevPE ? +(avgPE + stdDevPE).toFixed(1) : avgPE,
        ]
      : [h.pe, h.pe],
  }));

  // ---- CAGR Indicators ----
  const revenueSeries = annualIncome.map((is) => is.revenue);
  const epsSeries = annualIncome.map((is) => is.eps_diluted);
  const fcfSeries = annualCashFlow.map((cf) => cf.free_cash_flow);

  const revenueChartData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.revenue,
  }));
  const epsChartData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.eps_diluted,
  }));
  const fcfChartData = annualCashFlow.map((cf) => ({
    period: cf.period.replace("FY", ""),
    value: cf.free_cash_flow,
  }));

  const revenueCAGRs = calculateAllCAGRs(revenueSeries);
  const epsCAGRs = calculateAllCAGRs(epsSeries);
  const fcfCAGRs = calculateAllCAGRs(fcfSeries);

  return (
    <div className="space-y-6">
      {/* Valuation Metrics Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Valuation Multiples</CardTitle>
            {/* Rule 4 — data freshness */}
            <span className="text-[10px] text-mist/50 font-mono">
              Fundamentals: {latestPeriod} (GAAP) · Price: real-time
            </span>
          </div>
          {/* Rule 1 — P/E anomaly global alert */}
          {peAnomaly && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-golden-hour/25 bg-golden-hour/8 px-3 py-2">
              <span className="text-golden-hour text-xs font-semibold shrink-0">⚠ P/E Anomaly</span>
              <p className="text-[11px] text-mist/80">
                P/E below 5x on a large-cap company typically signals a one-time non-operating gain
                (e.g. asset sale, M&A accounting). The reported EPS may not reflect normalized earnings power.
                Consider using Forward P/E or Operating EPS for valuation.
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className={cn(
                  "space-y-1 p-3 rounded-lg border",
                  m.note
                    ? "bg-golden-hour/5 border-golden-hour/25"
                    : "bg-wolf-black/40 border-wolf-border/30"
                )}
              >
                <p className={cn(
                  "text-[11px] uppercase tracking-wider font-medium",
                  m.note ? "text-golden-hour/80" : "text-mist"
                )}>
                  {m.label}
                </p>
                <p className={cn(
                  "text-sm font-mono font-bold font-tabular",
                  m.note ? "text-golden-hour" : "text-snow-peak"
                )}>
                  {m.value}
                </p>
                {m.note && (
                  <p className="text-[9px] text-golden-hour/70 leading-tight">{m.note}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Valuation Bands — P/E vs Historical Range */}
      {historicalPE.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                {/* Rule 1 — Explicit P/E type label */}
                <CardTitle className="text-base">P/E (TTM, GAAP) — Historical Bands</CardTitle>
                <p className="text-xs text-mist mt-0.5">
                  Trailing P/E using current price ÷ annual diluted EPS per period.
                  <span className="ml-1 text-mist/60">Note: uses reported GAAP EPS — may include one-time items.</span>
                </p>
              </div>

              {/* Valuation verdict badge */}
              {pePercentile !== null && (
                <Tooltip
                  content={`Current P/E is in the ${pePercentile}th percentile of its ${historicalPE.length}-year history. ${pePercentile < 35 ? "Trading below historical norms." : pePercentile > 65 ? "Trading above historical norms." : "Near historical average."}`}
                  side="left"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-help",
                      pePercentile < 35
                        ? "border-bullish/30 bg-bullish/10 text-bullish"
                        : pePercentile > 65
                          ? "border-bearish/30 bg-bearish/10 text-bearish"
                          : "border-golden-hour/30 bg-golden-hour/10 text-golden-hour"
                    )}
                  >
                    {pePercentile < 35 ? "Historically Cheap" : pePercentile > 65 ? "Historically Expensive" : "Near Average"}
                    <span className="font-mono opacity-70">· P{pePercentile}</span>
                  </span>
                </Tooltip>
              )}
            </div>

            {/* Key stats row */}
            {avgPE !== null && (
              <div className="mt-3 flex flex-wrap gap-4">
                {[
                  { label: "Current P/E", value: currentPE ? `${currentPE.toFixed(1)}x` : "N/A", highlight: true },
                  { label: `${historicalPE.length}Y Average`, value: `${avgPE.toFixed(1)}x` },
                  { label: "Min", value: minPE ? `${minPE.toFixed(1)}x` : "N/A" },
                  { label: "Max", value: maxPE ? `${maxPE.toFixed(1)}x` : "N/A" },
                  stdDevPE ? { label: "Std Dev", value: `±${stdDevPE.toFixed(1)}x` } : null,
                ].filter(Boolean).map((stat) => (
                  <div key={stat!.label} className="space-y-0.5">
                    <p className="text-[10px] text-mist uppercase tracking-wider">{stat!.label}</p>
                    <p className={cn("text-sm font-mono font-semibold", stat!.highlight ? "text-sunset-orange" : "text-snow-peak")}>
                      {stat!.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-0 space-y-4">
            {/* Bands chart */}
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={bandsChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: c.tick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: c.grid }}
                />
                <YAxis
                  tick={{ fill: c.tick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}x`}
                  width={36}
                />
                <RechartTooltip
                  contentStyle={{
                    background: c.tooltipBg,
                    border: `1px solid ${c.tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: unknown) => [`${(v as number).toFixed(1)}x`]}
                />
                {/* ±1σ band */}
                {stdDevPE && avgPE && (
                  <Area
                    type="monotone"
                    dataKey="avgBand"
                    stroke="none"
                    fill="#FFBF69"
                    fillOpacity={0.08}
                    isAnimationActive={false}
                  />
                )}
                {/* P/E line */}
                <Line
                  type="monotone"
                  dataKey="pe"
                  stroke="#FFBF69"
                  strokeWidth={2}
                  dot={{ fill: "#FFBF69", r: 3 }}
                  activeDot={{ r: 5 }}
                  name="P/E"
                />
                {/* Average reference line */}
                {avgPE && (
                  <ReferenceLine
                    y={avgPE}
                    stroke={c.tick}
                    strokeDasharray="4 3"
                    label={{ value: `Avg ${avgPE.toFixed(1)}x`, position: "right", fill: c.tick, fontSize: 10 }}
                  />
                )}
                {/* Current P/E reference line */}
                {currentPE && (
                  <ReferenceLine
                    y={currentPE}
                    stroke="#FF8C42"
                    strokeDasharray="3 2"
                    label={{ value: `Now ${currentPE.toFixed(1)}x`, position: "insideTopRight", fill: "#FF8C42", fontSize: 10 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Percentile slider bar */}
            {pePercentile !== null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-mist">
                  <span>Cheapest ({minPE?.toFixed(1)}x)</span>
                  <span>P/E Percentile: {pePercentile}th</span>
                  <span>Most Expensive ({maxPE?.toFixed(1)}x)</span>
                </div>
                <div className="relative h-2 w-full rounded-full overflow-hidden bg-wolf-border/40">
                  {/* Cheap zone */}
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-bullish/20" />
                  {/* Expensive zone */}
                  <div className="absolute inset-y-0 right-0 w-1/3 bg-bearish/20" />
                  {/* Current position */}
                  <div
                    className="absolute top-0 h-full w-1 rounded-full bg-sunset-orange shadow-[0_0_4px_rgba(255,140,66,0.6)]"
                    style={{ left: `calc(${pePercentile}% - 2px)` }}
                  />
                </div>
              </div>
            )}

            {/* Implied fair value */}
            {impliedFairValue && (
              <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
                <p className="text-[10px] text-mist uppercase tracking-wider mb-2">
                  Implied Fair Value Range (Avg P/E × Current EPS)
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                  {impliedFairValue.low && (
                    <div>
                      <p className="text-[10px] text-mist">Bear (−1σ)</p>
                      <p className="text-sm font-mono font-semibold text-snow-peak">${impliedFairValue.low}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-mist">Base (Avg)</p>
                    <p className="text-sm font-mono font-bold text-golden-hour">${impliedFairValue.mid}</p>
                  </div>
                  {impliedFairValue.high && (
                    <div>
                      <p className="text-[10px] text-mist">Bull (+1σ)</p>
                      <p className="text-sm font-mono font-semibold text-snow-peak">${impliedFairValue.high}</p>
                    </div>
                  )}
                  <div className="ml-auto">
                    <p className="text-[10px] text-mist">Current Price</p>
                    <p className={cn(
                      "text-sm font-mono font-bold",
                      impliedFairValue.low && quote.price < impliedFairValue.low
                        ? "text-bullish"
                        : impliedFairValue.high && quote.price > impliedFairValue.high
                          ? "text-bearish"
                          : "text-golden-hour"
                    )}>
                      ${quote.price.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CAGR Indicators — Rule 2: explicit window labels */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Growth Rates — CAGR</CardTitle>
              <p className="text-xs text-mist mt-0.5">
                Compound Annual Growth Rate calculated from annual GAAP figures.
                Windows shown: 3Y, 5Y, 10Y.
              </p>
            </div>
            <span className="text-[10px] text-mist/50 font-mono">
              Based on: {latestPeriod} annual data
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Rule 2 — "Revenue CAGR" label is already clear, but add "(GAAP)" note */}
            <CAGRBlock
              label="Revenue CAGR (GAAP)"
              cagrs={revenueCAGRs}
              chartData={revenueChartData}
              color="#FF8C42"
            />
            <CAGRBlock
              label="EPS Diluted CAGR (GAAP)"
              cagrs={epsCAGRs}
              chartData={epsChartData}
              color="#9FD5CC"
            />
            <CAGRBlock
              label="FCF CAGR (GAAP)"
              cagrs={fcfCAGRs}
              chartData={fcfChartData}
              color="#4DC990"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- CAGR Block ----

function CAGRBlock({
  label,
  cagrs,
  chartData,
  color,
}: {
  label: string;
  cagrs: { cagr3Y: number | null; cagr5Y: number | null; cagr10Y: number | null };
  chartData: { period: string; value: number }[];
  color: string;
}) {
  const windows = [
    { label: "3Y", value: cagrs.cagr3Y },
    { label: "5Y", value: cagrs.cagr5Y },
    { label: "10Y", value: cagrs.cagr10Y },
  ];

  return (
    <div className="space-y-2">
      <MetricChart
        title={label}
        data={chartData}
        dataKey="value"
        type="area"
        color={color}
      />
      <div className="flex items-center gap-2">
        {windows.map((w) => (
          <Badge
            key={w.label}
            variant={
              w.value === null
                ? "secondary"
                : w.value > 0
                  ? "bullish"
                  : "bearish"
            }
            className="font-mono text-xs"
          >
            {w.label}:{" "}
            {w.value !== null ? formatPercent(w.value, 1) : "N/A"}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---- Skeleton ----

function ValuationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
