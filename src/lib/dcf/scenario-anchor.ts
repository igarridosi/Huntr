/**
 * DCF — the automatic Bear and Bull, kept on either side of the Base.
 *
 * The wings are generated once, from the statements, at populate. When the
 * user then sets the Base by hand they stay where the generator put them,
 * and nothing keeps them on the right side of it: Haleon's Bear started at
 * an 18.1% margin over a Base of 17.8%, its Bull grew 0.6% a year against
 * the Bear's 3%. The simulation, the decision and the entry zone all read
 * the three together, so an inverted wing turns into a wrong answer.
 *
 * Anchored on the Base: margins and growth rise from Bear to Bull, the
 * discount rate falls, each by at least a minimum gap. A wing already on
 * its side is left exactly as it is, so this is idempotent.
 */

import type { DCFInputs } from "@/lib/calculations/dcf";

type Field = "baseFCFMargin" | "terminalFCFMargin" | "growthRatePhase1" | "growthRatePhase2" | "terminalGrowthRate" | "wacc";

/** Direction from Bear to Bull (+1 rises) and the smallest gap to the Base. */
const RULES: Record<Field, { direction: 1 | -1; gap: (base: number) => number }> = {
  baseFCFMargin: { direction: 1, gap: () => 0.015 },
  terminalFCFMargin: { direction: 1, gap: () => 0.015 },
  growthRatePhase1: { direction: 1, gap: (base) => Math.max(0.01, Math.abs(base) * 0.25) },
  growthRatePhase2: { direction: 1, gap: (base) => Math.max(0.005, Math.abs(base) * 0.15) },
  terminalGrowthRate: { direction: 1, gap: () => 0.0025 },
  wacc: { direction: -1, gap: () => 0.005 },
};

/**
 * The narrowest gap between the discount rate and terminal growth a wing may
 * run on. The exit multiple is 1 / (WACC − g), so the spread is the multiple:
 * Haleon's automatic Bull, at 5.5% against 3.25%, sold the terminal year at
 * 44 times free cash flow and put 82% of a $38 value in it. A wing may be
 * more generous than the Base, but by a point and a half of spread at most,
 * and never under 2.5% (40x).
 */
export const MIN_WING_SPREAD = 0.025;
export const MAX_SPREAD_GIVEAWAY = 0.015;

function wing(side: "bear" | "bull", inputs: DCFInputs, base: DCFInputs): DCFInputs {
  const out = { ...inputs };
  for (const [field, rule] of Object.entries(RULES) as [Field, (typeof RULES)[Field]][]) {
    // Bear sits on the low side of a rising field, Bull on the high side.
    const sign = side === "bull" ? rule.direction : -rule.direction;
    const bound = base[field] + sign * rule.gap(base[field]);
    out[field] = sign > 0 ? Math.max(out[field], bound) : Math.min(out[field], bound);
  }
  const minSpread = Math.max(MIN_WING_SPREAD, base.wacc - base.terminalGrowthRate - MAX_SPREAD_GIVEAWAY);
  if (out.wacc - out.terminalGrowthRate < minSpread) {
    // Raise the discount rate first, as far as its own side of the Base
    // allows, so the wing keeps the growth that makes it a Bull; whatever
    // spread is still missing comes off terminal growth.
    const waccCeiling = side === "bull" ? base.wacc - RULES.wacc.gap(base.wacc) : Infinity;
    out.wacc = Math.max(out.wacc, Math.min(out.terminalGrowthRate + minSpread, waccCeiling));
    if (out.wacc - out.terminalGrowthRate < minSpread) {
      out.terminalGrowthRate = out.wacc - minSpread;
    }
  }
  return out;
}

/** Bear and Bull moved to their own side of the Base where they had crossed it. */
export function anchorWings(set: { bear: DCFInputs; base: DCFInputs; bull: DCFInputs }): { bear: DCFInputs; bull: DCFInputs } {
  return { bear: wing("bear", set.bear, set.base), bull: wing("bull", set.bull, set.base) };
}
