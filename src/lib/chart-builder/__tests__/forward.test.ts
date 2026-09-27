import { describe, expect, it } from "vitest";
import { buildForwardReader, forwardEpsReader, ntmFromTrend, type EpsTrend } from "../forward";
import type { Split } from "../splits";
import type { IncomeStatement } from "@/types/financials";

// Booking's consensus on 2026-09-27, after Q2 2026 reported (Yahoo earnings trend).
const TREND: EpsTrend = {
  asOf: "2026-09-27",
  lastReported: "2026-06-30",
  quarters: [
    { end: "2026-09-30", eps: 4.48906 },
    { end: "2026-12-31", eps: 2.31112 },
  ],
  years: [
    { end: "2026-12-31", eps: 10.44835 },
    { end: "2027-12-31", eps: 12.36832 },
  ],
};
const BKNG_SPLITS: Split[] = [{ date: "2026-04-06", ratio: 25 }];

describe("ntmFromTrend", () => {
  it("blends the fiscal years by how much of the current one is ahead", () => {
    // Two quarters of 2026 ahead: half of FY26 and half of FY27.
    expect(ntmFromTrend(TREND)).toBeCloseTo(0.5 * 10.44835 + 0.5 * 12.36832, 6);
  });

  it("is the next year alone once the current one has reported", () => {
    expect(ntmFromTrend({ ...TREND, lastReported: "2026-12-31" })).toBeCloseTo(12.36832, 6);
  });
});

describe("forwardEpsReader", () => {
  const quarters = [
    { date: "2025-09-30", reported: 3.98, estimate: 3.84 },
    { date: "2025-12-31", reported: 1.952, estimate: 1.929 },
    { date: "2026-03-31", reported: 1.14, estimate: 1.08 },
    { date: "2026-06-30", reported: 2.54, estimate: 2.45 },
  ];

  it("grows the last twelve months by the next quarter's expected growth", () => {
    const read = forwardEpsReader({ quarters, trend: TREND, snapshots: [] }, BKNG_SPLITS);
    // After Q2 2026: Q3 2026 is expected at 4.489 against 3.98 a year earlier.
    const ttm = 3.98 + 1.952 + 1.14 + 2.54;
    expect(read("2026-06-30")).toBeCloseTo(ttm * (4.48906 / 3.98), 6);
  });

  it("reads a seasonally small quarter together with the next", () => {
    const withYearAgo = [
      { date: "2025-03-31", reported: 0.99, estimate: 0.7 },
      { date: "2025-06-30", reported: 2.22, estimate: 2.02 },
      ...quarters,
    ];
    const read = forwardEpsReader({ quarters: withYearAgo, trend: TREND, snapshots: [] }, BKNG_SPLITS);
    // After Q4 2025 the next quarter is Q1 (~10% of the year): Q1 and Q2 2026 against Q1 and Q2 2025.
    const ttm = 2.22 + 3.98 + 1.952 + 0.99;
    expect(read("2025-12-31")).toBeCloseTo(((ttm * (1.08 + 2.45)) / (0.99 + 2.22)), 6);
  });

  it("sums the next four quarters' consensus when growth cannot be read", () => {
    const read = forwardEpsReader({ quarters, trend: TREND, snapshots: [] }, BKNG_SPLITS);
    // No year-earlier quarters before Q3 2025: Q4 2025, Q1 and Q2 2026 pre-report, then Q3 2026 from today's trend.
    expect(read("2025-09-30")).toBeCloseTo(1.929 + 1.08 + 2.45 + 4.48906, 6);
  });

  it("prefers a recorded snapshot near the date, on today's share basis", () => {
    const read = forwardEpsReader({ quarters, trend: TREND, snapshots: [{ date: "2025-10-02", ntm: 250 }] }, BKNG_SPLITS);
    expect(read("2025-09-30")).toBeCloseTo(250 / 25, 6);
  });

  it("is null where nothing is known", () => {
    const read = forwardEpsReader({ quarters: [], trend: null, snapshots: [] }, []);
    expect(read("2020-03-31")).toBeNull();
  });
});

describe("buildForwardReader", () => {
  it("sets Alpha Vantage's mixed quarters on the price basis before summing", () => {
    const inc = (date: string, ni: number, sh: number) =>
      ({ date, net_income: ni, shares_outstanding_diluted: sh * 25, shares_outstanding_basic: sh * 25, eps_diluted: 0, eps_basic: 0 }) as unknown as IncomeStatement;
    const income = [inc("2024-06-30", 1.521e9, 34.27e6), inc("2024-09-30", 2.517e9, 33.86e6), inc("2024-12-31", 1.068e9, 33.43e6), inc("2025-03-31", 0.333e9, 33.09e6), inc("2025-06-30", 0.895e9, 32.62e6)];
    const quarters = [
      { date: "2024-06-30", reported: 1.68, estimate: 1.55 },
      { date: "2024-09-30", reported: 83.89, estimate: 77.52 }, // as reported, pre-split
      { date: "2024-12-31", reported: 41.55, estimate: 36.0537 }, // as reported, pre-split
      { date: "2025-03-31", reported: 0.99, estimate: 0.7 },
      { date: "2025-06-30", reported: 2.22, estimate: 2.02 },
    ];
    const read = buildForwardReader({ quarters, trend: null, snapshots: [] }, { splits: BKNG_SPLITS, sharesNow: 815e6 }, income);
    expect(read("2024-06-30")).toBeCloseTo(77.52 / 25 + 36.0537 / 25 + 0.7 + 2.02, 4);
  });
});
