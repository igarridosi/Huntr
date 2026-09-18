import { describe, expect, it } from "vitest";
import { buildScenarioExport } from "@/lib/calculations/dcf-export";
import type { DCFScenarioSet } from "@/lib/calculations";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "@/lib/calculations/__tests__/dcf-fixtures";
import { withLivePrice } from "../live-price";

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
