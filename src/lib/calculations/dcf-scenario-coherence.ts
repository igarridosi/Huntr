import type { DCFInputs, DCFScenarioSet } from "./dcf";
import { formatPercent } from "@/lib/utils";

/**
 * Whether the three scenarios still mean what their names say.
 *
 * Bear, Base and Bull are not three arbitrary parameter sets - they are an
 * ordering. The bear case is supposed to be the pessimistic one, and once it
 * assumes a margin that nearly doubles while the base case starts below it,
 * the labels have stopped describing the contents. Every downstream artefact
 * inherits that: the stress case takes the lower of bear and the simulation
 * P5, the scenario weights assume an ordering, and the export presents the
 * three as a range.
 *
 * These checks exist because a slider's track can be clicked. A click a few
 * pixels off sets a value by pixel proportion, the label updates, and nothing
 * else in the interface reacts - so ServiceNow ended up with a bear case
 * assuming margin expansion from 17.8% to 31%, and YETI with a base case
 * starting below its own bear. Neither was visible without exporting the JSON
 * and reading it.
 *
 * Non-blocking on purpose. There are legitimate reasons to build a bear case
 * with expanding margins - a company mid-turnaround where the downside is
 * about volume, not profitability. The point is to make the departure
 * deliberate rather than accidental.
 */
export type CoherenceWarningId =
  | "bear-margin-expands"
  | "base-margin-below-bear"
  | "growth-not-ordered"
  | "terminal-margin-not-ordered"
  | "wacc-not-ordered";

export interface CoherenceWarning {
  id: CoherenceWarningId;
  /** Which scenarios the warning is about, for highlighting the table. */
  scenarios: ReadonlyArray<"bear" | "base" | "bull">;
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
 * A hair of tolerance, so an equality that is only unequal in floating point
 * does not raise a warning about a difference nobody made.
 */
const EPSILON = 1e-9;

/**
 * The bear case assuming its own margin improves.
 *
 * Not wrong in itself - it is wrong as a *bear* case, because the margin path
 * runs from the starting figure to the terminal one across every projected
 * year, so this one assumption lifts the whole projection.
 */
export function checkBearMarginExpands(bear: DCFInputs): CoherenceWarning | null {
  if (bear.terminalFCFMargin <= bear.baseFCFMargin + EPSILON) return null;

  return {
    id: "bear-margin-expands",
    scenarios: ["bear"],
    message: `The bear case assumes the FCF margin expands from ${pct(bear.baseFCFMargin)} to ${pct(bear.terminalFCFMargin)}. That lifts every projected year, not just the terminal one. Is that intended for the downside case?`,
  };
}

/** The base case starting below the pessimistic one. */
export function checkBaseMarginBelowBear(
  bear: DCFInputs,
  base: DCFInputs
): CoherenceWarning | null {
  if (base.baseFCFMargin >= bear.baseFCFMargin - EPSILON) return null;

  return {
    id: "base-margin-below-bear",
    scenarios: ["bear", "base"],
    message: `The base case starts at a lower FCF margin (${pct(base.baseFCFMargin)}) than the bear case (${pct(bear.baseFCFMargin)}), so the two are the wrong way round.`,
  };
}

function checkOrdering(params: {
  id: CoherenceWarningId;
  label: string;
  bear: number;
  base: number;
  bull: number;
  /** "up" means bear ≤ base ≤ bull; "down" is the reverse. */
  direction: "up" | "down";
  format?: (value: number) => string;
}): CoherenceWarning | null {
  const { id, label, bear, base, bull, direction } = params;
  const format = params.format ?? pct;

  const ordered =
    direction === "up"
      ? bear <= base + EPSILON && base <= bull + EPSILON
      : bear >= base - EPSILON && base >= bull - EPSILON;

  if (ordered) return null;

  return {
    id,
    scenarios: ["bear", "base", "bull"],
    message: `${label} does not run in order across the three cases: ${format(bear)} bear, ${format(base)} base, ${format(bull)} bull. ${
      direction === "up"
        ? "It should rise from bear to bull."
        : "It should fall from bear to bull, since the bull case carries less risk."
    }`,
  };
}

export function collectCoherenceWarnings(
  scenarios: DCFScenarioSet
): CoherenceWarning[] {
  const bear = scenarios.bear.inputs;
  const base = scenarios.base.inputs;
  const bull = scenarios.bull.inputs;

  return [
    checkBearMarginExpands(bear),
    checkBaseMarginBelowBear(bear, base),
    checkOrdering({
      id: "growth-not-ordered",
      label: "Phase 1 growth",
      bear: bear.growthRatePhase1,
      base: base.growthRatePhase1,
      bull: bull.growthRatePhase1,
      direction: "up",
    }),
    checkOrdering({
      id: "terminal-margin-not-ordered",
      label: "Terminal FCF margin",
      bear: bear.terminalFCFMargin,
      base: base.terminalFCFMargin,
      bull: bull.terminalFCFMargin,
      direction: "up",
    }),
    // The discount rate is the one that runs the other way: a bull case is a
    // company the market should require less return from, not more.
    checkOrdering({
      id: "wacc-not-ordered",
      label: "WACC",
      bear: bear.wacc,
      base: base.wacc,
      bull: bull.wacc,
      direction: "down",
    }),
  ].filter((warning): warning is CoherenceWarning => warning !== null);
}
