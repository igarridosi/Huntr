/**
 * Screener types — Huntr
 *
 * Filter dimensions operate on `ScreenerRow`, which is derived
 * from StockQuote + StockProfile (always available from cache).
 * Financial-derived metrics (ROIC, FCF yield) are optional enrichments.
 */

// ─── Core row (computed from StockQuote + StockProfile) ─────────────────────

export interface ScreenerRow {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  logo_url: string | undefined;

  // Price & size
  price: number;
  market_cap: number;

  // Valuation (from StockQuote)
  pe_ratio: number | null;
  /**
   * Normalized P/E — computed from Operating Income TTM (last 4 quarters) × (1 − tax_rate) ÷ shares.
   * Excludes below-the-line extraordinary items (asset sales, discontinued operations, M&A gains).
   * Available only when quarterly financials are in Supabase cache.
   * null means data not available — fall back to pe_ratio (GAAP).
   */
  normalized_pe: number | null;
  /** ISO timestamp of the last time enrichment data was fetched for this ticker */
  metrics_fetched_at: string | null;
  dividend_yield: number | null;

  // Growth (from StockQuote)
  revenue_growth: number | null;
  earnings_growth: number | null;

  // Technical
  fifty_two_week_high: number;
  fifty_two_week_low: number;
  /** (price - 52w_low) / (52w_high - 52w_low) */
  range_52w_pct: number | null;
  /** price / 52w_high - 1 */
  from_52w_high_pct: number | null;

  // Dividend
  payout_ratio: number | null;

  // Platform-computed enrichment (available once financials are cached)
  /** Last annual FCF ÷ Market Cap */
  fcf_yield: number | null;
  /** Platform Quality Score – Overall (0–100) */
  quality_overall: number | null;
  /** Platform Quality Score – Profitability dimension (0–100) */
  quality_profitability: number | null;
  /** Platform Quality Score – Financial Health dimension (0–100) */
  quality_financial_health: number | null;
  /** Platform Quality Score – Cash Generation dimension (0–100) */
  quality_cash_generation: number | null;

  // Volume
  avg_volume: number;
}

// ─── Filter definitions ───────────────────────────────────────────────────────

export type FilterId =
  | "market_cap"
  | "pe_ratio"
  | "dividend_yield"
  | "revenue_growth"
  | "earnings_growth"
  | "fcf_yield"
  | "from_52w_high"
  | "range_52w"
  | "payout_ratio"
  | "quality_overall"
  | "quality_profitability"
  | "quality_financial_health"
  | "quality_cash_generation";

// Keep this interface before ScreenerPreset is defined
export interface ScreenerPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // resolved to Lucide component in UI
  filters: ActiveFilters;
  sortBy: SortKey;
  sortDir: SortDir;
}

export interface RangeFilter {
  id: FilterId;
  label: string;
  tooltip: string;
  min: number | null;
  max: number | null;
  /** Raw step/default unit for slider  */
  step: number;
  unit: "%" | "x" | "$" | "";
  /** Multiply stored value for display (e.g. 0.01 stored → 1% shown) */
  displayMultiplier?: number;
}

export type ActiveFilters = Partial<Record<FilterId, { min: number | null; max: number | null }>>;

// ─── Sort ─────────────────────────────────────────────────────────────────────

export type SortKey = keyof ScreenerRow;
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

// ─── Preset strategies ───────────────────────────────────────────────────────

export interface ScreenerPreset {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name, resolved to component in the UI layer */
  icon: string;
  filters: ActiveFilters;
  sortBy: SortKey;
  sortDir: SortDir;
}

export const SCREENER_PRESETS: ScreenerPreset[] = [
  {
    id: "value",
    label: "Deep Value",
    description: "Low P/E ratio — trading cheap vs trailing earnings",
    icon: "Gem",
    filters: {
      pe_ratio: { min: 1, max: 15 },
    },
    sortBy: "pe_ratio",
    sortDir: "asc",
  },
  {
    id: "magic_formula",
    label: "Magic Formula",
    description: "Low P/E + positive earnings yield (Greenblatt proxy)",
    icon: "Zap",
    filters: {
      pe_ratio: { min: 1, max: 18 },
      earnings_growth: { min: 0, max: null },
    },
    sortBy: "pe_ratio",
    sortDir: "asc",
  },
  {
    id: "dividend",
    label: "Dividend Income",
    description: "Consistent yield with sustainable payout ratio",
    icon: "DollarSign",
    filters: {
      dividend_yield: { min: 0.02, max: null },
      payout_ratio: { min: null, max: 0.75 },
    },
    sortBy: "dividend_yield",
    sortDir: "desc",
  },
  {
    id: "garp",
    label: "GARP",
    description: "Growth at a Reasonable Price — P/E ≤ 35 with earnings growth",
    icon: "TrendingUp",
    filters: {
      earnings_growth: { min: 0.05, max: null },
      pe_ratio: { min: 1, max: 35 },
    },
    sortBy: "earnings_growth",
    sortDir: "desc",
  },
  {
    id: "momentum",
    label: "52W Breakout",
    description: "Trading near or above 52-week high",
    icon: "Rocket",
    filters: {
      from_52w_high: { min: -0.05, max: null },
    },
    sortBy: "from_52w_high_pct",
    sortDir: "desc",
  },
  {
    id: "defensive_quality",
    label: "Defensive Quality",
    description: "Strong balance sheet + reliable cash generation — resilient in downturns",
    icon: "Shield",
    filters: {
      quality_financial_health: { min: 70, max: null },
      quality_cash_generation:  { min: 65, max: null },
    },
    sortBy: "quality_overall",
    sortDir: "desc",
  },
];
