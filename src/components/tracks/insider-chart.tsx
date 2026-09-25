"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { InsiderRow } from "@/lib/insiders/activity";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";

interface Point {
  date: string;
  close: number;
  buy?: number;
  sell?: number;
  planBuy?: number;
  planSell?: number;
  trades?: InsiderRow[];
}

/**
 * The price over the summary window with every open-market trade placed on
 * the day it happened. Discretionary trades are solid, plan trades hollow;
 * routine lines (grants, tax withholding) stay off the chart, where they
 * would only read as selling that never took place.
 */
export function InsiderChart({ prices, rows, loading = false }: { prices: Array<{ date: string; close: number }>; rows: InsiderRow[]; loading?: boolean }) {
  const data = useMemo<Point[]>(() => {
    if (prices.length === 0) return [];
    const points: Point[] = prices.map((p) => ({ date: p.date.slice(0, 10), close: p.close }));
    const index = new Map(points.map((p, i) => [p.date, i]));
    const first = points[0].date;

    for (const r of rows) {
      if (r.kind !== "buy" && r.kind !== "sell") continue;
      if (r.date < first) continue;
      // A trade dated on a day with no close lands on the last session before it.
      let i = index.get(r.date);
      if (i === undefined) {
        i = points.findIndex((p) => p.date > r.date) - 1;
        if (i < 0) i = points.length - 1;
      }
      const p = points[i];
      const key = r.kind === "buy" ? (r.discretionary ? "buy" : "planBuy") : r.discretionary ? "sell" : "planSell";
      p[key] = p.close;
      (p.trades ??= []).push(r);
    }
    return points;
  }, [prices, rows]);

  if (data.length === 0) {
    // Loading and missing are different states and say different things.
    return (
      <div className="flex min-h-[300px] flex-1 items-center justify-center text-xs text-mist">
        {loading ? "Loading the price history…" : "No price history to plot the trades against."}
      </div>
    );
  }

  return (
    // Fills the height the panel gives it, with a floor on narrow screens:
    // beside the list it grows until both columns end on the same line.
    <div className="flex min-h-[300px] w-full flex-1 flex-col">
      <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--color-wolf-border)" strokeOpacity={0.35} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--color-mist)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={48} tickFormatter={(d: string) => d.slice(0, 7)} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-mist)", fontSize: 10 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
          <Tooltip
            cursor={{ stroke: "var(--color-wolf-border)" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="max-w-xs rounded-lg border border-wolf-border/60 bg-wolf-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
                  <p className="font-mono text-mist">{p.date} · {formatCurrency(p.close)}</p>
                  {(p.trades ?? []).map((t, i) => (
                    <p key={i} className={`mt-1 ${t.kind === "buy" ? "text-bullish" : "text-bearish"}`}>
                      {t.owner} {t.kind === "buy" ? "bought" : "sold"} {formatCompactNumber(t.shares)} sh
                      {t.plan ? <span className="text-mist"> · 10b5-1 plan</span> : null}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Line type="linear" dataKey="close" stroke="var(--color-mist)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Scatter dataKey="buy" fill="var(--color-bullish)" shape="triangle" isAnimationActive={false} />
          <Scatter dataKey="sell" fill="var(--color-bearish)" shape="triangle" isAnimationActive={false} />
          <Scatter dataKey="planBuy" fill="none" stroke="var(--color-bullish)" shape="circle" isAnimationActive={false} />
          <Scatter dataKey="planSell" fill="none" stroke="var(--color-bearish)" shape="circle" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-mist">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rotate-45 bg-bullish" /> open-market buy</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rotate-45 bg-bearish" /> open-market sale</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full ring-1 ring-mist" /> under a 10b5-1 plan</span>
      </div>
    </div>
  );
}
