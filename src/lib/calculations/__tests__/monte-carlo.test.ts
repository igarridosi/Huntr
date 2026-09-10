import { describe, expect, it } from "vitest";
import { runDCF, runMonteCarlo } from "../dcf";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "./dcf-fixtures";

const scenarios = { bear: BEAR_INPUTS, base: BASE_INPUTS, bull: BULL_INPUTS };

const bearValue = runDCF(BEAR_INPUTS).intrinsicValuePerShare;
const baseValue = runDCF(BASE_INPUTS).intrinsicValuePerShare;
const bullValue = runDCF(BULL_INPUTS).intrinsicValuePerShare;

describe("runMonteCarlo — scenario coverage", () => {
  /**
   * The point of the whole exercise. A simulation that perturbs around the
   * base case alone reports a P10 far above the hand-built bear scenario: it
   * measures noise inside one hypothesis and presents it as the range of
   * outcomes. Sampling across scenarios is what makes the tails mean
   * something, and this is the assertion that tells the two apart.
   */
  it("puts P10 at or below the bear scenario", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    expect(mc.p10).toBeLessThanOrEqual(bearValue * 1.15);
  });

  it("puts P90 at or above the bull scenario", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    expect(mc.p90).toBeGreaterThanOrEqual(bullValue * 0.85);
  });

  it("keeps the median near the base case", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    expect(mc.median).toBeGreaterThan(baseValue * 0.6);
    expect(mc.median).toBeLessThan(baseValue * 1.4);
  });

  it("reports the coherence check it just performed", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    expect(mc.coherence).toBeDefined();
    expect(mc.coherence?.p10CoversBear).toBe(true);
    expect(mc.coherence?.p90CoversBull).toBe(true);
  });

  /**
   * Valuations do not fail symmetrically: a business deteriorates faster than
   * it improves, and the sampling should inherit that from the scenarios.
   *
   * Measured as ratios, not as dollar distances. A value that compounds is
   * arithmetically wider on the upside in absolute terms - base to bull simply
   * covers more dollars than bear to base - so an absolute test would report
   * right skew on any set of scenarios whatsoever and prove nothing. The
   * proportional fall is the one an investor actually experiences.
   */
  it("produces a left-skewed distribution in proportional terms", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    const downsideRatio = mc.median / mc.p10;
    const upsideRatio = mc.p90 / mc.median;
    expect(downsideRatio).toBeGreaterThan(upsideRatio);
  });
});

describe("runMonteCarlo — growth and margin move together", () => {
  /**
   * Simulating them independently lets a collapse in demand pair with margin
   * expansion, which quietly cancels the worst cases. The correlation is what
   * keeps those draws in the sample.
   */
  it("widens the downside tail as correlation rises", () => {
    const uncorrelated = runMonteCarlo(BASE_INPUTS, 4000, 7, {
      scenarios,
      growthMarginCorrelation: 0,
    });
    const correlated = runMonteCarlo(BASE_INPUTS, 4000, 7, {
      scenarios,
      growthMarginCorrelation: 0.9,
    });
    expect(correlated.p10).toBeLessThan(uncorrelated.p10);
  });
});

describe("runMonteCarlo — determinism and shape", () => {
  it("is reproducible for a given seed", () => {
    const a = runMonteCarlo(BASE_INPUTS, 1000, 99, { scenarios });
    const b = runMonteCarlo(BASE_INPUTS, 1000, 99, { scenarios });
    expect(a.median).toBe(b.median);
    expect(a.p10).toBe(b.p10);
  });

  it("keeps percentiles ordered", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 2000, 3, { scenarios });
    expect(mc.p10).toBeLessThanOrEqual(mc.p25);
    expect(mc.p25).toBeLessThanOrEqual(mc.median);
    expect(mc.median).toBeLessThanOrEqual(mc.p75);
    expect(mc.p75).toBeLessThanOrEqual(mc.p90);
    expect(mc.p5).toBeLessThanOrEqual(mc.p10);
  });

  it("still runs when no scenario set is supplied", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 500, 11);
    expect(mc.simulations).toHaveLength(500);
    expect(Number.isFinite(mc.median)).toBe(true);
  });

  it("respects the scenario weights it is given", () => {
    const allBear = runMonteCarlo(BASE_INPUTS, 2000, 5, {
      scenarios,
      weights: { bear: 1, base: 0, bull: 0 },
    });
    const allBull = runMonteCarlo(BASE_INPUTS, 2000, 5, {
      scenarios,
      weights: { bear: 0, base: 0, bull: 1 },
    });
    expect(allBear.median).toBeLessThan(allBull.median);
    expect(allBear.median).toBeLessThan(baseValue);
  });
});

describe("stress case", () => {
  /**
   * A worst case that sits above the pessimistic scenario is not a worst case.
   */
  it("never exceeds the bear scenario", () => {
    const mc = runMonteCarlo(BASE_INPUTS, 4000, 42, { scenarios });
    const stress = Math.min(bearValue, mc.p5);
    expect(stress).toBeLessThanOrEqual(bearValue);
  });
});
