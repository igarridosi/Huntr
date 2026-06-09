/**
 * Quality Score Engine v2 — Huntr
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Calculates a sector-relative composite quality grade (A+→F / 0–100) across
 * five dimensions.  Key improvements over v1:
 *
 *  1. SECTOR-RELATIVE SCORING — all margin / ROIC metrics are scored as
 *     empirical percentiles within the company's GICS sector, not against
 *     absolute universal thresholds.
 *
 *  2. EARNINGS QUALITY — FCF / Net-Income conversion ratio detects
 *     non-recurring accounting charges.  High conversion prevents drastic
 *     profitability penalties even when GAAP EPS is depressed.
 *
 *  3. ROIC vs WACC SPREAD — the primary profitability signal.  Positive
 *     spread (ROIC > estimated WACC) signals economic value creation and
 *     overrides low nominal-margin penalties.
 *
 *  4. DYNAMIC CAPITAL ALLOCATION — dividend payout limits are sector-aware
 *     (mature sectors: Utilities, Staples, REITs carry higher acceptable
 *     payout ranges). Payout is evaluated vs FCF, not net income.
 *
 *  5. DUAL MODES
 *     • "standard"  — last 4 annual periods (Yahoo Finance default)
 *     • "deep"      — last 10 annual periods (AlphaVantage 20Y)
 *     Mode is auto-detected from data depth; score is displayed with its
 *     window so the user always knows which basis is shown.
 *
 *  6. QUALITY FLAGS — automatic inference of divergence signals:
 *     "non_recurring_charges", "high_cash_quality", "value_creator",
 *     "margin_compression", "leverage_risk".
 */

import type { CompanyFinancials, IncomeStatement, BalanceSheet, CashFlowStatement } from "@/types/financials";
import type { StockQuote, StockProfile } from "@/types/stock";
import { calculateCAGR } from "@/lib/calculations/cagr";

// ─── Public types ─────────────────────────────────────────────────────────────

export type QualityGrade = "A+" | "A" | "B" | "C" | "D" | "F";
export type QualityMode  = "standard" | "deep";

export type QualityFlag =
  /** Revenue & FCF growing but EPS depressed → likely non-recurring costs */
  | "non_recurring_charges"
  /** FCF / Net-Income consistently > 1 → cash earnings exceed GAAP earnings */
  | "high_cash_quality"
  /** ROIC > estimated WACC → company is an economic value creator */
  | "value_creator"
  /** Net margins have been declining over the analysis window */
  | "margin_compression"
  /** Net Debt / EBITDA > 3× — elevated leverage risk */
  | "leverage_risk";

export interface QualityMetric {
  label: string;
  value: string;
  /** 0–100 sector-relative percentile score */
  score: number;
  tooltip: string;
}

export interface QualityDimension {
  key: string;
  name: string;
  score: number;
  grade: QualityGrade;
  metrics: QualityMetric[];
  summary: string;
}

export interface QualityScoreResult {
  overall: number;
  grade: QualityGrade;
  headline: string;
  /** e.g. 12 → "Top 12% in Technology" */
  sectorPercentile: number;
  /** Human-readable sector label, e.g. "Technology" */
  sector: string;
  mode: QualityMode;
  flags: QualityFlag[];
  dimensions: [
    QualityDimension, // Profitability
    QualityDimension, // Growth
    QualityDimension, // Financial Health
    QualityDimension, // Cash Generation
    QualityDimension, // Capital Allocation
  ];
}

// ─── Sector benchmarks ────────────────────────────────────────────────────────

/** Empirical percentile breakpoints (p25/p50/p75/p90) per sector (as decimal fractions). */
interface MetricP { p25: number; p50: number; p75: number; p90: number }

interface SectorBenchmarks {
  label: string;
  netMargin:  MetricP;
  opMargin:   MetricP;
  grossMargin:MetricP;
  roic:       MetricP;
  fcfMargin:  MetricP;
  revCagr:    MetricP;
  fcfCagr:    MetricP;
  /** D/E — higher is worse, passed as lowerIsBetter=true */
  debtEquity: MetricP;
  /** Estimated sector WACC (decimal) */
  wacc: number;
  /** Mature = high dividends acceptable */
  isMature: boolean;
  /** Max acceptable FCF payout ratio before penalty begins */
  maxPayoutFcf: number;
}

type SectorKey =
  | "technology" | "healthcare" | "financials"
  | "consumer_staples" | "consumer_discretionary"
  | "industrials" | "energy" | "utilities"
  | "materials" | "real_estate" | "communication"
  | "default";

