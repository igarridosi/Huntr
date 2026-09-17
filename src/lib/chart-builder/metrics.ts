/**
 * Chart Builder — the metric catalogue.
 *
 * One declarative table drives the metric picker, the axis unit, the value
 * formatter and how each figure is read. Adding a metric is adding a row.
 *
 * Three sources:
 *  - `statements`: read straight off one period of the three statements.
 *  - `price`: the daily close series; drawn on a time axis.
 *  - `market`: price at the period's close combined with statement figures
 *    (trailing-twelve-month for flows), e.g. P/E = price ÷ EPS TTM. These
 *    exist only where the price history reaches (ten years today).
 *
 * Not in the catalogue on purpose: forward P/E and anything else built on
 * consensus estimates. The data layer has next quarter's estimate only, so
 * a historical series cannot be produced honestly.
 */

import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
} from "@/types/financials";

export type MetricSource = "statements" | "price" | "market";

/** Which of the three statements a metric reads; drives what to fetch. */
export type StatementKind = "income" | "balance" | "cashflow";

/** Drives axis formatting and which transforms make sense. */
export type MetricUnit =
  | "currency"   // absolute money, compact ($1.8t)
  | "shares"     // share counts, compact
  | "per_share"  // money per share, 2 decimals
  | "percent"    // already a percentage (12.3 → "12.3%")
  | "ratio"      // a multiple (24.1 → "24.1x")
  | "price";     // share price, 2 decimals

/** `flow` sums over time (TTM applies); `stock` is a point-in-time balance. */
export type MetricKind = "flow" | "stock" | "ratio" | "price";

export type MetricGroup =
  | "Income"
  | "Cash flow"
  | "Balance"
  | "Per share"
  | "Margins & returns"
  | "Market";

/** The three statements of one period, joined by calendar bucket. */
export interface PeriodBundle {
  /** Period end date, ISO. */
  date: string;
  /** Fiscal label as reported ("FY2024", "Q3 2024"). */
  period: string;
  income?: IncomeStatement;
  balance?: BalanceSheet;
  cashflow?: CashFlowStatement;
}

export type StatementReader = (p: PeriodBundle) => number | null;

/**
 * What a `market` metric sees for one period: the close on (or just before)
 * the period end, and readers that already account for granularity —
 * `flow()` returns the trailing four quarters on quarterly data and the
 * annual figure on annual data; `stock()` returns the period's own value.
 */
export interface MarketContext {
  price: number;
  flow: (read: StatementReader) => number | null;
  stock: (read: StatementReader) => number | null;
}

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Legend-compact label ("Rev"). */
  short: string;
  group: MetricGroup;
  unit: MetricUnit;
  kind: MetricKind;
  source: MetricSource;
  /** Statements the reader/deriver touches (empty for price). */
  statements: readonly StatementKind[];
  read?: StatementReader;
  derive?: (ctx: MarketContext) => number | null;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const inc = (k: keyof IncomeStatement): StatementReader => (p) => num(p.income?.[k]);
const bal = (k: keyof BalanceSheet): StatementReader => (p) => num(p.balance?.[k]);
const cf = (k: keyof CashFlowStatement): StatementReader => (p) => num(p.cashflow?.[k]);

/** Outflows arrive with either sign depending on the source; charts want them positive. */
const abs = (r: StatementReader): StatementReader => (p) => {
  const v = r(p);
  return v === null ? null : Math.abs(v);
};

