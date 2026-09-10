import { describe, expect, it } from "vitest";
import { buildScenarioExport, scenarioExportFilename } from "../dcf-export";
import {
  applySourcedBalanceSheet,
  buildSourcedFields,
} from "../dcf-inputs-source";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "./dcf-fixtures";
import type { DCFScenarioSet } from "../dcf";
import { assessValuation } from "../dcf-currency";

function fact(value: number): SECFact {
  return {
    value,
    form: "10-Q",
    filed: "2026-07-31",
    periodEnd: "2026-06-30",
    concept: "TestConcept",
    durationDays: 0,
  };
}

const sec: SECFundamentals = {
  cik: "0000000001",
  dilutedShares: fact(108_400_000),
  coverShares: null,
  weightedDilutedShares: null,
  financialDebt: fact(200_000_000),
  cash: fact(3_000_000_000),
  operatingLeases: fact(2_140_000_000),
  operatingLeaseExpense: fact(310_000_000),
  shareBasedCompensation: fact(29_190_000),
};

const scenarios: DCFScenarioSet = {
  bear: { key: "bear", label: "Bear", icon: "🐻", inputs: BEAR_INPUTS },
  base: { key: "base", label: "Base", icon: "⚓", inputs: BASE_INPUTS },
  bull: { key: "bull", label: "Bull", icon: "🐂", inputs: BULL_INPUTS },
  waccEstimate: null as never,
};

const build = (overrides: Partial<Parameters<typeof buildScenarioExport>[0]> = {}) =>
  buildScenarioExport({
    ticker: "lulu",
    companyName: "lululemon athletica inc.",
    currentPrice: 120.81,
    scenarios,
    activeScenario: "base",
    liveInputs: BASE_INPUTS,
    now: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  });

describe("buildScenarioExport", () => {
  it("carries all three scenarios with their assumptions and outputs", () => {
    const exported = build();

    expect(exported.scenarios.map((entry) => entry.key)).toEqual([
      "bear",
      "base",
      "bull",
    ]);
    for (const entry of exported.scenarios) {
      expect(entry.assumptions.wacc).toBeGreaterThan(0);
      expect(entry.outputs.intrinsicValuePerShare).toBeGreaterThan(0);
      expect(entry.projection.length).toBe(
        entry.assumptions.yearsPhase1 + entry.assumptions.yearsPhase2
      );
    }
  });

  /**
   * The whole point of the file is that it says what is on screen. Exporting
   * the scenario as generated, after the user has moved a slider, would hand a
   * model a different valuation than the one the person is looking at.
   */
  it("exports the active scenario as it currently stands, not as generated", () => {
    const edited = { ...BASE_INPUTS, wacc: BASE_INPUTS.wacc + 0.03 };
    const exported = build({ liveInputs: edited });

    const base = exported.scenarios.find((entry) => entry.key === "base")!;
    const bear = exported.scenarios.find((entry) => entry.key === "bear")!;

    expect(base.assumptions.wacc).toBeCloseTo(edited.wacc, 10);
    // The inactive ones keep their stored assumptions.
    expect(bear.assumptions.wacc).toBeCloseTo(BEAR_INPUTS.wacc, 10);
  });

  it("attaches the balance sheet with its provenance", () => {
    const fields = buildSourcedFields({
      sec,
      yahoo: {},
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
      includeLeases: false,
    });

    const exported = build({ sourcedFields: fields });

    expect(exported.balanceSheet?.fromFilings).toBe(true);
    expect(exported.balanceSheet?.cash).toBe(3_000_000_000);
    expect(exported.balanceSheet?.leasesCapitalised).toBe(false);
    expect(exported.balanceSheet?.netDebt).toBeCloseTo(-2_800_000_000, 2);
  });

  /**
   * A caveat that survives in the interface but not in the export would make
   * the file more confident than the screen it came from.
   */
  it("carries the cash caveat into the file", () => {
    const fields = buildSourcedFields({
      sec: { ...sec, cash: { ...fact(3_000_000_000), includesRestricted: true } },
      yahoo: {},
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
      includeLeases: false,
    });

    const exported = build({ sourcedFields: fields });
    expect(exported.balanceSheet?.caveats.join(" ")).toContain("restricted cash");
  });

  it("normalises the ticker and stays serialisable", () => {
    const exported = build();
    expect(exported.ticker).toBe("LULU");
    expect(() => JSON.parse(JSON.stringify(exported))).not.toThrow();
  });

  it("omits the optional blocks rather than inventing them", () => {
    const exported = build();
    expect(exported.balanceSheet).toBeNull();
    expect(exported.simulation).toBeNull();
    expect(exported.decision).toBeNull();
    expect(exported.warnings).toEqual([]);
  });
});

