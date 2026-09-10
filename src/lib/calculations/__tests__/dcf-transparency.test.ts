import { describe, expect, it } from "vitest";
import { runDCF } from "../dcf";
import {
  WACC_OVERRIDE_TOLERANCE,
  buildOperatingSensitivity,
  buildSensitivityAxes,
  buildTornado,
  impliedExitMultiple,
  readTerminalWeight,
  reconcileWACC,
} from "../dcf-transparency";
import { BASE_INPUTS } from "./dcf-fixtures";

const estimate = {
  costOfEquity: 0.12,
  costOfDebt: 0.05,
  wacc: 0.115,
  weightEquity: 0.85,
  weightDebt: 0.15,
};

describe("reconcileWACC", () => {
  /**
   * The gap the plan describes: sitting on 9.5% while the components imply
   * 11.5%, with nothing on screen disagreeing.
   */
  it("flags a WACC that contradicts its own components", () => {
    const reconciliation = reconcileWACC(0.095, estimate);
    expect(reconciliation.isOverride).toBe(true);
    expect(reconciliation.gap).toBeCloseTo(-0.02, 6);
    expect(reconciliation.calculated).toBeCloseTo(0.115, 6);
  });

  it("stays quiet inside half a percentage point", () => {
    expect(reconcileWACC(0.117, estimate).isOverride).toBe(false);
    expect(reconcileWACC(0.122, estimate).isOverride).toBe(true);
    expect(WACC_OVERRIDE_TOLERANCE).toBe(0.005);
  });

  /**
   * With no debt the weighted average is just the cost of equity. If it is
   * not, the capital structure came from somewhere other than this company.
   */
  it("notices an all-equity company", () => {
    const noDebt = { ...estimate, weightDebt: 0, weightEquity: 1, wacc: 0.12 };
    expect(reconcileWACC(0.12, noDebt).isAllEquity).toBe(true);
    expect(reconcileWACC(0.12, estimate).isAllEquity).toBe(false);
  });

  it("makes no claim without an estimate to compare against", () => {
    const reconciliation = reconcileWACC(0.1, null);
    expect(reconciliation.calculated).toBeNull();
    expect(reconciliation.gap).toBeNull();
    expect(reconciliation.isOverride).toBe(false);
  });
});

describe("impliedExitMultiple", () => {
  it("restates the spread as a multiple of final-year cash flow", () => {
    expect(impliedExitMultiple(0.1, 0.025)).toBeCloseTo(13.33, 2);
    expect(impliedExitMultiple(0.09, 0.02)).toBeCloseTo(14.29, 2);
  });

  /**
   * The smell test the multiple exists for: a spread that looks innocuous
   * turns into a multiple nobody would defend out loud.
   */
  it("exposes a spread that has quietly collapsed", () => {
    expect(impliedExitMultiple(0.08, 0.045)).toBeCloseTo(28.57, 2);
  });

  it("returns null where the model itself is undefined", () => {
    expect(impliedExitMultiple(0.05, 0.05)).toBeNull();
    expect(impliedExitMultiple(0.04, 0.06)).toBeNull();
  });
});

describe("readTerminalWeight", () => {
  it("reads a healthy share", () => {
    const reading = readTerminalWeight(30, 100);
    expect(reading.band).toBe("healthy");
    expect(reading.message).toContain("actually projected");
  });

  it("reads the middle band", () => {
    expect(readTerminalWeight(50, 100).band).toBe("elevated");
    expect(readTerminalWeight(60, 100).band).toBe("elevated");
  });

  it("reads a dominant terminal value", () => {
    const reading = readTerminalWeight(75, 100);
    expect(reading.band).toBe("dominant");
    expect(reading.message).toContain("More than half");
  });

  it("sits on the thresholds the way the plan sets them", () => {
    expect(readTerminalWeight(39.9, 100).band).toBe("healthy");
    expect(readTerminalWeight(40, 100).band).toBe("elevated");
    expect(readTerminalWeight(60.1, 100).band).toBe("dominant");
  });

  it("does not divide by zero on an empty model", () => {
    expect(readTerminalWeight(0, 0).weight).toBe(0);
  });
});

