/**
 * Chart Builder — what a chart needs from the statements, and how a
 * partial deep-history overlay combines with the quick data.
 */

import type { CompanyFinancials, IncomeStatement } from "@/types/financials";
import { METRICS, type StatementKind } from "./metrics";
import { bundlePeriods } from "./resolve";
import type { ChartSpec } from "./spec";

const ORDER: readonly StatementKind[] = ["income", "balance", "cashflow"];

/**
 * The statements the chart's series read, in a stable order. Per-share
 * transforms need share counts, which the income statement carries (with
 * the balance sheet as a fallback the mapper already handles), so they do
 * not widen the request.
 */
export function statementsFor(spec: ChartSpec): StatementKind[] {
  const wanted = new Set<StatementKind>();
  for (const s of spec.series) {
    for (const k of METRICS[s.metric].statements) wanted.add(k);
    if (s.transform === "per_share") wanted.add("income");
  }
  return ORDER.filter((k) => wanted.has(k));
}

const KEY: Record<StatementKind, keyof Pick<CompanyFinancials, "income_statement" | "balance_sheet" | "cash_flow">> = {
  income: "income_statement",
  balance: "balance_sheet",
  cashflow: "cash_flow",
};

/** True when the overlay has rows for every statement asked for. */
export function coversStatements(fin: CompanyFinancials | null | undefined, wanted: readonly StatementKind[]): boolean {
  if (!fin) return false;
  return wanted.every((k) => {
    const block = fin[KEY[k]];
    return (block?.annual?.length ?? 0) + (block?.quarterly?.length ?? 0) > 0;
  });
}

/**
 * Deep history where it exists, quick data elsewhere — statement by
 * statement, so an income-only overlay does not blank the cash-flow
 * series that still come from Yahoo.
 */
export function mergeFinancials(
  base: CompanyFinancials | null | undefined,
  overlay: CompanyFinancials | null | undefined
): CompanyFinancials | null {
  if (!overlay) return base ?? null;
  if (!base) return overlay;
  const has = (k: StatementKind) => {
    const o = overlay[KEY[k]];
    return (o?.annual?.length ?? 0) + (o?.quarterly?.length ?? 0) > 0;
  };
  // The deep income statement can arrive without EPS (Alpha Vantage
  // serves it separately); where Yahoo has the same period, its EPS
  // fills the gap so the ratios built on it do not go dark.
  const fillEps = (deep: IncomeStatement[] | undefined, quick: IncomeStatement[] | undefined) => {
    if (!deep?.length || !quick?.length) return deep ?? [];
    const byDate = new Map(quick.map((r) => [r.date, r] as const));
    return deep.map((r) => {
      if (r.eps_diluted !== 0 && r.eps_basic !== 0) return r;
      const q = byDate.get(r.date);
      if (!q) return r;
      return { ...r, eps_diluted: r.eps_diluted || q.eps_diluted, eps_basic: r.eps_basic || q.eps_basic };
    });
  };
  const income = has("income")
    ? {
        annual: fillEps(overlay.income_statement?.annual, base.income_statement?.annual),
        quarterly: fillEps(overlay.income_statement?.quarterly, base.income_statement?.quarterly),
      }
    : base.income_statement;
  return {
    ticker: base.ticker,
    income_statement: income,
    balance_sheet: has("balance") ? overlay.balance_sheet : base.balance_sheet,
    cash_flow: has("cashflow") ? overlay.cash_flow : base.cash_flow,
  };
}

/**
 * Earliest date in a price history, or null when there is none. The
 * first close on file is the day the stock started trading, as far as
 * the chart can know.
 */
export function firstTradeDate(prices: ReadonlyArray<{ date: string }> | undefined): string | null {
  let first: string | null = null;
  for (const p of prices ?? []) if (first === null || p.date < first) first = p.date;
  return first;
}

/**
 * Drops statement periods that ended before the stock traded. Data
 * vendors carry pre-listing figures lifted from the S-1 — sparse
 * quarters, some of them a fiscal year filed as a quarter — and a
 * chart built on them says things about a company that did not exist
 * on the market yet. Nothing is dropped while the listing date is
 * unknown.
 */
export function clipToListing(fin: CompanyFinancials | null | undefined, firstDate: string | null): CompanyFinancials | null | undefined {
  if (!fin || !firstDate) return fin;
  const keep = <T extends { date: string }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.date >= firstDate);
  const clip = <T extends { date: string }>(s: { annual: T[]; quarterly: T[] } | undefined) =>
    s ? { annual: keep(s.annual), quarterly: keep(s.quarterly) } : s;
  return {
    ...fin,
    income_statement: clip(fin.income_statement) ?? fin.income_statement,
    balance_sheet: clip(fin.balance_sheet) ?? fin.balance_sheet,
    cash_flow: clip(fin.cash_flow) ?? fin.cash_flow,
  };
}

/** Whether any series reads a per-share figure (EPS itself, a per-share transform, or a price multiple built on one). */
export function needsEps(spec: ChartSpec): boolean {
  return spec.series.some((s) => s.transform === "per_share" || s.metric === "eps_diluted" || s.metric === "eps_basic" || s.metric === "pe_ttm" || s.metric === "earnings_yield");
}

/** True when a statement set has income rows but every one of them carries a 0 EPS — the figure never arrived. */
export function lacksEps(fin: CompanyFinancials | null | undefined): boolean {
  const rows = [...(fin?.income_statement?.annual ?? []), ...(fin?.income_statement?.quarterly ?? [])];
  return rows.length > 0 && rows.every((r) => !r.eps_diluted && !r.eps_basic);
}

/**
 * Period-end dates the chart could show, before any range is applied:
 * the union over the statement tickers, sorted. Price-only charts have
 * none (their axis is daily).
 */
export function availableDates(spec: ChartSpec, financials: Record<string, CompanyFinancials | null | undefined>): string[] {
  const dates = new Set<string>();
  const tickers = new Set(spec.series.filter((s) => METRICS[s.metric].source !== "price").map((s) => s.ticker));
  for (const t of tickers) {
    const fin = financials[t];
    if (!fin) continue;
    for (const b of bundlePeriods(fin, spec.granularity)) dates.add(b.date);
  }
  return [...dates].sort();
}

/**
 * The window shown when the user has not picked one: the last `years`
 * years of what is available, ending at the latest period. Alpha Vantage
 * history defaults to ten years; Yahoo's few periods to five (its most).
 */
export function defaultRange(dates: readonly string[], years: number): { from: string | null; to: string | null } {
  if (dates.length === 0) return { from: null, to: null };
  const last = dates[dates.length - 1];
  const cutoff = `${Number(last.slice(0, 4)) - years}${last.slice(4)}`;
  const from = dates.find((d) => d > cutoff) ?? dates[0];
  return { from, to: null };
}

/**
 * For a chart with no statements (prices only): the last trading day of
 * each month on file, so the period slider has something to snap to.
 */
export function priceMonthEnds(prices: Record<string, Array<{ date: string }> | undefined>): string[] {
  const lastOfMonth = new Map<string, string>();
  for (const points of Object.values(prices)) {
    for (const p of points ?? []) {
      const month = p.date.slice(0, 7);
      const prev = lastOfMonth.get(month);
      if (!prev || p.date > prev) lastOfMonth.set(month, p.date);
    }
  }
  return [...lastOfMonth.values()].sort();
}