describe("scenarioExportFilename", () => {
  it("names the file by company and date", () => {
    expect(scenarioExportFilename("lulu", new Date("2026-09-01T10:00:00Z"))).toBe(
      "LULU-dcf-2026-09-01.json"
    );
  });
});

/**
 * BUG A, asserted on the file rather than on the function.
 *
 * The previous rounds of this fix each corrected one handler and were declared
 * done. They came back because nothing checked the artefact: net debt is a
 * property of the company, so `scenarios[i].outputs.netDebt` has to equal
 * `balanceSheet.netDebt` for every i, on every export, whatever the interface
 * was doing when the button was pressed.
 */
describe("company facts are identical across scenarios in the exported file", () => {
  const fields = buildSourcedFields({
    sec,
    yahoo: {},
    price: 120.81,
    reportedMarketCap: 13_720_000_000,
    includeLeases: false,
  });

  /**
   * The ServiceNow shape.
   *
   * The live copy carries the sourced balance sheet, because the toggle that
   * changed it wrote there; the two inactive scenarios still hold what
   * populate gave them.
   */
  const liveBase = applySourcedBalanceSheet(BASE_INPUTS, fields);

  const divergent: DCFScenarioSet = {
    ...scenarios,
    bear: {
      ...scenarios.bear,
      inputs: {
        ...BEAR_INPUTS,
        totalDebt: 2_932_000_000,
        cashAndEquivalents: 0,
        sharesOutstanding: 207_000_000,
      },
    },
    bull: {
      ...scenarios.bull,
      inputs: {
        ...BULL_INPUTS,
        totalDebt: 2_932_000_000,
        cashAndEquivalents: 0,
        sharesOutstanding: 207_000_000,
      },
    },
  };

  it("writes one net debt for all three, matching the balance sheet", () => {
    const exported = build({
      scenarios: divergent,
      liveInputs: liveBase,
      sourcedFields: fields,
    });

    const netDebts = exported.scenarios.map((entry) => entry.outputs.netDebt);
    expect(new Set(netDebts).size).toBe(1);
    expect(netDebts[0]).toBeCloseTo(exported.balanceSheet!.netDebt, 2);
  });

  it("writes one share count and one revenue base for all three", () => {
    const exported = build({
      scenarios: divergent,
      liveInputs: liveBase,
      sourcedFields: fields,
    });

    expect(
      new Set(exported.scenarios.map((entry) => entry.assumptions.baseRevenue)).size
    ).toBe(1);
    expect(exported.balanceSheet!.sharesOutstanding).toBe(
      fields.sharesOutstanding.value
    );
    // Per-share figures are only comparable if the denominator is.
    const perShare = exported.scenarios.map(
      (entry) => entry.outputs.equityValue / entry.outputs.intrinsicValuePerShare
    );
    for (const count of perShare) {
      expect(count).toBeCloseTo(perShare[0], 0);
    }
  });

  /** Correcting silently would hide the bug the next time it appears. */
  it("names every scenario and field that disagreed", () => {
    const exported = build({
      scenarios: divergent,
      liveInputs: liveBase,
      sourcedFields: fields,
    });

    expect(exported.integrity.divergences.length).toBeGreaterThan(0);
    const reported = exported.integrity.divergences.map(
      (divergence) => `${divergence.scenario}.${divergence.field}`
    );
    expect(reported).toContain("bear.totalDebt");
    expect(reported).toContain("bull.totalDebt");
    expect(reported).toContain("bear.sharesOutstanding");
    // Base was the active scenario and held the sourced figures already.
    expect(reported.filter((name) => name.startsWith("base."))).toEqual([]);
  });

  it("reports no divergence when every scenario already agrees", () => {
    const agreed: DCFScenarioSet = {
      ...scenarios,
      bear: {
        ...scenarios.bear,
        inputs: applySourcedBalanceSheet(BEAR_INPUTS, fields),
      },
      base: {
        ...scenarios.base,
        inputs: applySourcedBalanceSheet(BASE_INPUTS, fields),
      },
      bull: {
        ...scenarios.bull,
        inputs: applySourcedBalanceSheet(BULL_INPUTS, fields),
      },
    };

    const exported = build({
      scenarios: agreed,
      liveInputs: applySourcedBalanceSheet(BASE_INPUTS, fields),
      sourcedFields: fields,
    });

    expect(exported.integrity.divergences).toEqual([]);
    expect(exported.integrity.companyFactsChecked).toContain("totalDebt");
  });

  /**
   * The assumptions are the half that is *supposed* to differ. A fix that made
   * the three scenarios identical would satisfy the invariant and destroy the
   * feature.
   */
  it("leaves the operating assumptions untouched", () => {
    const exported = build({
      scenarios: divergent,
      liveInputs: liveBase,
      sourcedFields: fields,
    });

    const waccs = exported.scenarios.map((entry) => entry.assumptions.wacc);
    expect(new Set(waccs).size).toBe(3);
    const values = exported.scenarios.map(
      (entry) => entry.outputs.intrinsicValuePerShare
    );
    expect(values[0]).toBeLessThan(values[1]);
    expect(values[1]).toBeLessThan(values[2]);
  });

  it("still corrects the scenarios when there are no filings to anchor to", () => {
    const exported = build({ scenarios: divergent, sourcedFields: null });

    const netDebts = exported.scenarios.map((entry) => entry.outputs.netDebt);
    expect(new Set(netDebts).size).toBe(1);
    // With nothing filed, the live inputs are the reference.
    expect(netDebts[0]).toBeCloseTo(
      BASE_INPUTS.totalDebt - BASE_INPUTS.cashAndEquivalents,
      2
    );
  });
});

