import type {
  BalanceSheet,
  CashFlowStatement,
  CompanyFinancials,
  IncomeStatement,
} from "@/types/financials";
import type { PricePoint } from "../resolve";

/** Hand-written statement rows: only the fields a test needs, rest zeroed. */
export interface Row {
  date: string;
  period?: string;
  revenue?: number;
  gross_profit?: number;
  operating_income?: number;
  net_income?: number;
  ebitda?: number;
  eps_diluted?: number;
  shares?: number;
  ocf?: number;
  capex?: number;
  fcf?: number;
  dividends?: number;
  buybacks?: number;
  cash?: number;
  sti?: number;
  debt?: number;
  equity?: number;
}

function income(r: Row): IncomeStatement {
  return {
    period: r.period ?? r.date,
    date: r.date,
    currency: "USD",
    revenue: r.revenue ?? 0,
    cost_of_revenue: 0,
    gross_profit: r.gross_profit ?? 0,
    operating_expenses: 0,
    operating_income: r.operating_income ?? 0,
    interest_expense: 0,
    pre_tax_income: 0,
    income_tax: 0,
    net_income: r.net_income ?? 0,
    eps_basic: r.eps_diluted ?? 0,
    eps_diluted: r.eps_diluted ?? 0,
    shares_outstanding_basic: r.shares ?? 0,
    shares_outstanding_diluted: r.shares ?? 0,
    ebitda: r.ebitda ?? 0,
  };
}

function balance(r: Row): BalanceSheet {
  return {
    period: r.period ?? r.date,
    date: r.date,
    currency: "USD",
    cash_and_equivalents: r.cash ?? 0,
    short_term_investments: r.sti ?? 0,
    total_current_assets: 0,
    total_non_current_assets: 0,
    total_assets: 0,
    total_current_liabilities: 0,
    long_term_debt: r.debt ?? 0,
    total_non_current_liabilities: 0,
    total_liabilities: 0,
    total_equity: r.equity ?? 0,
    retained_earnings: 0,
    shares_outstanding: r.shares ?? 0,
  };
}

function cashflow(r: Row): CashFlowStatement {
  return {
    period: r.period ?? r.date,
    date: r.date,
    currency: "USD",
    operating_cash_flow: r.ocf ?? 0,
    capital_expenditures: r.capex ?? 0,
    free_cash_flow: r.fcf ?? 0,
    dividends_paid: r.dividends ?? 0,
    share_repurchases: r.buybacks ?? 0,
    net_investing: 0,
    net_financing: 0,
    net_change_in_cash: 0,
  };
}

export interface FinOptions {
  /** Which statements to populate. Default: all three. */
  statements?: Array<"income" | "balance" | "cashflow">;
}

/**
 * Builds `CompanyFinancials` from compact rows. Rows are given oldest-first
 * for readability and stored newest-first, the way the API layer returns them.
 */
export function fin(
  ticker: string,
  { annual = [], quarterly = [] }: { annual?: Row[]; quarterly?: Row[] },
  opts: FinOptions = {}
): CompanyFinancials {
  const which = new Set(opts.statements ?? ["income", "balance", "cashflow"]);
  const newestFirst = (rows: Row[]) => rows.slice().reverse();
  return {
    ticker,
    income_statement: {
      annual: which.has("income") ? newestFirst(annual).map(income) : [],
      quarterly: which.has("income") ? newestFirst(quarterly).map(income) : [],
    },
    balance_sheet: {
      annual: which.has("balance") ? newestFirst(annual).map(balance) : [],
      quarterly: which.has("balance") ? newestFirst(quarterly).map(balance) : [],
    },
    cash_flow: {
      annual: which.has("cashflow") ? newestFirst(annual).map(cashflow) : [],
      quarterly: which.has("cashflow") ? newestFirst(quarterly).map(cashflow) : [],
    },
  };
}

/** Quarter-end dates for a calendar-year filer, oldest first. */
export function quarterEnds(fromYear: number, toYear: number): string[] {
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    out.push(`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`);
  }
  return out;
}

/** Daily closes: one point per calendar day, price = f(dayIndex). */
export function prices(from: string, days: number, f: (i: number) => number): PricePoint[] {
  const start = Date.parse(from);
  const out: PricePoint[] = [];
  for (let i = 0; i < days; i++) {
    out.push({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), close: f(i) });
  }
  return out;
}
