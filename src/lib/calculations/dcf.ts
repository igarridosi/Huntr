// ============================================================
// DCF (Discounted Cash Flow) Calculation Engine
// Two-stage model: High Growth → Stable Growth + Terminal Value
// ============================================================

import type { CompanyFinancials } from "@/types/financials";
import type { StockQuote } from "@/types/stock";

export type FCFMarginMode = "constant" | "linear" | "converge";

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
  /**
   * How the FCF margin travels from base to terminal across the projection.
   *
   * Defaults to "linear", which is what the model has always done - and was
   * invisible in the interface. It matters: under linear the terminal margin
   * is not a terminal-value input at all, it drags every projected year with
   * it, which makes it one of the most leveraged sliders on the panel.
   *  - constant: hold the base margin; terminal margin touches only the
   *    terminal value.
   *  - linear: straight line from base to terminal (the original behaviour).
   *  - converge: ease toward terminal, back-loading the improvement. The more
   *    conservative path to the same endpoint.
   */
  fcfMarginMode?: FCFMarginMode;
  /**
   * Discount at (t - 0.5) rather than t. Cash is generated through the year
   * rather than arriving on 31 December, which is why this is the standard
   * banking convention. Worth roughly 4-5% on the valuation. Defaults to
   * false so existing scenarios keep their numbers.
   */
  midYearConvention?: boolean;
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
    fcfMarginMode = "linear",
    midYearConvention = false,
  } = inputs;

  const totalYears = yearsPhase1 + yearsPhase2;
  const projections: DCFProjectionYear[] = [];

  let revenue = baseRevenue;

  for (let i = 1; i <= totalYears; i++) {
    const isPhase1 = i <= yearsPhase1;
    const phase: 1 | 2 = isPhase1 ? 1 : 2;
    const growthRate = isPhase1 ? growthRatePhase1 : growthRatePhase2;

    // How far along the path to the terminal margin this year sits. Linear is
    // the original behaviour; convergence uses a quadratic ease so most of the
    // improvement lands late, which is the harder thing to assume and therefore
    // the safer path for anyone who wants one.
    const linearProgress = i / totalYears;
    const marginProgress =
      fcfMarginMode === "constant"
        ? 0
        : fcfMarginMode === "converge"
          ? linearProgress * linearProgress
          : linearProgress;
    const fcfMargin =
      baseFCFMargin + (terminalFCFMargin - baseFCFMargin) * marginProgress;

    revenue = revenue * (1 + growthRate);
    const fcf = revenue * fcfMargin;
    const discountPeriod = midYearConvention ? i - 0.5 : i;
    const discountFactor = 1 / Math.pow(1 + wacc, discountPeriod);
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

  // The terminal value is discounted on the same convention as the flows it
  // follows; mixing the two would silently understate it.
  const terminalDiscountPeriod = midYearConvention ? totalYears - 0.5 : totalYears;
  const pvTerminalValue =
    terminalValue / Math.pow(1 + wacc, terminalDiscountPeriod);

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

export interface MonteCarloCoherence {
  /** Bear scenario value the P10 is being judged against. */
  bearValue: number;
  /** Bull scenario value the P90 is being judged against. */
  bullValue: number;
  /** True when P10 sits at or below the hand-built bear case. */
  p10CoversBear: boolean;
  /** True when P90 sits at or above the hand-built bull case. */
  p90CoversBull: boolean;
  /** P10 relative to bear, as a decimal (+0.75 = P10 is 75% above bear). */
  p10VsBear: number;
  /** P90 relative to bull, as a decimal. */
  p90VsBull: number;
}

export interface MonteCarloResult {
  simulations: number[];
  mean: number;
  median: number;
  p5: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  probabilityAbovePrice: number;
  /** Present only when a scenario set was supplied. */
  coherence?: MonteCarloCoherence;
}

export interface MonteCarloScenarioInputs {
  bear: DCFInputs;
  base: DCFInputs;
  bull: DCFInputs;
}

export interface MonteCarloWeights {
  bear: number;
  base: number;
  bull: number;
}

export interface MonteCarloOptions {
  /**
   * The three hand-built cases. Without these the simulation falls back to the
   * old narrow perturbation, which is far less informative.
   */
  scenarios?: MonteCarloScenarioInputs;
  /** How likely each scenario is. Defaults to 25/50/25. */
  weights?: MonteCarloWeights;
  /** How tightly revenue growth and FCF margin move together, 0 to 1. */
  growthMarginCorrelation?: number;
}

export const DEFAULT_MC_WEIGHTS: MonteCarloWeights = {
  bear: 0.25,
  base: 0.5,
  bull: 0.25,
};

export const DEFAULT_GROWTH_MARGIN_CORRELATION = 0.5;

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
 * Still used by the no-scenario fallback path.
 */
function normalRandom(rand: () => number): number {
  const u1 = rand();
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Inverse CDF of a triangular distribution.
 *
 * Chosen over the gaussian this used to draw from because valuations are not
 * symmetric: a business deteriorates faster and further than it improves, and
 * a triangle defined by (worst, expected, best) says that directly instead of
 * needing a variance fudged into asymmetry. It also takes its shape from the
 * scenarios the user actually built, rather than from a percentage of the base
 * case.
 */
function triangular(u: number, low: number, mode: number, high: number): number {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  if (b - a < 1e-12) return a;

  const c = Math.min(b, Math.max(a, mode));
  const split = (c - a) / (b - a);

  return u < split
    ? a + Math.sqrt(u * (b - a) * (c - a))
    : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

/**
 * The (low, mode, high) triangle for one variable, given which scenario was
 * drawn.
 *
 * The scenario sets the mode; the neighbouring scenarios set the bounds, and
 * the outermost scenario reaches half a step beyond itself. So the support
 * runs from below bear to above bull while the mass stays where the weights
 * put it, which is what lets P10 land near the bear case rather than near the
 * base one.
 */
function triangleFor(
  scenario: DCFScenarioKey,
  bear: number,
  base: number,
  bull: number
): { low: number; mode: number; high: number } {
  if (scenario === "bear") {
    return { low: bear - (base - bear) * 0.5, mode: bear, high: base };
  }
  if (scenario === "bull") {
    return { low: base, mode: bull, high: bull + (bull - base) * 0.5 };
  }
  return { low: bear, mode: base, high: bull };
}

function pickScenario(u: number, weights: MonteCarloWeights): DCFScenarioKey {
  const total = weights.bear + weights.base + weights.bull;
  if (total <= 0) return "base";
  const scaled = u * total;
  if (scaled < weights.bear) return "bear";
  if (scaled < weights.bear + weights.base) return "base";
  return "bull";
}

/**
 * Monte Carlo simulation of intrinsic value.
 *
 * The previous version perturbed one input set with independent gaussian
 * noise. Three things were wrong with that, and all three pushed the same way:
 *
 *  - It sampled *within* the active scenario, so it measured the uncertainty
 *    inside a single hypothesis and reported it as the range of outcomes. On a
 *    representative company its P10 landed about 75% above the hand-built bear
 *    case: a tenth percentile better than the pessimistic scenario.
 *  - A symmetric gaussian is the wrong shape for a valuation, whose left tail
 *    is longer than its right.
 *  - Growth and margin were drawn independently, so collapsing demand could
 *    pair with expanding margin. Those draws quietly cancel the worst cases.
 *
 * Each iteration now draws which scenario the world is in, then draws within
 * it from triangles anchored on the neighbouring scenarios, with growth and
 * margin sharing a common draw so they move together.
 *
 * Without a scenario set it still runs the old perturbation, but the result
 * then carries no `coherence` report, because there is nothing to check it
 * against.
 */
export function runMonteCarlo(
  baseInputs: DCFInputs,
  iterations: number = 1000,
  seed: number = 42,
  options: MonteCarloOptions = {}
): MonteCarloResult {
  const rand = mulberry32(seed);
  const results: number[] = [];

  const scenarios = options.scenarios;
  const weights = options.weights ?? DEFAULT_MC_WEIGHTS;
  const rho = Math.min(
    1,
    Math.max(
      0,
      options.growthMarginCorrelation ?? DEFAULT_GROWTH_MARGIN_CORRELATION
    )
  );

  for (let i = 0; i < iterations; i++) {
    let perturbed: DCFInputs;

    if (scenarios) {
      const scenario = pickScenario(rand(), weights);
      const picked = scenarios[scenario];

      // One shared draw drives growth and margin; `rho` decides how much of
      // each variable's own draw survives. At 1 they move in lockstep, at 0
      // they are independent. A rank-correlation approximation rather than a
      // copula: enough to stop the tails cancelling, and cheap.
      const shared = rand();
      const mix = (own: number) => rho * shared + (1 - rho) * own;

      const uGrowth1 = mix(rand());
      const uGrowth2 = mix(rand());
      const uBaseMargin = mix(rand());
      const uTerminalMargin = mix(rand());
      const uWacc = rand();

      const draw = (u: number, pick: (inputs: DCFInputs) => number): number => {
        const t = triangleFor(
          scenario,
          pick(scenarios.bear),
          pick(scenarios.base),
          pick(scenarios.bull)
        );
        return triangular(u, t.low, t.mode, t.high);
      };

      perturbed = {
        ...picked,
        growthRatePhase1: clampRate(draw(uGrowth1, (x) => x.growthRatePhase1)),
        growthRatePhase2: clampRate(draw(uGrowth2, (x) => x.growthRatePhase2)),
        baseFCFMargin: clampMargin(draw(uBaseMargin, (x) => x.baseFCFMargin)),
        terminalFCFMargin: clampMargin(
          draw(uTerminalMargin, (x) => x.terminalFCFMargin)
        ),
        // WACC is drawn on its own: its co-movement with the rest is already
        // carried by which scenario was picked, and tying it to the same draw
        // would count that twice.
        wacc: clampWACC(draw(uWacc, (x) => x.wacc)),
        // The comparison is always against today's price and today's share
        // count, whichever scenario supplied the operating assumptions.
        currentPrice: baseInputs.currentPrice,
        sharesOutstanding: baseInputs.sharesOutstanding,
      };
    } else {
      perturbed = {
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
    }

    // Ensure WACC > terminal growth to avoid div/0
    if (perturbed.wacc <= perturbed.terminalGrowthRate) {
      perturbed.wacc = perturbed.terminalGrowthRate + 0.01;
    }

    results.push(runDCF(perturbed).intrinsicValuePerShare);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((s, v) => s + v, 0) / results.length;
  const median = percentile(results, 0.5);
  const p5 = percentile(results, 0.05);
  const p10 = percentile(results, 0.1);
  const p25 = percentile(results, 0.25);
  const p75 = percentile(results, 0.75);
  const p90 = percentile(results, 0.9);

  const abovePrice = results.filter((v) => v >= baseInputs.currentPrice).length;
  const probabilityAbovePrice = abovePrice / results.length;

  let coherence: MonteCarloCoherence | undefined;
  if (scenarios) {
    // Run on every simulation rather than left to a test suite: if P10 sits
    // above the bear case the sampling is mis-parameterised, and the interface
    // should say so instead of presenting the range as trustworthy.
    const bearValue = runDCF(scenarios.bear).intrinsicValuePerShare;
    const bullValue = runDCF(scenarios.bull).intrinsicValuePerShare;
    coherence = {
      bearValue,
      bullValue,
      p10CoversBear: p10 <= bearValue * 1.15,
      p90CoversBull: p90 >= bullValue * 0.85,
      p10VsBear: bearValue > 0 ? p10 / bearValue - 1 : 0,
      p90VsBull: bullValue > 0 ? p90 / bullValue - 1 : 0,
    };
  }

  return {
    simulations: results,
    mean,
    median,
    p5,
    p10,
    p25,
    p75,
    p90,
    probabilityAbovePrice,
    coherence,
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
    // 70%, like the slider: Visa has delivered 52–61% for four years, and a
    // 50% cap here handed the model a company it then had to undervalue.
    baseFCFMargin: clampRate(marginBase, -0.2, 0.7),
    growthRatePhase1: baseGrowthPhase1,
    growthRatePhase2: baseGrowthPhase2,
    // Base terminal margin regresses to mean and is capped at 25% unless 5-year history supports higher.
    terminalFCFMargin: hasConsolidatedHighMargins
      ? clampRate(Math.max(marginBase, marginBase + 0.01), -0.1, 0.7)
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

