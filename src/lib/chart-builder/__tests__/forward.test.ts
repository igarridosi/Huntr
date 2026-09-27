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

  const withYearAgo = [
    { date: "2024-12-31", reported: 1.662, estimate: 1.442 },
    { date: "2025-03-31", reported: 0.99, estimate: 0.7 },
    { date: "2025-06-30", reported: 2.22, estimate: 2.02 },
    ...quarters,
  ];

  it("takes the geometric mean of the roll and the sum when they agree", () => {
    const read = forwardEpsReader({ quarters: withYearAgo, trend: TREND, snapshots: [] }, BKNG_SPLITS);
    // After Q4 2025: the last twelve months with Q1 2025 swapped for Q1 2026's consensus…
    const roll = 0.99 + 2.22 + 3.98 + 1.952 - 0.99 + 1.08;
    // …and Q1-Q2 2026 pre-report consensus, then Q3-Q4 2026 from today's trend.
    const sum = 1.08 + 2.45 + 4.48906 + 2.31112;
    expect(read("2025-12-31")).toBeCloseTo(Math.sqrt(roll * sum), 6);
  });

  it("meets a rise halfway: the roll lags it, the sum overstates it", () => {
    const boom = [
      { date: "2025-03-31", reported: 0.1, estimate: 0.1 },
      { date: "2025-06-30", reported: 0.1, estimate: 0.1 },
      { date: "2025-09-30", reported: 0.1, estimate: 0.1 },
      { date: "2025-12-31", reported: 0.1, estimate: 0.1 },
      { date: "2026-03-31", reported: 1, estimate: 0.9 },
      { date: "2026-06-30", reported: 2, estimate: 1.8 },
      { date: "2026-09-30", reported: null, estimate: 2.5 },
      { date: "2026-12-31", reported: null, estimate: 3 },
    ];
    const read = forwardEpsReader({ quarters: boom, trend: null, snapshots: [] }, []);
    const roll = 0.4 - 0.1 + 0.9;
    const sum = 0.9 + 1.8 + 2.5 + 3;
    expect(read("2025-12-31")).toBeCloseTo(Math.sqrt(roll * sum), 6);
  });

  it("keeps the roll when only hindsight sees a fall (2020 seen from 2019)", () => {
    const fall = [
      { date: "2018-12-31", reported: 24, estimate: 23 },
      { date: "2019-03-31", reported: 10, estimate: 9 },
      { date: "2019-06-30", reported: 20, estimate: 19 },
      { date: "2019-09-30", reported: 40, estimate: 38 },
      { date: "2019-12-31", reported: 25, estimate: 24 },
      { date: "2020-03-31", reported: 4, estimate: 5 },
      { date: "2020-06-30", reported: 1, estimate: 2 },
      { date: "2020-09-30", reported: 12, estimate: 3 },
    ];
    const read = forwardEpsReader({ quarters: fall, trend: null, snapshots: [] }, []);
    // After Q3 2019 the sum (24 + 5 + 2 + 3) knows about 2020; the roll (94 - 24 + 24) does not.
    expect(read("2019-09-30")).toBeCloseTo(24 + 10 + 20 + 40 - 24 + 24, 6);
  });

  it("falls back to the roll when the consensus ahead is a loss", () => {
    const crash = [
      { date: "2019-03-31", reported: 10, estimate: 9 },
      { date: "2019-06-30", reported: 20, estimate: 19 },
      { date: "2019-09-30", reported: 40, estimate: 38 },
      { date: "2019-12-31", reported: 25, estimate: 24 },
      { date: "2020-03-31", reported: 4, estimate: 5 },
      { date: "2020-06-30", reported: -10, estimate: -15 },
      { date: "2020-09-30", reported: 12, estimate: 3 },
      { date: "2020-12-31", reported: 0, estimate: -2 },
    ];
    const read = forwardEpsReader({ quarters: crash, trend: null, snapshots: [] }, []);
    expect(read("2019-12-31")).toBeCloseTo(10 + 20 + 40 + 25 - 10 + 5, 6);
  });

  it("prefers a recorded snapshot near the date, on today's share basis", () => {
    const read = forwardEpsReader({ quarters: withYearAgo, trend: TREND, snapshots: [{ date: "2025-10-02", ntm: 250 }] }, BKNG_SPLITS);
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
