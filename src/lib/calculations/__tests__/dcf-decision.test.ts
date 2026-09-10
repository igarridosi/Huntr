import { describe, expect, it } from "vitest";
import { runDCF, runMonteCarlo } from "../dcf";
import {
  DEFAULT_CONVICTION_WEIGHTS,
  ENTRY_ZONE_RELEVANCE_THRESHOLD,
  buildConvictionBreakdown,
  buildSimulationBundle,
  buildWeightedReference,
  buildTradingZones,
  resolveStressCase,
} from "../dcf-decision";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "./dcf-fixtures";

const scenarios = { bear: BEAR_INPUTS, base: BASE_INPUTS, bull: BULL_INPUTS };

describe("resolveStressCase", () => {
  it("takes the lower of the bear case and the simulation P5", () => {
    expect(resolveStressCase(60, 45).value).toBe(45);
    expect(resolveStressCase(40, 55).value).toBe(40);
  });

  it("reports which candidate is binding", () => {
    expect(resolveStressCase(60, 45).source).toBe("simulation-p5");
    expect(resolveStressCase(40, 55).source).toBe("bear-scenario");
  });

  it("ignores a candidate that is missing or non-positive", () => {
    expect(resolveStressCase(50, 0).value).toBe(50);
    expect(resolveStressCase(0, 50).value).toBe(50);
    expect(resolveStressCase(Number.NaN, 50).value).toBe(50);
  });

  /**
   * The property that was broken: whatever else it is, the stress case can
   * never be more optimistic than the pessimistic scenario.
   */
  it("never lands above the bear scenario on real inputs", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 2000, 42, { scenarios });
    const bear = runDCF(BEAR_INPUTS).intrinsicValuePerShare;
    expect(resolveStressCase(bear, mc.p5).value).toBeLessThanOrEqual(bear);
  });
});

describe("buildConvictionBreakdown", () => {
  const strong = {
    upside: 0.8,
    probabilityAbovePrice: 0.85,
    stressVsPrice: 0.1,
    terminalWeight: 0.4,
  };
  const weak = {
    upside: 0.02,
    probabilityAbovePrice: 0.45,
    stressVsPrice: -0.45,
    terminalWeight: 0.88,
  };

  it("scores a strong setup above a weak one", () => {
    expect(buildConvictionBreakdown(strong).score).toBeGreaterThan(
      buildConvictionBreakdown(weak).score
    );
  });

  it("keeps the score inside 0 to 100", () => {
    expect(buildConvictionBreakdown(strong).score).toBeLessThanOrEqual(100);
    expect(buildConvictionBreakdown(weak).score).toBeGreaterThanOrEqual(0);
  });

  /**
   * The audit trail has to actually reconcile. A breakdown whose parts do not
   * add up to the headline is worse than no breakdown at all.
   */
  it("has factor points that reconcile to the score", () => {
    const breakdown = buildConvictionBreakdown(strong);
    const rewardBudget =
      DEFAULT_CONVICTION_WEIGHTS.upside +
      DEFAULT_CONVICTION_WEIGHTS.probability +
      DEFAULT_CONVICTION_WEIGHTS.resilience;
    const summed = breakdown.factors.reduce((total, f) => total + f.points, 0);
    expect((summed / rewardBudget) * 100).toBeCloseTo(breakdown.score, 6);
  });

  it("exposes every factor with its weight and ceiling", () => {
    const breakdown = buildConvictionBreakdown(strong);
    expect(breakdown.factors).toHaveLength(4);
    for (const factor of breakdown.factors) {
      expect(factor.label.length).toBeGreaterThan(0);
      expect(factor.description.length).toBeGreaterThan(0);
      expect(factor.maxPoints).toBeGreaterThan(0);
      expect(Math.abs(factor.points)).toBeLessThanOrEqual(factor.maxPoints + 1e-9);
    }
  });

  it("treats reliance on the terminal value as a penalty", () => {
    const terminal = buildConvictionBreakdown(weak).factors.find(
      (f) => f.key === "terminalReliance"
    );
    expect(terminal?.isPenalty).toBe(true);
    expect(terminal?.points).toBeLessThan(0);
  });

  it("lets the user reweight, and the score responds", () => {
    const upsideHeavy = buildConvictionBreakdown(strong, {
      ...DEFAULT_CONVICTION_WEIGHTS,
      upside: 80,
      probability: 10,
    });
    const probabilityHeavy = buildConvictionBreakdown(strong, {
      ...DEFAULT_CONVICTION_WEIGHTS,
      upside: 10,
      probability: 80,
    });
    expect(upsideHeavy.score).not.toBeCloseTo(probabilityHeavy.score, 3);
  });

  it("does not reward upside beyond the cap", () => {
    const capped = buildConvictionBreakdown({ ...strong, upside: 1 });
    const absurd = buildConvictionBreakdown({ ...strong, upside: 12 });
    expect(absurd.score).toBeCloseTo(capped.score, 6);
  });
});

