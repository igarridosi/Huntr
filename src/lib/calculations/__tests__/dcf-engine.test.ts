import { describe, expect, it } from "vitest";
import { runDCF } from "../dcf";
import { BASE_INPUTS } from "./dcf-fixtures";

describe("FCF margin path", () => {
  /**
   * Documents what the model has always done, which was not visible anywhere
   * in the interface: the terminal margin is not reserved for the terminal
   * value. It is interpolated across every projected year, which makes it one
   * of the most leveraged inputs on the panel.
   */
  it("interpolates linearly by default, so terminal margin drives every year", () => {
    const result = runDCF({ ...BASE_INPUTS, baseFCFMargin: 0.2, terminalFCFMargin: 0.3 });
    const margins = result.projections.map((p) => p.fcfMargin);

    expect(margins[0]).toBeCloseTo(0.21, 4);
    expect(margins[4]).toBeCloseTo(0.25, 4);
    expect(margins[9]).toBeCloseTo(0.30, 4);
  });

  it("holds the base margin flat in constant mode", () => {
    const result = runDCF({
      ...BASE_INPUTS,
      baseFCFMargin: 0.2,
      terminalFCFMargin: 0.3,
      fcfMarginMode: "constant",
    });
    for (const projection of result.projections) {
      expect(projection.fcfMargin).toBeCloseTo(0.2, 6);
    }
  });

  /**
   * Gradual convergence front-loads less of the improvement than a straight
   * line, so it is the more conservative of the two paths to the same endpoint.
   */
  it("converges gradually, staying below the linear path throughout", () => {
    const linear = runDCF({ ...BASE_INPUTS, baseFCFMargin: 0.2, terminalFCFMargin: 0.3 });
    const gradual = runDCF({
      ...BASE_INPUTS,
      baseFCFMargin: 0.2,
      terminalFCFMargin: 0.3,
      fcfMarginMode: "converge",
    });

    for (let i = 0; i < linear.projections.length - 1; i++) {
      expect(gradual.projections[i].fcfMargin).toBeLessThan(
        linear.projections[i].fcfMargin
      );
    }
    const last = gradual.projections[gradual.projections.length - 1];
    expect(last.fcfMargin).toBeCloseTo(0.3, 4);
    expect(gradual.intrinsicValuePerShare).toBeLessThan(linear.intrinsicValuePerShare);
  });

  it("leaves margins alone when base and terminal already agree", () => {
    for (const mode of ["constant", "linear", "converge"] as const) {
      const result = runDCF({
        ...BASE_INPUTS,
        baseFCFMargin: 0.25,
        terminalFCFMargin: 0.25,
        fcfMarginMode: mode,
      });
      for (const projection of result.projections) {
        expect(projection.fcfMargin).toBeCloseTo(0.25, 6);
      }
    }
  });
});

describe("mid-year convention", () => {
  it("discounts at t - 0.5 instead of t", () => {
    const endYear = runDCF(BASE_INPUTS);
    const midYear = runDCF({ ...BASE_INPUTS, midYearConvention: true });

    expect(endYear.projections[0].discountFactor).toBeCloseTo(
      1 / Math.pow(1 + BASE_INPUTS.wacc, 1),
      6
    );
    expect(midYear.projections[0].discountFactor).toBeCloseTo(
      1 / Math.pow(1 + BASE_INPUTS.wacc, 0.5),
      6
    );
  });

  /**
   * The standard banking convention, and worth roughly 4-5% on the valuation:
   * cash arrives through the year rather than all on 31 December.
   */
  it("raises the valuation by a few percent", () => {
    const endYear = runDCF(BASE_INPUTS);
    const midYear = runDCF({ ...BASE_INPUTS, midYearConvention: true });

    const lift = midYear.intrinsicValuePerShare / endYear.intrinsicValuePerShare - 1;
    expect(lift).toBeGreaterThan(0.02);
    expect(lift).toBeLessThan(0.08);
  });

  it("applies the same convention to the terminal value", () => {
    const midYear = runDCF({ ...BASE_INPUTS, midYearConvention: true });
    const totalYears = BASE_INPUTS.yearsPhase1 + BASE_INPUTS.yearsPhase2;
    const expected =
      midYear.terminalValue / Math.pow(1 + BASE_INPUTS.wacc, totalYears - 0.5);
    expect(midYear.pvTerminalValue).toBeCloseTo(expected, 2);
  });
});

describe("defaults are unchanged", () => {
  /**
   * The engine is verified and must keep producing exactly what it produced
   * before these options existed. Anything else is a silent revaluation of
   * every saved scenario.
   */
  it("matches the previous behaviour when no options are passed", () => {
    const result = runDCF(BASE_INPUTS);
    expect(result.projections[0].discountFactor).toBeCloseTo(
      1 / (1 + BASE_INPUTS.wacc),
      10
    );
    const marginProgress = 1 / (BASE_INPUTS.yearsPhase1 + BASE_INPUTS.yearsPhase2);
    expect(result.projections[0].fcfMargin).toBeCloseTo(
      BASE_INPUTS.baseFCFMargin +
        (BASE_INPUTS.terminalFCFMargin - BASE_INPUTS.baseFCFMargin) * marginProgress,
      10
    );
  });
});
