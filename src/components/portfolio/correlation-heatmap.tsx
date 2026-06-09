"use client";

import { useMemo, useState } from "react";
import { GitCompareArrows, Info, TrendingUp, Minus, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import { cn } from "@/lib/utils";
import type { EnrichedPosition } from "@/types/portfolio";
import { computeCorrelationMatrix } from "./portfolio-analytics";

type Range = "1M" | "YTD" | "1Y";
const RANGES: Range[] = ["1M", "YTD", "1Y"];
const MAX_TICKERS = 15;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function corrLabel(c: number): string {
  if (c >= 0.7)  return "Highly correlated";
  if (c >= 0.4)  return "Moderately correlated";
  if (c >= 0.1)  return "Weakly correlated";
  if (c >= -0.1) return "Uncorrelated";
  if (c >= -0.4) return "Weakly inverse";
  return "Inversely correlated";
}

function corrMeaning(c: number): string {
  if (c >= 0.7)  return "These two tend to rise and fall together — limited diversification benefit.";
  if (c >= 0.4)  return "They move in the same direction more often than not.";
  if (c >= 0.1)  return "Slight positive relationship — mostly independent.";
  if (c >= -0.1) return "Essentially independent — excellent diversification.";
  if (c >= -0.4) return "Tend to move in opposite directions — natural hedge.";
  return "Strong opposite movement — powerful hedge pair.";
}

function corrToCell(c: number): string {
  const v = Math.max(-1, Math.min(1, c));
  if (v >= 0) {
    const alpha = 0.08 + 0.72 * v * v;
    return `rgba(239,68,68,${alpha})`;
  }
  const t = -v;
  const alpha = 0.08 + 0.72 * t * t;
  return `rgba(59,130,246,${alpha})`;
}

function corrToText(c: number): string {
  const abs = Math.abs(c);
  if (abs >= 0.5) return "#F1F5F9";
  if (abs >= 0.25) return "#CBD5E1";
  return "#64748B";
}

function diversificationTier(avg: number): {
  label: string;
  description: string;
  color: string;
  barColor: string;
  score: number;
} {
  const score = Math.round(Math.max(0, Math.min(100, (1 - avg) * 100)));
  if (avg < 0.2) return { label: "Well diversified",       description: "Low average correlation — positions move mostly independently.",                              color: "text-bullish",     barColor: "bg-bullish",     score };
  if (avg < 0.4) return { label: "Moderately diversified", description: "Some correlation between positions, but broadly diversified.",                               color: "text-emerald-400", barColor: "bg-emerald-400", score };
  if (avg < 0.6) return { label: "Moderate concentration", description: "Many positions tend to move together. Consider adding uncorrelated assets.",                color: "text-amber-400",   barColor: "bg-amber-400",   score };
  return             { label: "Highly concentrated",    description: "Most positions are correlated — a market drop may hit all at once.",                         color: "text-bearish",     barColor: "bg-bearish",     score };
}

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

export function CorrelationHeatmap({ positions }: { positions: EnrichedPosition[] }) {
  const [range, setRange] = useState<Range>("1Y");

  const topPositions = useMemo(
    () => [...positions].sort((a, b) => b.weight - a.weight).slice(0, MAX_TICKERS),
    [positions]
  );

  const tickers = useMemo(
    () => topPositions.map((p) => p.ticker.toUpperCase()),
    [topPositions]
  );

  const { data: historyByTicker = {}, isLoading } = useBatchDailyHistory(
    tickers,
    range,
    tickers.length > 1
  );

  const matrix = useMemo(
    () => computeCorrelationMatrix(tickers, historyByTicker),
    [tickers, historyByTicker]
  );

  const insights = useMemo(() => {
    const pairs: Array<{ a: string; b: string; corr: number }> = [];
    for (let i = 0; i < matrix.tickers.length; i++) {
      for (let j = i + 1; j < matrix.tickers.length; j++) {
        const v = matrix.matrix[i]?.[j];
        if (typeof v === "number" && Number.isFinite(v)) {
          pairs.push({ a: matrix.tickers[i]!, b: matrix.tickers[j]!, corr: v });
        }
      }
    }
    if (pairs.length === 0) return null;
    const sorted = [...pairs].sort((x, y) => y.corr - x.corr);
    const avg = pairs.reduce((s, p) => s + p.corr, 0) / pairs.length;
    return { most: sorted[0]!, least: sorted[sorted.length - 1]!, avg, total: pairs.length };
  }, [matrix]);

  const highlightMost = useMemo(() => {
    if (!insights?.most) return new Set<string>();
    const { a, b } = insights.most;
    return new Set([`${a}:${b}`, `${b}:${a}`]);
  }, [insights]);

  const highlightLeast = useMemo(() => {
    if (!insights?.least) return new Set<string>();
    const { a, b } = insights.least;
    return new Set([`${a}:${b}`, `${b}:${a}`]);
  }, [insights]);

  const divTier = useMemo(
    () => (insights ? diversificationTier(insights.avg) : null),
    [insights]
  );

  if (positions.length < 2) {
    return (
      <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-sunset-orange" />
            Position Correlation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-mist">Add at least 2 positions to see how they move together.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">

      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-sunset-orange" />
            Position Correlation
            {positions.length > MAX_TICKERS && (
              <span className="text-[10px] text-mist/60 font-normal ml-1">
                top {MAX_TICKERS} by weight
              </span>
            )}
          </CardTitle>
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
      </CardHeader>

      <CardContent>
        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">

          {/* ═══════════════════════════════
              LEFT — info panel
          ═══════════════════════════════ */}
          <div className="space-y-3">

            {/* Summary banner */}
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : insights && divTier ? (
              <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/30 px-3.5 py-3 flex gap-2.5 items-start">
                <Info className="w-3.5 h-3.5 text-mist/50 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-mist leading-relaxed">
                  How much your <span className="text-snow-peak font-semibold">{matrix.tickers.length} positions</span> move
                  together on a scale from{" "}
                  <span className="text-blue-400 font-mono font-semibold">−1</span> (inverse) to{" "}
                  <span className="text-red-400 font-mono font-semibold">+1</span> (lockstep).
                  {" "}Near <span className="font-mono text-mist/80">0</span> = independent — ideal for diversification.
                </p>
              </div>
            ) : null}

            {/* Most correlated */}
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : insights ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-red-400" />
                  <p className="text-[10px] uppercase tracking-wider text-mist/70 font-medium">Most correlated</p>
                </div>
                <p className="text-sm font-semibold text-snow-peak font-mono tracking-tight">
                  {insights.most.a} ↔ {insights.most.b}
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] px-2 py-0.5 rounded font-mono font-bold"
                    style={{
                      background: corrToCell(insights.most.corr),
                      color: insights.most.corr > 0.4 ? "#FCA5A5" : "#94A3B8",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                  >
                    {insights.most.corr.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-red-400/80">{corrLabel(insights.most.corr)}</span>
                </div>
                <p className="text-[10px] text-mist/55 leading-snug">
                  {corrMeaning(insights.most.corr)}
                </p>
              </div>
            ) : null}

            {/* Least correlated */}
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : insights ? (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3.5 py-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Minus className="w-3 h-3 text-blue-400" />
                  <p className="text-[10px] uppercase tracking-wider text-mist/70 font-medium">Least correlated</p>
                </div>
                <p className="text-sm font-semibold text-snow-peak font-mono tracking-tight">
                  {insights.least.a} ↔ {insights.least.b}
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] px-2 py-0.5 rounded font-mono font-bold"
                    style={{
                      background: corrToCell(insights.least.corr),
                      color: insights.least.corr < -0.1 ? "#93C5FD" : "#94A3B8",
                      border: "1px solid rgba(59,130,246,0.3)",
                    }}
                  >
                    {insights.least.corr.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-blue-400/80">{corrLabel(insights.least.corr)}</span>
                </div>
                <p className="text-[10px] text-mist/55 leading-snug">
                  {corrMeaning(insights.least.corr)}
                </p>
              </div>
            ) : null}

            {/* Diversification score */}
            {isLoading ? (
              <Skeleton className="h-28 w-full rounded-lg" />
            ) : insights && divTier ? (
              <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/30 px-3.5 py-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-sunset-orange" />
                  <p className="text-[10px] uppercase tracking-wider text-mist/70 font-medium">Diversification score</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className={cn("text-2xl font-bold font-mono leading-none", divTier.color)}>
                    {divTier.score}
                  </p>
                  <p className="text-[11px] text-mist/50">/ 100</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-wolf-border/30 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", divTier.barColor)}
                    style={{ width: `${divTier.score}%` }}
                  />
                </div>
                <p className={cn("text-[11px] font-semibold leading-snug", divTier.color)}>
                  {divTier.label}
                </p>
                <p className="text-[10px] text-mist/55 leading-snug">
                  {divTier.description}
                </p>
              </div>
            ) : null}

            {/* Legend */}
            <div className="rounded-lg border border-wolf-border/20 bg-wolf-black/20 px-3.5 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-blue-400 font-mono font-semibold">−1</span>
                <div className="flex-1 h-1.5 rounded-sm overflow-hidden flex">
                  <div className="flex-1 bg-gradient-to-r from-blue-500/80 to-transparent" />
                  <div className="w-px bg-wolf-border/50" />
                  <div className="flex-1 bg-gradient-to-r from-transparent to-red-500/80" />
                </div>
                <span className="text-[10px] text-red-400 font-mono font-semibold">+1</span>
              </div>
              <div className="flex justify-between text-[9px] text-mist/40 px-0.5">
                <span>Inverse</span>
                <span>Independent</span>
                <span>Lockstep</span>
              </div>
              <div className="pt-0.5 space-y-0.5">
                <p className="text-[9px] text-mist/40">
                  <span className="text-red-400/70 font-semibold">Red border</span> = most correlated pair
                </p>
                <p className="text-[9px] text-mist/40">
                  <span className="text-blue-400/70 font-semibold">Blue border</span> = least correlated pair
                </p>
              </div>
            </div>

          </div>

          {/* ═══════════════════════════════
              RIGHT — heatmap
          ═══════════════════════════════ */}
          <div className="overflow-x-auto flex justify-center">
            {isLoading ? (
              <Skeleton className="h-80 w-full rounded-lg" />
            ) : (
              <table className="border-separate border-spacing-[3px] mx-auto">
                <thead>
                  <tr>
                    <th className="w-14" />
                    {matrix.tickers.map((t) => (
                      <th
                        key={t}
                        className="text-[9px] font-mono text-mist/70 pb-1 px-0 align-bottom"
                      >
                        <span className="inline-block [writing-mode:vertical-rl] rotate-180 leading-none tracking-wide">
                          {t}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.tickers.map((rowTicker, i) => (
                    <tr key={rowTicker}>
                      <th className="text-[9px] font-mono text-mist/70 text-right pr-2 leading-none tracking-wide whitespace-nowrap">
                        {rowTicker}
                      </th>
                      {matrix.tickers.map((colTicker, j) => {
                        const v = matrix.matrix[i]?.[j];
                        const isDiag = i === j;
                        const hasValue = typeof v === "number" && Number.isFinite(v);
                        const cellKey = `${rowTicker}:${colTicker}`;
                        const isMost  = !isDiag && highlightMost.has(cellKey);
                        const isLeast = !isDiag && highlightLeast.has(cellKey);

                        const bg = isDiag
                          ? "rgba(51,65,85,0.35)"
                          : hasValue
                            ? corrToCell(v as number)
                            : "rgba(30,41,59,0.3)";

                        return (
                          <td
                            key={colTicker}
                            className={cn(
                              "relative group/cell h-9 w-9 min-w-[2.25rem] text-center align-middle rounded cursor-default transition-all",
                              isDiag && "opacity-40",
                              isMost  && "ring-1 ring-red-400/60 ring-inset",
                              isLeast && "ring-1 ring-blue-400/60 ring-inset",
                            )}
                            style={{ backgroundColor: bg }}
                          >
                            <span
                              className="text-[10px] font-mono tabular-nums select-none"
                              style={{
                                color: isDiag
                                  ? "#475569"
                                  : hasValue
                                    ? corrToText(v as number)
                                    : "#334155",
                              }}
                            >
                              {isDiag ? "—" : hasValue ? (v as number).toFixed(2) : "·"}
                            </span>

                            {/* Hover tooltip */}
                            {!isDiag && (
                              <div className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-2 -translate-x-1/2 w-52 rounded-lg border border-wolf-border/60 bg-wolf-black/98 px-3 py-2.5 shadow-xl opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <p className="text-[11px] font-semibold text-snow-peak mb-1 font-mono">
                                  {rowTicker} ↔ {colTicker}
                                </p>
                                {hasValue ? (
                                  <>
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span
                                        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                                        style={{
                                          background: corrToCell(v as number),
                                          color: corrToText(v as number),
                                          border: "1px solid rgba(255,255,255,0.1)",
                                        }}
                                      >
                                        {(v as number).toFixed(3)}
                                      </span>
                                      <span className="text-[10px] text-mist">
                                        {corrLabel(v as number)}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-mist/70 leading-relaxed">
                                      {corrMeaning(v as number)}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-[10px] text-mist/50">Not enough shared history.</p>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
