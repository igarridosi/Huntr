"use client";

import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { StockQuote } from "@/types/stock";
import type { BalanceSheet, CashFlowStatement, CompanyFinancials, IncomeStatement } from "@/types/financials";

/**
 * The key figures in five columns, modelled on Qualtrim's summary: a plain
 * title per group, then label and value on one line each, a hairline
 * between rows, and for the ratios whose inputs matter a second line that
 * shows the sum (FCF per share against the price, and so on).
 *
 * Flows are trailing twelve months, summed from the last four quarters.
 * The block this replaces divided by the latest single period, which on a
 * quarterly filer put P/S and EV/EBITDA at about four times their value
 * (NVDA read P/S 59 against ~25), and showed the dividend yield divided by
 * 100 twice.
 */
interface Row {
  label: string;
  value: string;
  /** A second line under the label: the inputs of the ratio. */
  detail?: string;
  tooltip?: string;
  tone?: "up" | "down";
}

interface Group {
  title: string;
  rows: Row[];
}

export function KeyStats({
  quote,
  financials,
  style,
  className,
}: {
  quote: StockQuote;
  financials: CompanyFinancials | null;
  style?: CSSProperties;
  className?: string;
}) {
  const { groups, footnote } = buildGroups(quote, financials);

  return (
    <section
      aria-label="Key statistics"
      style={style}
      className={cn("rounded-xl border border-wolf-border/50 bg-wolf-surface px-5 pb-4 pt-5", className)}
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {groups.map((group) => (
          <div key={group.title} className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-snow-peak">{group.title}</h2>
            <dl className="mt-2.5">
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-wolf-border/35 py-[7px] last:border-b-0"
                >
                  <dt className="min-w-0 text-[13px] leading-snug text-mist">
                    {row.tooltip ? (
                      <Tooltip content={row.tooltip} side="top">
                        <span className="cursor-help">{row.label}</span>
                      </Tooltip>
                    ) : (
                      row.label
                    )}
                    {row.detail ? (
                      <span className="mt-0.5 block text-[12px] font-semibold text-snow-peak/85">{row.detail}</span>
                    ) : null}
                  </dt>
                  <dd
                    className={cn(
                      "shrink-0 text-right text-[13px] font-semibold tabular-nums",
                      row.tone === "up" ? "text-bullish" : row.tone === "down" ? "text-bearish" : "text-snow-peak"
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-wolf-border/30 pt-3 text-[11px] text-mist/75">{footnote}</p>
    </section>
  );
}

/** Same grid and row counts as the real block, so nothing moves when it lands. */
export function KeyStatsSkeleton() {
  return (
    <div aria-hidden className="rounded-xl border border-wolf-border/50 bg-wolf-surface px-5 pb-4 pt-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {[5, 3, 4, 3, 3].map((rows, i) => (
          <div key={i}>
            <Skeleton shape="line" className="h-5 w-24" />
            <div className="mt-2.5">
              {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex h-[34px] items-center justify-between">
                  <Skeleton shape="line" className="h-3 w-28" />
                  <Skeleton shape="line" className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Skeleton shape="line" className="mt-4 h-3 w-72" />
    </div>
  );
}

// ─── Figures ────────────────────────────────────────────────────────────────

const byDateDesc = <T extends { date: string }>(rows: T[]) =>
  rows.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

/** Trailing twelve months: the last four quarters summed, else the last fiscal year. */
function ttm<T extends { date: string }>(quarterly: T[], annual: T[], pick: (row: T) => number): number | null {
  const q = byDateDesc(quarterly).slice(0, 4);
  if (q.length === 4) return q.reduce((sum, row) => sum + (pick(row) ?? 0), 0);
  const latest = byDateDesc(annual)[0];
  return latest ? pick(latest) : null;
}

function latestOf<T extends { date: string }>(...lists: T[][]): T | null {
  return byDateDesc(lists.flat())[0] ?? null;
}

/** The latest quarter against the same quarter a year before. */
function quarterYoY(quarterly: IncomeStatement[], pick: (row: IncomeStatement) => number): number | null {
  const q = byDateDesc(quarterly);
  if (q.length < 5) return null;
  const now = pick(q[0]);
  const before = pick(q[4]);
  return before !== 0 && Number.isFinite(now) && Number.isFinite(before) ? (now - before) / Math.abs(before) : null;
}

const money = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "N/A" : formatCurrency(v, { compact: true }));
const pct = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? "N/A" : formatPercent(v, digits));
const ratio = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v <= 0 ? "N/A" : v.toFixed(2));
const signed = (v: number | null) => (v == null ? "N/A" : `${v >= 0 ? "+" : ""}${formatPercent(v, 2)}`);
const toneOf = (v: number | null): Row["tone"] => (v == null ? undefined : v >= 0 ? "up" : "down");

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

function buildGroups(quote: StockQuote, financials: CompanyFinancials | null): { groups: Group[]; footnote: string } {
  const inc = financials?.income_statement ?? { annual: [], quarterly: [] };
  const cf = financials?.cash_flow ?? { annual: [], quarterly: [] };
  const bs = financials?.balance_sheet ?? { annual: [], quarterly: [] };

  const revenue = ttm<IncomeStatement>(inc.quarterly, inc.annual, (r) => r.revenue);
  const netIncome = ttm<IncomeStatement>(inc.quarterly, inc.annual, (r) => r.net_income);
  const operatingIncome = ttm<IncomeStatement>(inc.quarterly, inc.annual, (r) => r.operating_income);
  const ebitda = ttm<IncomeStatement>(inc.quarterly, inc.annual, (r) => r.ebitda);
  const fcf = ttm<CashFlowStatement>(cf.quarterly, cf.annual, (r) => r.free_cash_flow);
  const dividends = ttm<CashFlowStatement>(cf.quarterly, cf.annual, (r) => Math.abs(r.dividends_paid));
  const buybacks = ttm<CashFlowStatement>(cf.quarterly, cf.annual, (r) => Math.abs(r.share_repurchases));
  const balance = latestOf<BalanceSheet>(bs.quarterly, bs.annual);

  const mcap = quote.market_cap;
  const shares = quote.shares_outstanding > 0 ? quote.shares_outstanding : mcap / Math.max(quote.price, 1e-9);
  const cash = balance ? balance.cash_and_equivalents + (balance.short_term_investments ?? 0) : null;
  const debt = balance ? balance.long_term_debt : null;

  const fcfPerShare = fcf != null && shares > 0 ? fcf / shares : null;
  const fcfYield = fcf != null && mcap > 0 ? fcf / mcap : null;
  const fcfMargin = fcf != null && revenue ? fcf / revenue : null;
  const buybackYield = buybacks != null && mcap > 0 ? buybacks / mcap : null;
  const ev = cash != null && debt != null ? mcap + debt - cash : null;

  const earningsYoY = quote.earnings_growth ?? quarterYoY(inc.quarterly, (r) => r.net_income);
  const revenueYoY = quote.revenue_growth ?? quarterYoY(inc.quarterly, (r) => r.revenue);
  const payout = quote.payout_ratio ?? (dividends != null && netIncome && netIncome > 0 ? dividends / netIncome : null);

  const fwd = quote.forward_pe && quote.forward_pe > 0 ? quote.forward_pe.toFixed(2) : "N/A";
  const trailing = quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(2) : "N/A";

  const groups: Group[] = [
    {
      title: "Valuation",
      rows: [
        { label: "Market Cap", value: money(mcap) },
        {
          label: "PE (TTM | NTM)",
          value: `${trailing} | ${fwd}`,
          tooltip: "Price over the last twelve months' EPS, and over next fiscal year's consensus EPS.",
        },
        { label: "Price to Sales", value: ratio(revenue ? mcap / revenue : null), tooltip: "Market cap over revenue, last twelve months." },
        { label: "EV to EBITDA", value: ratio(ev != null && ebitda ? ev / ebitda : null), tooltip: "Market cap plus long-term debt less cash, over EBITDA for the last twelve months." },
        { label: "Price to Book", value: ratio(quote.price_to_book ?? (balance && balance.total_equity > 0 ? mcap / balance.total_equity : null)) },
      ],
    },
    {
      title: "Cash Flow",
      rows: [
        {
          label: "Free Cash Flow Yield",
          detail: fcfPerShare != null ? `FCF per share / Price (${formatCurrency(fcfPerShare)} / ${formatCurrency(quote.price)})` : undefined,
          value: pct(fcfYield),
          tooltip: "Free cash flow over the last twelve months, against the market cap.",
        },
        {
          label: "Free Cash Flow Margin",
          detail: fcf != null && revenue ? `FCF / Revenue (${money(fcf)} / ${money(revenue)})` : undefined,
          value: pct(fcfMargin),
        },
        {
          label: "Buyback Yield",
          detail: buybacks != null && buybacks > 0 ? `Repurchases, last 12 months (${money(buybacks)})` : undefined,
          value: pct(buybackYield),
          tooltip: "Shares repurchased over the last twelve months, against the market cap.",
        },
      ],
    },
    {
      title: "Margins & Growth",
      rows: [
        { label: "Profit Margin", value: pct(netIncome != null && revenue ? netIncome / revenue : null) },
        { label: "Operating Margin", value: pct(operatingIncome != null && revenue ? operatingIncome / revenue : null) },
        { label: "Quarterly Earnings (YoY)", value: signed(earningsYoY), tone: toneOf(earningsYoY) },
        { label: "Quarterly Revenue (YoY)", value: signed(revenueYoY), tone: toneOf(revenueYoY) },
      ],
    },
    {
      title: "Balance",
      rows: [
        { label: "Cash", value: money(cash), tooltip: "Cash, equivalents and short-term investments." },
        { label: "Debt", value: money(debt), tooltip: "Long-term debt." },
        {
          label: "Net",
          value: money(cash != null && debt != null ? cash - debt : null),
          tone: cash != null && debt != null ? (cash >= debt ? "up" : "down") : undefined,
        },
      ],
    },
    {
      title: "Dividend",
      rows: [
        { label: "Dividend Yield", value: quote.dividend_yield > 0 ? pct(quote.dividend_yield) : "None" },
        { label: "Payout Ratio", value: quote.dividend_yield > 0 ? pct(payout) : "None" },
        { label: "Payout Date", value: quote.dividend_yield > 0 ? formatDay(quote.dividend_date) : "None" },
      ],
    },
  ];

  const lastQuarter = byDateDesc(inc.quarterly)[0]?.period;
  const footnote = [
    lastQuarter && inc.quarterly.length >= 4 ? `Last twelve months to ${lastQuarter}` : "Latest fiscal year",
    balance ? `balance sheet at ${formatDay(balance.date)}` : null,
    "price real-time",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/^./, (c) => c.toUpperCase()) + ".";

  return { groups, footnote };
}
