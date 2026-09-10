import { describe, expect, it } from "vitest";
import {
  IMPLAUSIBLE_MARGIN,
  buildMarginHistory,
  isCashFlowUnsuitableSector,
} from "../margin-history";

const income = (rows: Array<[string, number]>) =>
  rows.map(([date, revenue]) => ({ date, revenue }));

const cash = (rows: Array<[string, number, number]>) =>
  rows.map(([date, operating_cash_flow, capital_expenditures]) => ({
    date,
    operating_cash_flow,
    capital_expenditures,
  }));

describe("buildMarginHistory — pairing", () => {
  /**
   * The arithmetic bug underneath several of the reported figures. The two
   * statements do not always cover the same years, and lining them up by
   * position divides one year's cash flow by another year's revenue.
   */
  it("pairs by fiscal year, not by position", () => {
    const history = buildMarginHistory({
      // Six years of revenue…
      revenues: income([
        ["2021-12-31", 100],
        ["2022-12-31", 200],
        ["2023-12-31", 300],
        ["2024-12-31", 400],
        ["2025-12-31", 500],
        ["2026-12-31", 600],
      ]),
      // …against four of cash flow, starting later.
      cashFlows: cash([
        ["2023-12-31", 60, 0],
        ["2024-12-31", 80, 0],
        ["2025-12-31", 100, 0],
        ["2026-12-31", 120, 0],
      ]),
    });

    expect(history.series.map((entry) => entry.year)).toEqual([
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
    // 60/300, not 60/100 — which is what position pairing would have given.
    expect(history.series[0].margin).toBeCloseTo(0.2, 10);
    expect(history.series[3].margin).toBeCloseTo(0.2, 10);
  });

  it("computes free cash flow as operating cash flow less capex", () => {
    const history = buildMarginHistory({
      revenues: income([["2026-12-31", 1000]]),
      cashFlows: cash([["2026-12-31", 300, -120]]),
    });
    expect(history.series[0].freeCashFlow).toBe(180);
  });

  it("drops a year that only one statement covers", () => {
    const history = buildMarginHistory({
      revenues: income([["2025-12-31", 100]]),
      cashFlows: cash([
        ["2025-12-31", 20, 0],
        ["2026-12-31", 30, 0],
      ]),
    });
    expect(history.series).toHaveLength(1);
    expect(history.series[0].year).toBe("2025");
  });
});

describe("buildMarginHistory — whether the band can be compared against", () => {
  const steady = () =>
    buildMarginHistory({
      revenues: income([
        ["2022-12-31", 1000],
        ["2023-12-31", 1100],
        ["2024-12-31", 1180],
        ["2025-12-31", 1270],
        ["2026-12-31", 1360],
      ]),
      cashFlows: cash([
        ["2022-12-31", 200, -40],
        ["2023-12-31", 220, -44],
        ["2024-12-31", 236, -47],
        ["2025-12-31", 254, -50],
        ["2026-12-31", 272, -54],
      ]),
    });

  it("accepts a steady series", () => {
    const history = steady();
    expect(history.comparable).toBe(true);
    expect(history.flags).toEqual([]);
    expect(history.median).toBeCloseTo(0.16, 2);
  });

  /** AppLovin: revenue restated after a disposal, cash flow on the old base. */
  it("rejects a margin that steps by more than 15 points in a year", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2023-12-31", 1000],
        ["2024-12-31", 1050],
        ["2025-12-31", 1100],
      ]),
      cashFlows: cash([
        ["2023-12-31", 200, 0],
        ["2024-12-31", 210, 0],
        ["2025-12-31", 900, 0],
      ]),
    });

    expect(history.comparable).toBe(false);
    expect(history.flags).toContain("margin-discontinuity");
    expect(history.reasons.join(" ")).toContain("disposal");
  });

  it("rejects a revenue line that moves more than a fifth in a year", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2023-12-31", 1000],
        ["2024-12-31", 1050],
        ["2025-12-31", 1800],
      ]),
      cashFlows: cash([
        ["2023-12-31", 150, 0],
        ["2024-12-31", 158, 0],
        ["2025-12-31", 270, 0],
      ]),
    });

    expect(history.comparable).toBe(false);
    expect(history.flags).toContain("revenue-discontinuity");
  });

  it("rejects a level no operating business sustains", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2024-12-31", 1000],
        ["2025-12-31", 1050],
        ["2026-12-31", 1100],
      ]),
      cashFlows: cash([
        ["2024-12-31", 890, 0],
        ["2025-12-31", 940, 0],
        ["2026-12-31", 990, 0],
      ]),
    });

    expect(history.series.every((entry) => entry.margin > IMPLAUSIBLE_MARGIN)).toBe(
      true
    );
    expect(history.flags).toContain("implausible-level");
    expect(history.comparable).toBe(false);
  });

  /**
   * Visa really does earn about half its revenue as free cash. The threshold
   * exists to catch 90%, not to argue with 55%.
   */
  it("leaves a genuinely high but real margin alone", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2024-12-31", 1000],
        ["2025-12-31", 1080],
        ["2026-12-31", 1160],
      ]),
      cashFlows: cash([
        ["2024-12-31", 530, -20],
        ["2025-12-31", 572, -22],
        ["2026-12-31", 614, -23],
      ]),
    });
    expect(history.comparable).toBe(true);
    expect(history.median).toBeGreaterThan(0.5);
  });

  it("needs at least three paired years", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2025-12-31", 1000],
        ["2026-12-31", 1100],
      ]),
      cashFlows: cash([
        ["2025-12-31", 150, 0],
        ["2026-12-31", 165, 0],
      ]),
    });
    expect(history.flags).toContain("too-short");
    expect(history.comparable).toBe(false);
  });

  /** Sezzle: a lender's operating cash flow is a loan-book movement. */
  it("rejects the metric outright for lenders and insurers", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2024-12-31", 1000],
        ["2025-12-31", 1100],
        ["2026-12-31", 1200],
      ]),
      cashFlows: cash([
        ["2024-12-31", 450, 0],
        ["2025-12-31", 495, 0],
        ["2026-12-31", 540, 0],
      ]),
      sector: "Financial Services",
    });

    expect(history.flags).toContain("sector-mismatch");
    expect(history.comparable).toBe(false);
    expect(history.reasons.join(" ")).toContain("loan book");
    // Named as a sector rule, so a reader can tell it is categorical rather
    // than a measurement of their company.
    expect(history.reasons.join(" ")).toContain("Financial Services");
  });

  it("gives every reason it found, not just the first", () => {
    const history = buildMarginHistory({
      revenues: income([
        ["2024-12-31", 1000],
        ["2025-12-31", 1050],
        ["2026-12-31", 2000],
      ]),
      cashFlows: cash([
        ["2024-12-31", 100, 0],
        ["2025-12-31", 105, 0],
        ["2026-12-31", 1800, 0],
      ]),
      sector: "Banks",
    });

    expect(history.flags.length).toBeGreaterThanOrEqual(3);
    expect(history.reasons).toHaveLength(history.flags.length);
  });

  /** The point of showing the years: a median hides the series it came from. */
  it("returns the series so a median is never the only thing on offer", () => {
    const history = steady();
    expect(history.series).toHaveLength(5);
    expect(history.min).toBeLessThanOrEqual(history.median!);
    expect(history.max).toBeGreaterThanOrEqual(history.median!);
  });
});

describe("isCashFlowUnsuitableSector", () => {
  it("catches the sectors where operating cash flow is a balance-sheet move", () => {
    for (const sector of [
      "Financial Services",
      "Banks",
      "Insurance",
      "Credit Services",
    ]) {
      expect(isCashFlowUnsuitableSector(sector)).toBe(true);
    }
  });

  it("leaves operating businesses alone", () => {
    for (const sector of ["Technology", "Consumer Cyclical", "Industrials", null]) {
      expect(isCashFlowUnsuitableSector(sector)).toBe(false);
    }
  });
});
