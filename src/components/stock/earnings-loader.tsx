"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Coins, Gauge, Landmark, TrendingUp } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import type { StockProfile, StockQuote } from "@/types/stock";

/**
 * The wait for a company's earnings history, which can run past 30 seconds
 * (years of filings, an estimate per quarter, the next consensus).
 *
 * It gives the reader something real to read while they wait: facts about
 * the company from the data already on the page (when it reports, the growth
 * the market expects, where it trades in its range), one at a time. Beside
 * them, the chart being built, quarter by quarter, its trend drawing through
 * the results. Under both, a progress bar that moves quickly at first and
 * slows as it goes, never claiming to finish: it marks time passing, it does
 * not measure the fetch.
 */
const QUARTERS = [
  { est: 0.3, act: 0.36 },
  { est: 0.38, act: 0.41 },
  { est: 0.44, act: 0.4 },
  { est: 0.5, act: 0.57 },
  { est: 0.58, act: 0.63 },
  { est: 0.64, act: 0.69 },
  { est: 0.72, act: 0.8 },
  { est: 0.82, act: null },
] as const;

const STEPS = [
  "Reading the quarterly reports",
  "Matching each result to its estimate",
  "Lining up revenue against expectations",
  "Pulling the next quarter's consensus",
];

const FACT_MS = 4500;
const W = 360;
const H = 150;
const PAD_X = 24;
const PAD_Y = 22;

interface Fact {
  icon: typeof CalendarClock;
  title: string;
  body: string;
}

function factsFor(ticker: string, profile?: StockProfile | null, quote?: StockQuote | null): Fact[] {
  const facts: Fact[] = [];
  if (!quote) return facts;

  if (quote.next_earnings_date) {
    const date = new Date(`${quote.next_earnings_date}T00:00:00Z`);
    const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
    if (Number.isFinite(days) && days >= 0) {
      const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(date);
      facts.push({
        icon: CalendarClock,
        title: days === 0 ? "Reports today" : `Next report in ${days} day${days === 1 ? "" : "s"}`,
        body: `${ticker} is due to report on ${day}${quote.earnings_timing && quote.earnings_timing !== "Time TBD" ? `, ${quote.earnings_timing.toLowerCase()}` : ""}.`,
      });
    }
  }

  if (quote.pe_ratio > 0 && quote.forward_pe && quote.forward_pe > 0) {
    const growth = quote.pe_ratio / quote.forward_pe - 1;
    facts.push({
      icon: TrendingUp,
      title: `${growth >= 0 ? "+" : ""}${formatPercent(growth, 0)} earnings expected`,
      body: `P/E falls from ${quote.pe_ratio.toFixed(1)} on the last twelve months to ${quote.forward_pe.toFixed(1)} on next year's consensus: the earnings growth analysts are counting on.`,
    });
  }

  const span = quote.fifty_two_week_high - quote.fifty_two_week_low;
  if (span > 0) {
    const fromHigh = quote.price / quote.fifty_two_week_high - 1;
    const pos = (quote.price - quote.fifty_two_week_low) / span;
    facts.push({
      icon: Gauge,
      title: fromHigh > -0.01 ? "At its 52-week high" : `${formatPercent(Math.abs(fromHigh), 1)} below its high`,
      body: `The price sits ${Math.round(pos * 100)}% of the way up its 52-week range.`,
    });
  }

  facts.push({
    icon: Coins,
    title: quote.dividend_yield > 0 ? `${formatPercent(quote.dividend_yield, 2)} dividend yield` : "No dividend",
    body:
      quote.dividend_yield > 0
        ? "Paid out of the earnings this record is made of."
        : "Every dollar of profit stays in the business, or goes to buybacks.",
  });

  if (quote.market_cap > 0) {
    facts.push({
      icon: Landmark,
      title: `$${formatCompactNumber(quote.market_cap)} company`,
      body: profile?.industry ? `In ${profile.industry}${profile.sector ? `, ${profile.sector}` : ""}.` : "Market capitalisation today.",
    });
  }

  return facts;
}

