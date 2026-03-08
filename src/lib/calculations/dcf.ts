// ============================================================
// DCF (Discounted Cash Flow) Calculation Engine
// Two-stage model: High Growth → Stable Growth + Terminal Value
// ============================================================

import type { CompanyFinancials } from "@/types/financials";
import type { StockQuote } from "@/types/stock";

export interface DCFInputs {
  /** Base revenue (TTM or last annual) */
  baseRevenue: number;
  /** Base FCF margin (decimal, e.g. 0.20 = 20%) */
  baseFCFMargin: number;
  /** Phase 1 revenue growth rate (decimal) */
  growthRatePhase1: number;
  /** Phase 2 revenue growth rate (decimal) */
  growthRatePhase2: number;
  /** Years in Phase 1 */
  yearsPhase1: number;
  /** Years in Phase 2 */
  yearsPhase2: number;
  /** Terminal FCF margin (decimal) — margin at maturity */
  terminalFCFMargin: number;
  /** Weighted average cost of capital (decimal) */
  wacc: number;
  /** Terminal / perpetuity growth rate (decimal) */
  terminalGrowthRate: number;
  /** Total debt outstanding */
  totalDebt: number;
  /** Cash and equivalents */
  cashAndEquivalents: number;
  /** Shares outstanding (diluted) */
  sharesOutstanding: number;
  /** Current stock price */
  currentPrice: number;
}

export interface DCFProjectionYear {
  year: number;
  phase: 1 | 2;
  revenue: number;
  revenueGrowth: number;
  fcfMargin: number;
  fcf: number;
  discountFactor: number;
  pvFCF: number;
}

export interface DCFResult {
  projections: DCFProjectionYear[];
  terminalFCF: number;
  terminalValue: number;
  pvTerminalValue: number;
  sumPVFCF: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  intrinsicValuePerShare: number;
  currentPrice: number;
  marginOfSafety: number;
  upside: number;
}

export type DCFScenarioKey = "bear" | "base" | "bull";

export interface DCFScenarioPreset {
  key: DCFScenarioKey;
  label: "Bear" | "Base" | "Bull";
  icon: "🐻" | "⚓" | "🐂";
  inputs: DCFInputs;
}

export interface DCFScenarioSet {
  bear: DCFScenarioPreset;
  base: DCFScenarioPreset;
  bull: DCFScenarioPreset;
  waccEstimate: WACCEstimate;
}

/**
 * Run a full two-stage DCF model.
 */
export function runDCF(inputs: DCFInputs): DCFResult {
  const {
    baseRevenue,
    baseFCFMargin,
    growthRatePhase1,
    growthRatePhase2,
    yearsPhase1,
    yearsPhase2,
    terminalFCFMargin,
    wacc,
    terminalGrowthRate,
    totalDebt,
    cashAndEquivalents,
    sharesOutstanding,
    currentPrice,
  } = inputs;

  const totalYears = yearsPhase1 + yearsPhase2;
  const projections: DCFProjectionYear[] = [];

  let revenue = baseRevenue;

  for (let i = 1; i <= totalYears; i++) {
    const isPhase1 = i <= yearsPhase1;
    const phase: 1 | 2 = isPhase1 ? 1 : 2;
    const growthRate = isPhase1 ? growthRatePhase1 : growthRatePhase2;

    // Linearly interpolate FCF margin from base to terminal
    const marginProgress = i / totalYears;
    const fcfMargin =
      baseFCFMargin + (terminalFCFMargin - baseFCFMargin) * marginProgress;

    revenue = revenue * (1 + growthRate);
    const fcf = revenue * fcfMargin;
    const discountFactor = 1 / Math.pow(1 + wacc, i);
    const pvFCF = fcf * discountFactor;

    projections.push({
      year: i,
      phase,
      revenue,
      revenueGrowth: growthRate,
      fcfMargin,
      fcf,
      discountFactor,
      pvFCF,
    });
  }

  // Terminal Value (Gordon Growth Model)
  const lastProjection = projections[projections.length - 1];
  const terminalFCF = lastProjection.fcf * (1 + terminalGrowthRate);
  const terminalValue =
    wacc > terminalGrowthRate
      ? terminalFCF / (wacc - terminalGrowthRate)
      : 0;

  const pvTerminalValue =
    terminalValue / Math.pow(1 + wacc, totalYears);

  const sumPVFCF = projections.reduce((sum, p) => sum + p.pvFCF, 0);
  const enterpriseValue = sumPVFCF + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;

  const intrinsicValuePerShare =
    sharesOutstanding > 0 ? Math.max(0, equityValue / sharesOutstanding) : 0;

  const marginOfSafety =
    intrinsicValuePerShare > 0
      ? (intrinsicValuePerShare - currentPrice) / intrinsicValuePerShare
      : 0;

  const upside =
    currentPrice > 0
      ? (intrinsicValuePerShare - currentPrice) / currentPrice
      : 0;

  return {
    projections,
    terminalFCF,
    terminalValue,
    pvTerminalValue,
    sumPVFCF,
    enterpriseValue,
    netDebt,
    equityValue,
    intrinsicValuePerShare,
    currentPrice,
    marginOfSafety,
    upside,
  };
}

