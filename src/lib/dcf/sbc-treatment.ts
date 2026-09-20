/**
 * Stock-based compensation, deducted once.
 *
 * The "deduct SBC" switch lowers the base margin by SBC over revenue —
 * Adobe: 34.0% less 8.2% is 25.8%. The margin it lowers has to be the
 * one before the deduction. When the slider already stands at a
 * post-SBC level (typed in from a broker note that had it deducted, or a
 * scenario saved with the switch on and reloaded with it off), flipping
 * the switch deducts the same charge twice and the model runs on a
 * margin no statement supports. The switch cannot know what the user
 * had in mind; it can tell when the number on the slider is already the
 * deducted one, and say so before subtracting again.
 */

/** How close the slider has to sit to the post-SBC margin to be taken as already deducted, in margin points. */
export const ALREADY_DEDUCTED_TOLERANCE = 0.005;

export interface SbcTreatmentInput {
  /** The margin on the slider now. */
  currentMargin: number;
  /** Free cash flow over revenue from the statements, before SBC. */
  rawMargin: number;
  /** Stock-based compensation over revenue. */
  sbcMargin: number;
}

export interface SbcTreatment {
  /** The margin after deducting once from the raw statement margin. */
  deductedMargin: number;
  /** True when the slider already stands at (or below) the deducted margin: deducting again would double-count. */
  alreadyDeducted: boolean;
  warning: string | null;
}

export function sbcTreatment(input: SbcTreatmentInput): SbcTreatment {
  const deductedMargin = input.rawMargin - input.sbcMargin;
  const alreadyDeducted = input.sbcMargin > 0 && input.currentMargin <= deductedMargin + ALREADY_DEDUCTED_TOLERANCE;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return {
    deductedMargin,
    alreadyDeducted,
    warning: alreadyDeducted
      ? `The margin on the slider (${pct(input.currentMargin)}) already sits at or below the statements' margin less stock-based compensation (${pct(input.rawMargin)} − ${pct(input.sbcMargin)} = ${pct(deductedMargin)}). Deducting SBC again would take the same charge off twice. The switch has been applied to the statements' margin instead of the slider's.`
      : null,
  };
}
