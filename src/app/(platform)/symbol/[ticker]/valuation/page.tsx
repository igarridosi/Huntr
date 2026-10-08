"use client";

import Link from "next/link";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useBatchDailyHistory, useFinancials, useStockQuote } from "@/hooks/use-stock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/constants";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { cagrOf, impliedFcfGrowth, positionIn, priceOn, spreadOf, type Spread } from "@/lib/valuation/snapshot";
import type { CompanyFinancials } from "@/types/financials";
import type { StockQuote } from "@/types/stock";

/**
 * Is the price reasonable? Four answers, on one screen:
 *
 * - What the company is worth by each multiple's own range (a football
 *   field: the range of values, today's price across it).
 * - What growth the price already assumes (a reverse DCF on free cash flow),
 *   set against the growth the company has delivered.
 * - Where each multiple stands against its own past.
 * - The growth itself, year by year.
 *
 * Every past multiple uses the price on the day the fiscal year closed (see
 * lib/valuation/snapshot for why the previous page's numbers were wrong).
 */
const DISCOUNT_RATE = 0.09;
const TERMINAL_GROWTH = 0.03;
const PROJECTION_YEARS = 10;

type MultipleKey = "pe" | "ps" | "pfcf" | "evEbitda";

const MULTIPLE_LABEL: Record<MultipleKey, string> = {
  pe: "P/E",
  ps: "P/S",
  pfcf: "P/FCF",
  evEbitda: "EV/EBITDA",
};

const MULTIPLE_HELP: Record<MultipleKey, string> = {
  pe: "Price over earnings per share.",
  ps: "Market cap over revenue.",
  pfcf: "Market cap over free cash flow.",
  evEbitda: "Market cap plus debt less cash, over EBITDA.",
};

interface Analysis {
  years: number;
  fiscalLabel: string;
  now: Partial<Record<MultipleKey, number>>;
  history: Partial<Record<MultipleKey, Spread>>;
  /** Per-share value of the company at each multiple's min, median and max. */
  field: Array<{ key: MultipleKey; low: number; mid: number; high: number }>;
  implied: number | null;
  fcfTtm: number | null;
  ev: number;
  growth: Array<{ label: string; values: Array<{ year: string; value: number }>; cagr: number | null; yoy: number | null; money: boolean }>;
}

const byDate = <T extends { date: string }>(rows: T[]) =>
  rows.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

function sameYear(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 45 * 86_400_000;
}

function ttm<T extends { date: string }>(quarterly: T[], annual: T[], pick: (row: T) => number): number | null {
  const q = byDate(quarterly).slice(-4);
  if (q.length === 4) return q.reduce((sum, row) => sum + (pick(row) ?? 0), 0);
  const last = byDate(annual).at(-1);
  return last ? pick(last) : null;
}