// ---- Sensitivity Analysis ----

export interface SensitivityCell {
  wacc: number;
  terminalGrowth: number;
  intrinsicValue: number;
}

/**
 * Build a 2D sensitivity matrix varying WACC and terminal growth.
 */
export function buildSensitivityMatrix(
  baseInputs: DCFInputs,
  waccRange: number[],
  terminalGrowthRange: number[]
): SensitivityCell[] {
  const cells: SensitivityCell[] = [];

  for (const wacc of waccRange) {
    for (const tg of terminalGrowthRange) {
      if (wacc <= tg) {
        cells.push({ wacc, terminalGrowth: tg, intrinsicValue: 0 });
        continue;
      }
      const result = runDCF({ ...baseInputs, wacc, terminalGrowthRate: tg });
      cells.push({
        wacc,
        terminalGrowth: tg,
        intrinsicValue: result.intrinsicValuePerShare,
      });
    }
  }

  return cells;
}

// ---- Monte Carlo Simulation ----

export interface MonteCarloResult {
  simulations: number[];
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  probabilityAbovePrice: number;
}

/**
 * Simple seeded pseudo-random number generator (Mulberry32).
 * Deterministic output for reproducible simulations.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform to generate normally-distributed random numbers.
 */
function normalRandom(rand: () => number): number {
  const u1 = rand();
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Run Monte Carlo simulation of intrinsic value.
 * Perturbs growth rates, FCF margin, and WACC with gaussian noise.
 */
export function runMonteCarlo(
  baseInputs: DCFInputs,
  iterations: number = 1000,
  seed: number = 42
): MonteCarloResult {
  const rand = mulberry32(seed);
  const results: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Perturb inputs with ±30% standard deviation of the base parameter
    const perturbedInputs: DCFInputs = {
      ...baseInputs,
      growthRatePhase1: clampRate(
        baseInputs.growthRatePhase1 +
          normalRandom(rand) * Math.abs(baseInputs.growthRatePhase1) * 0.3
      ),
      growthRatePhase2: clampRate(
        baseInputs.growthRatePhase2 +
          normalRandom(rand) * Math.abs(baseInputs.growthRatePhase2) * 0.3
      ),
      baseFCFMargin: clampMargin(
        baseInputs.baseFCFMargin +
          normalRandom(rand) * Math.abs(baseInputs.baseFCFMargin) * 0.2
      ),
      terminalFCFMargin: clampMargin(
        baseInputs.terminalFCFMargin +
          normalRandom(rand) * Math.abs(baseInputs.terminalFCFMargin) * 0.2
      ),
      wacc: clampWACC(
        baseInputs.wacc + normalRandom(rand) * baseInputs.wacc * 0.15
      ),
    };

    // Ensure WACC > terminal growth to avoid div/0
    if (perturbedInputs.wacc <= perturbedInputs.terminalGrowthRate) {
      perturbedInputs.wacc = perturbedInputs.terminalGrowthRate + 0.01;
    }

    const result = runDCF(perturbedInputs);
    results.push(result.intrinsicValuePerShare);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((s, v) => s + v, 0) / results.length;
  const median = percentile(results, 0.5);
  const p10 = percentile(results, 0.1);
  const p25 = percentile(results, 0.25);
  const p75 = percentile(results, 0.75);
  const p90 = percentile(results, 0.9);

  const abovePrice = results.filter(
    (v) => v >= baseInputs.currentPrice
  ).length;
  const probabilityAbovePrice = abovePrice / results.length;

  return {
    simulations: results,
    mean,
    median,
    p10,
    p25,
    p75,
    p90,
    probabilityAbovePrice,
  };
}

// ---- Helpers ----

function percentile(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function clampRate(v: number, min: number = -0.5, max: number = 1): number {
  return Math.max(min, Math.min(max, v));
}

function clampMargin(v: number): number {
  return Math.max(-0.5, Math.min(0.8, v));
}

function clampWACC(v: number): number {
  return Math.max(0.03, Math.min(0.25, v));
}

// ---- WACC Estimation ----

export interface WACCEstimate {
  costOfEquity: number;
  costOfDebt: number;
  wacc: number;
  weightEquity: number;
  weightDebt: number;
}

/**
 * Estimate WACC from financial data.
 * Uses CAPM for cost of equity.
 */
export function estimateWACC(params: {
  beta: number;
  riskFreeRate?: number;
  equityRiskPremium?: number;
  interestExpense: number;
  totalDebt: number;
  marketCap: number;
  taxRate: number;
}): WACCEstimate {
  const {
    beta,
    riskFreeRate = 0.043,
    equityRiskPremium = 0.055,
    interestExpense,
    totalDebt,
    marketCap,
    taxRate,
  } = params;

  const costOfEquity = riskFreeRate + beta * equityRiskPremium;
  const costOfDebt =
    totalDebt > 0 ? Math.abs(interestExpense) / totalDebt : 0.04;

  const totalCapital = marketCap + totalDebt;
  const weightEquity = totalCapital > 0 ? marketCap / totalCapital : 1;
  const weightDebt = totalCapital > 0 ? totalDebt / totalCapital : 0;

  const wacc =
    weightEquity * costOfEquity +
    weightDebt * costOfDebt * (1 - taxRate);

  return { costOfEquity, costOfDebt, wacc, weightEquity, weightDebt };
}

// ---- Scenario Generation (Bear / Base / Bull) ----

export interface ScenarioGenerationInput {
  quote: StockQuote;
  financials: CompanyFinancials;
  sector?: string | null;
  analystGrowthYear1?: number | null;
  analystGrowthYear2?: number | null;
  inflationRate?: number;
}

/**
 * Build three pre-calculated DCF scenarios from financial history and optional analyst growth.
 * Base: consensus-like assumptions
 * Bull: faster growth, better margins, lower WACC
 * Bear: slower growth, compressed margins, higher WACC
 */
export function generateDCFScenarios(
  data: ScenarioGenerationInput
): DCFScenarioSet | null {
  const { quote, financials, sector, analystGrowthYear1, analystGrowthYear2 } = data;
  const inflationRate = data.inflationRate ?? 0.03;

  const annualIncome = sortByDateAsc(financials.income_statement.annual);
  const annualBalance = sortByDateAsc(financials.balance_sheet.annual);
  const annualCashFlow = sortByDateAsc(financials.cash_flow.annual);

  const latestIncome = annualIncome.at(-1);
  const latestBalance = annualBalance.at(-1);
  const latestCashFlow = annualCashFlow.at(-1);

  if (!latestIncome || !latestBalance || !latestCashFlow) {
    return null;
  }

  // Revenue growth series
  const revenueSeries = annualIncome.map((i) => i.revenue).filter((v) => v > 0);
  const cagr3 = computeCAGRFromSeries(revenueSeries, 3);
  const cagr1 = computeYoYGrowth(revenueSeries);

  // Analyst consensus growth (if available)
  const analystGrowth =
    analystGrowthYear1 !== null && analystGrowthYear1 !== undefined
      ? analystGrowthYear2 !== null && analystGrowthYear2 !== undefined
        ? (analystGrowthYear1 + analystGrowthYear2) / 2
        : analystGrowthYear1
      : null;

  const historicalGrowth = cagr3 ?? cagr1 ?? 0.08;
  const consensusGrowth = analystGrowth ?? historicalGrowth;

  // Safety rule: dampen very high historical growth to avoid unrealistic extrapolation.
  const hasHighHistoricalGrowth = historicalGrowth > 0.2;
  const baseGrowthRaw = hasHighHistoricalGrowth
    ? historicalGrowth * 0.6
    : consensusGrowth;

  const baseGrowthPhase1 = clampRate(baseGrowthRaw, -0.1, 0.28);

  // Mature growth should converge to lower levels than phase 1
  const baseGrowthPhase2 = clampRate(
    Math.max(0.02, Math.min(baseGrowthPhase1 * 0.45, 0.12)),
    -0.02,
    0.15
  );

  // FCF margins (last 3 years)
  const recentMargins = computeRecentFCFMargins(annualIncome, annualCashFlow, 3);
  const marginCurrent = recentMargins.at(-1) ?? 0.15;
  const marginBase = average(recentMargins) ?? marginCurrent;
  const marginHigh = Math.max(...recentMargins, marginCurrent);
  const marginLow = Math.min(...recentMargins, marginCurrent);

  const lastFiveMargins = computeRecentFCFMargins(annualIncome, annualCashFlow, 5);
  const hasConsolidatedHighMargins =
    lastFiveMargins.length >= 5 && lastFiveMargins.every((m) => m > 0.25);

  // Tax rate
  const taxRate =
    latestIncome.pre_tax_income > 0
      ? clampRate(latestIncome.income_tax / latestIncome.pre_tax_income, 0, 0.4)
      : 0.21;

  const waccEstimate = estimateWACC({
    beta: quote.beta || 1,
    interestExpense: latestIncome.interest_expense,
    totalDebt: latestBalance.long_term_debt,
    marketCap: quote.market_cap,
    taxRate,
  });

  const sectorName = (sector ?? "").toLowerCase();
  const isTechLikeSector =
    sectorName.includes("tech") ||
    sectorName.includes("software") ||
    sectorName.includes("internet") ||
    sectorName.includes("semiconductor");
  const isHighRiskProfile = isTechLikeSector || quote.beta > 1.1;

  // Safety rule: never allow too-low discount rates for tech/high-beta names.
  const baseWaccFloor = isHighRiskProfile ? 0.105 : 0.06;
  const scenarioWaccFloor = isHighRiskProfile ? 0.1 : 0.06;
  const baseWACC = clampRate(waccEstimate.wacc, baseWaccFloor, 0.18);

  const commonInputs = {
    baseRevenue: latestIncome.revenue,
    yearsPhase1: 5,
    yearsPhase2: 5,
    totalDebt: latestBalance.long_term_debt,
    cashAndEquivalents: latestBalance.cash_and_equivalents,
    sharesOutstanding: quote.shares_outstanding,
    currentPrice: quote.price,
  } satisfies Omit<
    DCFInputs,
    | "baseFCFMargin"
    | "growthRatePhase1"
    | "growthRatePhase2"
    | "terminalFCFMargin"
    | "wacc"
    | "terminalGrowthRate"
  >;

  const baseInputs: DCFInputs = {
    ...commonInputs,
    baseFCFMargin: clampRate(marginBase, -0.2, 0.5),
    growthRatePhase1: baseGrowthPhase1,
    growthRatePhase2: baseGrowthPhase2,
    // Base terminal margin regresses to mean and is capped at 25% unless 5-year history supports higher.
    terminalFCFMargin: hasConsolidatedHighMargins
      ? clampRate(Math.max(marginBase, marginBase + 0.01), -0.1, 0.5)
      : clampRate(Math.max(marginBase, marginBase + 0.01), -0.1, 0.25),
    wacc: baseWACC,
    terminalGrowthRate: 0.025,
  };

  const bullishGrowth = hasHighHistoricalGrowth
    ? historicalGrowth * 0.8
    : cagr1 !== null && cagr1 > baseGrowthPhase1 * 1.2
      ? cagr1
      : baseGrowthPhase1 * 1.2;

  const bullMargin =
    marginCurrent >= marginHigh - 0.001
      ? marginCurrent
      : marginBase + 0.025;

  const bullInputs: DCFInputs = {
    ...commonInputs,
    baseFCFMargin: clampRate(bullMargin, -0.2, 0.6),
    growthRatePhase1: clampRate(bullishGrowth, -0.05, 0.45),
    growthRatePhase2: clampRate(baseGrowthPhase2 * 1.15, 0.015, 0.16),
    terminalFCFMargin: clampRate(bullMargin + 0.015, -0.1, 0.6),
    wacc: clampRate(baseWACC - 0.0075, scenarioWaccFloor, 0.18),
    terminalGrowthRate: 0.028,
  };

  const bearGrowthRaw = hasHighHistoricalGrowth
    ? historicalGrowth * 0.4
    : baseGrowthPhase1 * 0.7;
  const bearGrowth =
    baseGrowthPhase1 < inflationRate ? inflationRate : bearGrowthRaw;

  const bearInputs: DCFInputs = {
    ...commonInputs,
    baseFCFMargin: clampRate(marginLow, -0.25, 0.45),
    growthRatePhase1: clampRate(bearGrowth, -0.08, 0.25),
    growthRatePhase2: clampRate(Math.max(0.01, baseGrowthPhase2 * 0.7), 0.005, 0.1),
    terminalFCFMargin: clampRate(Math.min(marginLow, marginBase - 0.01), -0.2, 0.4),
    wacc: clampRate(baseWACC + 0.01, isHighRiskProfile ? 0.11 : 0.065, 0.22),
    terminalGrowthRate: 0.02,
  };

  // Enforce valid terminal spread (WACC > terminal growth)
  ensureValidTerminalSpread(baseInputs);
  ensureValidTerminalSpread(bullInputs);
  ensureValidTerminalSpread(bearInputs);

  return {
    bear: { key: "bear", label: "Bear", icon: "🐻", inputs: bearInputs },
    base: { key: "base", label: "Base", icon: "⚓", inputs: baseInputs },
    bull: { key: "bull", label: "Bull", icon: "🐂", inputs: bullInputs },
    waccEstimate,
  };
}

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function computeYoYGrowth(values: number[]): number | null {
  if (values.length < 2) return null;
  const start = values[values.length - 2];
  const end = values[values.length - 1];
  if (start <= 0 || end <= 0) return null;
  return end / start - 1;
}

function computeCAGRFromSeries(values: number[], years: number): number | null {
  if (values.length < years + 1) return null;
  const start = values[values.length - 1 - years];
  const end = values[values.length - 1];
  if (start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function computeRecentFCFMargins(
  incomeAnnual: CompanyFinancials["income_statement"]["annual"],
  cashFlowAnnual: CompanyFinancials["cash_flow"]["annual"],
  windowSize: number
): number[] {
  const income = incomeAnnual.slice(-windowSize);
  const cash = cashFlowAnnual.slice(-windowSize);
  const margins: number[] = [];

  for (let i = 0; i < Math.min(income.length, cash.length); i++) {
    const rev = income[i].revenue;
    const fcf = cash[i].free_cash_flow;
    if (rev > 0) {
      margins.push(fcf / rev);
    }
  }

  return margins.length > 0 ? margins : [0.15];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function ensureValidTerminalSpread(inputs: DCFInputs): void {
  if (inputs.wacc <= inputs.terminalGrowthRate + 0.005) {
    inputs.wacc = inputs.terminalGrowthRate + 0.01;
  }
}

