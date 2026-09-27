/**
 * Screener — the filter catalogue.
 *
 * One entry per filter, and everything the screen shows about a filter comes
 * from it: the "Add filters" sheet (group, label, description), the control
 * (presets, custom range), the table column it adds (header, format, which
 * direction reads as good) and the URL.
 *
 * Every filter here is backed by data that exists for the universe:
 *  - "live": Yahoo's batch quote, fetched for every ticker on every load;
 *  - "cached": each ticker's quoteSummary or financials in stock_cache,
 *    warmed weekly for every active ticker by the pre-warm crons.
 * A metric we could not fill for most of the universe is not offered.
 *
 * Foreign listings (ADRs) quote in dollars and report in their own currency;
 * figures that divide one by the other (P/B, forward P/E, P/S, EV/EBITDA,
 * FCF yield) are left empty for them rather than shown wrong.
 */

import type { FilterId, ScreenerRow } from "@/types/screener";

export type FilterGroup = "Valuation" | "Growth" | "Profitability" | "Financial health" | "Dividends" | "Price & momentum" | "Quality scores" | "Size";

export const FILTER_GROUPS: readonly FilterGroup[] = [
  "Size",
  "Valuation",
  "Growth",
  "Profitability",
  "Financial health",
  "Dividends",
  "Price & momentum",
  "Quality scores",
];

/** How a value is written: a multiple (12.4x), a percentage of a fraction (0.12 → 12.0%), money, a 0-100 score or a 1-5 rating. */
export type FilterFormat = "multiple" | "percent" | "signed_percent" | "money" | "score" | "rating";

export interface FilterPreset {
  label: string;
  min: number | null;
  max: number | null;
}

export interface FilterSpec {
  id: FilterId;
  label: string;
  /** Column header; the label when it is short enough. */
  column: string;
  group: FilterGroup;
  field: keyof ScreenerRow;
  format: FilterFormat;
  description: string;
  presets: FilterPreset[];
  source: "live" | "cached";
  /** Which end reads as good, for colouring the column; none for neutral facts. */
  better?: "low" | "high";
  /** Custom ranges are typed in display units; this turns them back (percent → fraction). */
  inputScale: number;
}

const pct = (lo: number | null, hi: number | null): Pick<FilterPreset, "min" | "max"> => ({
  min: lo === null ? null : lo / 100,
  max: hi === null ? null : hi / 100,
});

