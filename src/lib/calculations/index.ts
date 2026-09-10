/**
 * Barrel export for all calculation utilities.
 * Pure functions — no side effects, no dependencies on data layer.
 */

export { calculateROIC } from "./roic";
export { calculateFCFYield } from "./fcf-yield";
export { calculatePayoutRatio } from "./payout-ratio";
export { calculateCAGR, calculateAllCAGRs } from "./cagr";
export {
  calculateGrossMargin,
  calculateOperatingMargin,
  calculateNetMargin,
  calculateFCFMargin,
  calculateCapexToRevenue,
} from "./margins";
export {
  runDCF,
  buildSensitivityMatrix,
  runMonteCarlo,
  estimateWACC,
  generateDCFScenarios,
} from "./dcf";
export {
  DEFAULT_MC_WEIGHTS,
  DEFAULT_GROWTH_MARGIN_CORRELATION,
} from "./dcf";
export type {
  FCFMarginMode,
  MonteCarloCoherence,
  MonteCarloOptions,
  MonteCarloScenarioInputs,
  MonteCarloWeights,
} from "./dcf";
export {
  DEFAULT_CONVICTION_WEIGHTS,
  buildConvictionBreakdown,
  buildSimulationBundle,
  buildTradingZones,
  resolveStressCase,
} from "./dcf-decision";
export type {
  ConvictionBreakdown,
  ConvictionFactor,
  ConvictionWeights,
  DCFSimulationBundle,
  StressCase,
  TradingZones,
} from "./dcf-decision";
export {
  calculateQualityScore,
  gradeFromScore,
} from "./quality-score";
export type {
  QualityGrade,
  QualityMetric,
  QualityDimension,
  QualityScoreResult,
} from "./quality-score";
export type {
  DCFInputs,
  DCFResult,
  DCFProjectionYear,
  SensitivityCell,
  MonteCarloResult,
  WACCEstimate,
  DCFScenarioKey,
  DCFScenarioPreset,
  DCFScenarioSet,
} from "./dcf";
