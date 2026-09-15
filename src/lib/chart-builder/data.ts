/**
 * Chart Builder — what a chart needs from the statements, and how a
 * partial deep-history overlay combines with the quick data.
 */

import type { CompanyFinancials } from "@/types/financials";
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
  return {
    ticker: base.ticker,
    income_statement: has("income") ? overlay.income_statement : base.income_statement,
    balance_sheet: has("balance") ? overlay.balance_sheet : base.balance_sheet,
    cash_flow: has("cashflow") ? overlay.cash_flow : base.cash_flow,
  };
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
