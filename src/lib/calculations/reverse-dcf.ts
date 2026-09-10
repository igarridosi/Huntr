import type { DCFInputs } from "./dcf";
import { runDCF } from "./dcf";

/**
 * Reverse DCF: what the market is already assuming.
 *
 * A forward DCF invites anchoring. You move sliders until the number looks
 * reasonable, the result lands near the price, and the exercise confirms what
 * you already believed. This inverts the burden of proof: it fixes the market
 * price as the answer and solves for the input that produces it, turning
 * "what is it worth?" into "do I believe this assumption?" - a question that is
 * far easier to answer honestly.
 */
export type ReverseDCFVariable =
  | "growthRatePhase1"
  | "terminalFCFMargin"
  | "wacc"
  | "terminalGrowthRate";

export interface ReverseDCFResult {
  variable: ReverseDCFVariable;
  /** The value that makes intrinsic value equal today's price. */
  impliedValue: number;
  /** What the model produces at that value — should sit on the price. */
  solvedPrice: number;
  targetPrice: number;
  /** How close the solver got, in dollars per share. */
  residual: number;
  converged: boolean;
  iterations: number;
}

/** The band each variable is searched over, and which way it pushes value. */
const SEARCH_BOUNDS: Record<
  ReverseDCFVariable,
  { min: number; max: number; increasing: boolean }
> = {
  // More growth, more value.
  growthRatePhase1: { min: -0.5, max: 1.5, increasing: true },
  terminalFCFMargin: { min: -0.2, max: 0.8, increasing: true },
  // A higher discount rate lowers value, so this one runs the other way.
  wacc: { min: 0.03, max: 0.4, increasing: false },
  terminalGrowthRate: { min: -0.05, max: 0.08, increasing: true },
};

function withVariable(
  inputs: DCFInputs,
  variable: ReverseDCFVariable,
  value: number
): DCFInputs {
  const next = { ...inputs, [variable]: value } as DCFInputs;

  // Gordon Growth needs WACC above terminal growth or the terminal value is
  // undefined. The solver walks through values that violate that on its way to
  // the answer, so the guard lives here rather than being left to blow up.
  if (next.wacc <= next.terminalGrowthRate) {
    if (variable === "wacc") next.terminalGrowthRate = next.wacc - 0.005;
    else next.terminalGrowthRate = next.wacc - 0.005;
  }
  return next;
}

function priceAt(
  inputs: DCFInputs,
  variable: ReverseDCFVariable,
  value: number
): number {
  const result = runDCF(withVariable(inputs, variable, value));
  return result.intrinsicValuePerShare;
}

/**
 * Solves for the assumption the market price implies.
 *
 * Bisection rather than Newton-Raphson on purpose. The value function is not
 * smooth everywhere - the terminal value clamps to zero when WACC crosses
 * terminal growth, and the per-share figure is floored at zero - and Newton
 * diverges near those discontinuities. Bisection cannot diverge as long as the
 * bracket has opposite signs, and 80 halvings of the bracket reach machine
 * precision. Slower, and it always terminates.
 */
export function solveReverseDCF(
  inputs: DCFInputs,
  variable: ReverseDCFVariable,
  targetPrice: number = inputs.currentPrice,
  tolerance: number = 0.01,
  maxIterations: number = 80
): ReverseDCFResult | null {
  if (!(targetPrice > 0)) return null;

  const bounds = SEARCH_BOUNDS[variable];
  let low = bounds.min;
  let high = bounds.max;

  const priceLow = priceAt(inputs, variable, low);
  const priceHigh = priceAt(inputs, variable, high);

  // The price has to be reachable inside the band. When it is not, the market
  // is assuming something outside any defensible range for this variable, and
  // reporting a clamped bound as though it were a solution would be worse than
  // saying so.
  const reachable =
    (Math.min(priceLow, priceHigh) - tolerance <= targetPrice &&
      targetPrice <= Math.max(priceLow, priceHigh) + tolerance);
  if (!reachable) return null;

  let iterations = 0;
  let mid = (low + high) / 2;
  let priceMid = priceAt(inputs, variable, mid);

  while (iterations < maxIterations && Math.abs(priceMid - targetPrice) > tolerance) {
    const midIsBelowTarget = priceMid < targetPrice;
    // For a decreasing variable the comparison flips: needing more value means
    // searching lower, not higher.
    const goHigher = bounds.increasing ? midIsBelowTarget : !midIsBelowTarget;

    if (goHigher) low = mid;
    else high = mid;

    mid = (low + high) / 2;
    priceMid = priceAt(inputs, variable, mid);
    iterations += 1;
  }

  return {
    variable,
    impliedValue: mid,
    solvedPrice: priceMid,
    targetPrice,
    residual: priceMid - targetPrice,
    converged: Math.abs(priceMid - targetPrice) <= tolerance,
    iterations,
  };
}

