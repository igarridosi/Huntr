import { describe, expect, it } from "vitest";
import { runDCF } from "../dcf";
import {
  compareToHistory,
  describeReverseDCF,
  solveReverseDCF,
  type ReverseDCFVariable,
} from "../reverse-dcf";
import { BASE_INPUTS } from "./dcf-fixtures";

const VARIABLES: ReverseDCFVariable[] = [
  "growthRatePhase1",
  "terminalFCFMargin",
  "wacc",
  "terminalGrowthRate",
];

describe("solveReverseDCF", () => {
  /**
   * The property that makes the whole feature trustworthy: feed the solved
   * value back into the forward model and the price has to come out again. If
   * this round trip does not close, the sentence the tab prints is fiction.
   */
  it.each(VARIABLES)("round-trips through the forward model: %s", (variable) => {
    const target = 120;
    const solved = solveReverseDCF(BASE_INPUTS, variable, target);

    expect(solved).not.toBeNull();
    expect(solved?.converged).toBe(true);

    const check = runDCF({ ...BASE_INPUTS, [variable]: solved!.impliedValue });
    expect(check.intrinsicValuePerShare).toBeCloseTo(target, 1);
  });

  it("recovers the input it started from", () => {
    // Price the model already produces, so the answer must be the current
    // assumption itself.
    const fair = runDCF(BASE_INPUTS).intrinsicValuePerShare;
    const solved = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", fair);
    expect(solved?.impliedValue).toBeCloseTo(BASE_INPUTS.growthRatePhase1, 3);
  });

  /**
   * A higher discount rate lowers value, so the solver has to search it in the
   * opposite direction from the others. Getting this backwards is the classic
   * bisection bug and would silently return a bound.
   */
  it("handles WACC, which moves value the other way", () => {
    const cheap = solveReverseDCF(BASE_INPUTS, "wacc", 80);
    const dear = solveReverseDCF(BASE_INPUTS, "wacc", 200);
    expect(cheap).not.toBeNull();
    expect(dear).not.toBeNull();
    // A lower price implies the market demands a higher return.
    expect(cheap!.impliedValue).toBeGreaterThan(dear!.impliedValue);
  });

  it("moves the implied growth with the price", () => {
    const low = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 80);
    const high = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 250);
    expect(low!.impliedValue).toBeLessThan(high!.impliedValue);
  });

  /**
   * Returning a clamped bound dressed up as a solution would be worse than
   * admitting the price is not reachable with this variable alone.
   */
  it("returns null when the price is outside any defensible band", () => {
    expect(solveReverseDCF(BASE_INPUTS, "terminalGrowthRate", 100_000)).toBeNull();
  });

  it("refuses a non-positive target", () => {
    expect(solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 0)).toBeNull();
    expect(solveReverseDCF(BASE_INPUTS, "growthRatePhase1", -5)).toBeNull();
  });

  it("always terminates", () => {
    for (const variable of VARIABLES) {
      const solved = solveReverseDCF(BASE_INPUTS, variable, 130);
      expect(solved?.iterations).toBeLessThanOrEqual(80);
    }
  });

  it("reports how far it landed from the target", () => {
    const solved = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 120);
    expect(Math.abs(solved!.residual)).toBeLessThanOrEqual(0.01);
  });

  /**
   * The solver walks through values where WACC crosses terminal growth on its
   * way to an answer. Gordon Growth is undefined there, and it must not throw.
   */
  it("survives the region where WACC meets terminal growth", () => {
    const tight = { ...BASE_INPUTS, terminalGrowthRate: 0.088, wacc: 0.09 };
    expect(() => solveReverseDCF(tight, "wacc", 100)).not.toThrow();
    expect(() => solveReverseDCF(tight, "terminalGrowthRate", 100)).not.toThrow();
  });
});

describe("compareToHistory", () => {
  it("calls the market pessimistic when it assumes less than the record", () => {
    const comparison = compareToHistory(0.018, 0.12, 0.1);
    expect(comparison.marketIsPessimistic).toBe(true);
    expect(comparison.marketIsOptimistic).toBe(false);
    expect(comparison.gapVs5Y).toBeCloseTo(-0.102, 4);
  });

  it("calls it optimistic the other way round", () => {
    const comparison = compareToHistory(0.2, 0.05, 0.04);
    expect(comparison.marketIsOptimistic).toBe(true);
  });

  it("says neither when the gap is small", () => {
    const comparison = compareToHistory(0.11, 0.12, 0.1);
    expect(comparison.marketIsPessimistic).toBe(false);
    expect(comparison.marketIsOptimistic).toBe(false);
  });

  it("declines to judge a company with no record", () => {
    const comparison = compareToHistory(0.05, null, null);
    expect(comparison.gapVs5Y).toBeNull();
    expect(comparison.marketIsPessimistic).toBe(false);
    expect(comparison.marketIsOptimistic).toBe(false);
  });
});

describe("describeReverseDCF", () => {
  it("states the implied assumption in plain language", () => {
    const solved = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 120)!;
    const sentence = describeReverseDCF(solved, BASE_INPUTS);
    expect(sentence).toContain("120.00");
    expect(sentence).toContain("revenue growth");
    expect(sentence).toContain("5 years");
  });

  it("adds the company's own record when there is one", () => {
    const solved = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 120)!;
    const sentence = describeReverseDCF(
      solved,
      BASE_INPUTS,
      compareToHistory(solved.impliedValue, 0.12, 0.1)
    );
    expect(sentence).toContain("12.0%");
    expect(sentence).toContain("last five years");
  });

  it("says nothing about history it does not have", () => {
    const solved = solveReverseDCF(BASE_INPUTS, "growthRatePhase1", 120)!;
    const sentence = describeReverseDCF(
      solved,
      BASE_INPUTS,
      compareToHistory(solved.impliedValue, null, null)
    );
    expect(sentence).not.toContain("last five years");
  });
});
