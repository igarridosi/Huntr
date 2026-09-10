import type { DCFInputs, DCFResult, WACCEstimate } from "./dcf";
import { runDCF } from "./dcf";

/**
 * Whether the WACC in use agrees with the components printed beneath it.
 *
 * The slider and the Ke / Kd / (E+D) figures underneath were never connected.
 * You could sit on a 9.5% WACC while the components implied 11.5% and nothing
 * on screen would disagree. Since WACC is usually the input that moves the
 * answer most, that gap can invalidate an entire valuation quietly - the model
 * looks internally consistent because the contradiction is never stated.
 */
export interface WACCReconciliation {
  applied: number;
  calculated: number | null;
  /** Applied minus calculated, in decimals. */
  gap: number | null;
  /** True when the two disagree by more than the tolerance. */
  isOverride: boolean;
  /** True when the company carries no meaningful debt, so WACC should be Ke. */
  isAllEquity: boolean;
}

/** Half a percentage point: enough to matter, small enough to ignore below. */
export const WACC_OVERRIDE_TOLERANCE = 0.005;

export function reconcileWACC(
  applied: number,
  estimate: WACCEstimate | null,
  tolerance: number = WACC_OVERRIDE_TOLERANCE
): WACCReconciliation {
  if (!estimate) {
    return {
      applied,
      calculated: null,
      gap: null,
      isOverride: false,
      isAllEquity: false,
    };
  }

  const gap = applied - estimate.wacc;

  return {
    applied,
    calculated: estimate.wacc,
    gap,
    isOverride: Math.abs(gap) > tolerance,
    // With no debt to speak of, the weighted average is just the cost of
    // equity. If it is not, the capital structure has been inherited from
    // somewhere rather than computed for this company.
    isAllEquity: estimate.weightDebt < 0.02,
  };
}

/**
 * The exit multiple the terminal value implies, as a multiple of final-year FCF.
 *
 * Gordon Growth expresses the terminal value as a spread between two rates,
 * which is abstract enough that an indefensible assumption does not look like
 * one. 1 / (WACC - g) restates it as a multiple you can hold against multiples
 * you have seen: 12x is ordinary, 17x wants an argument, 30x is usually a
 * spread that has quietly collapsed.
 */
export function impliedExitMultiple(
  wacc: number,
  terminalGrowth: number
): number | null {
  const spread = wacc - terminalGrowth;
  if (!(spread > 0)) return null;
  return 1 / spread;
}

export type TerminalWeightBand = "healthy" | "elevated" | "dominant";

export interface TerminalWeightReading {
  weight: number;
  band: TerminalWeightBand;
  message: string;
}

/**
 * How much of the answer rests beyond the horizon you actually modelled.
 *
 * The bar already existed; what it lacked was a reading. A number without a
 * threshold is a decoration, and the thing it is measuring - how much of the
 * valuation comes from a perpetuity rather than from projected cash - is one
 * of the few honest measures of how much the model is guessing.
 */
export function readTerminalWeight(
  pvTerminalValue: number,
  enterpriseValue: number
): TerminalWeightReading {
  const weight = enterpriseValue > 0 ? pvTerminalValue / enterpriseValue : 0;

  if (weight < 0.4) {
    return {
      weight,
      band: "healthy",
      message:
        "Most of the value comes from cash flows you have actually projected.",
    };
  }
  if (weight <= 0.6) {
    return {
      weight,
      band: "elevated",
      message:
        "A substantial share of the value sits beyond the projection horizon. Normal for a growing company, but the terminal assumptions carry real weight here.",
    };
  }
  return {
    weight,
    band: "dominant",
    message:
      "More than half the value depends on assumptions past the end of your forecast. The projected years are doing less work than the perpetuity.",
  };
}

/**
 * One bar of the tornado: how far the valuation moves when a single input is
 * pushed either way by a defensible amount.
 */
export interface TornadoBar {
  key: keyof DCFInputs;
  label: string;
  /** How much the input was moved in each direction. */
  delta: number;
  lowValue: number;
  highValue: number;
  baseValue: number;
  /** The full span, as a share of the base valuation. Used for ordering. */
  swing: number;
}

/**
 * The inputs worth testing, and how far to push each one.
 *
 * A percentage point for rates and two for margins: roughly the amount you
 * could be wrong by without having been careless. Using the same delta for
 * every input would be tidier and would tell you nothing, because a point of
 * WACC and a point of terminal growth are not comparable quantities of error.
 */