export const FILTERS: readonly FilterSpec[] = [
  // ── Size ────────────────────────────────────────────────────────────────
  {
    id: "market_cap",
    label: "Market cap",
    column: "Mkt cap",
    group: "Size",
    field: "market_cap",
    format: "money",
    description: "Share price times shares outstanding.",
    presets: [
      { label: "Mega (over $200B)", min: 200e9, max: null },
      { label: "Large ($10B-200B)", min: 10e9, max: 200e9 },
      { label: "Mid ($2B-10B)", min: 2e9, max: 10e9 },
      { label: "Small (under $2B)", min: null, max: 2e9 },
    ],
    source: "live",
    inputScale: 1e9,
  },

  // ── Valuation ───────────────────────────────────────────────────────────
  {
    id: "pe_ratio",
    label: "P/E (trailing)",
    column: "P/E",
    group: "Valuation",
    field: "pe_ratio",
    format: "multiple",
    description: "Price over the last twelve months of earnings per share. Companies with losses have none.",
    presets: [
      { label: "Under 10x", min: 0, max: 10 },
      { label: "Under 15x", min: 0, max: 15 },
      { label: "15x-25x", min: 15, max: 25 },
      { label: "Over 25x", min: 25, max: null },
    ],
    source: "live",
    better: "low",
    inputScale: 1,
  },
  {
    id: "forward_pe",
    label: "Forward P/E",
    column: "Fwd P/E",
    group: "Valuation",
    field: "forward_pe",
    format: "multiple",
    description: "Price over analysts' consensus EPS for the next fiscal year.",
    presets: [
      { label: "Under 10x", min: 0, max: 10 },
      { label: "Under 15x", min: 0, max: 15 },
      { label: "15x-25x", min: 15, max: 25 },
      { label: "Over 25x", min: 25, max: null },
    ],
    source: "live",
    better: "low",
    inputScale: 1,
  },
  {
    id: "price_to_book",
    label: "Price to book",
    column: "P/B",
    group: "Valuation",
    field: "price_to_book",
    format: "multiple",
    description: "Price over book value (equity) per share. Negative equity has no meaningful P/B.",
    presets: [
      { label: "Under 1x", min: 0, max: 1 },
      { label: "Under 3x", min: 0, max: 3 },
      { label: "3x-10x", min: 3, max: 10 },
      { label: "Over 10x", min: 10, max: null },
    ],
    source: "live",
    better: "low",
    inputScale: 1,
  },
  {
    id: "price_to_sales",
    label: "Price to sales",
    column: "P/S",
    group: "Valuation",
    field: "price_to_sales",
    format: "multiple",
    description: "Market cap over the last twelve months of revenue.",
    presets: [
      { label: "Under 1x", min: 0, max: 1 },
      { label: "Under 3x", min: 0, max: 3 },
      { label: "3x-10x", min: 3, max: 10 },
      { label: "Over 10x", min: 10, max: null },
    ],
    source: "cached",
    better: "low",
    inputScale: 1,
  },
  {
    id: "ev_to_ebitda",
    label: "EV / EBITDA",
    column: "EV/EBITDA",
    group: "Valuation",
    field: "ev_to_ebitda",
    format: "multiple",
    description: "Enterprise value (market cap plus net debt) over EBITDA. Compares companies with different debt loads.",
    presets: [
      { label: "Under 8x", min: 0, max: 8 },
      { label: "Under 12x", min: 0, max: 12 },
      { label: "12x-20x", min: 12, max: 20 },
      { label: "Over 20x", min: 20, max: null },
    ],
    source: "cached",
    better: "low",
    inputScale: 1,
  },
  {
    id: "fcf_yield",
    label: "FCF yield",
    column: "FCF yield",
    group: "Valuation",
    field: "fcf_yield",
    format: "percent",
    description: "Free cash flow over the last twelve months against market cap: the cash return on the price paid.",
    presets: [
      { label: "Over 3%", ...pct(3, null) },
      { label: "Over 5%", ...pct(5, null) },
      { label: "Over 8%", ...pct(8, null) },
      { label: "Negative", ...pct(null, 0) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },

  // ── Growth ──────────────────────────────────────────────────────────────
  {
    id: "revenue_growth",
    label: "Revenue growth",
    column: "Rev growth",
    group: "Growth",
    field: "revenue_growth",
    format: "signed_percent",
    description: "Revenue in the latest quarter against the same quarter a year earlier.",
    presets: [
      { label: "Growing", ...pct(0, null) },
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 20%", ...pct(20, null) },
      { label: "Shrinking", ...pct(null, 0) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "earnings_growth",
    label: "EPS growth",
    column: "EPS growth",
    group: "Growth",
    field: "earnings_growth",
    format: "signed_percent",
    description: "Earnings per share in the latest quarter against the same quarter a year earlier.",
    presets: [
      { label: "Growing", ...pct(0, null) },
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 25%", ...pct(25, null) },
      { label: "Shrinking", ...pct(null, 0) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "expected_eps_growth",
    label: "Expected EPS growth",
    column: "Exp. EPS growth",
    group: "Growth",
    field: "expected_eps_growth",
    format: "signed_percent",
    description: "Analysts' consensus EPS for next fiscal year against the last twelve months: the growth the market is told to expect.",
    presets: [
      { label: "Over 5%", ...pct(5, null) },
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 20%", ...pct(20, null) },
      { label: "Decline expected", ...pct(null, 0) },
    ],
    source: "live",
    better: "high",
    inputScale: 0.01,
  },

  // ── Profitability ───────────────────────────────────────────────────────
  {
    id: "gross_margin",
    label: "Gross margin",
    column: "Gross margin",
    group: "Profitability",
    field: "gross_margin",
    format: "percent",
    description: "Revenue left after the direct cost of what was sold. High and stable suggests pricing power.",
    presets: [
      { label: "Over 30%", ...pct(30, null) },
      { label: "Over 50%", ...pct(50, null) },
      { label: "Over 70%", ...pct(70, null) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "operating_margin",
    label: "Operating margin",
    column: "Op. margin",
    group: "Profitability",
    field: "operating_margin",
    format: "percent",
    description: "Operating income over revenue, last twelve months.",
    presets: [
      { label: "Profitable", ...pct(0, null) },
      { label: "Over 15%", ...pct(15, null) },
      { label: "Over 25%", ...pct(25, null) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "net_margin",
    label: "Net margin",
    column: "Net margin",
    group: "Profitability",
    field: "net_margin",
    format: "percent",
    description: "Net income over revenue, last twelve months.",
    presets: [
      { label: "Profitable", ...pct(0, null) },
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 20%", ...pct(20, null) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "roe",
    label: "Return on equity",
    column: "ROE",
    group: "Profitability",
    field: "roe",
    format: "percent",
    description: "Net income over shareholders' equity. Buybacks and debt can inflate it; read it with debt/equity.",
    presets: [
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 15%", ...pct(15, null) },
      { label: "Over 25%", ...pct(25, null) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },

  // ── Financial health ────────────────────────────────────────────────────
  {
    id: "debt_to_equity",
    label: "Debt / equity",
    column: "Debt/Eq",
    group: "Financial health",
    field: "debt_to_equity",
    format: "multiple",
    description: "Total debt over shareholders' equity. Companies with negative equity are left out.",
    presets: [
      { label: "Under 0.5x", min: 0, max: 0.5 },
      { label: "Under 1x", min: 0, max: 1 },
      { label: "Under 2x", min: 0, max: 2 },
      { label: "Over 2x", min: 2, max: null },
    ],
    source: "cached",
    better: "low",
    inputScale: 1,
  },
  {
    id: "current_ratio",
    label: "Current ratio",
    column: "Current ratio",
    group: "Financial health",
    field: "current_ratio",
    format: "multiple",
    description: "Current assets over current liabilities: whether the next year's bills are covered.",
    presets: [
      { label: "Over 1x", min: 1, max: null },
      { label: "Over 1.5x", min: 1.5, max: null },
      { label: "Over 2x", min: 2, max: null },
      { label: "Under 1x", min: null, max: 1 },
    ],
    source: "cached",
    better: "high",
    inputScale: 1,
  },

  // ── Dividends ───────────────────────────────────────────────────────────
  {
    id: "dividend_yield",
    label: "Dividend yield",
    column: "Div yield",
    group: "Dividends",
    field: "dividend_yield",
    format: "percent",
    description: "Annual dividend over price.",
    presets: [
      { label: "Pays a dividend", ...pct(0.01, null) },
      { label: "Over 2%", ...pct(2, null) },
      { label: "Over 4%", ...pct(4, null) },
    ],
    source: "live",
    better: "high",
    inputScale: 0.01,
  },
  {
    id: "payout_ratio",
    label: "Payout ratio",
    column: "Payout",
    group: "Dividends",
    field: "payout_ratio",
    format: "percent",
    description: "Share of earnings paid out as dividends. Over 100% is paid from something other than profit.",
    presets: [
      { label: "Under 50%", ...pct(0, 50) },
      { label: "Under 75%", ...pct(0, 75) },
      { label: "Over 100%", ...pct(100, null) },
    ],
    source: "cached",
    better: "low",
    inputScale: 0.01,
  },

  // ── Price & momentum ────────────────────────────────────────────────────
  {
    id: "from_52w_high",
    label: "Distance from 52W high",
    column: "vs 52W high",
    group: "Price & momentum",
    field: "from_52w_high_pct",
    format: "signed_percent",
    description: "Price against its 52-week high. Near 0% is at the high; deeply negative is a drawdown.",
    presets: [
      { label: "Within 5% of high", ...pct(-5, null) },
      { label: "10%-25% below", ...pct(-25, -10) },
      { label: "Over 25% below", ...pct(null, -25) },
    ],
    source: "live",
    inputScale: 0.01,
  },
  {
    id: "change_52w",
    label: "52-week change",
    column: "52W chg",
    group: "Price & momentum",
    field: "change_52w",
    format: "signed_percent",
    description: "Share price change over the last 52 weeks.",
    presets: [
      { label: "Up", ...pct(0, null) },
      { label: "Up over 25%", ...pct(25, null) },
      { label: "Down", ...pct(null, 0) },
      { label: "Down over 25%", ...pct(null, -25) },
    ],
    source: "live",
    inputScale: 0.01,
  },
  {
    id: "vs_200dma",
    label: "Price vs 200-day average",
    column: "vs 200D",
    group: "Price & momentum",
    field: "vs_200dma",
    format: "signed_percent",
    description: "Price against its 200-day moving average: above is an uptrend, below a downtrend.",
    presets: [
      { label: "Above", ...pct(0, null) },
      { label: "Below", ...pct(null, 0) },
      { label: "Over 15% below", ...pct(null, -15) },
    ],
    source: "live",
    inputScale: 0.01,
  },
  {
    id: "analyst_rating",
    label: "Analyst rating",
    column: "Rating",
    group: "Price & momentum",
    field: "analyst_rating",
    format: "rating",
    description: "Analysts' mean recommendation, from 1 (strong buy) to 5 (sell).",
    presets: [
      { label: "Strong buy (under 1.5)", min: null, max: 1.5 },
      { label: "Buy (under 2.5)", min: null, max: 2.5 },
      { label: "Hold or worse (over 2.5)", min: 2.5, max: null },
    ],
    source: "live",
    better: "low",
    inputScale: 1,
  },
  {
    id: "target_upside",
    label: "Upside to price target",
    column: "Target upside",
    group: "Price & momentum",
    field: "target_upside",
    format: "signed_percent",
    description: "Analysts' mean price target against the current price. Needs at least three analysts.",
    presets: [
      { label: "Over 10%", ...pct(10, null) },
      { label: "Over 25%", ...pct(25, null) },
      { label: "Below target price", ...pct(null, 0) },
    ],
    source: "cached",
    better: "high",
    inputScale: 0.01,
  },

  // ── Quality scores ──────────────────────────────────────────────────────
  {
    id: "quality_overall",
    label: "Quality score",
    column: "Quality",
    group: "Quality scores",
    field: "quality_overall",
    format: "score",
    description: "Huntr's 0-100 quality score: profitability, growth, balance sheet, cash generation and capital allocation against sector peers.",
    presets: [
      { label: "Over 60", min: 60, max: null },
      { label: "Over 70", min: 70, max: null },
      { label: "Over 80", min: 80, max: null },
    ],
    source: "cached",
    better: "high",
    inputScale: 1,
  },
  {
    id: "quality_profitability",
    label: "Profitability score",
    column: "Profit. score",
    group: "Quality scores",
    field: "quality_profitability",
    format: "score",
    description: "The profitability part of the quality score: returns on capital and margins against sector peers.",
    presets: [
      { label: "Over 60", min: 60, max: null },
      { label: "Over 70", min: 70, max: null },
      { label: "Over 80", min: 80, max: null },
    ],
    source: "cached",
    better: "high",
    inputScale: 1,
  },
  {
    id: "quality_financial_health",
    label: "Financial health score",
    column: "Health score",
    group: "Quality scores",
    field: "quality_financial_health",
    format: "score",
    description: "The balance-sheet part of the quality score: leverage, interest cover and liquidity against sector peers.",
    presets: [
      { label: "Over 60", min: 60, max: null },
      { label: "Over 70", min: 70, max: null },
      { label: "Over 80", min: 80, max: null },
    ],
    source: "cached",
    better: "high",
    inputScale: 1,
  },
  {
    id: "quality_cash_generation",
    label: "Cash generation score",
    column: "Cash score",
    group: "Quality scores",
    field: "quality_cash_generation",
    format: "score",
    description: "The cash part of the quality score: free cash flow margin, yield and conversion against sector peers.",
    presets: [
      { label: "Over 60", min: 60, max: null },
      { label: "Over 70", min: 70, max: null },
      { label: "Over 80", min: 80, max: null },
    ],
    source: "cached",
    better: "high",
    inputScale: 1,
  },
];

export const FILTER_BY_ID = new Map(FILTERS.map((f) => [f.id, f] as const));

/** The row field a filter reads. */
export const fieldOf = (id: FilterId): keyof ScreenerRow => FILTER_BY_ID.get(id)?.field ?? (id as keyof ScreenerRow);

// ─── Formatting ─────────────────────────────────────────────────────────────

function money(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

/** A value as the table and chips write it. */
export function formatFilterValue(format: FilterFormat, v: number): string {
  switch (format) {
    case "multiple":
      return `${v.toFixed(v >= 100 ? 0 : 1)}x`;
    case "percent":
      return `${(v * 100).toFixed(1)}%`;
    case "signed_percent":
      return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    case "money":
      return money(v);
    case "score":
      return String(Math.round(v));
    case "rating":
      return v.toFixed(1);
  }
}

/** A range as a chip writes it: "Under 15x", "10%-25%", "Over $10B". */
export function describeRange(spec: FilterSpec, min: number | null, max: number | null): string {
  const preset = spec.presets.find((p) => p.min === min && p.max === max);
  if (preset) return preset.label;
  // Ranges read as a person types them: "Over 20%", not "Over 20.0%".
  const f = (v: number) =>
    (spec.format === "percent" || spec.format === "signed_percent") && Number.isInteger(Math.round(v * 1e6) / 1e4)
      ? `${Math.round(v * 100)}%`
      : formatFilterValue(spec.format === "signed_percent" ? "percent" : spec.format, v);
  if (min !== null && max !== null) return `${f(min)} to ${f(max)}`;
  if (min !== null) return `Over ${f(min)}`;
  if (max !== null) return `Under ${f(max)}`;
  return "Any";
}
