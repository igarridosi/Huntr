"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Scale,
  ArrowRight,
  Download,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Info,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn, formatCurrency } from "@/lib/utils";
import type { EnrichedPosition } from "@/types/portfolio";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type Strategy = "current" | "equal" | "custom";

interface TradeAction {
  ticker: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  amount: number;
  currentWeight: number;
  targetWeight: number;
  drift: number;
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

/** Visual bar: grey fill = current weight, orange tick = target, coloured gap = delta */
function DriftBar({
  current,
  target,
  side,
  maxWeight,
}: {
  current: number;
  target: number;
  side: "buy" | "sell";
  maxWeight: number;
}) {
  const scale = Math.max(maxWeight * 1.15, 0.01);
  const curPct  = Math.min((current / scale) * 100, 100);
  const tgtPct  = Math.min((target  / scale) * 100, 100);
  const lo      = Math.min(curPct, tgtPct);
  const deltaPct = Math.abs(curPct - tgtPct);

  return (
    <div className="relative h-1.5 w-full rounded-full bg-wolf-border/20 overflow-visible">
      {/* Current fill */}
      <div
        className="absolute left-0 top-0 h-full rounded-full bg-mist/20"
        style={{ width: `${curPct}%` }}
      />
      {/* Delta gap (buy = green, sell = red) */}
      <div
        className={cn(
          "absolute top-0 h-full rounded-sm",
          side === "buy" ? "bg-bullish/45" : "bg-bearish/45"
        )}
        style={{ left: `${lo}%`, width: `${deltaPct}%` }}
      />
      {/* Target marker */}
      <div
        className="absolute top-[-3px] h-[calc(100%+6px)] w-px bg-sunset-orange rounded-full"
        style={{ left: `${tgtPct}%` }}
      />
    </div>
  );
}

/** A single stat tile for the summary row */
function StatTile({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-wolf-border/30 bg-wolf-black/25 px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn("w-3 h-3", color)} />
        <p className="text-[10px] uppercase tracking-wider text-mist/70 font-medium">{label}</p>
      </div>
      <p className={cn("text-base font-mono font-bold leading-tight", color)}>{value}</p>
      {sub && <p className="text-[10px] text-mist/50 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Tolerance preset chips */
const TOLERANCE_PRESETS = [0.5, 1, 2, 3, 5];

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

export function RebalanceAdvisor({
  positions,
  totalMarketValue,
}: {
  positions: EnrichedPosition[];
  totalMarketValue: number;
}) {
  const [strategy, setStrategy]     = useState<Strategy>("current");
  const [tolerance, setTolerance]   = useState(1.0);
  const [customTargets, setCustomTargets] = useState<Record<string, number>>({});

  // ── Targets ──────────────────────────────────────────────
  const targets = useMemo(() => {
    if (positions.length === 0) return {} as Record<string, number>;
    if (strategy === "equal") {
      const w = 1 / positions.length;
      return Object.fromEntries(positions.map((p) => [p.ticker, w]));
    }
    if (strategy === "current") {
      return Object.fromEntries(positions.map((p) => [p.ticker, p.weight]));
    }
    const base = Object.fromEntries(positions.map((p) => [p.ticker, p.weight]));
    return { ...base, ...customTargets };
  }, [strategy, positions, customTargets]);

  const normalizedTargets = useMemo(() => {
    const sum = Object.values(targets).reduce((s, v) => s + v, 0);
    if (sum <= 0) return targets;
    return Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [k, v / sum])
    );
  }, [targets]);

  // ── Trades ───────────────────────────────────────────────
  const trades = useMemo(() => {
    if (totalMarketValue <= 0) return [] as TradeAction[];
    const tol = tolerance / 100;

    return positions
      .flatMap((p) => {
        const currentWeight = p.weight;
        const targetWeight  = normalizedTargets[p.ticker] ?? 0;
        const drift         = currentWeight - targetWeight;
        if (Math.abs(drift) < tol) return [];

        const deltaValue = (targetWeight - currentWeight) * totalMarketValue;
        const price      = p.quote?.price ?? p.avg_cost;
        if (price <= 0) return [];

        return [{
          ticker:        p.ticker,
          name:          p.profile?.name ?? p.ticker,
          side:          (deltaValue > 0 ? "buy" : "sell") as "buy" | "sell",
          shares:        Math.abs(deltaValue) / price,
          amount:        Math.abs(deltaValue),
          currentWeight,
          targetWeight,
          drift,
        }];
      })
      .sort((a, b) => b.amount - a.amount);
  }, [positions, normalizedTargets, totalMarketValue, tolerance]);

  // ── Aggregates ───────────────────────────────────────────
  const buys  = trades.filter((t) => t.side === "buy");
  const sells = trades.filter((t) => t.side === "sell");
  const totalBuy  = buys.reduce((s, t)  => s + t.amount, 0);
  const totalSell = sells.reduce((s, t) => s + t.amount, 0);
  const netCash   = totalSell - totalBuy;
  const turnover  = totalMarketValue > 0 ? (totalBuy + totalSell) / 2 / totalMarketValue : 0;
  const maxWeight = Math.max(...positions.map((p) => Math.max(p.weight, normalizedTargets[p.ticker] ?? 0)), 0.01);

  // ── Handlers ─────────────────────────────────────────────
  const handleSetCustomTarget = useCallback((ticker: string, weight: number) => {
    setCustomTargets((prev) => ({ ...prev, [ticker]: Math.max(0, Math.min(1, weight)) }));
    setStrategy("custom");
  }, []);

  const handleResetCustom = useCallback(() => {
    setCustomTargets({});
    setStrategy("current");
  }, []);

  const handleExportCsv = useCallback(() => {
    if (trades.length === 0) return;
    const header = "Ticker,Side,Shares,Amount,Current%,Target%,Drift%";
    const rows = trades.map((t) =>
      [t.ticker, t.side.toUpperCase(), t.shares.toFixed(4), t.amount.toFixed(2),
       (t.currentWeight * 100).toFixed(2), (t.targetWeight * 100).toFixed(2),
       (t.drift * 100).toFixed(2)].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `rebalance-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trades]);

  if (positions.length === 0) {
    return (
      <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="w-4 h-4 text-sunset-orange" /> Rebalance Advisor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-mist">Add positions to plan a rebalance.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Plain-language summary ───────────────────────────────
  const summaryLine = useMemo(() => {
    if (trades.length === 0) return null;
    const biggestBuy  = buys[0];
    const biggestSell = sells[0];
    const parts: string[] = [];
    if (biggestBuy)  parts.push(`buying ${biggestBuy.ticker} (+${formatCurrency(biggestBuy.amount, { compact: true })})`);
    if (biggestSell) parts.push(`selling ${biggestSell.ticker} (−${formatCurrency(biggestSell.amount, { compact: true })})`);
    return parts.join(" and ");
  }, [trades, buys, sells]);

  return (
    <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">

      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-sunset-orange" />
            <CardTitle className="text-sm">Rebalance Advisor</CardTitle>
            {trades.length > 0 && (
              <span className="text-[10px] uppercase tracking-wider text-mist/50 font-normal">
                {trades.length} trade{trades.length !== 1 ? "s" : ""} suggested
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {strategy === "custom" && (
              <Button variant="ghost" size="sm" onClick={handleResetCustom} className="text-xs gap-1.5 h-7">
                <RotateCcw className="w-3 h-3" /> Reset
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={handleExportCsv}
              disabled={trades.length === 0}
              className="text-xs gap-1.5 h-7"
            >
              <Download className="w-3 h-3" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── Controls row ── */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">

          {/* Strategy selector */}
          <div className="space-y-1.5 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-mist/60 font-medium">Target strategy</p>
            <div className="flex rounded-lg border border-wolf-border/40 bg-wolf-black/40 p-0.5 w-fit">
              {(["current", "equal", "custom"] as Strategy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] rounded-md transition-colors font-medium",
                    strategy === s
                      ? "bg-sunset-orange/20 text-sunset-orange"
                      : "text-mist hover:text-snow-peak"
                  )}
                >
                  {s === "current" ? "Current weights" : s === "equal" ? "Equal weight" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* Tolerance chips */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-mist/60 font-medium">
              Drift tolerance
              <span className="text-mist/40 ml-1 normal-case">(skip trades below this threshold)</span>
            </p>
            <div className="flex gap-1">
              {TOLERANCE_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTolerance(v)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md border transition-colors font-mono",
                    tolerance === v
                      ? "border-sunset-orange/50 bg-sunset-orange/10 text-sunset-orange"
                      : "border-wolf-border/40 bg-wolf-black/30 text-mist hover:text-snow-peak hover:border-wolf-border/60"
                  )}
                >
                  ±{v}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Plain-language banner ── */}
        {trades.length > 0 && summaryLine ? (
          <div className="rounded-lg border border-wolf-border/25 bg-wolf-black/25 px-4 py-3 flex gap-2.5 items-start">
            <Info className="w-3.5 h-3.5 text-mist/50 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-mist leading-relaxed">
              To restore your{" "}
              <span className="text-snow-peak font-semibold">
                {strategy === "equal" ? "equal-weight" : strategy === "custom" ? "custom" : "current"} target
              </span>
              , make <span className="text-snow-peak font-semibold">{trades.length} trade{trades.length !== 1 ? "s" : ""}</span>{" "}
              — {summaryLine}.{" "}
              Estimated portfolio turnover:{" "}
              <span className={cn("font-semibold font-mono", turnover < 0.15 ? "text-bullish" : turnover < 0.3 ? "text-amber-400" : "text-bearish")}>
                {(turnover * 100).toFixed(1)}%
              </span>
              .
            </p>
          </div>
        ) : null}

        {/* ── Summary stat tiles ── */}
        {trades.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatTile
              label="To Buy"
              value={formatCurrency(totalBuy, { compact: true })}
              sub={`${buys.length} position${buys.length !== 1 ? "s" : ""}`}
              color="text-bullish"
              icon={TrendingUp}
            />
            <StatTile
              label="To Sell"
              value={formatCurrency(totalSell, { compact: true })}
              sub={`${sells.length} position${sells.length !== 1 ? "s" : ""}`}
              color="text-bearish"
              icon={TrendingDown}
            />
            <StatTile
              label="Net Cash"
              value={`${netCash >= 0 ? "+" : ""}${formatCurrency(Math.abs(netCash), { compact: true })}`}
              sub={netCash >= 0 ? "released" : "needed"}
              color={netCash >= 0 ? "text-bullish" : "text-bearish"}
              icon={RefreshCw}
            />
            <StatTile
              label="Turnover"
              value={`${(turnover * 100).toFixed(1)}%`}
              sub={turnover < 0.15 ? "low — efficient" : turnover < 0.3 ? "moderate" : "high — consider staging"}
              color={turnover < 0.15 ? "text-bullish" : turnover < 0.3 ? "text-amber-400" : "text-bearish"}
              icon={Scale}
            />
          </div>
        )}

        {/* ── Trade list ── */}
        {trades.length === 0 ? (
          <div className="rounded-xl border border-bullish/25 bg-bullish/5 px-5 py-6 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="w-7 h-7 text-bullish/70" />
            <p className="text-sm font-semibold text-bullish">Portfolio is on target</p>
            <p className="text-[11px] text-mist/70 max-w-sm">
              All positions are within ±{tolerance.toFixed(1)}% of their target weight.
              Tighten the tolerance or switch to a different strategy to see suggested trades.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">

            {/* Column headers */}
            <div className="grid grid-cols-[28px_1fr_80px_2fr_100px_80px] gap-3 px-3 pb-1 text-[9px] uppercase tracking-widest text-mist/40 border-b border-wolf-border/20">
              <span />
              <span>Position</span>
              <span>Action</span>
              <span>Weight drift</span>
              <span className="text-right">Shares</span>
              <span className="text-right">Amount</span>
            </div>

            {trades.map((t) => (
              <div
                key={t.ticker}
                className="grid grid-cols-[28px_1fr_80px_2fr_100px_80px] gap-3 items-center rounded-xl px-3 py-2.5 hover:bg-wolf-black/30 transition-colors group"
              >
                {/* Logo */}
                <TickerLogo ticker={t.ticker} className="w-6 h-6 shrink-0" imageClassName="rounded-full" fallbackClassName="rounded-full text-[8px]" />

                {/* Ticker + name */}
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-snow-peak leading-tight">{t.ticker}</p>
                  <p className="text-[9px] text-mist/50 truncate leading-tight mt-0.5">{t.name}</p>
                </div>

                {/* BUY / SELL badge */}
                <span
                  className={cn(
                    "inline-flex items-center justify-center gap-1 text-[10px] font-bold font-mono px-2 py-1 rounded-md w-fit",
                    t.side === "buy"
                      ? "bg-bullish/15 text-bullish"
                      : "bg-bearish/15 text-bearish"
                  )}
                >
                  {t.side === "buy" ? (
                    <TrendingUp className="w-2.5 h-2.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5" />
                  )}
                  {t.side.toUpperCase()}
                </span>

                {/* Drift bar + labels */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-mist">{(t.currentWeight * 100).toFixed(1)}%</span>
                    <ArrowRight className="w-2.5 h-2.5 text-mist/40 shrink-0" />
                    <span className="text-snow-peak font-semibold">{(t.targetWeight * 100).toFixed(1)}%</span>
                    <span className={cn("text-[9px] ml-auto", t.side === "buy" ? "text-bullish/70" : "text-bearish/70")}>
                      {t.drift > 0 ? "−" : "+"}{Math.abs(t.drift * 100).toFixed(1)}pp
                    </span>
                  </div>
                  <DriftBar
                    current={t.currentWeight}
                    target={t.targetWeight}
                    side={t.side}
                    maxWeight={maxWeight}
                  />
                </div>

                {/* Shares */}
                <p className="text-xs font-mono text-mist text-right whitespace-nowrap">
                  {t.shares >= 1
                    ? t.shares.toFixed(2)
                    : t.shares.toFixed(4)}{" "}
                  <span className="text-mist/50">shs</span>
                </p>

                {/* Dollar amount */}
                <p
                  className={cn(
                    "text-xs font-mono font-semibold text-right whitespace-nowrap",
                    t.side === "buy" ? "text-bullish" : "text-bearish"
                  )}
                >
                  {t.side === "buy" ? "+" : "−"}
                  {formatCurrency(t.amount, { compact: t.amount >= 100_000 })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Custom target editor ── */}
        {strategy === "custom" && (
          <div className="rounded-xl border border-wolf-border/30 bg-wolf-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-snow-peak">Custom target weights</p>
              <span className="text-[10px] font-mono text-mist/50">
                Total:{" "}
                <span className={cn(
                  "font-semibold",
                  Math.abs(Object.values(targets).reduce((s, v) => s + v, 0) - 1) < 0.005
                    ? "text-bullish"
                    : "text-amber-400"
                )}>
                  {(Object.values(targets).reduce((s, v) => s + v, 0) * 100).toFixed(1)}%
                </span>
                <span className="text-mist/40 ml-1">(auto-normalised)</span>
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {positions.map((p) => {
                const target = normalizedTargets[p.ticker] ?? p.weight;
                const raw    = customTargets[p.ticker]    ?? p.weight;
                const diff   = target - p.weight;

                return (
                  <div key={p.ticker} className="grid grid-cols-[24px_56px_1fr_52px_52px] gap-2 items-center">
                    <TickerLogo ticker={p.ticker} className="w-5 h-5" imageClassName="rounded-full" fallbackClassName="rounded-full text-[7px]" />
                    <span className="text-[11px] font-mono font-semibold text-snow-peak">{p.ticker}</span>

                    <input
                      type="range"
                      min={0} max={100} step={0.5}
                      value={raw * 100}
                      onChange={(e) => handleSetCustomTarget(p.ticker, parseFloat(e.target.value) / 100)}
                      className="accent-sunset-orange h-1 cursor-pointer"
                    />

                    <span className="text-[11px] font-mono text-mist/60 text-right">
                      {(p.weight * 100).toFixed(1)}%
                    </span>
                    <span className={cn(
                      "text-[11px] font-mono font-semibold text-right",
                      diff > 0.002 ? "text-bullish" : diff < -0.002 ? "text-bearish" : "text-sunset-orange"
                    )}>
                      {(target * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[9px] text-mist/40 text-center pt-1">
              Grey = current weight · Orange = target weight · Bars auto-normalise to 100%
            </p>
          </div>
        )}

        {/* ── Footer note ── */}
        <p className="text-[10px] text-mist/40 text-center">
          Advisory only — no live order routing. Export to CSV and execute through your broker.
        </p>

      </CardContent>
    </Card>
  );
}
