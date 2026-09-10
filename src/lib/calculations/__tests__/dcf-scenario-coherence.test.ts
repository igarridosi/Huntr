import { describe, expect, it } from "vitest";
import {
  checkBaseMarginBelowBear,
  checkBearMarginExpands,
  collectCoherenceWarnings,
} from "../dcf-scenario-coherence";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "./dcf-fixtures";
import type { DCFInputs, DCFScenarioSet } from "../dcf";

const set = (
  bear: Partial<DCFInputs> = {},
  base: Partial<DCFInputs> = {},
  bull: Partial<DCFInputs> = {}
): DCFScenarioSet => ({
  bear: { key: "bear", label: "Bear", icon: "🐻", inputs: { ...BEAR_INPUTS, ...bear } },
  base: { key: "base", label: "Base", icon: "⚓", inputs: { ...BASE_INPUTS, ...base } },
  bull: { key: "bull", label: "Bull", icon: "🐂", inputs: { ...BULL_INPUTS, ...bull } },
  waccEstimate: null as never,
});

describe("checkBearMarginExpands", () => {
  /** ServiceNow: a bear case assuming the margin goes from 17.8% to 31%. */
  it("flags a downside case whose margin nearly doubles", () => {
    const warning = checkBearMarginExpands({
      ...BEAR_INPUTS,
      baseFCFMargin: 0.1778,
      terminalFCFMargin: 0.31,
    });

    expect(warning?.id).toBe("bear-margin-expands");
    expect(warning?.message).toContain("17.8%");
    expect(warning?.message).toContain("31.0%");
  });

  /** QUALCOMM: smaller, same shape. */
  it("flags a modest expansion too", () => {
    expect(
      checkBearMarginExpands({
        ...BEAR_INPUTS,
        baseFCFMargin: 0.1472,
        terminalFCFMargin: 0.18,
      })
    ).not.toBeNull();
  });

  it("says nothing when the bear case compresses", () => {
    expect(
      checkBearMarginExpands({
        ...BEAR_INPUTS,
        baseFCFMargin: 0.22,
        terminalFCFMargin: 0.18,
      })
    ).toBeNull();
  });

  /** A flat margin is not an expansion, and floating point must not say it is. */
  it("says nothing when the two are equal", () => {
    expect(
      checkBearMarginExpands({
        ...BEAR_INPUTS,
        baseFCFMargin: 0.2,
        terminalFCFMargin: 0.1 + 0.1,
      })
    ).toBeNull();
  });
});

describe("checkBaseMarginBelowBear", () => {
  /** YETI: base 7.95% starting under a bear at 9%. */
  it("flags a base case starting below the pessimistic one", () => {
    const warning = checkBaseMarginBelowBear(
      { ...BEAR_INPUTS, baseFCFMargin: 0.09 },
      { ...BASE_INPUTS, baseFCFMargin: 0.0795 }
    );

    expect(warning?.id).toBe("base-margin-below-bear");
    expect(warning?.scenarios).toEqual(["bear", "base"]);
    expect(warning?.message).toContain("wrong way round");
  });

  it("says nothing when they are in order", () => {
    expect(
      checkBaseMarginBelowBear(
        { ...BEAR_INPUTS, baseFCFMargin: 0.09 },
        { ...BASE_INPUTS, baseFCFMargin: 0.12 }
      )
    ).toBeNull();
  });
});

describe("collectCoherenceWarnings", () => {
  it("stays quiet on a coherent set", () => {
    expect(
      collectCoherenceWarnings(
        set(
          { growthRatePhase1: 0.02, baseFCFMargin: 0.15, terminalFCFMargin: 0.14, wacc: 0.12 },
          { growthRatePhase1: 0.06, baseFCFMargin: 0.18, terminalFCFMargin: 0.19, wacc: 0.1 },
          { growthRatePhase1: 0.11, baseFCFMargin: 0.2, terminalFCFMargin: 0.24, wacc: 0.09 }
        )
      )
    ).toEqual([]);
  });

  it("catches growth that does not rise from bear to bull", () => {
    const warnings = collectCoherenceWarnings(
      set({ growthRatePhase1: 0.14 }, { growthRatePhase1: 0.06 }, { growthRatePhase1: 0.11 })
    );
    const ids = warnings.map((warning) => warning.id);
    expect(ids).toContain("growth-not-ordered");
  });

  /**
   * WACC is the one that runs the other way: a bull case is a company the
   * market should demand less return from, not more.
   */
  it("expects WACC to fall from bear to bull", () => {
    const rising = collectCoherenceWarnings(
      set({ wacc: 0.09 }, { wacc: 0.1 }, { wacc: 0.12 })
    );
    expect(rising.map((warning) => warning.id)).toContain("wacc-not-ordered");

    const falling = collectCoherenceWarnings(
      set({ wacc: 0.12 }, { wacc: 0.1 }, { wacc: 0.09 })
    );
    expect(falling.map((warning) => warning.id)).not.toContain("wacc-not-ordered");
  });

  it("catches a terminal margin out of order", () => {
    const warnings = collectCoherenceWarnings(
      set({ terminalFCFMargin: 0.3 }, { terminalFCFMargin: 0.2 }, { terminalFCFMargin: 0.25 })
    );
    expect(warnings.map((warning) => warning.id)).toContain(
      "terminal-margin-not-ordered"
    );
  });

  /** The ServiceNow export, reproduced end to end. */
  it("reports every problem in one incoherent set", () => {
    const warnings = collectCoherenceWarnings(
      set(
        { baseFCFMargin: 0.1778, terminalFCFMargin: 0.31, growthRatePhase1: 0.14, wacc: 0.09 },
        { baseFCFMargin: 0.16, terminalFCFMargin: 0.2, growthRatePhase1: 0.06, wacc: 0.1 },
        { baseFCFMargin: 0.2, terminalFCFMargin: 0.25, growthRatePhase1: 0.11, wacc: 0.12 }
      )
    );

    expect(warnings.map((warning) => warning.id).sort()).toEqual([
      "base-margin-below-bear",
      "bear-margin-expands",
      "growth-not-ordered",
      "terminal-margin-not-ordered",
      "wacc-not-ordered",
    ]);
  });

  /** Every message has to name the figures, or it is not actionable. */
  it("quotes the numbers in every message", () => {
    const warnings = collectCoherenceWarnings(
      set({ baseFCFMargin: 0.1778, terminalFCFMargin: 0.31 }, {}, {})
    );
    for (const warning of warnings) {
      expect(warning.message).toMatch(/\d/);
    }
  });
});
