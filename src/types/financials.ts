/**
 * Financial statement types — Domain Model.
 * Source of Truth: ARCHITECTURE.md § 2.2
 */

export type PeriodType = "annual" | "quarterly";

export interface FinancialPeriod {
  period: string;   // 'FY2024' | 'Q3 2024'
  date: string;     // '2024-09-28' (fiscal year end)
  currency: string; // 'USD'
}

export interface IncomeStatement extends FinancialPeriod {
  revenue: number;
  cost_of_revenue: number;
  gross_profit: number;
  operating_expenses: number;
  operating_income: number;
  interest_expense: number;
  pre_tax_income: number;
  income_tax: number;
  net_income: number;
  eps_basic: number;
  eps_diluted: number;
  shares_outstanding_basic: number;
  shares_outstanding_diluted: number;
  ebitda: number;
}

export interface BalanceSheet extends FinancialPeriod {
  cash_and_equivalents: number;
  short_term_investments: number;
  total_current_assets: number;
  total_non_current_assets: number;
  total_assets: number;
  total_current_liabilities: number;
  long_term_debt: number;
  total_non_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
  retained_earnings: number;
  shares_outstanding: number;
}

export interface CashFlowStatement extends FinancialPeriod {
  operating_cash_flow: number;
  capital_expenditures: number;
  free_cash_flow: number;
  dividends_paid: number;
  share_repurchases: number;
  net_investing: number;
  net_financing: number;
  net_change_in_cash: number;
}

export interface CompanyFinancials {
  ticker: string;
  income_statement: {
    annual: IncomeStatement[];
    quarterly: IncomeStatement[];
  };
  balance_sheet: {
    annual: BalanceSheet[];
    quarterly: BalanceSheet[];
  };
  cash_flow: {
    annual: CashFlowStatement[];
    quarterly: CashFlowStatement[];
  };
}