describe("buildSimulationBundle", () => {
  it("gives both panels the same probability", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 2000, 42, { scenarios });
    const bundle = buildSimulationBundle({
      result: runDCF(BASE_INPUTS),
      monteCarlo: mc,
      bearInputs: BEAR_INPUTS,
    });
    expect(bundle.probabilityAbovePrice).toBe(mc.probabilityAbovePrice);
    expect(bundle.monteCarlo).toBe(mc);
  });

  it("derives a stress case that respects the bear scenario", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 2000, 42, { scenarios });
    const bundle = buildSimulationBundle({
      result: runDCF(BASE_INPUTS),
      monteCarlo: mc,
      bearInputs: BEAR_INPUTS,
    });
    expect(bundle.stress.value).toBeLessThanOrEqual(bundle.stress.bearValue);
  });

  it("works without an explicit bear scenario", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 500, 42);
    const bundle = buildSimulationBundle({
      result: runDCF(BASE_INPUTS),
      monteCarlo: mc,
    });
    expect(Number.isFinite(bundle.stress.value)).toBe(true);
    expect(Number.isFinite(bundle.conviction.score)).toBe(true);
  });
});

/**
 * BUG 7 — the entry zone contradicted the rest of the panel.
 *
 * It was arithmetic on the base-case fair value and never looked at the
 * distribution, so an Avoid verdict could sit next to an entry range
 * containing the current price.
 */
describe("buildTradingZones", () => {
  const mc = runMonteCarlo(BASE_INPUTS, 2000, 42, { scenarios });
  const stress = resolveStressCase(runDCF(BEAR_INPUTS).intrinsicValuePerShare, mc.p5);

  it("takes the entry ceiling from the 25th percentile", () => {
    const zones = buildTradingZones({
      monteCarlo: mc,
      stress,
      signal: "Buy",
      currentPrice: 50,
    });
    expect(zones.entryHigh).toBeCloseTo(mc.p25, 6);
  });

  it("floors the range at the more pessimistic of P10 and the bear case", () => {
    const zones = buildTradingZones({
      monteCarlo: mc,
      stress,
      signal: "Buy",
      currentPrice: 50,
    });
    expect(zones.entryLow).toBeLessThanOrEqual(Math.min(mc.p10, stress.value));
  });

  it("puts the trim level where the upside runs out", () => {
    const zones = buildTradingZones({
      monteCarlo: mc,
      stress,
      signal: "Buy",
      currentPrice: 50,
    });
    expect(zones.trim).toBeCloseTo(mc.p75, 6);
  });

  /**
   * The invariant the bug violated: whatever the arithmetic produces, an Avoid
   * verdict cannot sit beside a range that says the current price is fine.
   */
  it("never lets an Avoid verdict contain the current price", () => {
    for (const price of [1, 50, 120.81, 500, 10_000]) {
      const zones = buildTradingZones({
        monteCarlo: mc,
        stress,
        signal: "Avoid",
        currentPrice: price,
      });
      expect(zones.entryHigh).toBeLessThan(price);
      expect(zones.entryLow).toBeLessThan(price);
    }
  });

  it("says when it had to pull the ceiling down to stay coherent", () => {
    const contradictory = buildTradingZones({
      monteCarlo: mc,
      stress,
      signal: "Avoid",
      currentPrice: 1,
    });
    expect(contradictory.clampedForSignal).toBe(true);

    const consistent = buildTradingZones({
      monteCarlo: mc,
      stress,
      signal: "Avoid",
      currentPrice: 10_000,
    });
    expect(consistent.clampedForSignal).toBe(false);
  });

  it("keeps the range and the trim level in order", () => {
    for (const signal of ["Strong Buy", "Buy", "Watch", "Avoid"] as const) {
      const zones = buildTradingZones({
        monteCarlo: mc,
        stress,
        signal,
        currentPrice: 120.81,
      });
      expect(zones.entryLow).toBeLessThanOrEqual(zones.entryHigh);
      expect(zones.entryHigh).toBeLessThanOrEqual(zones.trim);
    }
  });

  /**
   * The zones have to move when the assumptions do. Before the fix they were a
   * fixed multiple of fair value and stayed put when the Monte Carlo changed.
   */
  it("moves with the distribution", () => {
    const pessimistic = runMonteCarlo(BASE_INPUTS, 2000, 42, {
      scenarios,
      weights: { bear: 1, base: 0, bull: 0 },
    });
    const optimistic = runMonteCarlo(BASE_INPUTS, 2000, 42, {
      scenarios,
      weights: { bear: 0, base: 0, bull: 1 },
    });

    const low = buildTradingZones({
      monteCarlo: pessimistic,
      stress,
      signal: "Watch",
      currentPrice: 120.81,
    });
    const high = buildTradingZones({
      monteCarlo: optimistic,
      stress,
      signal: "Watch",
      currentPrice: 120.81,
    });

    expect(high.entryHigh).toBeGreaterThan(low.entryHigh);
    expect(high.trim).toBeGreaterThan(low.trim);
  });
});

