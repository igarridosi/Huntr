/**
 * Portfolio domain types — Position tracking with cost basis.
 */

export interface PortfolioPosition {
  ticker: string;
  shares: number;
  avg_cost: number;         // Average cost per share
  added_at: string;         // ISO date
  notes: string;
}

export interface PortfolioTransaction {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executed_at: string; // ISO date
  realized_gain_loss: number;
}

export interface Portfolio {
  id: string;
  name: string;
  positions: PortfolioPosition[];
  transaction_history: PortfolioTransaction[];
  created_at: string;       // ISO date
  realized_gain_loss: number;
}

export interface PortfolioStore {
  portfolios: Portfolio[];
  activePortfolioId: string;
}

/** Enriched position — merged with live quote + profile data */
export interface EnrichedPosition extends PortfolioPosition {
  profile: import("./stock").StockProfile | null;
  quote: import("./stock").StockQuote | null;
  // Computed P&L
  market_value: number;
  cost_basis: number;
  gain_loss: number;
  gain_loss_percent: number;
  // Allocation weight (0-1)
  weight: number;
  // Daily P&L
  day_gain_loss: number;
  day_gain_loss_percent: number;
}

/** Portfolio-level aggregate metrics */
export interface PortfolioSummary {
  total_market_value: number;
  total_cost_basis: number;
  total_gain_loss: number;
  total_gain_loss_percent: number;
  total_day_gain_loss: number;
  total_day_gain_loss_percent: number;
  position_count: number;
  // Diversification
  sector_allocation: Record<string, number>;  // sector -> weight
  top_holding_weight: number;
  // Weighted metrics
  weighted_pe: number;
  weighted_dividend_yield: number;
  weighted_beta: number;
  realized_gain_loss: number;
  unrealized_gain_loss: number;
  total_return_gain_loss: number;
}

export interface PortfolioImportResult {
  success: boolean;
  mode: "legacy" | "broker" | "unknown-format";
  importedCount: number;
  skippedInvalidRows: number;
  skippedUnknownTickers: string[];
  replacedPortfolio: boolean;
}