// Benchmarks sourced from cross-sectional S&P 500 median analysis (2019–2024).
const SECTOR_BENCHMARKS: Record<SectorKey, SectorBenchmarks> = {
  technology: {
    label: "Technology",
    netMargin:   { p25: 0.05, p50: 0.12, p75: 0.20, p90: 0.28 },
    opMargin:    { p25: 0.08, p50: 0.16, p75: 0.25, p90: 0.33 },
    grossMargin: { p25: 0.35, p50: 0.55, p75: 0.68, p90: 0.78 },
    roic:        { p25: 0.08, p50: 0.15, p75: 0.28, p90: 0.45 },
    fcfMargin:   { p25: 0.08, p50: 0.16, p75: 0.26, p90: 0.35 },
    revCagr:     { p25: 0.04, p50: 0.10, p75: 0.18, p90: 0.28 },
    fcfCagr:     { p25: 0.05, p50: 0.12, p75: 0.22, p90: 0.35 },
    debtEquity:  { p25: 0.10, p50: 0.30, p75: 0.60, p90: 1.20 },
    wacc: 0.10, isMature: false, maxPayoutFcf: 0.40,
  },
  healthcare: {
    label: "Healthcare",
    netMargin:   { p25: 0.03, p50: 0.08, p75: 0.16, p90: 0.25 },
    opMargin:    { p25: 0.05, p50: 0.12, p75: 0.20, p90: 0.28 },
    grossMargin: { p25: 0.30, p50: 0.52, p75: 0.65, p90: 0.76 },
    roic:        { p25: 0.06, p50: 0.12, p75: 0.20, p90: 0.32 },
    fcfMargin:   { p25: 0.05, p50: 0.12, p75: 0.20, p90: 0.30 },
    revCagr:     { p25: 0.03, p50: 0.07, p75: 0.13, p90: 0.22 },
    fcfCagr:     { p25: 0.04, p50: 0.09, p75: 0.16, p90: 0.26 },
    debtEquity:  { p25: 0.10, p50: 0.40, p75: 0.80, p90: 1.50 },
    wacc: 0.085, isMature: false, maxPayoutFcf: 0.50,
  },
  financials: {
    label: "Financials",
    // Banks have structurally high NM due to low revenue base
    netMargin:   { p25: 0.10, p50: 0.20, p75: 0.28, p90: 0.36 },
    opMargin:    { p25: 0.12, p50: 0.22, p75: 0.32, p90: 0.42 },
    grossMargin: { p25: 0.40, p50: 0.55, p75: 0.68, p90: 0.78 },
    roic:        { p25: 0.05, p50: 0.09, p75: 0.14, p90: 0.20 },
    fcfMargin:   { p25: 0.08, p50: 0.16, p75: 0.24, p90: 0.32 },
    revCagr:     { p25: 0.02, p50: 0.06, p75: 0.11, p90: 0.18 },
    fcfCagr:     { p25: 0.03, p50: 0.07, p75: 0.13, p90: 0.22 },
    debtEquity:  { p25: 0.50, p50: 2.00, p75: 5.00, p90: 10.0 },
    wacc: 0.10, isMature: true, maxPayoutFcf: 0.65,
  },
  consumer_staples: {
    label: "Consumer Staples",
    netMargin:   { p25: 0.03, p50: 0.06, p75: 0.10, p90: 0.15 },
    opMargin:    { p25: 0.06, p50: 0.10, p75: 0.15, p90: 0.20 },
    grossMargin: { p25: 0.25, p50: 0.38, p75: 0.50, p90: 0.60 },
    roic:        { p25: 0.08, p50: 0.14, p75: 0.22, p90: 0.32 },
    fcfMargin:   { p25: 0.04, p50: 0.08, p75: 0.13, p90: 0.18 },
    revCagr:     { p25: 0.01, p50: 0.03, p75: 0.07, p90: 0.12 },
    fcfCagr:     { p25: 0.02, p50: 0.05, p75: 0.09, p90: 0.15 },
    debtEquity:  { p25: 0.20, p50: 0.50, p75: 1.00, p90: 2.00 },
    wacc: 0.07, isMature: true, maxPayoutFcf: 0.70,
  },
  consumer_discretionary: {
    label: "Consumer Discretionary",
    netMargin:   { p25: 0.02, p50: 0.05, p75: 0.09, p90: 0.14 },
    opMargin:    { p25: 0.03, p50: 0.07, p75: 0.12, p90: 0.18 },
    grossMargin: { p25: 0.20, p50: 0.35, p75: 0.50, p90: 0.62 },
    roic:        { p25: 0.07, p50: 0.13, p75: 0.20, p90: 0.30 },
    fcfMargin:   { p25: 0.02, p50: 0.05, p75: 0.10, p90: 0.16 },
    revCagr:     { p25: 0.03, p50: 0.07, p75: 0.13, p90: 0.22 },
    fcfCagr:     { p25: 0.04, p50: 0.09, p75: 0.16, p90: 0.28 },
    debtEquity:  { p25: 0.20, p50: 0.60, p75: 1.20, p90: 2.50 },
    wacc: 0.09, isMature: false, maxPayoutFcf: 0.40,
  },
  industrials: {
    label: "Industrials",
    netMargin:   { p25: 0.03, p50: 0.07, p75: 0.11, p90: 0.15 },
    opMargin:    { p25: 0.06, p50: 0.10, p75: 0.15, p90: 0.21 },
    grossMargin: { p25: 0.20, p50: 0.32, p75: 0.42, p90: 0.53 },
    roic:        { p25: 0.07, p50: 0.12, p75: 0.18, p90: 0.26 },
    fcfMargin:   { p25: 0.03, p50: 0.07, p75: 0.11, p90: 0.16 },
    revCagr:     { p25: 0.02, p50: 0.05, p75: 0.09, p90: 0.14 },
    fcfCagr:     { p25: 0.03, p50: 0.07, p75: 0.12, p90: 0.20 },
    debtEquity:  { p25: 0.20, p50: 0.50, p75: 1.00, p90: 2.00 },
    wacc: 0.085, isMature: false, maxPayoutFcf: 0.45,
  },
  energy: {
    label: "Energy",
    netMargin:   { p25: 0.02, p50: 0.07, p75: 0.13, p90: 0.20 },
    opMargin:    { p25: 0.06, p50: 0.14, p75: 0.21, p90: 0.29 },
    grossMargin: { p25: 0.15, p50: 0.28, p75: 0.40, p90: 0.52 },
    roic:        { p25: 0.05, p50: 0.10, p75: 0.16, p90: 0.24 },
    fcfMargin:   { p25: 0.04, p50: 0.10, p75: 0.16, p90: 0.24 },
    revCagr:     { p25: -0.02, p50: 0.03, p75: 0.08, p90: 0.14 },
    fcfCagr:     { p25: 0.02, p50: 0.07, p75: 0.14, p90: 0.24 },
    debtEquity:  { p25: 0.20, p50: 0.50, p75: 1.00, p90: 2.00 },
    wacc: 0.09, isMature: false, maxPayoutFcf: 0.55,
  },
  utilities: {
    label: "Utilities",
    netMargin:   { p25: 0.07, p50: 0.12, p75: 0.16, p90: 0.20 },
    opMargin:    { p25: 0.12, p50: 0.18, p75: 0.24, p90: 0.30 },
    grossMargin: { p25: 0.20, p50: 0.30, p75: 0.40, p90: 0.52 },
    roic:        { p25: 0.03, p50: 0.05, p75: 0.08, p90: 0.12 },
    fcfMargin:   { p25: -0.03, p50: 0.02, p75: 0.06, p90: 0.12 },
    revCagr:     { p25: 0.01, p50: 0.03, p75: 0.06, p90: 0.10 },
    fcfCagr:     { p25: -0.02, p50: 0.02, p75: 0.07, p90: 0.14 },
    debtEquity:  { p25: 0.50, p50: 1.00, p75: 1.80, p90: 3.00 },
    wacc: 0.065, isMature: true, maxPayoutFcf: 0.85,
  },
  materials: {
    label: "Materials",
    netMargin:   { p25: 0.03, p50: 0.07, p75: 0.12, p90: 0.18 },
    opMargin:    { p25: 0.06, p50: 0.12, p75: 0.18, p90: 0.26 },
    grossMargin: { p25: 0.18, p50: 0.30, p75: 0.42, p90: 0.55 },
    roic:        { p25: 0.06, p50: 0.11, p75: 0.17, p90: 0.26 },
    fcfMargin:   { p25: 0.03, p50: 0.08, p75: 0.13, p90: 0.20 },
    revCagr:     { p25: 0.01, p50: 0.04, p75: 0.08, p90: 0.13 },
    fcfCagr:     { p25: 0.02, p50: 0.06, p75: 0.12, p90: 0.20 },
    debtEquity:  { p25: 0.20, p50: 0.50, p75: 1.00, p90: 2.00 },
    wacc: 0.085, isMature: false, maxPayoutFcf: 0.45,
  },
  real_estate: {
    label: "Real Estate",
    netMargin:   { p25: 0.05, p50: 0.15, p75: 0.25, p90: 0.35 },
    opMargin:    { p25: 0.20, p50: 0.35, p75: 0.50, p90: 0.65 },
    grossMargin: { p25: 0.40, p50: 0.60, p75: 0.75, p90: 0.85 },
    roic:        { p25: 0.02, p50: 0.04, p75: 0.07, p90: 0.11 },
    fcfMargin:   { p25: 0.10, p50: 0.20, p75: 0.30, p90: 0.42 },
    revCagr:     { p25: 0.02, p50: 0.05, p75: 0.09, p90: 0.15 },
    fcfCagr:     { p25: 0.02, p50: 0.05, p75: 0.10, p90: 0.18 },
    debtEquity:  { p25: 0.50, p50: 1.00, p75: 2.00, p90: 4.00 },
    wacc: 0.065, isMature: true, maxPayoutFcf: 0.92,
  },
  communication: {
    label: "Communication Services",
    netMargin:   { p25: 0.04, p50: 0.10, p75: 0.18, p90: 0.26 },
    opMargin:    { p25: 0.07, p50: 0.15, p75: 0.24, p90: 0.32 },
    grossMargin: { p25: 0.30, p50: 0.48, p75: 0.62, p90: 0.75 },
    roic:        { p25: 0.06, p50: 0.12, p75: 0.20, p90: 0.32 },
    fcfMargin:   { p25: 0.05, p50: 0.12, p75: 0.20, p90: 0.30 },
    revCagr:     { p25: 0.02, p50: 0.06, p75: 0.12, p90: 0.20 },
    fcfCagr:     { p25: 0.03, p50: 0.08, p75: 0.15, p90: 0.25 },
    debtEquity:  { p25: 0.20, p50: 0.60, p75: 1.20, p90: 2.50 },
    wacc: 0.085, isMature: false, maxPayoutFcf: 0.45,
  },
  default: {
    label: "Market",
    netMargin:   { p25: 0.04, p50: 0.09, p75: 0.15, p90: 0.22 },
    opMargin:    { p25: 0.07, p50: 0.13, p75: 0.20, p90: 0.28 },
    grossMargin: { p25: 0.25, p50: 0.42, p75: 0.58, p90: 0.70 },
    roic:        { p25: 0.07, p50: 0.13, p75: 0.20, p90: 0.30 },
    fcfMargin:   { p25: 0.05, p50: 0.10, p75: 0.17, p90: 0.25 },
    revCagr:     { p25: 0.02, p50: 0.06, p75: 0.12, p90: 0.20 },
    fcfCagr:     { p25: 0.03, p50: 0.07, p75: 0.13, p90: 0.22 },
    debtEquity:  { p25: 0.20, p50: 0.50, p75: 1.00, p90: 2.00 },
    wacc: 0.09, isMature: false, maxPayoutFcf: 0.50,
  },
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function lerp(a: number, b: number, t: number) { return a + (b - a) * clamp(t, 0, 1); }

function weightedAvg(scores: [number, number][]): number {
  const tw = scores.reduce((s, [, w]) => s + w, 0);
  return tw === 0 ? 0 : scores.reduce((s, [v, w]) => s + v * w, 0) / tw;
}

export function gradeFromScore(s: number): QualityGrade {
  if (s >= 90) return "A+";
  if (s >= 78) return "A";
  if (s >= 65) return "B";
  if (s >= 50) return "C";
  if (s >= 35) return "D";
  return "F";
}

/** Maps overall score → approximate top-X% sector rank. */
function scoreToSectorPercentile(s: number): number {
  if (s >= 90) return 5;
  if (s >= 80) return 10;
  if (s >= 70) return 20;
  if (s >= 60) return 35;
  if (s >= 50) return 50;
  if (s >= 40) return 65;
  return 80;
}

/**
 * Score a metric value as a sector-relative percentile (0–100).
 * Uses linear interpolation between the empirical percentile breakpoints.
 * `lowerIsBetter`: inverts the scale (e.g. D/E ratio).
 */
function spScore(value: number, p: MetricP, lowerIsBetter = false): number {
  const v = lowerIsBetter ? -value : value;
  const { p25, p50, p75, p90 } = lowerIsBetter
    ? { p25: -p.p90, p50: -p.p75, p75: -p.p50, p90: -p.p25 }
    : p;

  // Below zero with positive benchmarks → proportional penalty
  if (v <= 0 && p25 > 0) return clamp(10 + v / p25 * 10, 0, 10);
  if (v < p25) return lerp(0, 25, v / p25);
  if (v < p50) return lerp(25, 50, (v - p25) / (p50 - p25));
  if (v < p75) return lerp(50, 75, (v - p50) / (p75 - p50));
  if (v < p90) return lerp(75, 90, (v - p75) / (p90 - p75));
  // Above p90: scale toward 100
  return clamp(lerp(90, 100, (v - p90) / (p90 * 0.6)), 90, 100);
}

function pct(v: number | null, decimals = 1): string {
  return v === null ? "N/A" : `${(v * 100).toFixed(decimals)}%`;
}
function fmtX(v: number | null): string {
  return v === null ? "N/A" : `${v.toFixed(1)}x`;
}

function sortAsc<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ─── Mode & window ────────────────────────────────────────────────────────────

/** Standard = 4 rows (Yahoo); Deep = 11 rows (enables 10Y CAGR = 11 - 1). */
const WINDOW: Record<QualityMode, number> = { standard: 4, deep: 11 };

function detectMode(annual: { date: string }[]): QualityMode {
  return annual.length >= 8 ? "deep" : "standard";
}

function trimAnnual<T extends { date: string }>(rows: T[], mode: QualityMode): T[] {
  return sortAsc(rows).slice(-WINDOW[mode]);
}

// ─── Sector detection ─────────────────────────────────────────────────────────

function detectSectorKey(sector = "", industry = ""): SectorKey {
  const s = sector.toLowerCase();
  const i = industry.toLowerCase();
  if (s.includes("tech") || i.includes("software") || i.includes("semiconductor") || i.includes("it ")) return "technology";
  if (s.includes("health") || i.includes("pharma") || i.includes("biotech") || i.includes("medical")) return "healthcare";
  if (s.includes("financial") || i.includes("bank") || i.includes("insur") || i.includes("asset man")) return "financials";
  if (s.includes("consumer defensive") || s.includes("consumer staples") || i.includes("food") || i.includes("beverage")) return "consumer_staples";
  if (s.includes("consumer cyclical") || s.includes("consumer discretionary") || i.includes("retail") || i.includes("apparel")) return "consumer_discretionary";
  if (s.includes("industrial") || i.includes("aerospace") || i.includes("defense") || i.includes("machinery")) return "industrials";
  if (s.includes("energy") || i.includes("oil") || i.includes("gas") || i.includes("petroleum")) return "energy";
  if (s.includes("utilit") || i.includes("electric") || i.includes("water utility")) return "utilities";
  if (s.includes("material") || s.includes("basic material") || i.includes("chemical") || i.includes("mining")) return "materials";
  if (s.includes("real estate") || i.includes("reit")) return "real_estate";
  if (s.includes("communication") || i.includes("media") || i.includes("entertainment") || i.includes("telecom")) return "communication";
  return "default";
}

// ─── WACC estimation ──────────────────────────────────────────────────────────

function estimateWACC(
  benchmarkWacc: number,
  beta: number | undefined,
  latestIncome: IncomeStatement | undefined,
  latestBalance: BalanceSheet | undefined
): number {
  // CAPM beta adjustment: ±2% per unit of beta above/below 1.0
  const betaAdj = beta ? clamp((beta - 1.0) * 0.02, -0.025, 0.04) : 0;

  // Debt cost overlay (after-tax kd * debt weight, partial blend)
  let debtAdj = 0;
  if (latestBalance && latestIncome && latestBalance.long_term_debt > 0) {
    const kd = Math.abs(latestIncome.interest_expense) / latestBalance.long_term_debt;
    const aftertaxKd = kd * 0.79; // 21% corporate tax
    const v = latestBalance.total_equity + latestBalance.long_term_debt;
    if (v > 0) debtAdj = (latestBalance.long_term_debt / v) * aftertaxKd * 0.25;
  }

  return clamp(benchmarkWacc + betaAdj + debtAdj, 0.04, 0.20);
}

// ─── Earnings quality analysis ────────────────────────────────────────────────

interface EarningsQuality {
  avgConversion: number;   // mean FCF / Net Income
  isHighQuality: boolean;  // conversion > 1.0 in ≥75% of years
  hasDivergence: boolean;  // revenue & FCF up but EPS down (non-recurring signal)
}

function analyzeEarningsQuality(
  income: IncomeStatement[],
  cashflow: CashFlowStatement[]
): EarningsQuality {
  const n = Math.min(income.length, cashflow.length);
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    const ni = income[i]!.net_income;
    const fcf = cashflow[i]!.free_cash_flow;
    if (ni > 0 && Number.isFinite(fcf)) ratios.push(fcf / ni);
  }
  const avgConversion = ratios.length ? ratios.reduce((s, v) => s + v, 0) / ratios.length : 1;
  const highQualityYears = ratios.filter(r => r > 0.8).length;
  const isHighQuality = avgConversion > 1.0 && highQualityYears >= ratios.length * 0.70;

  // Divergence: revenue & FCF growing, EPS shrinking
  let hasDivergence = false;
  if (n >= 3) {
    const first = income[0]!; const last = income[n - 1]!;
    const firstCf = cashflow[0]!; const lastCf = cashflow[n - 1]!;
    const revGrowth  = first.revenue > 0 ? (last.revenue / first.revenue) - 1 : 0;
    const fcfGrowth  = firstCf.free_cash_flow > 0 ? (lastCf.free_cash_flow / firstCf.free_cash_flow) - 1 : 0;
    const epsGrowth  = first.eps_diluted > 0 ? (last.eps_diluted / first.eps_diluted) - 1 : 0;
    hasDivergence = revGrowth > 0.05 && fcfGrowth > 0.02 && epsGrowth < -0.10;
  }

  return { avgConversion, isHighQuality, hasDivergence };
}