describe("entry zone relevance", () => {
  const stress = { value: 30, source: "bear-scenario" as const, bearValue: 30, simulationP5: 30 };
  const mc = (p10: number, p25: number, p75: number) =>
    ({ p10, p25, p75 } as never);

  it("keeps the numeric range when the band is within reach of the price", () => {
    const zones = buildTradingZones({
      monteCarlo: mc(85, 92, 130),
      stress: { ...stress, value: 85 },
      signal: "Buy",
      currentPrice: 100,
    });
    expect(zones.relevant).toBe(true);
    expect(zones.gapToPrice).toBeCloseTo(0.08, 4);
  });

  // The CROX case: fair value 58% under the price. A range there reads as a
  // target that will only ever fill if the thesis has already broken.
  it("marks the zone irrelevant once the ceiling is more than 40% below price", () => {
    const zones = buildTradingZones({
      monteCarlo: mc(25, 34, 60),
      stress,
      signal: "Avoid",
      currentPrice: 108,
    });
    expect(zones.relevant).toBe(false);
    expect(zones.gapToPrice).toBeGreaterThan(0.6);
  });

  it("treats the threshold itself as still relevant", () => {
    const zones = buildTradingZones({
      monteCarlo: mc(50, 60, 90),
      stress: { ...stress, value: 50 },
      signal: "Watch",
      currentPrice: 100,
    });
    expect(zones.gapToPrice).toBeCloseTo(ENTRY_ZONE_RELEVANCE_THRESHOLD, 6);
    expect(zones.relevant).toBe(true);
  });

  it("reports no gap when the price is unknown", () => {
    const zones = buildTradingZones({
      monteCarlo: mc(50, 60, 90),
      stress: { ...stress, value: 50 },
      signal: "Watch",
      currentPrice: 0,
    });
    expect(zones.gapToPrice).toBe(0);
    expect(zones.relevant).toBe(true);
  });
});

/**
 * BUG H — a signal that changed when you looked at it.
 *
 * The conviction score read `result.upside`, and `result` is whatever the
 * interface is showing. On S&P Global the Bull tab scored the upside at +23.8%
 * and the Bear tab at -41.8%: the same company, the same assumptions, a
 * different recommendation depending on which tab had last been clicked.
 */
