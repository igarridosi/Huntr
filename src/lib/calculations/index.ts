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