// ─── Coefficient of variation (stability metric) ─────────────────────────────

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (Math.abs(mean) < 0.001) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

// ─── ROIC calculation ─────────────────────────────────────────────────────────

function computeROIC(
  income: IncomeStatement,
  balance: BalanceSheet
): number | null {
  const nopat = income.operating_income * (1 - (income.income_tax > 0 && income.pre_tax_income > 0
    ? income.income_tax / income.pre_tax_income : 0.21));
  const investedCapital = balance.total_equity + balance.long_term_debt - balance.cash_and_equivalents;
  return investedCapital > 0 ? nopat / investedCapital : null;
}

// ─── 1. Profitability ─────────────────────────────────────────────────────────

function scoreProfitability(
  income: IncomeStatement[],
  balance: BalanceSheet[],
  bm: SectorBenchmarks,
  wacc: number,
  eq: EarningsQuality,
  mode: QualityMode
): QualityDimension {
  const latest    = income.at(-1);
  const latestBal = balance.at(-1);
  if (!latest || !latestBal) return emptyDimension("profitability", "Profitability");

  const grossMargin = latest.revenue > 0 ? latest.gross_profit / latest.revenue : null;
  const opMargin    = latest.revenue > 0 ? latest.operating_income / latest.revenue : null;
  const netMargin   = latest.revenue > 0 ? latest.net_income / latest.revenue : null;
  const roic        = computeROIC(latest, latestBal);

  // ROIC vs WACC spread (the "moat" indicator)
  const roicWaccSpread = roic !== null ? roic - wacc : null;
  const isValueCreator = roicWaccSpread !== null && roicWaccSpread > 0;

  // Sector-relative scores
  const grossScore = grossMargin !== null ? spScore(grossMargin, bm.grossMargin) : 50;
  const opScore    = opMargin    !== null ? spScore(opMargin,    bm.opMargin)    : 50;
  const roicScore  = roic        !== null ? spScore(roic,        bm.roic)        : 50;

  // Net margin score — but boost if FCF quality is high (earnings are understated)
  let netScore = netMargin !== null ? spScore(netMargin, bm.netMargin) : 50;
  if (eq.isHighQuality && netScore < 60) {
    // FCF/NI > 1: GAAP earnings are understated → soft floor of 50
    netScore = Math.max(netScore, 50);
  }
  if (eq.hasDivergence && netScore < 55) {
    // Revenue & FCF growing despite depressed EPS → non-recurring charge
    netScore = Math.max(netScore, 55);
  }

  // ROIC vs WACC spread score (0–100)
  let spreadScore = 50;
  if (roicWaccSpread !== null) {
    if (roicWaccSpread >= 0.20) spreadScore = 100;
    else if (roicWaccSpread >= 0.10) spreadScore = lerp(80, 100, (roicWaccSpread - 0.10) / 0.10);
    else if (roicWaccSpread >= 0.05) spreadScore = lerp(65, 80, (roicWaccSpread - 0.05) / 0.05);
    else if (roicWaccSpread >= 0)    spreadScore = lerp(55, 65, roicWaccSpread / 0.05);
    else if (roicWaccSpread >= -0.05) spreadScore = lerp(35, 55, (roicWaccSpread + 0.05) / 0.05);
    else spreadScore = clamp(35 + roicWaccSpread * 100, 0, 35);
  }

  // Margin trend (recent 2 years vs prior 2 years)
  let marginTrendScore = 50;
  if (income.length >= 4) {
    const recentMargins = income.slice(-2).map(is => is.revenue > 0 ? is.net_income / is.revenue : null).filter((v): v is number => v !== null);
    const olderMargins  = income.slice(0, 2).map(is => is.revenue > 0 ? is.net_income / is.revenue : null).filter((v): v is number => v !== null);
    if (recentMargins.length && olderMargins.length) {
      const recentAvg = recentMargins.reduce((s, v) => s + v, 0) / recentMargins.length;
      const olderAvg  = olderMargins.reduce((s, v) => s + v, 0) / olderMargins.length;
      marginTrendScore = recentAvg > olderAvg ? 75 : recentAvg > olderAvg * 0.90 ? 50 : 25;
    }
  }

  // Deep mode: add consistency bonus (margin stability over 10Y)
  let consistencyBonus = 0;
  if (mode === "deep" && income.length >= 6) {
    const netMargins = income.map(is => is.revenue > 0 ? is.net_income / is.revenue : null).filter((v): v is number => v !== null);
    const cv = coefficientOfVariation(netMargins);
    if (cv !== null) {
      // Lower CV = more consistent = bonus
      consistencyBonus = cv < 0.2 ? 5 : cv < 0.4 ? 2 : 0;
    }
  }

  // Weights: ROIC spread is the king metric (40%), then ROIC absolute (20%),
  // op margin (15%), gross margin (10%), net margin (10%), trend (5%)
  const score = clamp(
    weightedAvg([
      [spreadScore, 40],
      [roicScore,   20],
      [opScore,     15],
      [grossScore,  10],
      [netScore,    10],
      [marginTrendScore, 5],
    ]) + consistencyBonus
  );

  const trendLabel = marginTrendScore >= 65 ? "Improving" : marginTrendScore >= 45 ? "Stable" : "Declining";
  const roicVsWaccLabel = isValueCreator
    ? `ROIC +${pct(roicWaccSpread)} above WACC`
    : roicWaccSpread !== null
      ? `ROIC ${pct(roicWaccSpread)} below WACC`
      : "N/A";

  return {
    key: "profitability", name: "Profitability",
    score, grade: gradeFromScore(score),
    summary: `ROIC ${pct(roic)} · Net Margin ${pct(netMargin)} · ${trendLabel}`,
    metrics: [
      {
        label: "ROIC vs WACC Spread",
        value: roicWaccSpread !== null ? `${roicWaccSpread >= 0 ? "+" : ""}${pct(roicWaccSpread)}` : "N/A",
        score: spreadScore,
        tooltip: `ROIC minus estimated WACC (${pct(wacc, 1)}). Positive spread = the business earns more on capital than it costs → economic value creation. Primary profitability signal.`,
      },
      {
        label: "ROIC (Return on Invested Capital)",
        value: pct(roic),
        score: roicScore,
        tooltip: "NOPAT ÷ Invested Capital. Sector-relative percentile. Reflects true capital efficiency regardless of accounting choices.",
      },
      {
        label: "Operating Margin",
        value: pct(opMargin),
        score: opScore,
        tooltip: `Operating income ÷ Revenue. Scored vs ${bm.label} sector peers. Reflects business efficiency before financing costs.`,
      },
      {
        label: "Gross Margin",
        value: pct(grossMargin),
        score: grossScore,
        tooltip: `Gross Profit ÷ Revenue. Scored vs ${bm.label} sector peers. High gross margins indicate pricing power and structural competitive advantage.`,
      },
      {
        label: "Net Margin",
        value: pct(netMargin),
        score: netScore,
        tooltip: eq.isHighQuality
          ? `Net Income ÷ Revenue. Score floored upward: FCF/NI conversion (${eq.avgConversion.toFixed(2)}×) indicates earnings are understated by non-cash charges.`
          : `Net Income ÷ Revenue. Sector-relative percentile vs ${bm.label} peers.`,
      },
      {
        label: "Margin Trend",
        value: trendLabel,
        score: marginTrendScore,
        tooltip: "Compares average net margin of the most recent 2 years vs the earliest 2 years in the analysis window.",
      },
    ],
  };
}

