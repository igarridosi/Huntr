"use client";

/**
 * WhatIfSimulator
 * ─────────────────────────────────────────────────────────────
 * Interactive sandbox where the user stages hypothetical BUY / SELL
 * trades without touching their real portfolio. The card recomputes:
 *
 *   • New total market value
 *   • New sector allocation (delta vs current)
 *   • New weighted beta + weighted dividend yield
 *   • Estimated cash impact (net buys - net sells)
 *
 * Trades are kept in local state only. A "Commit to portfolio" button
 * would close the loop, but the spec says it's a SIMULATOR so we keep
 * it ephemeral for now — that's the safer default.
 */

import { useMemo, useState, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  Trash2,
  PlusCircle,
  MinusCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useSearch } from "@/hooks/use-stock-data";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { EnrichedPosition, PortfolioSummary } from "@/types/portfolio";

interface DraftTrade {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number; // assumed at current quote
  name?: string;
  sector?: string;
  beta?: number;
  dividendYield?: number;
  logoUrl?: string;
}

function normalizeDividendYield(raw: number | null | undefined): number {
  if (!Number.isFinite(raw) || raw === null || raw === undefined || raw <= 0) return 0;
  return raw > 1 ? raw / 100 : raw;
}

export function WhatIfSimulator({
  positions,
  summary,
}: {
  positions: EnrichedPosition[];
  summary: PortfolioSummary;
}) {
  const [drafts, setDrafts] = useState<DraftTrade[]>([]);
  const [addingTicker, setAddingTicker] = useState("");
  const [addingShares, setAddingShares] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");

  const { data: searchResults = [] } = useSearch(searchQuery, 5);

  // Map current positions by ticker for quick lookup
  const positionByTicker = useMemo(() => {
    return new Map(positions.map((p) => [p.ticker.toUpperCase(), p]));
  }, [positions]);

  // ── Compute simulated portfolio ───────────────────────────
  const simulated = useMemo(() => {
    // Start from current positions (clone shape we need)
    type SimPos = {
      ticker: string;
      shares: number;
      price: number;
      sector: string;
      beta: number;
      dividendYield: number;
    };
    const map = new Map<string, SimPos>();

    for (const p of positions) {
      map.set(p.ticker.toUpperCase(), {
        ticker: p.ticker.toUpperCase(),
        shares: p.shares,
        price: p.quote?.price ?? p.avg_cost,
        sector: p.profile?.sector || "Unknown",
        beta: p.quote?.beta ?? 0,
        dividendYield: normalizeDividendYield(p.quote?.dividend_yield),
      });
    }

    // Apply each draft
    let cashImpact = 0;
    for (const d of drafts) {
      const key = d.ticker.toUpperCase();
      const existing = map.get(key);
      const delta = d.side === "buy" ? d.shares : -d.shares;
      cashImpact += d.side === "buy" ? d.shares * d.price : -(d.shares * d.price);

      if (existing) {
        const nextShares = Math.max(0, existing.shares + delta);
        if (nextShares <= 1e-9) {
          map.delete(key);
        } else {
          map.set(key, { ...existing, shares: nextShares });
        }
      } else if (d.side === "buy") {
        map.set(key, {
          ticker: key,
          shares: d.shares,
          price: d.price,
          sector: d.sector || "Unknown",
          beta: d.beta ?? 0,
          dividendYield: normalizeDividendYield(d.dividendYield),
        });
      }
    }

    const simPositions = Array.from(map.values());
    const totalValue = simPositions.reduce((s, p) => s + p.shares * p.price, 0);

    const sectorMap = new Map<string, number>();
    let weightedBeta = 0;
    let weightedDivYield = 0;

    for (const p of simPositions) {
      const value = p.shares * p.price;
      const w = totalValue > 0 ? value / totalValue : 0;
      sectorMap.set(p.sector, (sectorMap.get(p.sector) ?? 0) + w);
      weightedBeta += w * p.beta;
      weightedDivYield += w * p.dividendYield;
    }

    return {
      totalValue,
      cashImpact,
      sectorAllocation: Object.fromEntries(sectorMap),
      weightedBeta,
      weightedDivYield,
      positionCount: simPositions.length,
    };
  }, [positions, drafts]);

  // ── Sector deltas vs current ──────────────────────────────
  const sectorDelta = useMemo(() => {
    const all = new Set([
      ...Object.keys(summary.sector_allocation),
      ...Object.keys(simulated.sectorAllocation),
    ]);
    const out: Array<{ sector: string; before: number; after: number; delta: number }> = [];
    all.forEach((s) => {
      const before = summary.sector_allocation[s] ?? 0;
      const after = simulated.sectorAllocation[s] ?? 0;
      out.push({ sector: s, before, after, delta: after - before });
    });
    return out
      .filter((r) => Math.abs(r.delta) > 1e-5 || r.after > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [summary.sector_allocation, simulated.sectorAllocation]);

  // ── Add a draft trade ────────────────────────────────────
  const handleAddDraft = useCallback(() => {
    const sym = addingTicker.trim().toUpperCase();
    const sharesNum = parseFloat(addingShares);
    if (!sym || !Number.isFinite(sharesNum) || sharesNum <= 0) return;

    const existing = positionByTicker.get(sym);
    // If selling but the user has no position and no prior buy draft → block
    if (side === "sell" && !existing) {
      const fromDraft = drafts
        .filter((d) => d.ticker === sym)
        .reduce((s, d) => s + (d.side === "buy" ? d.shares : -d.shares), 0);
      if (fromDraft <= 0) return; // nothing to sell
    }

    // Reuse the searched result's metadata if available
    const fromSearch = searchResults.find((r) => r.ticker.toUpperCase() === sym);

    const price = existing?.quote?.price ?? existing?.avg_cost ?? 0;
    if (price <= 0 && !existing) {
      // Need at least a starting price — we don't have a quote-by-ticker hook
      // synchronously here, so allow user to enter via raw price field later.
      // For v1, only let the user buy tickers they've selected from search
      // OR already own (so we have a price).
      return;
    }

    setDrafts((prev) => [
      ...prev,
      {
        id: `${sym}-${Date.now()}`,
        ticker: sym,
        side,
        shares: sharesNum,
        price,
        name: existing?.profile?.name ?? fromSearch?.name,
        sector: existing?.profile?.sector ?? fromSearch?.sector ?? "Unknown",
        beta: existing?.quote?.beta ?? 0,
        dividendYield: existing?.quote?.dividend_yield ?? 0,
        logoUrl: existing?.profile?.logo_url ?? fromSearch?.logo_url,
      },
    ]);
    setAddingTicker("");
    setAddingShares("");
    setSearchQuery("");
  }, [addingTicker, addingShares, side, positionByTicker, drafts, searchResults]);

  const handleRemoveDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleReset = useCallback(() => {
    setDrafts([]);
  }, []);

  // ── Stat deltas for header ────────────────────────────────
  const valueDelta = simulated.totalValue - summary.total_market_value;
  const betaDelta = simulated.weightedBeta - summary.weighted_beta;
  const yieldDelta = simulated.weightedDivYield - summary.weighted_dividend_yield;

  return (
    <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sunset-orange" /> What-If
            Simulator
            <span className="text-[10px] uppercase tracking-wider text-mist/60 font-normal ml-1">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
          {drafts.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-mist hover:text-snow-peak"
            >
              Reset
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Add draft trade ── */}
        <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/20 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-wolf-border/40 bg-wolf-black/50 p-0.5">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-sm flex items-center gap-1 transition-colors",
                  side === "buy"
                    ? "bg-bullish/15 text-bullish"
                    : "text-mist hover:text-snow-peak"
                )}
              >
                <PlusCircle className="w-3 h-3" /> Buy
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-sm flex items-center gap-1 transition-colors",
                  side === "sell"
                    ? "bg-bearish/15 text-bearish"
                    : "text-mist hover:text-snow-peak"
                )}
              >
                <MinusCircle className="w-3 h-3" /> Sell
              </button>
            </div>

            <div className="relative flex-1">
              <Input
                value={searchQuery || addingTicker}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setSearchQuery(v);
                  setAddingTicker(v);
                }}
                placeholder="Ticker (e.g. AAPL)"
                className="h-9 text-xs font-mono"
              />
              {searchQuery && searchResults.length > 0 && searchQuery !== addingTicker ? (
                <div className="absolute z-30 mt-1 w-full rounded-md border border-wolf-border/50 bg-wolf-surface shadow-xl overflow-hidden max-h-44 overflow-y-auto">
                  {searchResults.map((r) => (
                    <button
                      key={r.ticker}
                      type="button"
                      onClick={() => {
                        setAddingTicker(r.ticker);
                        setSearchQuery(r.ticker);
                      }}
                      className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-sunset-orange/10 transition-colors"
                    >
                      <TickerLogo
                        ticker={r.ticker}
                        src={r.logo_url}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-xs font-mono text-snow-peak">
                        {r.ticker}
                      </span>
                      <span className="text-[11px] text-mist truncate flex-1">
                        {r.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <Input
              value={addingShares}
              onChange={(e) => setAddingShares(e.target.value)}
              placeholder="Shares"
              type="number"
              step="any"
              min="0.0001"
              className="h-9 w-24 text-xs font-mono"
            />

            <Button
              size="sm"
              onClick={handleAddDraft}
              disabled={!addingTicker || !addingShares}
              className="h-9 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          <p className="text-[10px] text-mist">
            Trades are simulated only — your real portfolio is untouched.
            Prices use current quote at the moment you add the draft.
          </p>
        </div>

        {/* ── Draft trades list ── */}
        {drafts.length > 0 ? (
          <div className="space-y-1.5">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-wolf-border/35 bg-wolf-black/25 px-2.5 py-1.5"
              >
                <TickerLogo
                  ticker={d.ticker}
                  src={d.logoUrl}
                  className="w-5 h-5"
                />
                <span
                  className={cn(
                    "text-[10px] font-mono uppercase px-1.5 py-0.5 rounded",
                    d.side === "buy"
                      ? "bg-bullish/15 text-bullish"
                      : "bg-bearish/15 text-bearish"
                  )}
                >
                  {d.side}
                </span>
                <span className="text-xs font-mono font-semibold text-snow-peak">
                  {d.ticker}
                </span>
                <span className="text-xs text-mist">
                  {d.shares} shares @ {formatCurrency(d.price)}
                </span>
                <span className="text-xs font-mono text-mist ml-auto">
                  {formatCurrency(d.shares * d.price)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveDraft(d.id)}
                  className="text-mist hover:text-bearish transition-colors"
                  aria-label="Remove draft"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Impact summary ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <ImpactTile
            label="Market Value"
            current={summary.total_market_value}
            next={simulated.totalValue}
            format="currency"
          />
          <ImpactTile
            label="Net Cash Impact"
            current={0}
            next={-simulated.cashImpact}
            format="currency"
            highlight
          />
          <ImpactTile
            label="Weighted Beta"
            current={summary.weighted_beta}
            next={simulated.weightedBeta}
            format="number"
          />
          <ImpactTile
            label="Dividend Yield"
            current={summary.weighted_dividend_yield}
            next={simulated.weightedDivYield}
            format="percent"
          />
        </div>

        {/* ── Sector allocation deltas ── */}
        {sectorDelta.length > 0 && drafts.length > 0 ? (
          <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/20 p-3">
            <p className="text-xs font-semibold text-snow-peak mb-2">
              Sector allocation shift
            </p>
            <div className="space-y-1">
              {sectorDelta.map((row) => (
                <div
                  key={row.sector}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-xs"
                >
                  <span className="text-mist truncate">{row.sector}</span>
                  <span className="font-mono text-mist">
                    {(row.before * 100).toFixed(1)}%
                  </span>
                  <ArrowRight className="w-3 h-3 text-mist/60" />
                  <span
                    className={cn(
                      "font-mono",
                      row.delta > 0.001
                        ? "text-bullish"
                        : row.delta < -0.001
                          ? "text-bearish"
                          : "text-snow-peak"
                    )}
                  >
                    {(row.after * 100).toFixed(1)}%
                    <span className="text-mist/60 ml-1 text-[10px]">
                      ({row.delta >= 0 ? "+" : ""}
                      {(row.delta * 100).toFixed(1)}pp)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-xs text-mist text-center py-2">
            Add a draft trade above to see its impact on your portfolio.
          </p>
        ) : null}

        {/* Footer hints */}
        {valueDelta !== 0 && drafts.length > 0 ? (
          <div className="text-[11px] text-mist border-t border-wolf-border/30 pt-2">
            Net result:{" "}
            <span
              className={cn(
                "font-mono",
                valueDelta >= 0 ? "text-bullish" : "text-bearish"
              )}
            >
              {valueDelta >= 0 ? "+" : ""}
              {formatCurrency(valueDelta)}
            </span>{" "}
            market value,{" "}
            <span
              className={cn(
                "font-mono",
                Math.abs(betaDelta) < 0.01
                  ? "text-mist"
                  : betaDelta > 0
                    ? "text-bearish"
                    : "text-bullish"
              )}
            >
              {betaDelta >= 0 ? "+" : ""}
              {betaDelta.toFixed(2)}β
            </span>
            , {yieldDelta >= 0 ? "+" : ""}
            {formatPercent(yieldDelta, 2)} yield.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ImpactTile({
  label,
  current,
  next,
  format,
  highlight,
}: {
  label: string;
  current: number;
  next: number;
  format: "currency" | "number" | "percent";
  highlight?: boolean;
}) {
  const delta = next - current;
  const hasChange = Math.abs(delta) > (format === "percent" ? 0.0001 : 0.01);
  const deltaColor = hasChange
    ? delta > 0
      ? "text-bullish"
      : "text-bearish"
    : "text-mist";

  const fmt = (v: number): string => {
    if (format === "currency") return formatCurrency(v, { compact: true });
    if (format === "percent") return formatPercent(v, 2);
    return v.toFixed(2);
  };

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        highlight
          ? "border-sunset-orange/40 bg-sunset-orange/5"
          : "border-wolf-border/35 bg-wolf-black/20"
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-mist">{label}</p>
      <p className="text-sm font-mono font-semibold text-snow-peak mt-0.5">
        {fmt(next)}
      </p>
      {hasChange ? (
        <p className={cn("text-[10px] font-mono mt-0.5", deltaColor)}>
          {delta >= 0 ? "+" : ""}
          {fmt(delta)}
        </p>
      ) : (
        <p className="text-[10px] text-mist/60 mt-0.5">no change</p>
      )}
    </div>
  );
}
