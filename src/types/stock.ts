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
  day_change?: number;
  day_change_percent?: number;
  next_earnings_date?: string | null;
  market_cap: number;
  shares_outstanding: number;
  pe_ratio: number;
  dividend_yield: number;
  fifty_two_week_high: number;
  fifty_two_week_low: number;
  avg_volume: number;
  beta: number;
}

export interface MarketIndexQuote {
  symbol: string;
  label: string;
  price: number;
  change_percent: number;
}