/**
 * BUG D on the artefact.
 *
 * The screen refusing to show a number is only half of it: the export is what
 * a language model reads, and a `decision.signal` of "Strong Buy" in a file is
 * acted on more readily than one on a screen, because the caveat beside it is
 * not part of the field.
 */
describe("currency reaches the exported file", () => {
  const usable = assessValuation({
    priceCurrency: "USD",
    financialCurrency: "USD",
    upside: 0.3,
  });
  const mismatched = assessValuation({
    priceCurrency: "USD",
    financialCurrency: "JPY",
    upside: 5.66,
  });

  const decision = {
    conviction: {
      score: 96,
      signal: "Strong Buy" as const,
      positionSize: "8% - 10%",
      factors: [],
    },
    stress: {
      value: 30,
      source: "bear-scenario" as const,
      bearValue: 30,
      simulationP5: 31,
    },
    zones: {
      entryLow: 30,
      entryHigh: 40,
      trim: 60,
      clampedForSignal: false,
      relevant: true,
      gapToPrice: 0.1,
    },
  };

  it("names the unit every figure is in", () => {
    const exported = build({ guard: usable });
    expect(exported.currency.reporting).toBe("USD");
    expect(exported.currency.price).toBe("USD");
    expect(exported.currency.mismatch).toBe(false);
    expect(exported.currency.usable).toBe(true);
  });

  it("records the mismatch and drops the recommendation", () => {
    const exported = build({ guard: mismatched, ...decision });

    expect(exported.currency.mismatch).toBe(true);
    expect(exported.currency.reporting).toBe("JPY");
    expect(exported.currency.price).toBe("USD");
    expect(exported.currency.reason).toBe("currency-mismatch");
    // The one field a downstream reader would act on.
    expect(exported.decision).toBeNull();
  });

  it("keeps the recommendation when the valuation is sound", () => {
    const exported = build({ guard: usable, ...decision });
    expect(exported.decision?.signal).toBe("Strong Buy");
  });

  /**
   * The assumptions are what makes the failure diagnosable, so they stay. It
   * is the verdict that has to go.
   */
  it("still exports the scenarios so the failure can be diagnosed", () => {
    const exported = build({ guard: mismatched, ...decision });
    expect(exported.scenarios).toHaveLength(3);
    expect(exported.scenarios[0].assumptions.baseRevenue).toBeGreaterThan(0);
  });

  it("assumes usable when no guard was supplied", () => {
    const exported = build();
    expect(exported.currency.usable).toBe(true);
    expect(exported.currency.reporting).toBeNull();
  });
});

