/**
 * Stock profile and quote types — Domain Model.
 * Source of Truth: ARCHITECTURE.md § 2.2
 */

export interface StockProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  currency: string;
  country: string;
  description: string;
  logo_url: string;
  website: string;
}

export interface StockQuote {
  ticker: string;
  price: number;
  /**
   * The currency `price` and `market_cap` are quoted in.
   *
   * Carried explicitly because a valuation compares a per-share figure derived
   * from the statements against this price, and that comparison is only valid
   * when the two are in the same unit.
   */
  currency?: string;
  /** The currency the financial statements are reported in. */
  financial_currency?: string;
  current_volume?: number;
  dividend_rate?: number;
  dividend_date?: string | null;
  ex_dividend_date?: string | null;
  payout_ratio?: number;
  five_year_avg_dividend_yield?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  day_change?: number;
  day_change_percent?: number;
  next_earnings_date?: string | null;
  earnings_timing?: "Before Open" | "After Close" | "Time TBD";
  /**
   * The report that has already happened. Once a company reports, Yahoo moves
   * its next date to the following quarter, so without this a company drops
   * off the calendar the day after it reports.
   */
  last_earnings_date?: string | null;
  last_earnings_timing?: "Before Open" | "After Close" | "Time TBD";
  market_cap: number;
  shares_outstanding: number;
  pe_ratio: number;
  dividend_yield: number;
  fifty_two_week_high: number;
  fifty_two_week_low: number;
  avg_volume: number;
  beta: number;
  /** Price over next-fiscal-year consensus EPS (batch quote). */
  forward_pe?: number | null;
  price_to_book?: number | null;
  /** Trailing twelve-month EPS as Yahoo reports it. */
  eps_ttm?: number | null;
  /** Consensus EPS for the next fiscal year. */
  eps_forward?: number | null;
  fifty_day_average?: number | null;
  two_hundred_day_average?: number | null;
  /** Price change over 52 weeks, as a fraction (0.12 = +12%). */
  fifty_two_week_change?: number | null;
  /** Analysts' mean rating, 1 (strong buy) to 5 (sell). */
  analyst_rating?: number | null;
}

export type EarningsInsightSource = "yahoo" | "alphavantage" | "mixed" | "none";

export interface EarningsHistoryPoint {
  quarter: string;
  report_date: string | null;
  eps_actual: number | null;
  eps_estimate: number | null;
  revenue_estimate?: number | null;
  revenue_actual?: number | null;
  surprise_percent: number | null;
}

export interface EarningsInsight {
  ticker: string;
  company_name: string | null;
  next_earnings_date: string | null;
  earnings_timing: "Before Open" | "After Close" | "Time TBD";
  est_eps: number | null;
  est_revenue: number | null;
  history: EarningsHistoryPoint[];
  investor_relations_url: string | null;
  webcast_url: string | null;
  source: EarningsInsightSource;
}

export interface MarketIndexQuote {
  symbol: string;
  label: string;
  price: number;
  change_percent: number;
}
