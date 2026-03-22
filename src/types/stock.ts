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
  market_cap: number;
  shares_outstanding: number;
  pe_ratio: number;
  dividend_yield: number;
  fifty_two_week_high: number;
  fifty_two_week_low: number;
  avg_volume: number;
  beta: number;
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