describe("the score does not depend on the visible scenario", () => {
  const set = { bear: BEAR_INPUTS, base: BASE_INPUTS, bull: BULL_INPUTS };
  const weights = { bear: 0.25, base: 0.5, bull: 0.25 };

  const bundleFor = (active: keyof typeof set) => {
    const result = runDCF(set[active]);
    const monteCarlo = runMonteCarlo(set[active], 500, 42, {
      scenarios: set,
      weights,
    });
    return buildSimulationBundle({
      result,
      monteCarlo,
      bearInputs: set.bear,
      scenarios: set,
      scenarioWeights: weights,
    });
  };

  it("produces one score whichever scenario is active", () => {
    const scores = (["bear", "base", "bull"] as const).map(
      (key) => bundleFor(key).conviction.score
    );
    expect(new Set(scores.map((score) => score.toFixed(6))).size).toBe(1);
  });

  it("produces one signal and one position size", () => {
    const signals = (["bear", "base", "bull"] as const).map((key) => {
      const { conviction } = bundleFor(key);
      return `${conviction.signal}|${conviction.positionSize}`;
    });
    expect(new Set(signals).size).toBe(1);
  });

  it("scores the upside on the weighted blend, not the active case", () => {
    const bundle = bundleFor("bull");
    const upsideFactor = bundle.conviction.factors.find(
      (factor) => factor.key === "upside"
    )!;

    expect(bundle.reference).not.toBeNull();
    expect(upsideFactor.raw).toBeCloseTo(bundle.reference!.upside, 10);
    // And the blend really is a blend: strictly between bear and bull.
    const bear = runDCF(BEAR_INPUTS).intrinsicValuePerShare;
    const bull = runDCF(BULL_INPUTS).intrinsicValuePerShare;
    expect(bundle.reference!.intrinsicValuePerShare).toBeGreaterThan(bear);
    expect(bundle.reference!.intrinsicValuePerShare).toBeLessThan(bull);
  });

  /** The weights are the argument the user is allowed to have. */
  it("moves when the scenario weights move", () => {
    const result = runDCF(BASE_INPUTS);
    const monteCarlo = runMonteCarlo(BASE_INPUTS, 500, 42, { scenarios: set, weights });
    const bearish = buildSimulationBundle({
      result,
      monteCarlo,
      scenarios: set,
      scenarioWeights: { bear: 0.8, base: 0.2, bull: 0 },
    });
    const bullish = buildSimulationBundle({
      result,
      monteCarlo,
      scenarios: set,
      scenarioWeights: { bear: 0, base: 0.2, bull: 0.8 },
    });

    expect(bearish.reference!.intrinsicValuePerShare).toBeLessThan(
      bullish.reference!.intrinsicValuePerShare
    );
    expect(bearish.conviction.score).toBeLessThan(bullish.conviction.score);
  });

  it("falls back to the active result when no scenarios are supplied", () => {
    const result = runDCF(BULL_INPUTS);
    const monteCarlo = runMonteCarlo(BULL_INPUTS, 300, 42);
    const bundle = buildSimulationBundle({ result, monteCarlo });

    expect(bundle.reference).toBeNull();
    const upsideFactor = bundle.conviction.factors.find((f) => f.key === "upside")!;
    expect(upsideFactor.raw).toBeCloseTo(result.upside, 10);
  });
});

describe("buildWeightedReference", () => {
  const set = { bear: BEAR_INPUTS, base: BASE_INPUTS, bull: BULL_INPUTS };

  it("weights the three by probability", () => {
    const ref = buildWeightedReference({
      scenarios: set,
      weights: { bear: 0.25, base: 0.5, bull: 0.25 },
      currentPrice: 150,
    });
    const expected =
      0.25 * runDCF(BEAR_INPUTS).intrinsicValuePerShare +
      0.5 * runDCF(BASE_INPUTS).intrinsicValuePerShare +
      0.25 * runDCF(BULL_INPUTS).intrinsicValuePerShare;
    expect(ref.intrinsicValuePerShare).toBeCloseTo(expected, 6);
    expect(ref.upside).toBeCloseTo(expected / 150 - 1, 10);
  });

  it("normalises weights that do not sum to one", () => {
    const a = buildWeightedReference({
      scenarios: set,
      weights: { bear: 1, base: 2, bull: 1 },
      currentPrice: 150,
    });
    const b = buildWeightedReference({
      scenarios: set,
      weights: { bear: 0.25, base: 0.5, bull: 0.25 },
      currentPrice: 150,
    });
    expect(a.intrinsicValuePerShare).toBeCloseTo(b.intrinsicValuePerShare, 6);
  });

  /**
   * Zeroing every weight says nothing about which case is likely - it does not
   * say the company is worthless.
   */
  it("falls back to equal weighting rather than dividing by zero", () => {
    const ref = buildWeightedReference({
      scenarios: set,
      weights: { bear: 0, base: 0, bull: 0 },
      currentPrice: 150,
    });
    const equal =
      (runDCF(BEAR_INPUTS).intrinsicValuePerShare +
        runDCF(BASE_INPUTS).intrinsicValuePerShare +
        runDCF(BULL_INPUTS).intrinsicValuePerShare) /
      3;
    expect(ref.intrinsicValuePerShare).toBeCloseTo(equal, 6);
  });

  it("reports no upside when there is no price", () => {
    const ref = buildWeightedReference({
      scenarios: set,
      weights: { bear: 0.25, base: 0.5, bull: 0.25 },
      currentPrice: 0,
    });
    expect(ref.upside).toBe(0);
    expect(ref.intrinsicValuePerShare).toBeGreaterThan(0);
  });
});
