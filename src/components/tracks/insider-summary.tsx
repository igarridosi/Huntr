"use client";

import { Users } from "lucide-react";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";
import type { FlowTotals, InsiderSummary as Summary } from "@/lib/insiders/activity";

function money(t: FlowTotals): string {
  if (t.count === 0) return "—";
  return t.value > 0 ? formatCurrency(t.value, { compact: true, decimals: 1 }) : "no price filed";
}

function Tile({ label, totals, tone, hint }: { label: string; totals: FlowTotals; tone: "buy" | "sell" | "quiet"; hint?: string }) {
  const colour = tone === "buy" ? "text-bullish" : tone === "sell" ? "text-bearish" : "text-snow-peak";
  return (
    <div className="rounded-xl border border-wolf-border/50 bg-wolf-black/25 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">{label}</p>
      <p className={`mt-1.5 font-mono text-xl font-semibold tabular-nums ${totals.count ? colour : "text-mist/50"}`}>{money(totals)}</p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-mist">
        {totals.count} trade{totals.count === 1 ? "" : "s"} · {formatCompactNumber(totals.shares)} sh
        {totals.unpriced > 0 ? <span className="text-mist/60"> · {totals.unpriced} unpriced</span> : null}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-mist/70">{hint}</p> : null}
    </div>
  );
}

/**
 * Twelve months in four tiles. Discretionary trades lead; plan trades sit
 * beside them, labelled, because a scheduled sale is not a view on the
 * stock and a reader should never have to work that out from a total.
 */
export function InsiderSummary({ summary }: { summary: Summary }) {
  const { buys, sells, planBuys, planSells, buyers, cluster, other } = summary;
  const routine = other.grant + other.exercise + other.tax + other.gift + other.other;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Open-market buys" totals={buys} tone="buy" hint={buyers > 0 ? `${buyers} insider${buyers === 1 ? "" : "s"} buying` : undefined} />
        <Tile label="Open-market sells" totals={sells} tone="sell" />
        <Tile label="Plan purchases" totals={planBuys} tone="quiet" hint="Scheduled under Rule 10b5-1" />
        <Tile label="Plan sales" totals={planSells} tone="quiet" hint="Scheduled under Rule 10b5-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {cluster ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-bullish/10 px-2.5 py-1.5 font-medium text-bullish ring-1 ring-inset ring-bullish/25">
            <Users className="h-3.5 w-3.5" aria-hidden />
            Cluster buying: {cluster.insiders.length} insiders between {cluster.from} and {cluster.to}
          </span>
        ) : null}
        <span className="text-mist">
          {routine > 0
            ? `${routine} routine line${routine === 1 ? "" : "s"} — grants, exercises, tax withholding, gifts — shown below, counted in neither total.`
            : "No routine lines in the window."}
        </span>
      </div>
    </div>
  );
}
