"use client";

import { useMemo, useState } from "react";
import { SearchAlert } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Cell,
} from "recharts";
import { useBatchDailyHistory } from "@/hooks/use-stock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, cn } from "@/lib/utils";

type DipMode =
  | "today"
  | "5d"
  | "1m"
  | "3m"
  | "6m"
  | "ytd"
  | "1y"
  | "sma10"
  | "sma50"
  | "sma100"
  | "sma200";

interface DipItem {
  ticker: string;
  name?: string;
  sector?: string;
  price: number;
}

function nearestOnOrBefore(history: Array<{ date: string; close: number }>, targetTs: number) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const ts = new Date(history[i].date).getTime();
    if (!Number.isNaN(ts) && ts <= targetTs) return history[i].close;
  }
  return null;
}

function firstOnOrAfter(history: Array<{ date: string; close: number }>, targetTs: number) {
  for (let i = 0; i < history.length; i += 1) {
    const ts = new Date(history[i].date).getTime();
    if (!Number.isNaN(ts) && ts >= targetTs) return history[i].close;
  }
  return history[0]?.close ?? null;
}

function calcSmaDeviation(history: Array<{ date: string; close: number }>, period: number, currentPrice: number) {
  if (history.length < period || currentPrice <= 0) return null;
  const window = history.slice(-period);
  const avg = window.reduce((sum, row) => sum + row.close, 0) / window.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return (currentPrice - avg) / avg;
}

function calcPriceChange(mode: DipMode, history: Array<{ date: string; close: number }>, currentPrice: number) {
  if (currentPrice <= 0 || history.length === 0) return null;

  if (mode === "today") {
    if (history.length < 2) return null;
    const previousClose = history[history.length - 2]?.close;
    if (!previousClose || previousClose <= 0) return null;
    return (currentPrice - previousClose) / previousClose;
  }

  if (mode === "ytd") {
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const base = firstOnOrAfter(history, yearStart);
    if (!base || base <= 0) return null;
    return (currentPrice - base) / base;
  }

  const lookbackDays: Record<string, number> = {
    "5d": 5,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
  };

  const days = lookbackDays[mode];
  if (!days) return null;

  const targetTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const base = nearestOnOrBefore(history, targetTs);
  if (!base || base <= 0) return null;
  return (currentPrice - base) / base;
}

export function DipFinderPanel({
  title = "Dip Finder",
  subtitle = "Identify potential buy opportunities from sharp drawdowns",
  items,
}: {
  title?: string;
  subtitle?: string;
  items: DipItem[];
}) {
  const [mode, setMode] = useState<DipMode>("sma50");

  const tickers = useMemo(
    () => Array.from(new Set(items.map((item) => item.ticker.toUpperCase()).filter(Boolean))),
    [items]
  );

  const { data: historyByTicker = {}, isLoading } = useBatchDailyHistory(
    tickers,
    "ALL",
    tickers.length > 0
  );

  const rows = useMemo(() => {
    const normalized = items
      .map((item) => {
        const history = (historyByTicker[item.ticker.toUpperCase()] ?? [])
          .filter((h) => Number.isFinite(h.close) && h.close > 0)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let value: number | null = null;

        if (mode.startsWith("sma")) {
          const period = parseInt(mode.replace("sma", ""), 10);
          value = calcSmaDeviation(history, period, item.price);
        } else {
          value = calcPriceChange(mode, history, item.price);
        }

        return {
          ticker: item.ticker,
          name: item.name,
          value,
        };
      })
      .filter((row) => row.value !== null)
      .map((row) => ({
        ...row,
        percent: (row.value as number) * 100,
      }))
      .sort((a, b) => a.percent - b.percent);

    return normalized;
  }, [historyByTicker, items, mode]);

  const modeLabel = useMemo(() => {
    const labels: Record<DipMode, string> = {
      today: "Today",
      "5d": "5 Days",
      "1m": "1 Month",
      "3m": "3 Months",
      "6m": "6 Months",
      ytd: "YTD",
      "1y": "1 Year",
      sma10: "SMA 10",
      sma50: "SMA 50",
      sma100: "SMA 100",
      sma200: "SMA 200",
    };
    return labels[mode];
  }, [mode]);

  return (
    <Card className="border-wolf-border/50 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80 shadow-[0_10px_28px_rgba(0,0,0,0.2)]">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <SearchAlert className="w-4 h-4 text-sunset-orange" /> {title}
          </CardTitle>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DipMode)}
            className="h-8 rounded-md border border-wolf-border/50 bg-wolf-black/70 px-2.5 text-xs text-snow-peak"
          >
            <optgroup label="Price Change">
              <option value="today">Today</option>
              <option value="5d">5 Days</option>
              <option value="1m">1 Month</option>
              <option value="3m">3 Months</option>
              <option value="6m">6 Months</option>
              <option value="ytd">YTD</option>
              <option value="1y">1 Year</option>
            </optgroup>
            <optgroup label="SMA Deviation">
              <option value="sma10">SMA 10</option>
              <option value="sma50">SMA 50</option>
              <option value="sma100">SMA 100</option>
              <option value="sma200">SMA 200</option>
            </optgroup>
          </select>
        </div>
        <p className="text-xs text-mist mt-1">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          {isLoading ? (
            <div className="h-full grid place-items-center text-xs text-mist">Calculating dips...</div>
          ) : rows.length === 0 ? (
            <div className="h-full grid place-items-center text-xs text-mist">Not enough data to compute dip metrics.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3B40" strokeOpacity={0.32} vertical={false} />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeOpacity={0.5} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(value) => {
                    const numeric = typeof value === "number" ? value : 0;
                    return [formatPercent(numeric / 100, 2), modeLabel];
                  }}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{
                    background: "#a2b1a8af",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10,
                    color: "black",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                />
                <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                  {rows.map((row) => (
                    <Cell
                      key={`dip-${row.ticker}`}
                      fill={row.percent >= 0 ? "#00D492" : "#EF3F3F"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className={cn("mt-2 text-[11px] text-mist/80")}>Formula: ((Current Price - Baseline) / Baseline) x 100</p>
      </CardContent>
    </Card>
  );
}