function analyse(quote: StockQuote, fin: CompanyFinancials, history: Array<{ date: string; close: number }>): Analysis {
  const income = byDate(fin.income_statement.annual);
  const balance = byDate(fin.balance_sheet.annual);
  const cash = byDate(fin.cash_flow.annual);
  const shares = quote.shares_outstanding > 0 ? quote.shares_outstanding : quote.market_cap / quote.price;

  // ---- each fiscal year at its own closing price ----
  const past: Record<MultipleKey, number[]> = { pe: [], ps: [], pfcf: [], evEbitda: [] };
  for (const is of income) {
    const price = priceOn(history, is.date);
    if (!price) continue;
    const s = is.shares_outstanding_diluted > 0 ? is.shares_outstanding_diluted : shares;
    const cf = cash.find((row) => sameYear(row.date, is.date));
    const bs = balance.find((row) => sameYear(row.date, is.date));
    const cap = price * s;
    if (is.eps_diluted > 0) past.pe.push(price / is.eps_diluted);
    if (is.revenue > 0) past.ps.push(cap / is.revenue);
    if (cf && cf.free_cash_flow > 0) past.pfcf.push(cap / cf.free_cash_flow);
    if (bs && is.ebitda > 0) past.evEbitda.push((cap + bs.long_term_debt - bs.cash_and_equivalents) / is.ebitda);
  }

  // ---- today, on the last twelve months ----
  const q = fin.income_statement.quarterly;
  const revenue = ttm(q, income, (r) => r.revenue);
  const netIncome = ttm(q, income, (r) => r.net_income);
  const ebitda = ttm(q, income, (r) => r.ebitda);
  const fcf = ttm(fin.cash_flow.quarterly, cash, (r) => r.free_cash_flow);
  const latestBs = byDate([...fin.balance_sheet.quarterly, ...balance]).at(-1);
  const debt = latestBs?.long_term_debt ?? 0;
  const cashNow = (latestBs?.cash_and_equivalents ?? 0) + (latestBs?.short_term_investments ?? 0);
  const cap = quote.market_cap;
  const ev = cap + debt - cashNow;

  const now: Analysis["now"] = {};
  if (quote.pe_ratio > 0) now.pe = quote.pe_ratio;
  else if (netIncome && netIncome > 0) now.pe = cap / netIncome;
  if (revenue && revenue > 0) now.ps = cap / revenue;
  if (fcf && fcf > 0) now.pfcf = cap / fcf;
  if (ebitda && ebitda > 0) now.evEbitda = ev / ebitda;

  const historySpread: Analysis["history"] = {};
  (Object.keys(past) as MultipleKey[]).forEach((key) => {
    const spread = past[key].length >= 2 ? spreadOf(past[key]) : null;
    if (spread) historySpread[key] = spread;
  });

  // ---- what each multiple's range says the company is worth, per share ----
  const perShare: Partial<Record<MultipleKey, (m: number) => number>> = {};
  if (netIncome && netIncome > 0) perShare.pe = (m) => (m * netIncome) / shares;
  if (revenue && revenue > 0) perShare.ps = (m) => (m * revenue) / shares;
  if (fcf && fcf > 0) perShare.pfcf = (m) => (m * fcf) / shares;
  if (ebitda && ebitda > 0) perShare.evEbitda = (m) => (m * ebitda - debt + cashNow) / shares;

  const field: Analysis["field"] = [];
  (Object.keys(historySpread) as MultipleKey[]).forEach((key) => {
    const spread = historySpread[key]!;
    const value = perShare[key];
    if (!value) return;
    field.push({ key, low: value(spread.min), mid: value(spread.median), high: value(spread.max) });
  });

  const series = (label: string, values: Array<{ year: string; value: number }>, money: boolean) => ({
    label,
    values,
    money,
    cagr: cagrOf(values.map((v) => v.value)),
    yoy: values.length >= 2 && values.at(-2)!.value > 0 ? values.at(-1)!.value / values.at(-2)!.value - 1 : null,
  });
  const year = (d: string) => String(new Date(d).getUTCFullYear());

  return {
    years: income.length,
    fiscalLabel: income.at(-1)?.period ?? "",
    now,
    history: historySpread,
    field,
    implied: fcf ? impliedFcfGrowth({ fcf, enterpriseValue: ev, discountRate: DISCOUNT_RATE, terminalGrowth: TERMINAL_GROWTH, years: PROJECTION_YEARS }) : null,
    fcfTtm: fcf,
    ev,
    growth: [
      series("Revenue", income.map((r) => ({ year: year(r.date), value: r.revenue })), true),
      series("EPS", income.map((r) => ({ year: year(r.date), value: r.eps_diluted })), false),
      series("Free cash flow", cash.map((r) => ({ year: year(r.date), value: r.free_cash_flow })), true),
    ],
  };
}

