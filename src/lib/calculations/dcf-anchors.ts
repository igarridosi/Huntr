import { formatPercent } from "@/lib/utils";
/**
 * External anchors against optimism in the assumptions.
 *
 * The most common way to build a bad DCF is not a modelling error. It is an
 * assumption that sounds moderate and sits above anything the company has ever
 * achieved, or that contradicts what management said out loud last quarter.
 * Nothing in a slider stops you, and the resulting number looks as rigorous as
 * any other. This module makes the gap visible.
 *
 * Every check here informs and never blocks. There are legitimate reasons to
 * assume a break with the record - a new product cycle, a disposal, a turn in
 * the cycle - and the point is to make the departure deliberate rather than
 * accidental.
 */

/** The realised range of a metric, for the band drawn under a slider. */
export interface HistoricalBand {
  min: number;
  median: number;
  max: number;
  /** Where the current input sits inside the band, 0-1. Clamped. */
  position: number;
  /** True when the input is outside anything the company has recorded. */
  beyondRecord: boolean;
  sampleSize: number;
}

export function buildHistoricalBand(
  values: number[],
  current: number
): HistoricalBand | null {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const span = max - min;
  const rawPosition = span > 0 ? (current - min) / span : 0.5;

  return {
    min,
    median,
    max,
    position: Math.max(0, Math.min(1, rawPosition)),
    // Sitting outside the recorded range is not wrong, but it is a claim that
    // this time differs from every year on file, and that deserves saying.
    beyondRecord: current > max || current < min,
    sampleSize: usable.length,
  };
}

export type AnchorSeverity = "info" | "warning";

export interface AnchorWarning {
  id: "growth-vs-record" | "margin-vs-capex";
  severity: AnchorSeverity;
  message: string;
}

/**
 * The shared formatter, not a local multiply-then-round.
 *
 * `(0.0725 * 100).toFixed(1)` is "7.2", because the multiplication lands on
 * 7.249999999999999 first. The panel formats the ratio directly and prints
 * 7.3%, so the two disagreed about the same number on the same screen - which
 * is exactly the kind of small inconsistency that costs a valuation tool its
 * credibility.
 */
const pct = (value: number) => formatPercent(value, 1);

/**
 * Growth against the company's own record.
 *
 * The past is not the future, so this is raised as information rather than a
 * warning unless the assumption is far outside anything the company has
 * achieved.
 */
export function checkGrowthVsRecord(
  growthPhase1: number,
  band: HistoricalBand | null
): AnchorWarning | null {
  if (!band || !band.beyondRecord) return null;

  return {
    id: "growth-vs-record",
    severity: growthPhase1 > band.max ? "warning" : "info",
    message:
      growthPhase1 > band.max
        ? `Phase 1 growth (${pct(growthPhase1)}) is above the fastest year on record (${pct(band.max)}). Worth a reason beyond extrapolation.`
        : `Phase 1 growth (${pct(growthPhase1)}) is below the worst year on record (${pct(band.min)}).`,
  };
}

/**
 * Margin expansion against capital intensity.
 *
 * A terminal margin well above today's implies the business gets structurally
 * more efficient. If capex is not falling as a share of revenue, that story
 * needs a mechanism - operating leverage, mix shift, a cost programme - rather
 * than an assumption that it simply happens.
 */
export function checkMarginVsCapex(params: {
  baseMargin: number;
  terminalMargin: number;
  capexToRevenue: number | null;
  capexTrend: number | null;
  expansionThreshold?: number;
}): AnchorWarning | null {
  const {
    baseMargin,
    terminalMargin,
    capexToRevenue,
    capexTrend,
    expansionThreshold = 0.02,
  } = params;

  const expansion = terminalMargin - baseMargin;
  if (expansion <= expansionThreshold) return null;
  if (capexToRevenue === null || !Number.isFinite(capexToRevenue)) return null;

  // A falling capex ratio is the mechanism; if it is already falling the story
  // holds together and there is nothing to flag.
  if (capexTrend !== null && capexTrend < 0) return null;

  return {
    id: "margin-vs-capex",
    severity: "warning",
    message: `Terminal FCF margin implies ${pct(expansion)} of expansion, but capex is holding at ${pct(capexToRevenue)} of revenue. Check the improvement has a mechanism behind it.`,
  };
}

export interface AnchorInputs {
  growthPhase1: number;
  baseMargin: number;
  terminalMargin: number;
  growthBand: HistoricalBand | null;
  capexToRevenue: number | null;
  capexTrend: number | null;
}

/** Every anchor check, ordered so the strongest evidence reads first. */
export function collectAnchorWarnings(inputs: AnchorInputs): AnchorWarning[] {
  return [
    checkMarginVsCapex({
      baseMargin: inputs.baseMargin,
      terminalMargin: inputs.terminalMargin,
      capexToRevenue: inputs.capexToRevenue,
      capexTrend: inputs.capexTrend,
    }),
    checkGrowthVsRecord(inputs.growthPhase1, inputs.growthBand),
  ].filter((warning): warning is AnchorWarning => warning !== null);
}