// ─── 2. Growth ────────────────────────────────────────────────────────────────

function scoreGrowth(
  income: IncomeStatement[],
  cashflow: CashFlowStatement[],
  bm: SectorBenchmarks,
  mode: QualityMode
): QualityDimension {
  const revSeries = income.map(is => is.revenue);
  const epsSeries = income.map(is => is.eps_diluted).filter(v => v > 0);
  const fcfSeries = cashflow.map(cf => cf.free_cash_flow).filter(v => v > 0);

  // Choose best available CAGR window depending on mode
  const maxYears  = mode === "deep" ? 5 : 3;
  const tryWindow = (series: number[]): number | null => {
    for (let y = maxYears; y >= 3; y--) {
      const c = calculateCAGR(series, y as 3 | 5 | 10);
      if (c !== null) return c;
    }
    return calculateCAGR(series, 3);
  };

  const revCAGR = tryWindow(revSeries);
  const epsCAGR = tryWindow(epsSeries);
  const fcfCAGR = tryWindow(fcfSeries);

  // Deep mode extras: 10Y CAGR durability + consistency score
  let revCAGR10: number | null = null;
  let consistencyScore = 50;
  if (mode === "deep" && income.length >= 8) {
    revCAGR10 = calculateCAGR(revSeries, 10) ?? calculateCAGR(revSeries, 5);
    const positiveGrowthYears = income.slice(1).filter((is, idx) => is.revenue > income[idx]!.revenue).length;
    const growthRate = positiveGrowthYears / (income.length - 1);
    consistencyScore = lerp(0, 100, growthRate); // % of years with positive revenue growth
  }

  const window = mode === "deep" ? "5Y" : "3Y";

  const revScore = revCAGR !== null ? spScore(revCAGR, bm.revCagr) : 25;
  const fcfScore = fcfCAGR !== null ? spScore(fcfCAGR, bm.fcfCagr) : 25;

  // EPS growth score — FCF prioritized (EPS can be distorted)
  // We blend EPS score with FCF score; if EPS is negative but FCF is growing, FCF dominates
  let epsScore = epsCAGR !== null ? spScore(epsCAGR, bm.revCagr) : 25;
  if (fcfCAGR !== null && fcfCAGR > 0.05 && (epsCAGR === null || epsCAGR < 0)) {
    // FCF growing strongly but EPS depressed → use FCF score as floor for EPS component
    epsScore = Math.max(epsScore, fcfScore * 0.7);
  }

  const weights: [number, number][] = [
    [revScore,         30],
    [fcfScore,         35], // FCF CAGR is gold standard
    [epsScore,         20],
    [consistencyScore, 15], // consistency only counts in deep mode (else fixed 50)
  ];
  const score = clamp(weightedAvg(weights));

  return {
    key: "growth", name: "Growth",
    score, grade: gradeFromScore(score),
    summary: `Rev ${pct(revCAGR)} · EPS ${pct(epsCAGR)} · FCF ${pct(fcfCAGR)} (${window} CAGR)`,
    metrics: [
      {
        label: `FCF Growth (${window} CAGR)`,
        value: pct(fcfCAGR),
        score: fcfScore,
        tooltip: `Compound Annual Growth Rate of Free Cash Flow over ${window}. Harder to manipulate than earnings — the gold standard of quality growth. Scored vs ${bm.label} peers.`,
      },
      {
        label: `Revenue Growth (${window} CAGR)`,
        value: pct(revCAGR),
        score: revScore,
        tooltip: `Compound Annual Growth Rate of Revenue over ${window}. Scored vs ${bm.label} sector peers. Persistent top-line growth validates business momentum.`,
      },
      {
        label: `EPS Growth (${window} CAGR)`,
        value: pct(epsCAGR),
        score: epsScore,
        tooltip: epsCAGR !== null && epsCAGR < 0 && fcfCAGR !== null && fcfCAGR > 0.05
          ? "EPS is negative/declining while FCF is growing — likely non-recurring charges. Score adjusted upward based on FCF quality."
          : `Diluted EPS CAGR over ${window}. Scored alongside FCF growth to weight cash earnings more heavily.`,
      },
      ...(mode === "deep" ? [{
        label: "Growth Consistency (10Y)",
        value: income.length >= 2
          ? `${Math.round((income.slice(1).filter((is, idx) => is.revenue > income[idx]!.revenue).length / (income.length - 1)) * 100)}% of years`
          : "N/A",
        score: consistencyScore,
        tooltip: "Percentage of years (over the 10Y window) in which revenue grew vs the prior year. Consistent growers score highest.",
      }] : []),
    ],
  };
}