/**
 * The implied assumption set against what the company has actually done.
 *
 * This is the sentence that does the work. "The market is pricing in 1.8%
 * growth; the company has compounded at 12% for five years" tells you more
 * than any fair-value estimate, because it is a claim you can check against
 * the world rather than an opinion you have to weigh.
 */
export interface ReverseDCFComparison {
  implied: number;
  history5Y: number | null;
  history10Y: number | null;
  /** Implied minus the 5-year record, in decimal terms. */
  gapVs5Y: number | null;
  /** True when the market is assuming materially less than the record. */
  marketIsPessimistic: boolean;
  /** True when the market is assuming materially more than the record. */
  marketIsOptimistic: boolean;
}

export const REVERSE_GAP_THRESHOLD = 0.02;

export function compareToHistory(
  implied: number,
  history5Y: number | null,
  history10Y: number | null,
  threshold: number = REVERSE_GAP_THRESHOLD
): ReverseDCFComparison {
  const gapVs5Y = history5Y === null ? null : implied - history5Y;

  return {
    implied,
    history5Y,
    history10Y,
    gapVs5Y,
    marketIsPessimistic: gapVs5Y !== null && gapVs5Y < -threshold,
    marketIsOptimistic: gapVs5Y !== null && gapVs5Y > threshold,
  };
}

const VARIABLE_LABELS: Record<ReverseDCFVariable, string> = {
  growthRatePhase1: "revenue growth",
  terminalFCFMargin: "terminal FCF margin",
  wacc: "discount rate",
  terminalGrowthRate: "perpetual growth",
};

export function describeVariable(variable: ReverseDCFVariable): string {
  return VARIABLE_LABELS[variable];
}

/**
 * The finding as a sentence, because a solved number on its own is not an
 * insight until it is placed next to something.
 */
export function describeReverseDCF(
  result: ReverseDCFResult,
  inputs: DCFInputs,
  comparison?: ReverseDCFComparison
): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const years = inputs.yearsPhase1;

  const head =
    result.variable === "growthRatePhase1"
      ? `At ${result.targetPrice.toFixed(2)} a share, the market is pricing in ${pct(result.impliedValue)} revenue growth for ${years} years, with a ${pct(inputs.terminalFCFMargin)} terminal FCF margin and a ${pct(inputs.wacc)} discount rate.`
      : result.variable === "terminalFCFMargin"
        ? `At ${result.targetPrice.toFixed(2)} a share, the market is pricing in a ${pct(result.impliedValue)} terminal FCF margin, on ${pct(inputs.growthRatePhase1)} growth and a ${pct(inputs.wacc)} discount rate.`
        : result.variable === "wacc"
          ? `At ${result.targetPrice.toFixed(2)} a share, the market is applying a ${pct(result.impliedValue)} discount rate to your growth and margin assumptions.`
          : `At ${result.targetPrice.toFixed(2)} a share, the market is pricing in ${pct(result.impliedValue)} growth in perpetuity.`;

  if (!comparison || comparison.history5Y === null) return head;

  const record = `The company has managed ${pct(comparison.history5Y)} over the last five years.`;
  return `${head} ${record}`;
}
