import type { DCFInputs } from "../dcf";

/**
 * A deliberately ordinary company: positive growth, healthy margin, modest
 * leverage. Nothing here is meant to be a stress case - the tests build their
 * own bear and bull around it.
 */
export const BASE_INPUTS: DCFInputs = {
  baseRevenue: 100_000_000_000,
  baseFCFMargin: 0.22,
  growthRatePhase1: 0.10,
  growthRatePhase2: 0.04,
  yearsPhase1: 5,
  yearsPhase2: 5,
  terminalFCFMargin: 0.26,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  totalDebt: 20_000_000_000,
  cashAndEquivalents: 30_000_000_000,
  sharesOutstanding: 4_000_000_000,
  currentPrice: 150,
};

export const BEAR_INPUTS: DCFInputs = {
  ...BASE_INPUTS,
  growthRatePhase1: 0.03,
  growthRatePhase2: 0.01,
  terminalFCFMargin: 0.18,
  wacc: 0.11,
  terminalGrowthRate: 0.015,
};

export const BULL_INPUTS: DCFInputs = {
  ...BASE_INPUTS,
  growthRatePhase1: 0.16,
  growthRatePhase2: 0.07,
  terminalFCFMargin: 0.32,
  wacc: 0.08,
  terminalGrowthRate: 0.03,
};