// ─── 3. Financial Health ──────────────────────────────────────────────────────

function scoreFinancialHealth(
  income: IncomeStatement[],
  balance: BalanceSheet[],
  bm: SectorBenchmarks,
  mode: QualityMode
): QualityDimension {
  const latestBal = balance.at(-1);
  const latestInc = income.at(-1);
  if (!latestBal) return emptyDimension("financialHealth", "Financial Health");

  const debtEquity     = latestBal.total_equity > 0 ? latestBal.long_term_debt / latestBal.total_equity : null;
  const netDebt        = latestBal.long_term_debt - latestBal.cash_and_equivalents;
  const netDebtEBITDA  = latestInc && latestInc.ebitda > 0 ? netDebt / latestInc.ebitda : null;
  const intCoverage    = latestInc && Math.abs(latestInc.interest_expense) > 0
    ? latestInc.operating_income / Math.abs(latestInc.interest_expense) : null;
  const currentRatio   = latestBal.total_current_liabilities > 0
    ? latestBal.total_current_assets / latestBal.total_current_liabilities : null;

  // D/E: sector-relative (Financials/Utilities tolerate higher leverage)
  const deScore = debtEquity !== null ? spScore(debtEquity, bm.debtEquity, true) : 50;

  // Net Debt / EBITDA: absolute thresholds (universal concept)
  let ndScore = 60;
  if (netDebtEBITDA !== null) {
    ndScore = netDebt <= 0
      ? 100
      : clamp(scoreAbsolute(netDebtEBITDA, [[0, 100], [1, 85], [2, 70], [3, 50], [4, 30], [6, 10]]));
  }

  // Interest coverage: absolute (>5× is universally safe)
  let covScore = 70; // assume safe if no interest expense
  if (intCoverage !== null) {
    covScore = clamp(scoreAbsolute(intCoverage, [[0, 5], [2, 20], [3, 40], [5, 60], [8, 75], [12, 90], [20, 100]]));
  }

  // Current ratio
  let crScore = 60;
  if (currentRatio !== null) {
    crScore = clamp(scoreAbsolute(currentRatio, [[0.5, 10], [0.8, 30], [1.0, 55], [1.5, 80], [2.0, 95], [3.0, 100]]));
  }

  // Deep mode: leverage trend (is debt/equity improving over time?)
  let leverageTrendScore = 50;
  if (mode === "deep" && balance.length >= 4) {
    const deHistory = balance
      .filter(b => b.total_equity > 0)
      .map(b => b.long_term_debt / b.total_equity);
    if (deHistory.length >= 4) {
      const recentDe = deHistory.slice(-2).reduce((s, v) => s + v, 0) / 2;
      const olderDe  = deHistory.slice(0, 2).reduce((s, v) => s + v, 0) / 2;
      leverageTrendScore = recentDe < olderDe * 0.9 ? 80 : recentDe < olderDe * 1.1 ? 50 : 25;
    }
  }

  const weights: [number, number][] = mode === "deep"
    ? [[deScore, 25], [ndScore, 28], [covScore, 22], [crScore, 13], [leverageTrendScore, 12]]
    : [[deScore, 30], [ndScore, 30], [covScore, 25], [crScore, 15]];

  const score = clamp(weightedAvg(weights));

  return {
    key: "financialHealth", name: "Financial Health",
    score, grade: gradeFromScore(score),
    summary: debtEquity !== null
      ? `D/E ${debtEquity.toFixed(1)}x · Coverage ${fmtX(intCoverage)} · ${netDebt <= 0 ? "Net Cash" : `Net Debt/EBITDA ${fmtX(netDebtEBITDA)}`}`
      : "Insufficient data",
    metrics: [
      {
        label: "Debt / Equity",
        value: debtEquity !== null ? `${debtEquity.toFixed(1)}x` : "N/A",
        score: deScore,
        tooltip: `Long-term Debt ÷ Equity. Scored relative to ${bm.label} sector peers — capital-intensive sectors naturally carry more leverage.`,
      },
      {
        label: "Net Debt / EBITDA",
        value: netDebt <= 0 ? "Net Cash" : fmtX(netDebtEBITDA),
        score: ndScore,
        tooltip: "Years of EBITDA needed to repay net debt. Universal threshold: < 2× healthy, > 4× concerning. Net cash position scores 100.",
      },
      {
        label: "Interest Coverage",
        value: intCoverage !== null ? `${intCoverage.toFixed(1)}x` : "No interest expense",
        score: covScore,
        tooltip: "Operating Income ÷ Interest Expense. > 5× provides a comfortable safety margin. Companies with no debt score as safe.",
      },
      {
        label: "Current Ratio",
        value: fmtX(currentRatio),
        score: crScore,
        tooltip: "Current Assets ÷ Current Liabilities. > 1.5× suggests healthy short-term liquidity.",
      },
      ...(mode === "deep" ? [{
        label: "Leverage Trend (10Y)",
        value: leverageTrendScore >= 65 ? "Improving" : leverageTrendScore >= 40 ? "Stable" : "Increasing",
        score: leverageTrendScore,
        tooltip: "Whether the D/E ratio has improved (decreased) over the 10-year window vs earlier periods.",
      }] : []),
    ],
  };
}

