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

  // Live from the batch quote (every ticker, every load)
  forward_pe: number | null;
  price_to_book: number | null;
  /** Next fiscal year's consensus EPS over trailing EPS, less one. */
  expected_eps_growth: number | null;
  /** Price over its 200-day average, less one. */
  vs_200dma: number | null;
  /** Price change over 52 weeks, as a fraction. */
  change_52w: number | null;
  /** Analysts' mean rating, 1 (strong buy) to 5 (sell). */
  analyst_rating: number | null;

  // From the cached quoteSummary (warmed weekly for the whole universe)
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  target_upside: number | null;
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
  | "quality_cash_generation"
  | "forward_pe"
  | "price_to_book"
  | "price_to_sales"
  | "ev_to_ebitda"
  | "expected_eps_growth"
  | "gross_margin"
  | "operating_margin"
  | "net_margin"
  | "roe"
  | "debt_to_equity"
  | "current_ratio"
  | "target_upside"
  | "analyst_rating"
  | "change_52w"
  | "vs_200dma";

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

/**
 * Starting points, each one question a value or growth investor asks. The
 * filters are ordinary ones, so a preset is a screen the user can then
 * adjust, not a black box.
 */
export const SCREENER_PRESETS: ScreenerPreset[] = [
  {
    id: "deep_value",
    label: "Deep value",
    description: "Cheap on earnings and on assets: P/E under 12x, price to book under 2x.",
    icon: "Gem",
    filters: { pe_ratio: { min: 0, max: 12 }, price_to_book: { min: 0, max: 2 } },
    sortBy: "pe_ratio",
    sortDir: "asc",
  },
  {
    id: "quality_compounders",
    label: "Quality compounders",
    description: "High returns on equity, fat operating margins and modest debt.",
    icon: "Crown",
    filters: { roe: { min: 0.15, max: null }, operating_margin: { min: 0.2, max: null }, debt_to_equity: { min: 0, max: 1 } },
    sortBy: "quality_overall",
    sortDir: "desc",
  },
  {
    id: "garp",
    label: "Growth at a fair price",
    description: "Earnings expected to grow over 10% at a forward P/E under 25x.",
    icon: "TrendingUp",
    filters: { forward_pe: { min: 0, max: 25 }, expected_eps_growth: { min: 0.1, max: null } },
    sortBy: "expected_eps_growth",
    sortDir: "desc",
  },
  {
    id: "cash_machines",
    label: "Cash machines",
    description: "Free cash flow yield over 6%: a lot of cash for the price.",
    icon: "Banknote",
    filters: { fcf_yield: { min: 0.06, max: null } },
    sortBy: "fcf_yield",
    sortDir: "desc",
  },
  {
    id: "dividend_income",
    label: "Dividend income",
    description: "Yield over 3%, with a payout under 75% of earnings so it can last.",
    icon: "HandCoins",
    filters: { dividend_yield: { min: 0.03, max: null }, payout_ratio: { min: 0, max: 0.75 } },
    sortBy: "dividend_yield",
    sortDir: "desc",
  },
  {
    id: "high_growth",
    label: "High growth",
    description: "Revenue growing over 20% with gross margins over 50%.",
    icon: "Rocket",
    filters: { revenue_growth: { min: 0.2, max: null }, gross_margin: { min: 0.5, max: null } },
    sortBy: "revenue_growth",
    sortDir: "desc",
  },
  {
    id: "quality_on_sale",
    label: "Quality on sale",
    description: "Quality score over 70, trading over 20% below its 52-week high.",
    icon: "Tag",
    filters: { quality_overall: { min: 70, max: null }, from_52w_high: { min: null, max: -0.2 } },
    sortBy: "from_52w_high_pct",
    sortDir: "asc",
  },
];