/**
 * BUG G — the upside that reported zero.
 *
 * `runDCF` returns an upside of 0 when there is no price to compare against,
 * which is correct. What was not correct was how the scenarios came to hold no
 * price: the effect that syncs the live inputs into the active scenario zeroed
 * `currentPrice` to keep a ticking quote from counting as an edit, and then
 * stored the zeroed copy. Every scenario that had ever been selected lost its
 * price, and only the active one looked right because the export runs that one
 * from the live inputs.
 */
describe("upside survives the export with its sign", () => {
  const priced = (price: number) => ({ ...BASE_INPUTS, currentPrice: price });

  /** THC: two scenarios that had been visited, so both had lost their price. */
  const visited: DCFScenarioSet = {
    ...scenarios,
    bear: {
      ...scenarios.bear,
      inputs: { ...BEAR_INPUTS, currentPrice: 0 },
    },
    bull: {
      ...scenarios.bull,
      inputs: { ...BULL_INPUTS, currentPrice: 0 },
    },
  };

  it("gives every scenario the one real price", () => {
    const exported = build({
      scenarios: visited,
      liveInputs: priced(150),
      currentPrice: 150,
    });

    for (const entry of exported.scenarios) {
      expect(entry.outputs.upside).not.toBe(0);
      expect(Number.isFinite(entry.outputs.upside)).toBe(true);
    }
  });

  it("keeps the sign, and the ordering the scenarios imply", () => {
    const exported = build({
      scenarios: visited,
      liveInputs: priced(150),
      currentPrice: 150,
    });

    const [bear, base, bull] = exported.scenarios.map((entry) => entry.outputs.upside);
    expect(bear).toBeLessThan(base);
    expect(base).toBeLessThan(bull);
  });

  /** A negative upside is an answer, not a missing one. */
  it("reports a negative upside rather than flooring it at zero", () => {
    const expensive = 400;
    const exported = build({
      scenarios: visited,
      liveInputs: priced(expensive),
      currentPrice: expensive,
    });

    const bear = exported.scenarios[0];
    expect(bear.outputs.upside).toBeLessThan(0);
    // And it agrees with the figures beside it, rather than being a separate
    // opinion about the same company.
    expect(bear.outputs.upside).toBeCloseTo(
      bear.outputs.intrinsicValuePerShare / expensive - 1,
      6
    );
  });

  it("names the price among the fields that had diverged", () => {
    const exported = build({
      scenarios: visited,
      liveInputs: priced(150),
      currentPrice: 150,
    });

    const reported = exported.integrity.divergences.map(
      (divergence) => `${divergence.scenario}.${divergence.field}`
    );
    expect(reported).toContain("bear.currentPrice");
    expect(reported).toContain("bull.currentPrice");
  });

  it("says nothing when every scenario already holds the price", () => {
    const exported = build({
      scenarios: {
        ...scenarios,
        bear: { ...scenarios.bear, inputs: { ...BEAR_INPUTS, currentPrice: 150 } },
        base: { ...scenarios.base, inputs: priced(150) },
        bull: { ...scenarios.bull, inputs: { ...BULL_INPUTS, currentPrice: 150 } },
      },
      liveInputs: priced(150),
      currentPrice: 150,
    });

    expect(exported.integrity.divergences).toEqual([]);
  });
});
