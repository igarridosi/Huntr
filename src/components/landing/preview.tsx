"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  DollarSign,
  Repeat2,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useMemo } from "react";
import {
  useAllProfiles,
  useAllQuotes,
  useBatchBuybackStrength,
  useBatchPeriodPerformance,
} from "@/hooks/use-stock-data";
import type { StockProfile, StockQuote } from "@/types/stock";
import { formatPercent } from "@/lib/utils";

type InsightRow = {
  quote: StockQuote;
  profile?: StockProfile;
  dayChangePercent: number;
};

type RadarRow = {
  ticker: string;
  value: string;
  valueColor: string;
  logoUrl?: string;
};

function formatPct(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function toRadarRow(
  item: InsightRow,
  value: string,
  valueColor: string
): RadarRow {
  return {
    ticker: item.quote.ticker,
    value,
    valueColor,
    logoUrl: item.profile?.logo_url,
  };
}

function ensureMinRows(primary: RadarRow[], fallback: RadarRow[], min = 4) {
  const merged: RadarRow[] = [];
  const seen = new Set<string>();

  const push = (rows: RadarRow[]) => {
    for (const row of rows) {
      if (seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      merged.push(row);
      if (merged.length >= min) break;
    }
  };

  push(primary);
  if (merged.length < min) push(fallback);
  return merged.slice(0, min);
}

/* ── helper: glass card ───────────────────────────────── */

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-wolf-surface/50 p-4 backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

/* ── helper: ticker row ───────────────────────────────── */

function TickerRow({
  ticker,
  value,
  logoUrl,
  valueColor = "text-bullish",
}: {
  ticker: string;
  value: string;
  logoUrl?: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-wolf-black/25 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <TickerLogo
          ticker={ticker}
          src={logoUrl}
          className="h-8 w-8"
          imageClassName="rounded"
          fallbackClassName="rounded text-[8px]"
        />
        <span className="text-sm font-semibold text-snow-peak">{ticker}</span>
      </div>
      <span className={`text-sm font-mono blur-metrics ${valueColor}`}>{value}</span>
    </div>
  );
}

/* ── main section ─────────────────────────────────────── */

export function Preview() {
  const { data: quotes = [] } = useAllQuotes();
  const { data: profiles = [] } = useAllProfiles();

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.ticker, profile])),
    [profiles]
  );

  const universe = useMemo(() => {
    return quotes
      .filter((quote) => quote.market_cap > 10_000_000_000)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 120)
      .map((quote) => ({
        quote,
        profile: profileMap[quote.ticker],
        dayChangePercent: quote.day_change_percent ?? 0,
      }));
  }, [quotes, profileMap]);

  const universeTickers = useMemo(
    () => universe.map((item) => item.quote.ticker),
    [universe]
  );

  const { data: periodPerformance = {} } = useBatchPeriodPerformance(
    universeTickers,
    "1W",
    universe.length > 0
  );

  const { data: buybackStrength = {} } = useBatchBuybackStrength(
    universeTickers.slice(0, 80),
    universe.length > 0
  );

  const ranked = useMemo(() => {
    const rows = universe.map((item) => ({
      ...item,
      periodChangePercent:
        periodPerformance[item.quote.ticker] ?? item.dayChangePercent,
    }));

    const topGainers = rows
      .slice()
      .sort((a, b) => b.periodChangePercent - a.periodChangePercent)
      .slice(0, 8)
      .map((item) => toRadarRow(item, `${formatPct(item.periodChangePercent)}`, "text-sunset-orange"));

    const topLosers = rows
      .slice()
      .sort((a, b) => a.periodChangePercent - b.periodChangePercent)
      .slice(0, 8)
      .map((item) => toRadarRow(item, `${formatPct(item.periodChangePercent)}`, "text-bearish"));

    const unusualVolume = rows
      .filter((item) => item.quote.avg_volume > 0 && (item.quote.current_volume ?? 0) > 0)
      .map((item) => {
        const ratio = Math.max(item.quote.current_volume ?? 0, 1) / Math.max(item.quote.avg_volume, 1);
        return { item, ratio };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8)
      .map(({ item, ratio }) => toRadarRow(item, `Vol: ${ratio.toFixed(1)}x`, "text-sunset-orange"));

    const buybackLeaders = rows
      .map((item) => ({
        item,
        pct: buybackStrength[item.quote.ticker] ?? 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8)
      .map(({ item, pct }) => toRadarRow(item, `Buyback: ${formatPercent(pct, 2)}`, "text-sunset-orange"));

    const breaking52W = rows
      .map((item) => {
        const high = item.quote.fifty_two_week_high;
        const pct = high > 0 ? item.quote.price / high - 1 : -1;
        return { item, pct };
      })
      .filter(({ item }) => item.quote.fifty_two_week_high > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8)
      .map(({ item, pct }) => toRadarRow(item, `Break: ${formatPercent(pct, 2)}`, "text-sunset-orange"));

    const incomeLeaders = rows
      .filter((item) => item.quote.dividend_yield > 0)
      .sort((a, b) => b.quote.dividend_yield - a.quote.dividend_yield)
      .slice(0, 8)
      .map((item) => toRadarRow(item, `Yield: ${formatPercent(item.quote.dividend_yield, 2)}`, "text-sunset-orange"));

    const fallbackRows = rows
      .slice(0, 12)
      .map((item) => toRadarRow(item, formatPct(item.periodChangePercent), "text-mist"));

    return {
      topGainers: ensureMinRows(topGainers, fallbackRows, 4),
      topLosers: ensureMinRows(topLosers, fallbackRows, 4),
      unusualVolume: ensureMinRows(unusualVolume, fallbackRows, 4),
      buybackLeaders: ensureMinRows(buybackLeaders, fallbackRows, 4),
      breaking52W: ensureMinRows(breaking52W, fallbackRows, 4),
      incomeLeaders: ensureMinRows(incomeLeaders, fallbackRows, 4),
    };
  }, [universe, periodPerformance, buybackStrength]);

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-8 -z-10 h-[520px] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(255,140,66,0.13)_0%,transparent_70%)] blur-[120px]"
      />

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak">
            Opportunity Radar
          </h2>
          <p className="mt-2 text-base text-mist">
            Real-time market signals to identify high-conviction trading opportunities before they move.
          </p>
        </div>
        <span className="rounded border border-white/10 bg-wolf-surface/50 px-2.5 py-1 text-[10px] font-mono text-sunset-orange backdrop-blur-md">
          PRO FEED
        </span>
      </div>

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Top Gainers
            </h3>
            <ArrowUpRight className="h-4 w-4 text-bullish" />
          </div>
          <div className="space-y-1.5">
            {ranked.topGainers.map((g) => (
              <TickerRow
                key={g.ticker}
                ticker={g.ticker}
                value={g.value}
                valueColor={g.valueColor}
                logoUrl={g.logoUrl}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Top Losers
            </h3>
            <ArrowDownRight className="h-4 w-4 text-bearish" />
          </div>
          <div className="space-y-1.5">
            {ranked.topLosers.map((l) => (
              <TickerRow
                key={l.ticker}
                ticker={l.ticker}
                value={l.value}
                valueColor={l.valueColor}
                logoUrl={l.logoUrl}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Income Leaders
            </h3>
            <DollarSign className="h-4 w-4 text-golden-hour" />
          </div>
          <div className="space-y-1.5">
            {ranked.incomeLeaders.map((i) => (
              <TickerRow
                key={i.ticker}
                ticker={i.ticker}
                value={i.value}
                valueColor={i.valueColor}
                logoUrl={i.logoUrl}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Unusual Volume
            </h3>
            <AlertTriangle className="h-4 w-4 text-sunset-orange" />
          </div>
          <div className="space-y-1.5">
            {ranked.unusualVolume.map((u) => (
              <TickerRow
                key={u.ticker}
                ticker={u.ticker}
                value={u.value}
                valueColor={u.valueColor}
                logoUrl={u.logoUrl}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Buyback Leaders
            </h3>
            <Repeat2 className="h-4 w-4 text-bullish" />
          </div>
          <div className="space-y-1.5">
            {ranked.buybackLeaders.map((b) => (
              <TickerRow
                key={b.ticker}
                ticker={b.ticker}
                value={b.value}
                valueColor={b.valueColor}
                logoUrl={b.logoUrl}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">
              Breaking 52W High
            </h3>
            <TrendingUp className="h-4 w-4 text-sunset-orange" />
          </div>
          <div className="space-y-1.5">
            {ranked.breaking52W.map((b) => (
              <TickerRow
                key={b.ticker}
                ticker={b.ticker}
                value={b.value}
                valueColor={b.valueColor}
                logoUrl={b.logoUrl}
              />
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Caption */}
      <p className="mt-4 text-center text-xs text-mist/50">
        Tactical preview of the Opportunity Radar terminal
      </p>
    </section>
  );
}
