"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { InsiderRow } from "@/lib/insiders/activity";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";

/**
 * A trade marker sitting exactly on the price. Decisions are solid with a
 * soft halo so they carry across the chart; plan trades are rings, present
 * but quieter. A dark rim separates either from the line under it.
 */
function markerShape(key: "buy" | "sell" | "planBuy" | "planSell", colour: string, solid: boolean) {
  function Marker(props: unknown) {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: Point };
    // Recharts calls the shape for every point in the series, trade or not;
    // only a day that carries this kind of trade gets a mark.
    if (cx === undefined || cy === undefined || payload?.[key] === undefined) return <g />;
    return solid ? (
      <g>
        <circle cx={cx} cy={cy} r={11} fill={colour} fillOpacity={0.18} />
        <circle cx={cx} cy={cy} r={6} fill={colour} stroke="var(--color-wolf-black)" strokeWidth={2} />
      </g>
    ) : (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="var(--color-wolf-black)" stroke={colour} strokeWidth={2} />
      </g>
    );
  }
  return Marker;
}

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
          <defs>
            <linearGradient id="insider-price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-snow-peak)" stopOpacity={0.10} />
              <stop offset="100%" stopColor="var(--color-snow-peak)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* The price is the ground the trades stand on: a clear line over a faint wash. */}
          <Area type="linear" dataKey="close" stroke="none" fill="url(#insider-price-fill)" isAnimationActive={false} />
          <Line type="linear" dataKey="close" stroke="var(--color-snow-peak)" strokeOpacity={0.85} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--color-snow-peak)", stroke: "var(--color-wolf-black)", strokeWidth: 2 }} isAnimationActive={false} />
          <Scatter dataKey="planBuy" shape={markerShape("planBuy", "var(--color-bullish)", false)} isAnimationActive={false} />
          <Scatter dataKey="planSell" shape={markerShape("planSell", "var(--color-bearish)", false)} isAnimationActive={false} />
          <Scatter dataKey="buy" shape={markerShape("buy", "var(--color-bullish)", true)} isAnimationActive={false} />
          <Scatter dataKey="sell" shape={markerShape("sell", "var(--color-bearish)", true)} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-[11px] text-mist">
        <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full bg-bullish ring-4 ring-bullish/20" /> Open-market buy</span>
        <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full bg-bearish ring-4 ring-bearish/20" /> Open-market sale</span>
        <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-inset ring-mist" /> Under a 10b5-1 plan</span>
      </div>
    </div>
  );
}