// ─── 4. Cash Generation ───────────────────────────────────────────────────────

function scoreCashGeneration(
  income: IncomeStatement[],
  cashflow: CashFlowStatement[],
  quote: StockQuote,
  bm: SectorBenchmarks,
  eq: EarningsQuality,
  mode: QualityMode
): QualityDimension {
  const latestInc = income.at(-1);
  const latestCF  = cashflow.at(-1);

  const fcfMargin = latestInc && latestCF && latestInc.revenue > 0
    ? latestCF.free_cash_flow / latestInc.revenue : null;
  const fcfYield = latestCF && quote.price > 0 && quote.shares_outstanding > 0
    ? latestCF.free_cash_flow / (quote.price * quote.shares_outstanding) : null;

  const fcfMarginScore = fcfMargin !== null ? spScore(fcfMargin, bm.fcfMargin)  : 30;
  const fcfYieldScore  = fcfYield  !== null
    ? clamp(scoreAbsolute(fcfYield, [[0.01, 20], [0.02, 40], [0.03, 55], [0.04, 70], [0.06, 85], [0.08, 95], [0.10, 100]]))
    : 40;

  // FCF / NI conversion (higher = better cash quality)
  const convScore = clamp(scoreAbsolute(eq.avgConversion,
    [[0.4, 10], [0.6, 30], [0.8, 55], [0.95, 70], [1.05, 82], [1.2, 92], [1.5, 100]]));

  // FCF trend (recent 2 vs earlier 2)
  let fcfTrendScore = 50;
  if (cashflow.length >= 4) {
    const recent = cashflow.slice(-2).map(c => c.free_cash_flow);
    const older  = cashflow.slice(0, 2).map(c => c.free_cash_flow);
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg  = older.reduce((s, v) => s + v, 0) / older.length;
    fcfTrendScore = recentAvg > olderAvg * 1.1 ? 80 : recentAvg > olderAvg * 0.9 ? 55 : 25;
  }

  // Deep mode: FCF stability (coefficient of variation)
  let stabilityScore = 50;
  if (mode === "deep" && cashflow.length >= 6) {
    const fcfValues = cashflow.map(c => c.free_cash_flow).filter(v => v > 0);
    const cv = coefficientOfVariation(fcfValues);
    // Low CV = stable = high score
    stabilityScore = cv === null ? 50 : clamp(lerp(100, 0, cv / 1.5));
  }

  const weights: [number, number][] = mode === "deep"
    ? [[fcfMarginScore, 25], [fcfYieldScore, 20], [convScore, 25], [fcfTrendScore, 15], [stabilityScore, 15]]
    : [[fcfMarginScore, 30], [fcfYieldScore, 30], [convScore, 25], [fcfTrendScore, 15]];

  const score = clamp(weightedAvg(weights));

  return {
    key: "cashGeneration", name: "Cash Generation",
    score, grade: gradeFromScore(score),
    summary: `FCF Margin ${pct(fcfMargin)} · FCF Yield ${pct(fcfYield)} · Conversion ${eq.avgConversion.toFixed(1)}×`,
    metrics: [
      {
        label: "FCF Margin",
        value: pct(fcfMargin),
        score: fcfMarginScore,
        tooltip: `Free Cash Flow ÷ Revenue. Scored vs ${bm.label} sector peers. > 15% generally signals a capital-light, highly profitable business.`,
      },
      {
        label: "FCF Yield",
        value: pct(fcfYield),
        score: fcfYieldScore,
        tooltip: "FCF ÷ Market Cap. Functions as a real-earnings yield. > 4% is attractive relative to current bond yields.",
      },
      {
        label: "FCF / Net Income Conversion",
        value: `${eq.avgConversion.toFixed(2)}×`,
        score: convScore,
        tooltip: "Average FCF ÷ Net Income over the analysis window. > 1× means cash generation exceeds reported earnings — strong earnings quality signal. < 0.8× may indicate aggressive accruals.",
      },
      {
        label: "FCF Trend",
        value: fcfTrendScore >= 65 ? "Improving" : fcfTrendScore >= 40 ? "Stable" : "Declining",
        score: fcfTrendScore,
        tooltip: "Compares average FCF of the most recent 2 years vs the earliest 2 years in the window.",
      },
      ...(mode === "deep" ? [{
        label: "FCF Stability (10Y)",
        value: stabilityScore >= 70 ? "High" : stabilityScore >= 45 ? "Moderate" : "Low",
        score: stabilityScore,
        tooltip: "Coefficient of variation of annual FCF over 10 years. Low volatility in cash generation commands a premium — it means the business model is durable.",
      }] : []),
    ],
  };
}