export default function ValuationPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const { data: quote, isLoading: qLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: fLoading } = useFinancials(ticker);
  // The same query as the price chart, so it is usually cached already.
  const { data: historyMap, isLoading: hLoading } = useBatchDailyHistory([ticker], "ALL", !!ticker);
  const history = useMemo(() => historyMap?.[ticker] ?? [], [historyMap, ticker]);

  const analysis = useMemo(
    () => (quote && financials ? analyse(quote, financials, history) : null),
    [quote, financials, history]
  );

  if (qLoading || fLoading || (hLoading && history.length === 0)) return <ValuationSkeleton />;

  if (!quote || !analysis) {
    return <p className="py-8 text-center text-sm text-mist">No valuation data found for {ticker}.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          delay={0}
          title="What it is worth, by its own multiples"
          subtitle={`Each bar is the share price the company would have at the low, median and high of that multiple over its last ${analysis.years} fiscal years, applied to the last twelve months.`}
        >
          <FootballField analysis={analysis} price={quote.price} />
        </Panel>
        <Panel className="xl:col-span-5" delay={60} title="What the price assumes" subtitle="The free cash flow growth today's price needs, against what the company has done.">
          <ImpliedGrowth analysis={analysis} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" delay={120} title="Multiples against their own history" subtitle={`Today, on the last twelve months, against each fiscal year-end over ${analysis.years} years.`}>
          <MultiplesTable analysis={analysis} />
        </Panel>
        <Panel className="xl:col-span-5" delay={180} title="Growth" subtitle={`Fiscal years to ${analysis.fiscalLabel || "the latest"}, compounded.`}>
          <GrowthBlock analysis={analysis} />
        </Panel>
      </div>

      <p className="text-[11px] text-mist/70">
        GAAP figures from the filings, prices at each fiscal year-end. A reference, not a price target: check it against the
        DCF and the quality score before acting on it.
      </p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className,
  delay,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  delay: number;
}) {
  return (
    <section
      className={cn("symbol-enter flex min-w-0 flex-col rounded-xl border border-wolf-border/50 bg-wolf-surface p-5", className)}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-snow-peak">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-mist">{subtitle}</p>
      <div className="mt-5 flex-1">{children}</div>
    </section>
  );
}

// ─── Football field ────────────────────────────────────────────────────────

function FootballField({ analysis, price }: { analysis: Analysis; price: number }) {
  const rows = analysis.field;
  if (rows.length === 0) {
    return <Empty>Not enough fiscal years with positive figures to build a range.</Empty>;
  }

  const lo = Math.min(price, ...rows.map((r) => r.low)) * 0.88;
  const hi = Math.max(price, ...rows.map((r) => r.high)) * 1.06;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const below = rows.filter((r) => price < r.mid).length;
  const midOfMids = spreadOf(rows.map((r) => r.mid))!.median;
  const gap = midOfMids / price - 1;

  return (
    <div>
      <p className="text-[13.5px] text-snow-peak">
        The price is <span className={below >= rows.length / 2 ? "text-bullish" : "text-bearish"}>{below >= rows.length / 2 ? "below" : "above"}</span>{" "}
        the median value on {below >= rows.length / 2 ? below : rows.length - below} of {rows.length} multiples.
        <span className="ml-1.5 text-mist">
          Median of medians {formatCurrency(midOfMids)} ({gap >= 0 ? "+" : ""}
          {formatPercent(gap, 1)}).
        </span>
      </p>

      <div className="relative mt-8 space-y-3">
        {/* Today's price, labelled once above the rows; the track starts
            after the 5.5rem label column and its 0.75rem gap. */}
        <span
          className="absolute -top-6 -translate-x-1/2 rounded-md bg-sunset-orange px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-wolf-black"
          style={{ left: `calc(6.25rem + (100% - 6.25rem) * ${((price - lo) / (hi - lo)).toFixed(4)})` }}
        >
          Today {formatCurrency(price, { decimals: 0 })}
        </span>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <Tooltip content={MULTIPLE_HELP[row.key]} side="top">
              <span className="cursor-help text-[12.5px] font-medium text-mist">{MULTIPLE_LABEL[row.key]}</span>
            </Tooltip>
            <div className="relative h-9">
              <div
                className="symbol-field-bar absolute top-1.5 h-6 rounded-md bg-sunset-orange/18 ring-1 ring-inset ring-sunset-orange/35"
                style={{ left: at(row.low), width: `calc(${at(row.high)} - ${at(row.low)})` }}
              />
              <span className="absolute top-1 h-7 w-0.5 -translate-x-1/2 rounded-full bg-snow-peak/85" style={{ left: at(row.mid) }} />
              <span className="absolute -bottom-1.5 -translate-x-full pr-1.5 font-mono text-[10.5px] tabular-nums text-mist" style={{ left: at(row.low) }}>
                {formatCurrency(row.low, { decimals: 0 })}
              </span>
              <span className="absolute -bottom-1.5 pl-1.5 font-mono text-[10.5px] tabular-nums text-mist" style={{ left: at(row.high) }}>
                {formatCurrency(row.high, { decimals: 0 })}
              </span>
              {/* Today's price, the same line through every row. */}
              <span className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-sunset-orange" style={{ left: at(price) }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-mist">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-sunset-orange/18 ring-1 ring-inset ring-sunset-orange/35" /> Low to high
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-snow-peak/85" /> Median
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-sunset-orange" /> Price today {formatCurrency(price)}
        </span>
      </div>
    </div>
  );
}