describe("buildTornado", () => {
  const bars = buildTornado(BASE_INPUTS);

  it("covers every input it tests", () => {
    expect(bars).toHaveLength(6);
  });

  /** The ordering is the whole point: it says where to spend research effort. */
  it("ranks by impact, largest first", () => {
    for (let i = 0; i < bars.length - 1; i++) {
      expect(bars[i].swing).toBeGreaterThanOrEqual(bars[i + 1].swing);
    }
  });

  /**
   * A point of WACC and two points of margin are different quantities of
   * error. Using one delta for everything would be tidier and meaningless.
   */
  it("moves rates by a point and margins by two", () => {
    expect(bars.find((bar) => bar.key === "wacc")?.delta).toBe(0.01);
    expect(bars.find((bar) => bar.key === "terminalFCFMargin")?.delta).toBe(0.02);
  });

  it("puts a higher WACC on the low side, since it lowers value", () => {
    const wacc = bars.find((bar) => bar.key === "wacc")!;
    expect(wacc.highValue).toBeLessThan(wacc.lowValue);
  });

  it("puts more growth on the high side", () => {
    const growth = bars.find((bar) => bar.key === "growthRatePhase1")!;
    expect(growth.highValue).toBeGreaterThan(growth.lowValue);
  });

  it("reports the same base valuation the model produces", () => {
    const fair = runDCF(BASE_INPUTS).intrinsicValuePerShare;
    for (const bar of bars) expect(bar.baseValue).toBeCloseTo(fair, 6);
  });

  /**
   * Nudging a rate can close the Gordon Growth spread. The bar has to report
   * the effect of the change, not the effect of the model breaking.
   */
  it("survives inputs that would close the terminal spread", () => {
    const tight = { ...BASE_INPUTS, wacc: 0.035, terminalGrowthRate: 0.03 };
    const risky = buildTornado(tight);
    expect(risky.every((bar) => Number.isFinite(bar.swing))).toBe(true);
  });

  /**
   * A company with no revenue is still worth its net cash, so the model does
   * produce a valuation - it just is not one any operating assumption can move.
   * The bars should say exactly that rather than inventing sensitivity.
   */
  it("shows no sensitivity in a valuation made entirely of net cash", () => {
    const cashOnly = buildTornado({ ...BASE_INPUTS, baseRevenue: 0 });
    expect(cashOnly.length).toBeGreaterThan(0);
    for (const bar of cashOnly) expect(bar.swing).toBeCloseTo(0, 6);
  });

  it("returns nothing when the model produces no value at all", () => {
    expect(
      buildTornado({
        ...BASE_INPUTS,
        baseRevenue: 0,
        cashAndEquivalents: 0,
        totalDebt: 50_000_000_000,
      })
    ).toEqual([]);
  });
});

describe("buildSensitivityAxes", () => {
  it("centres the financial grid on the current assumptions", () => {
    const axes = buildSensitivityAxes(BASE_INPUTS, "financial");
    expect(axes.rowValues[2]).toBeCloseTo(BASE_INPUTS.wacc, 6);
    expect(axes.colValues[2]).toBeCloseTo(BASE_INPUTS.terminalGrowthRate, 6);
    expect(axes.rowLabel).toBe("WACC");
  });

  /**
   * The existing grid is two financial assumptions, so it says nothing about
   * the business. This is the operating pair.
   */
  it("offers an operating grid as well", () => {
    const axes = buildSensitivityAxes(BASE_INPUTS, "operating");
    expect(axes.rowLabel).toBe("Phase 1 growth");
    expect(axes.colLabel).toBe("Terminal FCF margin");
    expect(axes.rowValues[2]).toBeCloseTo(BASE_INPUTS.growthRatePhase1, 6);
  });

  it("keeps both axes inside sane bounds", () => {
    const extreme = { ...BASE_INPUTS, wacc: 0.04, terminalGrowthRate: 0.0 };
    const axes = buildSensitivityAxes(extreme, "financial");
    expect(Math.min(...axes.rowValues)).toBeGreaterThanOrEqual(0.03);
    expect(Math.min(...axes.colValues)).toBeGreaterThanOrEqual(-0.02);
  });

  it("gives five steps per axis", () => {
    const axes = buildSensitivityAxes(BASE_INPUTS, "operating");
    expect(axes.rowValues).toHaveLength(5);
    expect(axes.colValues).toHaveLength(5);
  });
});

describe("buildOperatingSensitivity", () => {
  it("fills the grid", () => {
    const cells = buildOperatingSensitivity(BASE_INPUTS, [0.08, 0.1], [0.24, 0.28]);
    expect(cells).toHaveLength(4);
  });

  it("rises with both growth and margin", () => {
    const cells = buildOperatingSensitivity(BASE_INPUTS, [0.05, 0.15], [0.2, 0.3]);
    const worst = cells.find((c) => c.growth === 0.05 && c.margin === 0.2)!;
    const best = cells.find((c) => c.growth === 0.15 && c.margin === 0.3)!;
    expect(best.intrinsicValue).toBeGreaterThan(worst.intrinsicValue);
  });
});