// ─── 5. Capital Allocation ────────────────────────────────────────────────────

function scoreCapitalAllocation(
  income: IncomeStatement[],
  balance: BalanceSheet[],
  cashflow: CashFlowStatement[],
  bm: SectorBenchmarks,
  mode: QualityMode
): QualityDimension {
  const latestCF  = cashflow.at(-1);
  const latestInc = income.at(-1);

  // Share count trend (always from oldest to newest in the trimmed window)
  const shareSeries = balance.map(b => b.shares_outstanding).filter(v => v > 0);
  const sharesFirst = shareSeries.at(0);
  const sharesLast  = shareSeries.at(-1);
  const shareReduction = sharesFirst && sharesLast && sharesFirst > 0
    ? (sharesFirst - sharesLast) / sharesFirst : null;

  // Payout ratio vs FCF (not net income — avoids accounting distortions)
  const fcfPayoutRatio = latestCF && latestCF.free_cash_flow > 0
    ? Math.abs(latestCF.dividends_paid) / latestCF.free_cash_flow : null;

  // Returns / FCF: (dividends + buybacks) / FCF
  const totalReturns = latestCF
    ? Math.abs(latestCF.dividends_paid) + Math.abs(latestCF.share_repurchases) : 0;
  const returnRatio = latestCF && latestCF.free_cash_flow > 0
    ? totalReturns / latestCF.free_cash_flow : null;

  // CapEx efficiency: FCF / Operating CF
  const capexEff = latestCF && latestCF.operating_cash_flow > 0
    ? latestCF.free_cash_flow / latestCF.operating_cash_flow : null;

  // Buyback score
  const buybackScore = shareReduction !== null
    ? clamp(scoreAbsolute(shareReduction, [[-0.05, 10], [0.0, 30], [0.02, 50], [0.05, 70], [0.10, 90], [0.15, 100]]))
    : 40;

  // Dynamic payout score — sector-aware
  let payoutScore = 60;
  if (fcfPayoutRatio !== null) {
    const maxOk = bm.maxPayoutFcf;
    if (fcfPayoutRatio <= 0.001) {
      // No dividend: neutral for mature sectors, good for growth sectors
      payoutScore = bm.isMature ? 55 : 65;
    } else if (fcfPayoutRatio <= maxOk) {
      // Within acceptable range → good score (75–95)
      payoutScore = lerp(75, 95, 1 - fcfPayoutRatio / maxOk);
    } else if (fcfPayoutRatio <= maxOk * 1.2) {
      // Slightly above: moderate penalty
      payoutScore = lerp(50, 75, 1 - (fcfPayoutRatio - maxOk) / (maxOk * 0.2));
    } else {
      // Clearly unsustainable FCF payout → strong penalty
      payoutScore = clamp(50 - (fcfPayoutRatio - maxOk * 1.2) * 100, 0, 50);
    }
  }

  const returnRatioScore = returnRatio !== null
    ? clamp(scoreAbsolute(returnRatio, [[0, 30], [0.1, 45], [0.3, 65], [0.5, 80], [0.7, 90], [0.9, 75]]))
    : 50;

  const capexScore = capexEff !== null
    ? clamp(scoreAbsolute(capexEff, [[0, 10], [0.5, 40], [0.7, 65], [0.8, 80], [0.9, 92], [0.95, 100]]))
    : 50;

  // Deep mode: buyback consistency
  let buybackConsistency = 50;
  if (mode === "deep" && cashflow.length >= 6) {
    const buybackYears = cashflow.filter(cf => Math.abs(cf.share_repurchases) > 0).length;
    buybackConsistency = lerp(0, 100, buybackYears / cashflow.length);
  }

  const weights: [number, number][] = mode === "deep"
    ? [[buybackScore, 25], [payoutScore, 20], [returnRatioScore, 20], [capexScore, 20], [buybackConsistency, 15]]
    : [[buybackScore, 30], [payoutScore, 20], [returnRatioScore, 25], [capexScore, 25]];

  const score = clamp(weightedAvg(weights));

  const buybackLabel = shareReduction !== null
    ? shareReduction > 0.05 ? "Active buybacks" : shareReduction > 0.01 ? "Modest buybacks" : "Share dilution"
    : "N/A";

  return {
    key: "capitalAllocation", name: "Capital Allocation",
    score, grade: gradeFromScore(score),
    summary: [
      buybackLabel,
      fcfPayoutRatio !== null ? `FCF payout ${pct(fcfPayoutRatio)}` : null,
      capexEff !== null ? `CapEx eff. ${pct(capexEff)}` : null,
    ].filter(Boolean).join(" · ") || "Insufficient data",
    metrics: [
      {
        label: "Share Count Trend",
        value: shareReduction !== null
          ? `${shareReduction >= 0 ? "−" : "+"}${pct(Math.abs(shareReduction))} ${shareReduction >= 0 ? "(reduction)" : "(dilution)"}`
          : "N/A",
        score: buybackScore,
        tooltip: `Change in shares outstanding across the ${mode === "deep" ? "10Y" : "4Y"} analysis window. Reduction signals buybacks (shareholder-friendly); dilution may indicate equity financing.`,
      },
      {
        label: "Dividend Payout (vs FCF)",
        value: fcfPayoutRatio !== null ? pct(fcfPayoutRatio) : "No dividend",
        score: payoutScore,
        tooltip: `Dividends paid ÷ Free Cash Flow. Evaluated dynamically: max acceptable FCF payout for ${bm.label} sector = ${pct(bm.maxPayoutFcf)}. Payout vs FCF (not net income) avoids accounting distortions.`,
      },
      {
        label: "Returns / FCF",
        value: pct(returnRatio),
        score: returnRatioScore,
        tooltip: "(Dividends + Buybacks) ÷ Free Cash Flow. 30–90% is healthy. > 100% means the company is returning more than it earns — not sustainable long term.",
      },
      {
        label: "CapEx Efficiency",
        value: pct(capexEff),
        score: capexScore,
        tooltip: "Free Cash Flow ÷ Operating Cash Flow. High values indicate that little capital is consumed sustaining the business — a capital-light model.",
      },
      ...(mode === "deep" ? [{
        label: "Buyback Consistency (10Y)",
        value: `${cashflow.filter(cf => Math.abs(cf.share_repurchases) > 0).length} / ${cashflow.length} years`,
        score: buybackConsistency,
        tooltip: "Number of years (out of 10) in which the company repurchased shares. Consistent buybacks signal capital discipline and confidence in the business.",
      }] : []),
    ],
  };
}