// ─── Implied growth (reverse DCF) ──────────────────────────────────────────

function ImpliedGrowth({ analysis }: { analysis: Analysis }) {
  const { implied } = analysis;
  const fcfRecord = analysis.growth.find((g) => g.label === "Free cash flow")?.cagr ?? null;
  const revenueRecord = analysis.growth.find((g) => g.label === "Revenue")?.cagr ?? null;

  if (implied == null) {
    return (
      <Empty>
        {analysis.fcfTtm != null && analysis.fcfTtm <= 0
          ? "Free cash flow over the last twelve months is not positive, so there is no growth rate that prices it."
          : "The price is out of reach of any growth between -30% and 80% a year."}
      </Empty>
    );
  }

  const bars = [
    { label: "Priced in", value: implied, tone: "bg-sunset-orange" },
    { label: `FCF, last ${analysis.years - 1} years`, value: fcfRecord, tone: "bg-snow-peak/70" },
    { label: `Revenue, last ${analysis.years - 1} years`, value: revenueRecord, tone: "bg-snow-peak/40" },
  ];
  const scale = Math.max(...bars.map((b) => Math.abs(b.value ?? 0)), 0.01);
  const easier = fcfRecord != null && implied < fcfRecord;

  return (
    <div className="flex h-full flex-col">
      <p className="font-mono text-[34px] font-bold leading-none tracking-[-0.03em] text-snow-peak">
        {implied >= 0 ? "+" : ""}
        {formatPercent(implied, 1)}
        <span className="ml-2 font-sans text-[13px] font-medium tracking-normal text-mist">a year, for {PROJECTION_YEARS} years</span>
      </p>
      {fcfRecord != null ? (
        <p className={cn("mt-2 text-[13px]", easier ? "text-bullish" : "text-golden-hour")}>
          {easier ? "Less than the company has delivered: the price asks for a slowdown." : "More than the company has delivered: the price asks it to speed up."}
        </p>
      ) : null}

      <div className="mt-5 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label} className="grid grid-cols-[9.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-[12px]">
            <span className="truncate text-mist">{bar.label}</span>
            <span className="h-2">
              {bar.value != null ? (
                <span
                  className={cn("symbol-field-bar block h-2 rounded-full", bar.value >= 0 ? bar.tone : "bg-bearish/70")}
                  style={{ width: `${(Math.abs(bar.value) / scale) * 100}%` }}
                />
              ) : null}
            </span>
            <span className="text-right font-mono tabular-nums text-snow-peak">{bar.value != null ? formatPercent(bar.value, 1) : "N/A"}</span>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-5 text-[11px] leading-relaxed text-mist/80">
        {formatPercent(DISCOUNT_RATE, 0)} discount rate, {formatPercent(TERMINAL_GROWTH, 0)} growth after year {PROJECTION_YEARS}, free cash flow{" "}
        {formatCurrency(analysis.fcfTtm ?? 0, { compact: true })} over the last twelve months, enterprise value{" "}
        {formatCurrency(analysis.ev, { compact: true })}.{" "}
        <Link href={ROUTES.APP_DCF_CALCULATOR} className="inline-flex items-center gap-0.5 font-medium text-sunset-orange hover:text-golden-hour">
          Build your own DCF <ArrowRight className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

// ─── Multiples against history ─────────────────────────────────────────────

function MultiplesTable({ analysis }: { analysis: Analysis }) {
  const keys = (Object.keys(MULTIPLE_LABEL) as MultipleKey[]).filter((k) => analysis.now[k] != null || analysis.history[k]);

  return (
    <div>
      <div className="grid grid-cols-[5.5rem_4.5rem_4.5rem_minmax(0,1fr)_6.5rem] gap-3 border-b border-wolf-border/35 pb-2 text-[11px] text-mist/80">
        <span>Multiple</span>
        <span className="text-right">Today</span>
        <span className="text-right">Median</span>
        <span className="pl-2">Low to high</span>
        <span className="text-right">Reads</span>
      </div>
      {keys.map((key) => {
        const now = analysis.now[key];
        const spread = analysis.history[key];
        const ratio = now != null && spread ? now / spread.median : null;
        const read = ratio == null ? null : ratio < 0.85 ? "cheaper" : ratio > 1.15 ? "richer" : "in line";
        return (
          <div key={key} className="grid grid-cols-[5.5rem_4.5rem_4.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 border-b border-wolf-border/25 py-2.5 text-[13px] last:border-b-0">
            <Tooltip content={MULTIPLE_HELP[key]} side="top">
              <span className="cursor-help font-medium text-snow-peak">{MULTIPLE_LABEL[key]}</span>
            </Tooltip>
            <span className="text-right font-mono font-semibold tabular-nums text-snow-peak">{now != null ? `${now.toFixed(1)}x` : "N/A"}</span>
            <span className="text-right font-mono tabular-nums text-mist">{spread ? `${spread.median.toFixed(1)}x` : "N/A"}</span>
            <span className="pl-2">
              {spread && now != null ? <RangeStrip spread={spread} now={now} /> : <span className="text-[11px] text-mist/70">Not enough years</span>}
            </span>
            <span
              className={cn(
                "text-right text-[12px] font-medium",
                read === "cheaper" ? "text-bullish" : read === "richer" ? "text-bearish" : "text-mist"
              )}
            >
              {read === "in line" ? "in line" : read ? `${read} than usual` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RangeStrip({ spread, now }: { spread: Spread; now: number }) {
  const median = positionIn(spread, spread.median) * 100;
  const pos = positionIn(spread, now) * 100;
  const outside = now < spread.min ? "below" : now > spread.max ? "above" : null;
  return (
    <span className="relative flex h-4 items-center" title={`${spread.min.toFixed(1)}x to ${spread.max.toFixed(1)}x`}>
      <span className="absolute inset-x-0 h-px bg-wolf-border" />
      <span className="absolute h-2.5 w-px bg-mist/60" style={{ left: "0%" }} />
      <span className="absolute h-2.5 w-px bg-mist/60" style={{ left: "100%" }} />
      <span className="absolute h-3 w-0.5 -translate-x-1/2 rounded-full bg-snow-peak/70" style={{ left: `${median}%` }} />
      <span
        className={cn(
          "absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-wolf-surface",
          outside ? "bg-golden-hour" : "bg-sunset-orange"
        )}
        style={{ left: `${pos}%` }}
      />
    </span>
  );
}

// ─── Growth ────────────────────────────────────────────────────────────────

function GrowthBlock({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-4">
      {analysis.growth.map((series) => {
        const max = Math.max(...series.values.map((v) => Math.abs(v.value)), 1e-9);
        return (
          <div key={series.label} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-4">
            <div className="min-w-0">
              <p className="text-[12.5px] text-mist">{series.label}</p>
              <div className="mt-1.5 flex h-10 items-end gap-1.5">
                {series.values.map((v, i) => (
                  <Tooltip key={v.year} content={`${v.year}: ${series.money ? formatCurrency(v.value, { compact: true }) : formatCurrency(v.value)}`} side="top">
                    <span
                      className={cn(
                        "symbol-bar block flex-1 origin-bottom rounded-t-[3px]",
                        v.value < 0 ? "bg-bearish/60" : i === series.values.length - 1 ? "bg-sunset-orange" : "bg-snow-peak/20"
                      )}
                      style={{ height: `${Math.max(6, (Math.abs(v.value) / max) * 100)}%`, "--i": i * 3 } as CSSProperties}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
            <div className="text-right">
              <p className={cn("font-mono text-[17px] font-semibold tabular-nums", series.cagr == null ? "text-mist" : series.cagr >= 0 ? "text-bullish" : "text-bearish")}>
                {series.cagr == null ? "N/A" : `${series.cagr >= 0 ? "+" : ""}${formatPercent(series.cagr, 1)}`}
              </p>
              <p className="text-[11px] text-mist">
                a year
                {series.yoy != null ? `, ${series.yoy >= 0 ? "+" : ""}${formatPercent(series.yoy, 0)} last` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-wolf-border/50 px-4 py-6 text-center text-[12.5px] text-mist">{children}</p>;
}

function ValuationSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {[7, 5].map((span) => (
            <div key={span} className={cn("rounded-xl border border-wolf-border/50 bg-wolf-surface p-5", span === 7 ? "xl:col-span-7" : "xl:col-span-5")}>
              <Skeleton shape="line" className="h-5 w-56" />
              <Skeleton shape="line" className="mt-2 h-3 w-80" />
              <Skeleton className="mt-6 h-40 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