const sum = (...rs: StatementReader[]): StatementReader => (p) => {
  let total = 0;
  let seen = false;
  for (const r of rs) {
    const v = r(p);
    if (v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
};

const sub = (a: StatementReader, b: StatementReader): StatementReader => (p) => {
  const x = a(p);
  const y = b(p);
  if (x === null) return null;
  return x - (y ?? 0);
};

/** `a / b` as a percentage; null when the denominator is missing or ≤ 0. */
const pct = (a: StatementReader, b: StatementReader): StatementReader => (p) => {
  const x = a(p);
  const y = b(p);
  if (x === null || y === null || y <= 0) return null;
  return (x / y) * 100;
};

const div = (a: StatementReader, b: StatementReader): StatementReader => (p) => {
  const x = a(p);
  const y = b(p);
  if (x === null || y === null || y <= 0) return null;
  return x / y;
};

const revenue = inc("revenue");
const netIncome = inc("net_income");
const ebitda = inc("ebitda");
const fcf = cf("free_cash_flow");
const capex = abs(cf("capital_expenditures"));
const dividends = abs(cf("dividends_paid"));
const buybacks = abs(cf("share_repurchases"));
const sharesDiluted: StatementReader = (p) =>
  num(p.income?.shares_outstanding_diluted) ?? num(p.balance?.shares_outstanding);
/**
 * Diluted EPS as reported, or net income over diluted shares when the
 * source left it at 0 — Alpha Vantage keeps EPS on a separate endpoint,
 * so a statement bundle can arrive without it. A P/E built on a zero EPS
 * is not a P/E; this keeps the ratio honest either way.
 */
const epsDiluted: StatementReader = (p) => {
  const reported = num(p.income?.eps_diluted);
  if (reported !== null && reported !== 0) return reported;
  const ni = netIncome(p);
  const sh = sharesDiluted(p);
  // A 0 with nothing to derive it from is a missing figure, not a result:
  // as a value it would drag a TTM to zero and draw a line along the floor.
  return ni === null || sh === null || sh <= 0 ? null : ni / sh;
};
const totalCash = sum(bal("cash_and_equivalents"), bal("short_term_investments"));
const debt = bal("long_term_debt");
const equity = bal("total_equity");

const ratio = (n: number | null, d: number | null): number | null =>
  n === null || d === null || d <= 0 ? null : n / d;
const yieldPct = (n: number | null, d: number | null): number | null => {
  const r = ratio(n, d);
  return r === null ? null : r * 100;
};
const marketCap = (ctx: MarketContext) => {
  const s = ctx.stock(sharesDiluted);
  return s === null || s <= 0 ? null : ctx.price * s;
};
const enterpriseValue = (ctx: MarketContext) => {
  const mc = marketCap(ctx);
  if (mc === null) return null;
  return mc + (ctx.stock(debt) ?? 0) - (ctx.stock(totalCash) ?? 0);
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const METRIC_IDS = [
  "revenue",
  "cost_of_revenue",
  "gross_profit",
  "operating_expenses",
  "operating_income",
  "ebitda",
  "pre_tax_income",
  "income_tax",
  "net_income",
  "operating_cash_flow",
  "capex",
  "free_cash_flow",
  "dividends_paid",
  "share_repurchases",
  "shareholder_returns",
  "net_change_in_cash",
  "cash_and_equivalents",
  "total_cash",
  "long_term_debt",
  "net_debt",
  "total_assets",
  "total_liabilities",
  "total_equity",
  "retained_earnings",
  "eps_diluted",
  "eps_basic",
  "fcf_per_share",
  "book_value_per_share",
  "shares_outstanding_diluted",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "payout_ratio",
  "roe",
  "debt_to_equity",
  "price",
  "market_cap",
  "enterprise_value",
  "pe_ttm",
  "price_to_sales",
  "price_to_book",
  "price_to_fcf",
  "ev_to_ebitda",
  "earnings_yield",
  "fcf_yield",
  "dividend_yield",
  "buyback_yield",
  "shareholder_yield",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

const defs: Record<MetricId, Omit<MetricDef, "id">> = {
  // Income
  revenue: { label: "Revenue", short: "Rev", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: revenue },
  cost_of_revenue: { label: "Cost of revenue", short: "COGS", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: abs(inc("cost_of_revenue")) },
  gross_profit: { label: "Gross profit", short: "GP", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: inc("gross_profit") },
  operating_expenses: { label: "Operating expenses", short: "OpEx", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: abs(inc("operating_expenses")) },
  operating_income: { label: "Operating income", short: "EBIT", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: inc("operating_income") },
  ebitda: { label: "EBITDA", short: "EBITDA", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: ebitda },
  pre_tax_income: { label: "Pre-tax income", short: "EBT", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: inc("pre_tax_income") },
  income_tax: { label: "Income tax", short: "Tax", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: abs(inc("income_tax")) },
  net_income: { label: "Net income", short: "NI", group: "Income", unit: "currency", kind: "flow", source: "statements", statements: ["income"], read: netIncome },

  // Cash flow
  operating_cash_flow: { label: "Operating cash flow", short: "OCF", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: cf("operating_cash_flow") },
  capex: { label: "Capital expenditures", short: "CapEx", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: capex },
  free_cash_flow: { label: "Free cash flow", short: "FCF", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: fcf },
  dividends_paid: { label: "Dividends paid", short: "Div", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: dividends },
  share_repurchases: { label: "Share repurchases", short: "Buyback", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: buybacks },
  shareholder_returns: { label: "Dividends + buybacks", short: "Returns", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: sum(dividends, buybacks) },
  net_change_in_cash: { label: "Net change in cash", short: "ΔCash", group: "Cash flow", unit: "currency", kind: "flow", source: "statements", statements: ["cashflow"], read: cf("net_change_in_cash") },

  // Balance
  cash_and_equivalents: { label: "Cash & equivalents", short: "Cash", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: bal("cash_and_equivalents") },
  total_cash: { label: "Cash + short-term investments", short: "Cash+STI", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: totalCash },
  long_term_debt: { label: "Long-term debt", short: "Debt", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: debt },
  net_debt: { label: "Net debt", short: "Net debt", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: sub(debt, totalCash) },
  total_assets: { label: "Total assets", short: "Assets", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: bal("total_assets") },
  total_liabilities: { label: "Total liabilities", short: "Liab", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: bal("total_liabilities") },
  total_equity: { label: "Shareholders' equity", short: "Equity", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: equity },
  retained_earnings: { label: "Retained earnings", short: "RE", group: "Balance", unit: "currency", kind: "stock", source: "statements", statements: ["balance"], read: bal("retained_earnings") },

  // Per share
  eps_diluted: { label: "EPS (diluted)", short: "EPS", group: "Per share", unit: "per_share", kind: "flow", source: "statements", statements: ["income"], read: epsDiluted },
  eps_basic: { label: "EPS (basic)", short: "EPS basic", group: "Per share", unit: "per_share", kind: "flow", source: "statements", statements: ["income"], read: inc("eps_basic") },
  fcf_per_share: { label: "FCF per share", short: "FCF/sh", group: "Per share", unit: "per_share", kind: "flow", source: "statements", statements: ["income", "cashflow"], read: div(fcf, sharesDiluted) },
  book_value_per_share: { label: "Book value per share", short: "BV/sh", group: "Per share", unit: "per_share", kind: "stock", source: "statements", statements: ["income", "balance"], read: div(equity, sharesDiluted) },
  shares_outstanding_diluted: { label: "Shares outstanding (diluted)", short: "Shares", group: "Per share", unit: "shares", kind: "stock", source: "statements", statements: ["income"], read: sharesDiluted },

  // Margins & returns
  gross_margin: { label: "Gross margin", short: "GM", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income"], read: pct(inc("gross_profit"), revenue) },
  operating_margin: { label: "Operating margin", short: "OM", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income"], read: pct(inc("operating_income"), revenue) },
  net_margin: { label: "Net margin", short: "NM", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income"], read: pct(netIncome, revenue) },
  fcf_margin: { label: "FCF margin", short: "FCF %", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income", "cashflow"], read: pct(fcf, revenue) },
  payout_ratio: { label: "Payout ratio", short: "Payout", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income", "cashflow"], read: pct(dividends, netIncome) },
  roe: { label: "Return on equity", short: "ROE", group: "Margins & returns", unit: "percent", kind: "ratio", source: "statements", statements: ["income", "balance"], read: pct(netIncome, equity) },
  debt_to_equity: { label: "Debt to equity", short: "D/E", group: "Margins & returns", unit: "ratio", kind: "ratio", source: "statements", statements: ["balance"], read: div(debt, equity) },

  // Market (price × statements)
  price: { label: "Price", short: "Price", group: "Market", unit: "price", kind: "price", source: "price", statements: [] },
  market_cap: { label: "Market cap", short: "Mkt cap", group: "Market", unit: "currency", kind: "stock", source: "market", statements: ["income"], derive: marketCap },
  enterprise_value: { label: "Enterprise value", short: "EV", group: "Market", unit: "currency", kind: "stock", source: "market", statements: ["income", "balance"], derive: enterpriseValue },
  pe_ttm: { label: "P/E (trailing)", short: "P/E", group: "Market", unit: "ratio", kind: "ratio", source: "market", statements: ["income"], derive: (ctx) => ratio(ctx.price, ctx.flow(epsDiluted)) },
  price_to_sales: { label: "Price to sales", short: "P/S", group: "Market", unit: "ratio", kind: "ratio", source: "market", statements: ["income"], derive: (ctx) => ratio(marketCap(ctx), ctx.flow(revenue)) },
  price_to_book: { label: "Price to book", short: "P/B", group: "Market", unit: "ratio", kind: "ratio", source: "market", statements: ["income", "balance"], derive: (ctx) => ratio(marketCap(ctx), ctx.stock(equity)) },
  price_to_fcf: { label: "Price to FCF", short: "P/FCF", group: "Market", unit: "ratio", kind: "ratio", source: "market", statements: ["income", "cashflow"], derive: (ctx) => ratio(marketCap(ctx), ctx.flow(fcf)) },
  ev_to_ebitda: { label: "EV / EBITDA", short: "EV/EBITDA", group: "Market", unit: "ratio", kind: "ratio", source: "market", statements: ["income", "balance"], derive: (ctx) => ratio(enterpriseValue(ctx), ctx.flow(ebitda)) },
  earnings_yield: { label: "Earnings yield", short: "E/P", group: "Market", unit: "percent", kind: "ratio", source: "market", statements: ["income"], derive: (ctx) => yieldPct(ctx.flow(netIncome), marketCap(ctx)) },
  fcf_yield: { label: "FCF yield", short: "FCF yld", group: "Market", unit: "percent", kind: "ratio", source: "market", statements: ["income", "cashflow"], derive: (ctx) => yieldPct(ctx.flow(fcf), marketCap(ctx)) },
  dividend_yield: { label: "Dividend yield", short: "Div yld", group: "Market", unit: "percent", kind: "ratio", source: "market", statements: ["income", "cashflow"], derive: (ctx) => yieldPct(ctx.flow(dividends), marketCap(ctx)) },
  buyback_yield: { label: "Buyback yield", short: "BB yld", group: "Market", unit: "percent", kind: "ratio", source: "market", statements: ["income", "cashflow"], derive: (ctx) => yieldPct(ctx.flow(buybacks), marketCap(ctx)) },
  shareholder_yield: { label: "Shareholder yield", short: "SH yld", group: "Market", unit: "percent", kind: "ratio", source: "market", statements: ["income", "cashflow"], derive: (ctx) => yieldPct(ctx.flow(sum(dividends, buybacks)), marketCap(ctx)) },
};

export const METRICS: Record<MetricId, MetricDef> = Object.fromEntries(
  METRIC_IDS.map((id) => [id, { id, ...defs[id] }])
) as Record<MetricId, MetricDef>;

export const METRIC_GROUPS: readonly MetricGroup[] = [
  "Income",
  "Cash flow",
  "Balance",
  "Per share",
  "Margins & returns",
  "Market",
];

export function isMetricId(v: unknown): v is MetricId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(METRICS, v);
}

export function metricsInGroup(group: MetricGroup): MetricDef[] {
  return METRIC_IDS.map((id) => METRICS[id]).filter((d) => d.group === group);
}
