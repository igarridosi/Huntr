"use client";

import { Users } from "lucide-react";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";
import type { FlowTotals, InsiderSummary as Summary } from "@/lib/insiders/activity";

function amount(t: FlowTotals): string {
  if (t.count === 0) return "None";
  return t.value > 0 ? formatCurrency(t.value, { compact: true, decimals: 1 }) : "No price filed";
}

function Tile({ label, totals, tone, note }: { label: string; totals: FlowTotals; tone: "buy" | "sell" | "plan"; note?: string }) {
  const colour = !totals.count ? "text-mist/50" : tone === "buy" ? "text-bullish" : tone === "sell" ? "text-bearish" : "text-snow-peak";
  return (
    <div className="rounded-xl bg-wolf-black/25 p-4 ring-1 ring-inset ring-wolf-border/40">
      <p className="text-[11px] text-mist">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tracking-[-0.01em] tabular-nums ${colour}`}>{amount(totals)}</p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-mist/80">
        {totals.count} trade{totals.count === 1 ? "" : "s"}, {formatCompactNumber(totals.shares)} sh
        {totals.unpriced > 0 ? `, ${totals.unpriced} unpriced` : ""}
      </p>
      {note ? <p className="mt-1 text-[11px] text-mist/70">{note}</p> : null}
    </div>
  );
}

/**
 * Twelve months in four tiles. Decisions lead, scheduled plan trades sit
 * beside them, and the rule that separates the two is stated once, under
 * the figures it governs.
 */
export function InsiderSummary({ summary }: { summary: Summary }) {
  const { buys, sells, planBuys, planSells, buyers, cluster, other } = summary;
  const routine = other.grant + other.exercise + other.tax + other.gift + other.other;

  return (
    <div className="space-y-3">
      {cluster ? (
        <p className="flex items-start gap-2 rounded-xl bg-bullish/[0.08] px-3 py-2.5 text-xs text-bullish ring-1 ring-inset ring-bullish/25">
          <Users className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Cluster buying: {cluster.insiders.length} insiders bought on the open market between {cluster.from} and {cluster.to}.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="Open-market buys" totals={buys} tone="buy" note={buyers > 0 ? `${buyers} insider${buyers === 1 ? "" : "s"}` : undefined} />
        <Tile label="Open-market sells" totals={sells} tone="sell" />
        <Tile label="Plan purchases" totals={planBuys} tone="plan" />
        <Tile label="Plan sales" totals={planSells} tone="plan" />
      </div>

      <p className="text-[11px] leading-relaxed text-mist">
        Only open-market trades outside a Rule 10b5-1 plan count as buying or selling. Plan trades were scheduled in advance.
        {routine > 0
          ? ` ${routine} routine line${routine === 1 ? "" : "s"} (grants, exercises, tax withholding, gifts) sit in neither total.`
          : ""}
      </p>
    </div>
  );
}
