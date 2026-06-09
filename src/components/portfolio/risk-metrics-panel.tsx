"use client";

/**
 * RiskMetricsPanel
 * ─────────────────────────────────────────────────────────────
 * Annualized risk/return metrics + drawdown chart for the
 * current portfolio. Uses constant-mix daily reconstruction
 * (current weights * historical prices).
 *
 * UX goal: every number has human-readable context so a
 * non-quant user instantly understands what's good or bad.
 *
 * Layout:
 *   1. Plain-language summary banner
 *   2. 6 KPI tiles — each with value, vs-SPY delta, colored border & scale bar
 *   3. Underwater drawdown chart (portfolio line + SPY overlay)
 */

import { useMemo, useState } from "react";
import {
  Shield,
  Activity,
  TrendingUp,
  TrendingDown,
  Gauge,
  Waves,
  Info,
  HelpCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import { useChartColors } from "@/hooks/use-chart-colors";
import { cn, formatPercent } from "@/lib/utils";
import type { EnrichedPosition } from "@/types/portfolio";
import {
  buildDailyReturns,
  buildTWRValueSeries,
  computeDrawdownSeries,
  computeRiskMetrics,
} from "./portfolio-analytics";
import type { PortfolioTxInput } from "./portfolio-analytics";

type Range = "1M" | "YTD" | "1Y" | "ALL";

const RANGES: Range[] = ["1M", "YTD", "1Y", "ALL"];
const BENCHMARK = "SPY";

// ────────────────────────────────────────────────────────────
// Quality tier → CSS left-border class
// ────────────────────────────────────────────────────────────
type Tier = "good" | "ok" | "bad";

const TIER_BORDER: Record<Tier, string> = {
  good: "border-l-bullish",
  ok:   "border-l-amber-500",
  bad:  "border-l-bearish",
};

export function RiskMetricsPanel({
  positions,
  transactionHistory = [],
  isLoading: portfolioLoading,
}: {
  positions: EnrichedPosition[];
  transactionHistory?: PortfolioTxInput[];
  isLoading: boolean;
}) {
  const [range, setRange] = useState<Range>("1Y");
  const [showHelp, setShowHelp] = useState(false);
  const c = useChartColors();

  const tickers = useMemo(
    () => positions.map((p) => p.ticker.toUpperCase()),
    [positions]
  );

  const { data: historyByTicker = {}, isLoading: historyLoading } =
    useBatchDailyHistory([...tickers, BENCHMARK], range, tickers.length > 0);

  // ── Portfolio TWR value series + returns ─────────────────
  // Uses actual transaction history to replay share counts per date,
  // matching the Portfolio Evolution chart methodology. Cumulative
  // factor starting at 1.0 (avoids constant-mix distortion when
  // positions were added at different times).
  const valueSeries = useMemo(
    () => buildTWRValueSeries(positions, transactionHistory, historyByTicker),
    [positions, transactionHistory, historyByTicker]
  );

  const portfolioReturns = useMemo(() => {
    const daily = buildDailyReturns(
      valueSeries.map((v) => ({ date: v.isoDate, close: v.value }))
    );
    return daily.map((d) => d.ret);
  }, [valueSeries]);

  const benchmarkReturns = useMemo(() => {
    const rows = historyByTicker[BENCHMARK] ?? [];
    return buildDailyReturns(rows).map((d) => d.ret);
  }, [historyByTicker]);

  const metrics = useMemo(
    () => computeRiskMetrics(portfolioReturns, benchmarkReturns, valueSeries),
    [portfolioReturns, benchmarkReturns, valueSeries]
  );

  // ── S&P 500 benchmark metrics (for comparison) ────────────
  const spyValueSeries = useMemo(() => {
    const rows = historyByTicker[BENCHMARK] ?? [];
    return rows
      .filter((r) => r.close > 0)
      .map((r) => ({ isoDate: r.date, value: r.close }));
  }, [historyByTicker]);

  const benchmarkMetrics = useMemo(
    () => computeRiskMetrics(benchmarkReturns, benchmarkReturns, spyValueSeries),
    [benchmarkReturns, spyValueSeries]
  );

  // ── Drawdown chart data (portfolio + SPY overlay) ─────────
  const drawdownChartData = useMemo(() => {
    const portfolioDD = computeDrawdownSeries(valueSeries);
    const spyDD = computeDrawdownSeries(spyValueSeries);
    const spyMap = new Map(spyDD.map((p) => [p.isoDate, p.drawdown * 100]));

    return portfolioDD.map((p) => ({
      isoDate: p.isoDate,
      drawdownPct: p.drawdown * 100,
      spyDrawdownPct: spyMap.get(p.isoDate) ?? null,
      tooltipDate: new Date(`${p.isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    }));
  }, [valueSeries, spyValueSeries]);

  // ── Annotation points for the drawdown chart ─────────────
  // 1. Portfolio max-drawdown point (deepest trough)
  // 2. Last data point (to place an end-of-line label)
  // 3. SPY max-drawdown point
  const drawdownAnnotations = useMemo(() => {
    if (drawdownChartData.length < 2) return null;

    // Portfolio worst point
    let portfolioWorst = drawdownChartData[0];
    for (const p of drawdownChartData) {
      if (p.drawdownPct < portfolioWorst.drawdownPct) portfolioWorst = p;
    }

    // SPY worst point
    let spyWorst: (typeof drawdownChartData)[0] | null = null;
    for (const p of drawdownChartData) {
      if (typeof p.spyDrawdownPct === "number") {
        if (!spyWorst || p.spyDrawdownPct < spyWorst.spyDrawdownPct!) spyWorst = p;
      }
    }

    // Last point where SPY has a value (for end label)
    let spyLast: (typeof drawdownChartData)[0] | null = null;
    for (let i = drawdownChartData.length - 1; i >= 0; i--) {
      if (typeof drawdownChartData[i].spyDrawdownPct === "number") {
        spyLast = drawdownChartData[i];
        break;
      }
    }

    return { portfolioWorst, spyWorst, spyLast };
  }, [drawdownChartData]);

  const isLoading = portfolioLoading || historyLoading;
  const hasData = metrics.observations >= 5;
  const hasBenchmark = benchmarkMetrics.observations >= 5;

  // ── KPI definitions ───────────────────────────────────────
  const kpis: KpiDef[] = useMemo(() => [
    {
      label: "Annual Return",
      value: hasData ? formatSignedPct(metrics.annualReturn) : "—",
      benchmarkValue: hasBenchmark ? formatSignedPct(benchmarkMetrics.annualReturn) : undefined,
      benchmarkDelta:
        hasData && hasBenchmark
          ? formatSignedPct(metrics.annualReturn - benchmarkMetrics.annualReturn)
          : undefined,
      benchmarkPositive:
        hasData && hasBenchmark
          ? metrics.annualReturn >= benchmarkMetrics.annualReturn
          : undefined,
      icon: metrics.annualReturn >= 0 ? TrendingUp : TrendingDown,
      color: metrics.annualReturn >= 0 ? "text-bullish" : "text-bearish",
      tier: returnTier(metrics.annualReturn, benchmarkMetrics.annualReturn),
      scaleMin: -0.4,
      scaleMax: 0.4,
      scaleValue: hasData ? metrics.annualReturn : null,
      tooltip: "What is Annual Return?",
      tooltipContext:
        "The total gain or loss of the portfolio expressed as a yearly percentage. If your portfolio grew from $10,000 to $12,000, that's +20%. Compared with S&P 500 to show whether you beat the market.",
    },
    {
      label: "Volatility",
      value: hasData ? formatPercent(metrics.volatility, 1) : "—",
      benchmarkValue: hasBenchmark ? formatPercent(benchmarkMetrics.volatility, 1) : undefined,
      benchmarkDelta:
        hasData && hasBenchmark
          ? `${metrics.volatility <= benchmarkMetrics.volatility ? "Lower" : "Higher"} than SPY`
          : undefined,
      benchmarkPositive:
        hasData && hasBenchmark ? metrics.volatility <= benchmarkMetrics.volatility : undefined,
      icon: Waves,
      color: "text-snow-peak",
      tier: volatilityTier(metrics.volatility),
      scaleMin: 0,
      scaleMax: 0.6,
      scaleValue: hasData ? metrics.volatility : null,
      tooltip: "What is Volatility?",
      tooltipContext:
        "How wildly your portfolio swings up and down (annualized). 15% = moderate. 30%+ = high — your portfolio can move ±30% in a year. Lower volatility means a smoother, less stressful ride.",
    },
    {
      label: "Sharpe Ratio",
      value: hasData ? metrics.sharpe.toFixed(2) : "—",
      benchmarkValue: hasBenchmark ? benchmarkMetrics.sharpe.toFixed(2) : undefined,
      sub: sharpeLabel(metrics.sharpe),
      icon: Gauge,
      color: sharpeColor(metrics.sharpe),
      tier: sharpeTier(metrics.sharpe),
      scaleMin: -2,
      scaleMax: 3,
      scaleValue: hasData ? metrics.sharpe : null,
      tooltip: "What is the Sharpe Ratio?",
      tooltipContext:
        "The \"efficiency score\" of your portfolio: how much return you earn per unit of risk. Below 0 = worse than a savings account. 0–1 = poor. 1–2 = good. Above 2 = excellent.",
    },
    {
      label: "Sortino Ratio",
      value: hasData ? metrics.sortino.toFixed(2) : "—",
      benchmarkValue: hasBenchmark ? benchmarkMetrics.sortino.toFixed(2) : undefined,
      sub: sortinoLabel(metrics.sortino),
      icon: Gauge,
      color: sharpeColor(metrics.sortino),
      tier: sharpeTier(metrics.sortino),
      scaleMin: -2,
      scaleMax: 3,
      scaleValue: hasData ? metrics.sortino : null,
      tooltip: "What is the Sortino Ratio?",
      tooltipContext:
        "Like Sharpe, but it only penalises downward moves (losses), not upward ones. More relevant for investors who fear losses more than they enjoy gains. Above 2 = great.",
    },
    {
      label: "Max Drawdown",
      value: hasData ? formatPercent(metrics.maxDrawdown, 1) : "—",
      benchmarkValue: hasBenchmark ? formatPercent(benchmarkMetrics.maxDrawdown, 1) : undefined,
      benchmarkDelta:
        hasData && hasBenchmark
          ? `${metrics.maxDrawdown >= benchmarkMetrics.maxDrawdown ? "Shallower" : "Deeper"} than SPY`
          : undefined,
      benchmarkPositive:
        hasData && hasBenchmark ? metrics.maxDrawdown >= benchmarkMetrics.maxDrawdown : undefined,
      icon: TrendingDown,
      color: "text-bearish",
      tier: drawdownTier(metrics.maxDrawdown),
      scaleMin: -0.6,
      scaleMax: 0,
      scaleValue: hasData ? metrics.maxDrawdown : null,
      tooltip: "What is Max Drawdown?",
      tooltipContext:
        "The worst drop from a peak to the lowest point in this period. If your portfolio peaked at $100k then fell to $65k, that's −35% drawdown. It answers: \"What's the worst I would have lived through?\"",
    },
    {
      label: "Beta vs S&P",
      value: hasData ? metrics.beta.toFixed(2) : "—",
      sub: betaLabel(metrics.beta),
      icon: Activity,
      color: betaColor(metrics.beta),
      tier: betaTier(metrics.beta),
      scaleMin: 0,
      scaleMax: 2.5,
      scaleValue: hasData ? metrics.beta : null,
      tooltip: "What is Beta?",
      tooltipContext:
        "How sensitive your portfolio is to S&P 500 moves. 1.0 = moves exactly with the market. 1.5 = 50% more reactive. 0.5 = half as reactive. High beta = more upside AND more downside.",
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [metrics, benchmarkMetrics, hasData, hasBenchmark]);

  // ── Plain-language summary ────────────────────────────────
  const summary = useMemo(() => {
    if (!hasData || !hasBenchmark) return null;
    const outperforms = metrics.annualReturn > benchmarkMetrics.annualReturn;
    const delta = metrics.annualReturn - benchmarkMetrics.annualReturn;

    const riskAdj =
      metrics.sharpe >= 1.5
        ? "excellent risk-adjusted returns"
        : metrics.sharpe >= 0.5
          ? "acceptable risk-adjusted returns"
          : metrics.sharpe >= 0
            ? "poor risk-adjusted returns"
            : "negative risk-adjusted returns (the risk-free rate beat it)";

    return {
      outperforms,
      delta,
      portReturn: metrics.annualReturn,
      spyReturn: benchmarkMetrics.annualReturn,
      riskAdj,
      maxDD: metrics.maxDrawdown,
    };
  }, [metrics, benchmarkMetrics, hasData, hasBenchmark]);

  return (
    <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-sunset-orange" /> Risk &amp; Return
            </CardTitle>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] text-mist/60 hover:text-sunset-orange transition-colors px-1.5 py-0.5 rounded border border-wolf-border/30 hover:border-sunset-orange/40"
            >
              <HelpCircle className="w-2.5 h-2.5" />
              <span>{showHelp ? "Hide guide" : "How to read this"}</span>
            </button>
          </div>
          <div className="flex rounded-md border border-wolf-border/40 bg-wolf-black/40 p-0.5">
            {RANGES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setRange(w)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-sm transition-colors",
                  range === w
                    ? "bg-sunset-orange/20 text-sunset-orange"
                    : "text-mist hover:text-snow-peak"
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* ── "How to read this" help panel ── */}
        {showHelp ? (
          <div className="mt-2 rounded-lg border border-sunset-orange/20 bg-sunset-orange/5 px-4 py-3 text-[11px] text-mist leading-relaxed space-y-1.5">
            <p>
              <span className="text-snow-peak font-semibold">What is this?</span>{" "}
              It shows how your portfolio <em>would have</em> performed historically
              using today&apos;s allocation. Change the time range above (1M, YTD, 1Y, ALL).
            </p>
            <p>
              <span className="text-snow-peak font-semibold">Colored borders:</span>{" "}
              <span className="text-bullish">Green</span> = healthy,{" "}
              <span className="text-amber-400">orange</span> = acceptable,{" "}
              <span className="text-bearish">red</span> = needs attention.
              Click the{" "}
              <HelpCircle className="w-2.5 h-2.5 inline" /> on any tile for a plain-English explanation of that metric.
            </p>
            <p>
              <span className="text-snow-peak font-semibold">vs S&P 500:</span>{" "}
              Each metric shows the equivalent SPY value so you can benchmark your portfolio against the market.
            </p>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Plain-language summary ── */}
        {!isLoading && summary ? (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 flex gap-3 items-start",
              summary.outperforms
                ? "border-bullish/25 bg-bullish/5"
                : "border-bearish/25 bg-bearish/5"
            )}
          >
            <Info
              className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0",
                summary.outperforms ? "text-bullish" : "text-bearish"
              )}
            />
            <p className="text-xs text-mist leading-relaxed">
              <span className="text-snow-peak font-semibold">In plain terms: </span>
              Your portfolio{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  summary.portReturn >= 0 ? "text-bullish" : "text-bearish"
                )}
              >
                {summary.portReturn >= 0 ? "gained " : "lost "}
                {Math.abs(summary.portReturn * 100).toFixed(1)}%
              </span>{" "}
              this period, while the S&P 500 returned{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  summary.spyReturn >= 0 ? "text-bullish" : "text-bearish"
                )}
              >
                {summary.spyReturn >= 0 ? "+" : ""}
                {(summary.spyReturn * 100).toFixed(1)}%
              </span>
              {" — "}
              <span
                className={cn(
                  "font-semibold",
                  summary.outperforms ? "text-bullish" : "text-bearish"
                )}
              >
                {summary.outperforms ? "outperforming" : "underperforming"} by{" "}
                {Math.abs(summary.delta * 100).toFixed(1)} percentage points
              </span>
              . It delivered <span className="text-snow-peak">{summary.riskAdj}</span>
              {summary.maxDD < -0.2
                ? `, with a notable max drawdown of ${(summary.maxDD * 100).toFixed(1)}%`
                : ""}
              .
            </p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : null}

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          {kpis.map((k) => (
            <KpiTile key={k.label} kpi={k} isLoading={isLoading} hasData={hasData} />
          ))}
        </div>

        {/* ── Drawdown chart ── */}
        <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/20 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-bearish" />
              <p className="text-xs font-semibold text-snow-peak">Drawdown Chart</p>
            </div>
            <span className="text-[10px] text-mist">
              How far below peak your portfolio was at each point in time
            </span>
            <div className="ml-auto flex items-center gap-4 text-[10px] text-mist">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-bearish rounded inline-block" />
                Portfolio
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4 inline-block"
                  style={{
                    height: "1px",
                    background:
                      "repeating-linear-gradient(90deg,#64748B 0,#64748B 4px,transparent 4px,transparent 7px)",
                  }}
                />
                S&P 500
              </span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : drawdownChartData.length < 2 ? (
            <div className="h-48 flex items-center justify-center text-xs text-mist">
              Not enough price history for this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <ComposedChart
                data={drawdownChartData}
                margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.04} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={c.grid}
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="isoDate"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={60}
                  tickMargin={6}
                  tick={{ fill: c.tick, fontSize: 10 }}
                  tickFormatter={(iso: string) => {
                    const d = new Date(`${iso}T00:00:00Z`);
                    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: c.tick, fontSize: 10 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  domain={["auto", 0]}
                />
                <Tooltip
                  cursor={{ stroke: c.tick, strokeWidth: 1, strokeDasharray: "4 4" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as {
                      tooltipDate?: string;
                      drawdownPct?: number;
                      spyDrawdownPct?: number | null;
                    };
                    return (
                      <div className="min-w-[170px] rounded-md border border-wolf-border/60 bg-wolf-black/95 px-2.5 py-2 shadow-lg space-y-1">
                        <p className="text-[10px] text-mist mb-1">{row?.tooltipDate}</p>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-0.5 bg-bearish rounded inline-block" />
                          <span className="text-[11px] text-mist">Portfolio:</span>
                          <span className="text-xs font-mono text-bearish ml-auto">
                            {(row?.drawdownPct ?? 0).toFixed(2)}%
                          </span>
                        </div>
                        {typeof row?.spyDrawdownPct === "number" ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-0.5 bg-slate-500 rounded inline-block" />
                            <span className="text-[11px] text-mist">S&P 500:</span>
                            <span className="text-xs font-mono text-mist ml-auto">
                              {row.spyDrawdownPct.toFixed(2)}%
                            </span>
                          </div>
                        ) : null}
                        <p className="text-[9px] text-mist/40 pt-0.5 border-t border-wolf-border/20">
                          0% = at peak value
                        </p>
                      </div>
                    );
                  }}
                />
                {/* 0% baseline */}
                <ReferenceLine y={0} stroke="#94A3B8" strokeOpacity={0.25} />

                {/* SPY drawdown — grey dashed line behind portfolio */}
                <Line
                  type="monotone"
                  dataKey="spyDrawdownPct"
                  stroke="#64748B"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />

                {/* Portfolio drawdown — red area */}
                <Area
                  type="monotone"
                  dataKey="drawdownPct"
                  stroke="#EF4444"
                  strokeWidth={1.8}
                  fill="url(#drawdownFill)"
                  dot={false}
                  activeDot={{
                    r: 3.5,
                    stroke: "#EF4444",
                    strokeWidth: 2,
                    fill: c.dotStroke,
                  }}
                />

                {/* Portfolio max-drawdown dot + badge label */}
                {drawdownAnnotations && drawdownAnnotations.portfolioWorst.drawdownPct < -3 ? (
                  <ReferenceDot
                    x={drawdownAnnotations.portfolioWorst.isoDate}
                    y={drawdownAnnotations.portfolioWorst.drawdownPct}
                    r={5}
                    fill="#EF4444"
                    stroke="#0d0d18"
                    strokeWidth={2}
                    label={
                      <DotBadgeLabel
                        text={`▼ Worst: ${drawdownAnnotations.portfolioWorst.drawdownPct.toFixed(1)}%`}
                        color="#EF4444"
                        position="top"
                      />
                    }
                  />
                ) : null}

                {/* SPY max-drawdown dot + badge label */}
                {drawdownAnnotations?.spyWorst &&
                  typeof drawdownAnnotations.spyWorst.spyDrawdownPct === "number" &&
                  drawdownAnnotations.spyWorst.spyDrawdownPct < -3 ? (
                  <ReferenceDot
                    x={drawdownAnnotations.spyWorst.isoDate}
                    y={drawdownAnnotations.spyWorst.spyDrawdownPct}
                    r={4}
                    fill="#94A3B8"
                    stroke="#0d0d18"
                    strokeWidth={2}
                    label={
                      <DotBadgeLabel
                        text={`▼ SPY: ${(drawdownAnnotations.spyWorst.spyDrawdownPct as number).toFixed(1)}%`}
                        color="#94A3B8"
                        position="top"
                      />
                    }
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          <p className="text-[10px] text-mist/50 mt-2 text-center">
            The closer to 0%, the healthier. A deeper dip means a bigger paper loss from the peak.
          </p>
        </div>

        <p className="text-[10px] text-mist/50 text-center">
          Uses current portfolio weights applied to historical prices. Past performance does not guarantee future results.
        </p>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// KPI Tile — single metric card with benchmark comparison
// ────────────────────────────────────────────────────────────

interface KpiDef {
  label: string;
  value: string;
  benchmarkValue?: string;
  benchmarkDelta?: string;
  benchmarkPositive?: boolean;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  tier: Tier;
  scaleMin: number;
  scaleMax: number;
  scaleValue: number | null;
  tooltip: string;
  tooltipContext: string;
}

function KpiTile({
  kpi: k,
  isLoading,
  hasData,
}: {
  kpi: KpiDef;
  isLoading: boolean;
  hasData: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={cn(
        "relative rounded-lg border border-wolf-border/35 border-l-2 bg-wolf-black/20 px-3 py-2.5",
        TIER_BORDER[k.tier]
      )}
    >
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-1 mb-1">
            <k.icon className="w-3 h-3 text-mist/60 flex-shrink-0" />
            <p className="text-[10px] uppercase tracking-wide text-mist leading-none truncate flex-1 min-w-0">
              {k.label}
            </p>
            <button
              type="button"
              onClick={() => setShowTooltip((v) => !v)}
              className={cn(
                "flex-shrink-0 transition-colors",
                showTooltip
                  ? "text-sunset-orange"
                  : "text-mist/40 hover:text-sunset-orange"
              )}
              aria-label={`Explain ${k.label}`}
            >
              <HelpCircle className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Main value */}
          <p className={cn("text-[17px] font-semibold font-mono leading-tight", k.color)}>
            {hasData ? k.value : "—"}
          </p>

          {/* Sub-label (Sharpe/Sortino/Beta descriptors) */}
          {k.sub && hasData ? (
            <p className="text-[10px] text-mist">{k.sub}</p>
          ) : null}

          {/* vs SPY row */}
          {k.benchmarkValue && hasData ? (
            <div className="flex items-baseline gap-1 mt-1 pt-1 border-t border-wolf-border/20">
              <span className="text-[9px] text-mist/50 shrink-0">SPY:</span>
              <span className="text-[10px] font-mono text-mist/70">{k.benchmarkValue}</span>
              {k.benchmarkDelta ? (
                <span
                  className={cn(
                    "text-[9px] font-mono ml-auto shrink-0",
                    k.benchmarkPositive ? "text-bullish" : "text-bearish"
                  )}
                >
                  {k.benchmarkDelta}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Scale bar */}
          {k.scaleValue !== null && hasData ? (
            <ScaleBar
              min={k.scaleMin}
              max={k.scaleMax}
              value={k.scaleValue}
              tier={k.tier}
            />
          ) : null}

          {/* Click-toggled explanation panel */}
          {showTooltip ? (
            <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-wolf-border/60 bg-wolf-black/98 px-3 py-2.5 shadow-xl">
              <p className="font-semibold text-snow-peak text-xs mb-1">{k.tooltip}</p>
              <p className="text-[11px] text-mist leading-relaxed">{k.tooltipContext}</p>
              <button
                type="button"
                onClick={() => setShowTooltip(false)}
                className="mt-2 text-[10px] text-mist/50 hover:text-sunset-orange transition-colors"
              >
                Close ✕
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Scale bar — visual indicator of where value sits on scale
// ────────────────────────────────────────────────────────────

function ScaleBar({
  min,
  max,
  value,
  tier,
}: {
  min: number;
  max: number;
  value: number;
  tier: Tier;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max !== min ? ((clamped - min) / (max - min)) * 100 : 50;
  const COLOR: Record<Tier, string> = {
    good: "bg-bullish",
    ok: "bg-amber-500",
    bad: "bg-bearish",
  };
  return (
    <div className="mt-2 h-1 w-full rounded-full bg-wolf-border/25 relative">
      {/* Filled track */}
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full opacity-35", COLOR[tier])}
        style={{ width: `${pct}%` }}
      />
      {/* Pointer tick */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 rounded-sm bg-snow-peak/70"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Quality tier classifiers
// ────────────────────────────────────────────────────────────

function returnTier(portReturn: number, benchReturn: number): Tier {
  if (!Number.isFinite(portReturn)) return "ok";
  if (portReturn > benchReturn + 0.02) return "good";
  if (portReturn > benchReturn - 0.05) return "ok";
  return "bad";
}

function volatilityTier(vol: number): Tier {
  if (!Number.isFinite(vol)) return "ok";
  if (vol < 0.15) return "good";
  if (vol < 0.30) return "ok";
  return "bad";
}

function sharpeTier(s: number): Tier {
  if (!Number.isFinite(s)) return "ok";
  if (s >= 1.0) return "good";
  if (s >= 0) return "ok";
  return "bad";
}

function drawdownTier(dd: number): Tier {
  if (!Number.isFinite(dd)) return "ok";
  if (dd >= -0.10) return "good";
  if (dd >= -0.25) return "ok";
  return "bad";
}

function betaTier(b: number): Tier {
  if (!Number.isFinite(b)) return "ok";
  if (b > 0.5 && b <= 1.15) return "good";
  if (b <= 1.5) return "ok";
  return "bad";
}

// ────────────────────────────────────────────────────────────
// Label / color helpers
// ────────────────────────────────────────────────────────────

function formatSignedPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function sharpeColor(s: number): string {
  if (!Number.isFinite(s)) return "text-mist";
  if (s >= 2) return "text-bullish";
  if (s >= 1) return "text-emerald-400";
  if (s >= 0) return "text-snow-peak";
  return "text-bearish";
}

function sharpeLabel(s: number): string {
  if (!Number.isFinite(s)) return "";
  if (s >= 2) return "Excellent";
  if (s >= 1) return "Good";
  if (s >= 0.5) return "Acceptable";
  if (s >= 0) return "Poor";
  return "Underperforms risk-free";
}

function sortinoLabel(s: number): string {
  if (!Number.isFinite(s)) return "";
  if (s >= 2.5) return "Excellent";
  if (s >= 1.5) return "Good";
  if (s >= 0.5) return "Fair";
  if (s >= 0) return "Weak";
  return "Underperforms risk-free";
}

function betaColor(b: number): string {
  if (!Number.isFinite(b)) return "text-mist";
  if (b > 1.3) return "text-bearish";
  if (b > 0.8) return "text-snow-peak";
  return "text-emerald-400";
}

function betaLabel(b: number): string {
  if (!Number.isFinite(b)) return "";
  if (b > 1.5) return "Very aggressive";
  if (b > 1.1) return "Aggressive";
  if (b > 0.9) return "Market-like";
  if (b > 0.5) return "Defensive";
  return "Very defensive";
}

// ────────────────────────────────────────────────────────────
// Custom SVG labels for the drawdown chart
// Recharts injects `viewBox` via React.cloneElement when used
// as a `label` prop on ReferenceLine / ReferenceDot.
// ────────────────────────────────────────────────────────────

interface SvgViewBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Amber badge label for the 0% "at peak" reference line.
 * Placed at the right edge of the chart, clearly distinct from
 * the grey SPY dashed line.
 */
function AtPeakLabel({ viewBox }: { viewBox?: SvgViewBox }) {
  const { x = 0, y = 0, width = 0 } = viewBox ?? {};
  const text = "← at peak (0%)";
  const charW = 5.4;
  const padX = 6;
  const padY = 3;
  const textW = text.length * charW;
  const rectW = textW + padX * 2;
  const rectH = 15;
  // Pin to right edge of chart area
  const rx = x + width - rectW - 8;
  const ry = y - rectH - 2;

  return (
    <g>
      {/* Background pill */}
      <rect
        x={rx}
        y={ry}
        width={rectW}
        height={rectH}
        rx={4}
        fill="#0d0d18"
        fillOpacity={0.92}
        stroke="#F59E0B"
        strokeWidth={1}
        strokeOpacity={0.7}
      />
      {/* Amber text */}
      <text
        x={rx + padX}
        y={ry + rectH - padY}
        fill="#F59E0B"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        fontWeight="600"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Badge label for ReferenceDot annotations (portfolio trough, SPY trough).
 * Dark background with colored border + matching text for high contrast.
 * Recharts injects `viewBox.x` / `viewBox.y` as the dot's pixel coordinates.
 */
function DotBadgeLabel({
  viewBox,
  text,
  color,
  position = "top",
}: {
  viewBox?: SvgViewBox;
  text: string;
  color: string;
  position?: "top" | "bottom";
}) {
  const { x = 0, y = 0 } = viewBox ?? {};
  const charW = 5.4;
  const padX = 6;
  const padY = 3;
  const textW = text.length * charW;
  const rectW = textW + padX * 2;
  const rectH = 15;
  const gap = 10; // gap between dot edge and label box
  const rx = x - rectW / 2;
  const ry = position === "top" ? y - rectH - gap : y + gap;
  // Connector line endpoints
  const lineY1 = position === "top" ? y - 6 : y + 6;
  const lineY2 = position === "top" ? ry + rectH : ry;

  return (
    <g>
      {/* Dashed connector from dot to box */}
      <line
        x1={x}
        y1={lineY1}
        x2={x}
        y2={lineY2}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.45}
        strokeDasharray="2 2"
      />
      {/* Dark background */}
      <rect
        x={rx}
        y={ry}
        width={rectW}
        height={rectH}
        rx={4}
        fill="#0d0d18"
        fillOpacity={0.95}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.75}
      />
      {/* Colored text */}
      <text
        x={x}
        y={ry + rectH - padY}
        textAnchor="middle"
        fill={color}
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
      >
        {text}
      </text>
    </g>
  );
}
