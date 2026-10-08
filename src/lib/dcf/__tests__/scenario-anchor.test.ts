import { describe, expect, it } from "vitest";
import type { DCFInputs } from "@/lib/calculations/dcf";
import { anchorWings } from "../scenario-anchor";

const inputs = (over: Partial<DCFInputs>): DCFInputs =>
  ({
    baseRevenue: 14_620e6,
    baseFCFMargin: 0.178,
    terminalFCFMargin: 0.19,
    growthRatePhase1: 0.03,
    growthRatePhase2: 0.025,
    terminalGrowthRate: 0.025,
    wacc: 0.07,
    yearsPhase1: 5,
    yearsPhase2: 5,
    totalDebt: 0,
    cashAndEquivalents: 0,
    sharesOutstanding: 4_476e6,
    currentPrice: 10,
    ...over,
  }) as DCFInputs;

describe("anchorWings", () => {
  it("puts Haleon's crossed wings back on their side of a Base set by hand", () => {
    const base = inputs({});
    const { bear, bull } = anchorWings({
      bear: inputs({ baseFCFMargin: 0.181, growthRatePhase1: 0.03, wacc: 0.08 }),
      base,
      bull: inputs({ baseFCFMargin: 0.2, growthRatePhase1: 0.006, wacc: 0.06 }),
    });
    for (const f of ["baseFCFMargin", "terminalFCFMargin", "growthRatePhase1", "growthRatePhase2", "terminalGrowthRate"] as const) {
      expect(bear[f]).toBeLessThan(base[f]);
      expect(bull[f]).toBeGreaterThan(base[f]);
    }
    expect(bear.wacc).toBeGreaterThan(base.wacc);
    expect(bull.wacc).toBeLessThan(base.wacc);
    expect(bull.wacc - bull.terminalGrowthRate).toBeGreaterThanOrEqual(0.01 - 1e-12);
  });

  it("keeps the Bull's exit multiple within reach of the Base's (Haleon: 5.5% against 3.25% was 44x)", () => {
    // The Base Ibai set: 7.5% and 3%, a 22x exit. The generated Bull ran at
    // 5.5% and 3.25% and put 82% of a $38 value in the terminal year.
    const base = inputs({ wacc: 0.075, terminalGrowthRate: 0.03 });
    const { bull } = anchorWings({ bear: inputs({ wacc: 0.08, terminalGrowthRate: 0.02 }), base, bull: inputs({ wacc: 0.055, terminalGrowthRate: 0.0325 }) });
    const spread = bull.wacc - bull.terminalGrowthRate;
    expect(spread).toBeCloseTo(0.03, 10);
    // The growth that makes it a Bull is kept; the discount rate gave way.
    expect(bull.terminalGrowthRate).toBeCloseTo(0.0325, 10);
    expect(bull.wacc).toBeLessThan(base.wacc);
    expect(1 / spread).toBeLessThan(35);
  });

  it("leaves wings already on their side exactly as they are", () => {
    const set = {
      bear: inputs({ baseFCFMargin: 0.14, terminalFCFMargin: 0.15, growthRatePhase1: 0.01, growthRatePhase2: 0.015, terminalGrowthRate: 0.02, wacc: 0.08 }),
      base: inputs({}),
      bull: inputs({ baseFCFMargin: 0.21, terminalFCFMargin: 0.22, growthRatePhase1: 0.06, growthRatePhase2: 0.035, terminalGrowthRate: 0.028, wacc: 0.062 }),
    };
    const { bear, bull } = anchorWings(set);
    expect(bear).toEqual(set.bear);
    expect(bull).toEqual(set.bull);
    expect(anchorWings({ ...set, bear, bull })).toEqual({ bear, bull });
  });
});
