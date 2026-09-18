import { describe, expect, it } from "vitest";
import { buildScenarioExport } from "@/lib/calculations/dcf-export";
import type { DCFScenarioSet } from "@/lib/calculations";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "@/lib/calculations/__tests__/dcf-fixtures";
import { liveFacts, withCompanyFacts, withLivePrice } from "../live-price";

/** A set as it comes back from the store: the price zeroed on every scenario. */
const stored: DCFScenarioSet = {
  bear: { key: "bear", label: "Bear", icon: "🐻", inputs: { ...BEAR_INPUTS, currentPrice: 0 } },
  base: { key: "base", label: "Base", icon: "⚓", inputs: { ...BASE_INPUTS, currentPrice: 0 } },
  bull: { key: "bull", label: "Bull", icon: "🐂", inputs: { ...BULL_INPUTS, currentPrice: 0 } },
  waccEstimate: null as never,
};

describe("withLivePrice", () => {
  it("stamps the live price on every scenario", () => {
    const live = withLivePrice(stored, 41.9);
    expect([live.bear, live.base, live.bull].map((s) => s.inputs.currentPrice)).toEqual([41.9, 41.9, 41.9]);
    // Only the price moved.
    expect({ ...live.bull.inputs, currentPrice: 0 }).toEqual(stored.bull.inputs);
  });

  it("leaves the set alone without a price, and once it already holds the price", () => {
    expect(withLivePrice(stored, 0)).toBe(stored);
    expect(withLivePrice(stored, Number.NaN)).toBe(stored);
    const live = withLivePrice(stored, 41.9);
    expect(withLivePrice(live, 41.9)).toBe(live);
  });

  it("exports with no divergence on the price once the set is stamped", () => {
    const liveInputs = { ...BASE_INPUTS, currentPrice: 41.9 };
    const params = { ticker: "yeti", companyName: null, currentPrice: 41.9, activeScenario: "base" as const, liveInputs, now: new Date("2026-09-18T10:00:00Z") };
    const stale = buildScenarioExport({ ...params, scenarios: stored });
    expect(stale.integrity.divergences.map((d) => `${d.scenario}:${d.field}`)).toEqual(["bear:currentPrice", "bull:currentPrice"]);
    const fixed = buildScenarioExport({ ...params, scenarios: withLivePrice(stored, 41.9) });
    expect(fixed.integrity.divergences).toEqual([]);
  });
});

describe("withCompanyFacts", () => {
  it("puts every scenario on the balance sheet of the live inputs, not only the active one", () => {
    // Uber's pattern: bear kept the cash and debt of an earlier load.
    const set: DCFScenarioSet = {
      ...stored,
      bear: { ...stored.bear, inputs: { ...stored.bear.inputs, totalDebt: 10_521e6, cashAndEquivalents: 7_105e6 } },
      base: { ...stored.base, inputs: { ...stored.base.inputs, totalDebt: 10_590e6, cashAndEquivalents: 4_870e6 } },
      bull: { ...stored.bull, inputs: { ...stored.bull.inputs, totalDebt: 10_590e6, cashAndEquivalents: 4_870e6 } },
    };
    const live = { ...BASE_INPUTS, totalDebt: 10_590e6, cashAndEquivalents: 4_870e6, currentPrice: 0 };
    const facts = liveFacts(live, 92.4);
    const stamped = withCompanyFacts(set, facts);
    for (const k of ["bear", "base", "bull"] as const) {
      expect(stamped[k].inputs).toMatchObject({ totalDebt: 10_590e6, cashAndEquivalents: 4_870e6, currentPrice: 92.4, sharesOutstanding: BASE_INPUTS.sharesOutstanding, baseRevenue: BASE_INPUTS.baseRevenue });
    }
    // Assumptions untouched.
    expect(stamped.bear.inputs.growthRatePhase1).toBe(BEAR_INPUTS.growthRatePhase1);
    expect(withCompanyFacts(stamped, facts)).toBe(stamped);

    const exported = buildScenarioExport({ ticker: "uber", companyName: null, currentPrice: 92.4, scenarios: stamped, activeScenario: "base", liveInputs: { ...live, currentPrice: 92.4 }, now: new Date("2026-09-18T10:00:00Z") });
    expect(exported.integrity.divergences).toEqual([]);
  });

  it("liveFacts keeps a stored price when there is no quote", () => {
    expect(liveFacts({ ...BASE_INPUTS, currentPrice: 12 }, null).currentPrice).toBe(12);
    expect(liveFacts({ ...BASE_INPUTS, currentPrice: 12 }, 0).currentPrice).toBe(12);
  });
});