// ─── Absolute threshold helper (retained for non-sector metrics) ──────────────

function scoreAbsolute(value: number, breakpoints: [number, number][]): number {
  if (breakpoints.length === 0) return 0;
  if (value <= breakpoints[0]![0]) return 0;
  if (value >= breakpoints.at(-1)![0]) return breakpoints.at(-1)![1];
  for (let i = 1; i < breakpoints.length; i++) {
    const [v0, s0] = breakpoints[i - 1]!;
    const [v1, s1] = breakpoints[i]!;
    if (value >= v0 && value <= v1) {
      return s0 + ((value - v0) / (v1 - v0)) * (s1 - s0);
    }
  }
  return 0;
}

// ─── Empty dimension fallback ─────────────────────────────────────────────────

function emptyDimension(key: string, name: string): QualityDimension {
  return { key, name, score: 0, grade: "F", metrics: [], summary: "Insufficient data" };
}

// ─── Quality flags ────────────────────────────────────────────────────────────

function computeFlags(
  eq: EarningsQuality,
  roic: number | null,
  wacc: number,
  netDebt: number,
  ebitda: number,
  marginsDecline: boolean
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (eq.hasDivergence)        flags.push("non_recurring_charges");
  if (eq.isHighQuality)        flags.push("high_cash_quality");
  if (roic !== null && roic > wacc + 0.01) flags.push("value_creator");
  if (marginsDecline)          flags.push("margin_compression");
  if (ebitda > 0 && netDebt / ebitda > 3) flags.push("leverage_risk");
  return flags;
}

// ─── Headline labels ──────────────────────────────────────────────────────────

const HEADLINES: Record<QualityGrade, string> = {
  "A+": "Exceptional Business",
  A:   "High-Quality Business",
  B:   "Good Business",
  C:   "Average Business",
  D:   "Below Average",
  F:   "Poor Quality",
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const DIMENSION_WEIGHTS = [
  0.30, // Profitability  (ROIC vs WACC is king)
  0.22, // Growth
  0.20, // Financial Health
  0.18, // Cash Generation
  0.10, // Capital Allocation
] as const;

/**
 * Calculate the quality score.
 * Mode is auto-detected: ≥ 8 annual rows → deep (10Y), else standard (4Y).
 * Pass `profile` to enable sector-relative scoring.
 */
export function calculateQualityScore(
  financials: CompanyFinancials,
  quote: StockQuote,
  profile?: StockProfile | null
): QualityScoreResult {
  const incomeRaw   = sortAsc(financials.income_statement.annual);
  const balanceRaw  = sortAsc(financials.balance_sheet.annual);
  const cashflowRaw = sortAsc(financials.cash_flow.annual);

  // Auto-detect mode before trimming
  const mode = detectMode(incomeRaw);

  const income   = trimAnnual(incomeRaw,   mode);
  const balance  = trimAnnual(balanceRaw,  mode);
  const cashflow = trimAnnual(cashflowRaw, mode);

  // Sector context
  const sectorKey = detectSectorKey(profile?.sector ?? "", profile?.industry ?? "");
  const bm        = SECTOR_BENCHMARKS[sectorKey];

  // WACC
  const wacc = estimateWACC(bm.wacc, quote.beta, income.at(-1), balance.at(-1));

  // Earnings quality (run on full trimmed window)
  const eq = analyzeEarningsQuality(income, cashflow);

  // ROIC for flags
  const latestInc = income.at(-1);
  const latestBal = balance.at(-1);
  const roic      = latestInc && latestBal ? computeROIC(latestInc, latestBal) : null;

  // Net debt for leverage flag
  const netDebt = latestBal ? latestBal.long_term_debt - latestBal.cash_and_equivalents : 0;
  const ebitda  = latestInc?.ebitda ?? 0;

  // Margin compression flag
  let marginsDecline = false;
  if (income.length >= 4) {
    const getNetMargin = (is: IncomeStatement) => is.revenue > 0 ? is.net_income / is.revenue : null;
    const recent = [income.at(-1), income.at(-2)].map(is => is ? getNetMargin(is) : null).filter((v): v is number => v !== null);
    const older  = [income.at(0),  income.at(1) ].map(is => is ? getNetMargin(is) : null).filter((v): v is number => v !== null);
    if (recent.length && older.length) {
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg  = older.reduce((s, v) => s + v, 0) / older.length;
      marginsDecline = recentAvg < olderAvg * 0.85;
    }
  }

  const flags = computeFlags(eq, roic, wacc, netDebt, ebitda, marginsDecline);

  // Dimensions
  const dimensions = [
    scoreProfitability(income, balance, bm, wacc, eq, mode),
    scoreGrowth(income, cashflow, bm, mode),
    scoreFinancialHealth(income, balance, bm, mode),
    scoreCashGeneration(income, cashflow, quote, bm, eq, mode),
    scoreCapitalAllocation(income, balance, cashflow, bm, mode),
  ] as QualityScoreResult["dimensions"];

  const overall = clamp(
    dimensions.reduce((sum, dim, i) => sum + dim.score * DIMENSION_WEIGHTS[i], 0)
  );
  const grade = gradeFromScore(overall);

  return {
    overall,
    grade,
    headline: HEADLINES[grade],
    sectorPercentile: scoreToSectorPercentile(overall),
    sector: bm.label,
    mode,
    flags,
    dimensions,
  };
}
