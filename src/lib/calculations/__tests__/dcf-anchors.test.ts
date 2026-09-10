import { describe, expect, it } from "vitest";
import {
  buildHistoricalBand,
  checkGrowthVsRecord,
  checkMarginVsCapex,
  collectAnchorWarnings,
} from "../dcf-anchors";

describe("buildHistoricalBand", () => {
  const growth = [0.04, 0.11, 0.08, 0.15, 0.06];

  it("reports the min, median and max of the record", () => {
    const band = buildHistoricalBand(growth, 0.1)!;
    expect(band.min).toBeCloseTo(0.04, 6);
    expect(band.max).toBeCloseTo(0.15, 6);
    expect(band.median).toBeCloseTo(0.08, 6);
  });

  it("takes the midpoint of the two middle years on an even sample", () => {
    expect(buildHistoricalBand([0.02, 0.04, 0.06, 0.08], 0.05)!.median).toBeCloseTo(
      0.05,
      6
    );
  });

  it("places the current input inside the band", () => {
    expect(buildHistoricalBand(growth, 0.04)!.position).toBeCloseTo(0, 6);
    expect(buildHistoricalBand(growth, 0.15)!.position).toBeCloseTo(1, 6);
    expect(buildHistoricalBand(growth, 0.095)!.position).toBeCloseTo(0.5, 6);
  });

  /**
   * An assumption outside every year on file is not wrong, but it is a claim
   * that this time is different from all of them - and the marker should not
   * quietly slide off the end of the band without saying so.
   */
  it("clamps the marker but flags that the input left the record", () => {
    const above = buildHistoricalBand(growth, 0.4)!;
    expect(above.position).toBe(1);
    expect(above.beyondRecord).toBe(true);

    const below = buildHistoricalBand(growth, -0.2)!;
    expect(below.position).toBe(0);
    expect(below.beyondRecord).toBe(true);
  });

  it("declines to draw a band from one data point", () => {
    expect(buildHistoricalBand([0.05], 0.05)).toBeNull();
    expect(buildHistoricalBand([], 0.05)).toBeNull();
  });

  it("survives a flat record without dividing by zero", () => {
    const band = buildHistoricalBand([0.05, 0.05, 0.05], 0.05)!;
    expect(Number.isFinite(band.position)).toBe(true);
    expect(band.beyondRecord).toBe(false);
  });
});


describe("checkGrowthVsRecord", () => {
  const band = buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], 0.1)!;

  it("warns when the assumption beats the best year on file", () => {
    const beyond = buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], 0.3)!;
    const warning = checkGrowthVsRecord(0.3, beyond);
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("fastest year on record");
  });

  /**
   * Assuming less than the worst year is conservative, not dangerous, so it is
   * information rather than a warning.
   */
  it("treats an unusually cautious assumption as information", () => {
    const below = buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], -0.1)!;
    expect(checkGrowthVsRecord(-0.1, below)?.severity).toBe("info");
  });

  it("stays quiet inside the record", () => {
    expect(checkGrowthVsRecord(0.1, band)).toBeNull();
  });

  it("says nothing without a band", () => {
    expect(checkGrowthVsRecord(0.1, null)).toBeNull();
  });
});

describe("checkMarginVsCapex", () => {
  it("warns when margin expansion has no mechanism behind it", () => {
    const warning = checkMarginVsCapex({
      baseMargin: 0.2,
      terminalMargin: 0.28,
      capexToRevenue: 0.09,
      capexTrend: 0.01,
    });
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("8.0%");
    expect(warning?.message).toContain("9.0%");
  });

  /**
   * Falling capital intensity is the mechanism. If it is already falling the
   * story holds together and there is nothing to raise.
   */
  it("stays quiet when capex is already coming down", () => {
    expect(
      checkMarginVsCapex({
        baseMargin: 0.2,
        terminalMargin: 0.28,
        capexToRevenue: 0.09,
        capexTrend: -0.015,
      })
    ).toBeNull();
  });

  it("ignores expansion too small to need explaining", () => {
    expect(
      checkMarginVsCapex({
        baseMargin: 0.2,
        terminalMargin: 0.21,
        capexToRevenue: 0.09,
        capexTrend: 0.01,
      })
    ).toBeNull();
  });

  it("says nothing about a company whose capex it cannot see", () => {
    expect(
      checkMarginVsCapex({
        baseMargin: 0.2,
        terminalMargin: 0.3,
        capexToRevenue: null,
        capexTrend: null,
      })
    ).toBeNull();
  });
});


describe("collectAnchorWarnings", () => {
  const clean = {
    growthPhase1: 0.08,
    baseMargin: 0.2,
    terminalMargin: 0.21,
    growthBand: buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], 0.08),
    capexToRevenue: 0.09,
    capexTrend: -0.01,
  } as const;

  it("returns nothing when the assumptions are anchored", () => {
    expect(collectAnchorWarnings({ ...clean })).toHaveLength(0);
  });

  it("collects every departure it finds", () => {
    const warnings = collectAnchorWarnings({
      ...clean,
      growthPhase1: 0.3,
      terminalMargin: 0.3,
      baseMargin: 0.24,
      capexTrend: 0.02,
      growthBand: buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], 0.3),
    });
    expect(warnings.map((warning) => warning.id)).toEqual([
      "margin-vs-capex",
      "growth-vs-record",
    ]);
  });

  /**
   * The record is the weaker of the two checks - the past is not the future -
   * so it reads last.
   */
  it("puts the mechanism check ahead of the historical record", () => {
    const warnings = collectAnchorWarnings({
      ...clean,
      growthPhase1: 0.3,
      terminalMargin: 0.3,
      capexTrend: 0.02,
      growthBand: buildHistoricalBand([0.04, 0.11, 0.08, 0.15, 0.06], 0.3),
    });
    expect(warnings[0].id).toBe("margin-vs-capex");
    expect(warnings[warnings.length - 1].id).toBe("growth-vs-record");
  });
});