export function EarningsLoader({
  ticker,
  profile,
  quote,
}: {
  ticker: string;
  profile?: StockProfile | null;
  quote?: StockQuote | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => window.clearInterval(id);
  }, []);

  const facts = useMemo(() => factsFor(ticker, profile, quote), [ticker, profile, quote]);
  const factIndex = facts.length ? Math.floor((elapsed * 1000) / FACT_MS) % facts.length : 0;
  const fact = facts[factIndex];
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor(elapsed / 6))];
  // Fast at first, slower as it goes, never full: 1 - e^(-t/14), capped.
  const progress = Math.min(0.94, 1 - Math.exp(-elapsed / 14));

  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (QUARTERS.length - 1);
  const y = (v: number) => H - PAD_Y - v * (H - PAD_Y * 2);
  const trend = QUARTERS.filter((q) => q.act != null)
    .map((q, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(q.act as number)}`)
    .join(" ");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading earnings for ${ticker}`}
      className="insight-enter overflow-hidden rounded-xl border border-wolf-border/50 bg-wolf-surface"
    >
      <div className="grid grid-cols-1 gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        {/* The chart being built. */}
        <div>
          <div className="flex items-center gap-2.5">
            {profile ? (
              <TickerLogo ticker={ticker} src={profile.logo_url} className="h-8 w-8" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[9px]" />
            ) : null}
            <div>
              <p className="text-[16px] font-semibold tracking-[-0.01em] text-snow-peak">Building {ticker}&apos;s earnings record</p>
              <p key={step} className="earnings-loader-caption text-[12.5px] text-mist">
                {step}
              </p>
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 h-auto w-full" aria-hidden>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={PAD_X - 10} x2={W - PAD_X + 10} y1={y(g)} y2={y(g)} className="stroke-wolf-border" strokeDasharray="2 5" strokeWidth={1} />
            ))}
            {/* The trend through the results, drawing itself each round. */}
            <path d={trend} pathLength={1} className="earnings-loader-trend fill-none stroke-bullish/50" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            {QUARTERS.map((q, i) => {
              const beat = q.act != null && q.act >= q.est;
              return (
                <g key={i} style={{ "--q": i } as React.CSSProperties}>
                  <circle cx={x(i)} cy={y(q.est)} r={5.5} className="earnings-loader-ring fill-none stroke-mist/60" strokeWidth={1.5} />
                  {q.act != null ? (
                    <circle cx={x(i)} cy={y(q.act)} r={5} className={cn("earnings-loader-dot", beat ? "fill-bullish" : "fill-bearish")} />
                  ) : (
                    <circle cx={x(i)} cy={y(q.est)} r={10} className="earnings-loader-next fill-none stroke-sunset-orange/70" strokeWidth={1.25} />
                  )}
                  <text x={x(i)} y={H - 4} textAnchor="middle" className="fill-mist/60 font-mono text-[9px]">
                    {q.act == null ? "Next" : `Q${(i % 4) + 1}`}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-3 flex items-center gap-4 text-[11px] text-mist">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full ring-[1.5px] ring-inset ring-mist/70" /> Estimate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-bullish" /> Beat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-bearish" /> Missed
            </span>
          </div>
        </div>

        {/* While you wait: one real fact at a time. */}
        {fact ? (
          <div className="rounded-xl bg-snow-peak/[0.03] p-5 ring-1 ring-inset ring-wolf-border/40">
            <p className="text-[11.5px] text-mist">While the reports load</p>
            <div key={factIndex} className="earnings-fact mt-3 flex min-h-[7.5rem] gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunset-orange/10 text-sunset-orange ring-1 ring-inset ring-sunset-orange/25">
                <fact.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em] text-snow-peak">{fact.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{fact.body}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-1.5" aria-hidden>
              {facts.map((_, i) => (
                <span
                  key={i}
                  className={cn("h-1 rounded-full transition-[width,background-color] duration-300", i === factIndex ? "w-5 bg-sunset-orange" : "w-1.5 bg-snow-peak/20")}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Time passing, not the fetch measured: quick, then slower, never full. */}
      <div className="flex items-center gap-3 border-t border-wolf-border/30 px-6 py-3 md:px-8">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-snow-peak/[0.06]">
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-sunset-orange to-golden-hour transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-mist/80">
          {Math.floor(elapsed)}s{elapsed >= 12 ? ", years of filings take a moment" : ""}
        </span>
      </div>
    </div>
  );
}