const TORNADO_INPUTS: ReadonlyArray<{
  key: keyof DCFInputs;
  label: string;
  delta: number;
}> = [
  { key: "growthRatePhase1", label: "Phase 1 growth", delta: 0.02 },
  { key: "growthRatePhase2", label: "Phase 2 growth", delta: 0.02 },
  { key: "terminalFCFMargin", label: "Terminal FCF margin", delta: 0.02 },
  { key: "baseFCFMargin", label: "Current FCF margin", delta: 0.02 },
  { key: "wacc", label: "WACC", delta: 0.01 },
  { key: "terminalGrowthRate", label: "Terminal growth", delta: 0.01 },
];

/**
 * What actually moves the answer, ranked.
 *
 * The sensitivity matrix covers two variables at a time and both of them are
 * financial. This covers every input one at a time, which is what tells you
 * where research effort is worth spending before refining anything else -
 * there is no point agonising over a margin assumption that moves the value by
 * 3% while the growth rate moves it by 40%.
 */
export function buildTornado(inputs: DCFInputs): TornadoBar[] {
  const base = runDCF(inputs).intrinsicValuePerShare;
  if (!(base > 0)) return [];

  const bars = TORNADO_INPUTS.map(({ key, label, delta }) => {
    const current = inputs[key] as number;

    const lowInputs = { ...inputs, [key]: current - delta } as DCFInputs;
    const highInputs = { ...inputs, [key]: current + delta } as DCFInputs;

    // Gordon Growth needs the spread to stay positive; nudging either rate can
    // close it. Keeping a floor here means the bar reports the effect of the
    // change rather than the effect of the model breaking.
    if (lowInputs.wacc <= lowInputs.terminalGrowthRate) {
      lowInputs.wacc = lowInputs.terminalGrowthRate + 0.005;
    }
    if (highInputs.wacc <= highInputs.terminalGrowthRate) {
      highInputs.wacc = highInputs.terminalGrowthRate + 0.005;
    }

    const lowValue = runDCF(lowInputs).intrinsicValuePerShare;
    const highValue = runDCF(highInputs).intrinsicValuePerShare;

    return {
      key,
      label,
      delta,
      lowValue,
      highValue,
      baseValue: base,
      swing: Math.abs(highValue - lowValue) / base,
    };
  });

  return bars.sort((a, b) => b.swing - a.swing);
}

export type SensitivityAxes = "financial" | "operating";

export interface SensitivityAxisConfig {
  axes: SensitivityAxes;
  rowLabel: string;
  colLabel: string;
  rowValues: number[];
  colValues: number[];
}

/**
 * The two pairs of axes worth looking at.
 *
 * WACC against terminal growth is the standard grid and it is fine, but both
 * are financial assumptions - it says nothing about the business. Growth
 * against terminal margin is the operating pair, and for most companies it is
 * where the disagreement actually lives.
 */
export function buildSensitivityAxes(
  inputs: DCFInputs,
  axes: SensitivityAxes
): SensitivityAxisConfig {
  const spread = (centre: number, step: number) => [
    centre - step * 2,
    centre - step,
    centre,
    centre + step,
    centre + step * 2,
  ];

  if (axes === "operating") {
    return {
      axes,
      rowLabel: "Phase 1 growth",
      colLabel: "Terminal FCF margin",
      rowValues: spread(inputs.growthRatePhase1, 0.02).map((v) =>
        Math.max(-0.5, Math.min(1, v))
      ),
      colValues: spread(inputs.terminalFCFMargin, 0.02).map((v) =>
        Math.max(-0.2, Math.min(0.8, v))
      ),
    };
  }

  return {
    axes,
    rowLabel: "WACC",
    colLabel: "Terminal growth",
    rowValues: spread(inputs.wacc, 0.01).map((v) => Math.max(0.03, Math.min(0.3, v))),
    colValues: spread(inputs.terminalGrowthRate, 0.005).map((v) =>
      Math.max(-0.02, Math.min(0.06, v))
    ),
  };
}

export interface OperatingSensitivityCell {
  growth: number;
  margin: number;
  intrinsicValue: number;
}

/** The operating grid, which `buildSensitivityMatrix` does not cover. */
export function buildOperatingSensitivity(
  inputs: DCFInputs,
  growthValues: number[],
  marginValues: number[]
): OperatingSensitivityCell[] {
  const cells: OperatingSensitivityCell[] = [];

  for (const growth of growthValues) {
    for (const margin of marginValues) {
      const result: DCFResult = runDCF({
        ...inputs,
        growthRatePhase1: growth,
        terminalFCFMargin: margin,
      });
      cells.push({
        growth,
        margin,
        intrinsicValue: result.intrinsicValuePerShare,
      });
    }
  }

  return cells;
}
