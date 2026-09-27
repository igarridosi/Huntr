import { describe, expect, it } from "vitest";
import { countCandidates, countMultipliers, normalizeShareBasis, perShareMultipliers, type Split } from "../splits";
import type { CompanyFinancials, IncomeStatement } from "@/types/financials";

const BKNG: Split[] = [
  { date: "2003-06-16", ratio: 1 / 6 },
  { date: "2026-04-06", ratio: 25 },
];
const NVDA: Split[] = [
  { date: "2021-07-20", ratio: 4 },
  { date: "2024-06-10", ratio: 10 },
];

const income = (date: string, netIncome: number, shares: number, eps: number): IncomeStatement =>
  ({ date, period: date, currency: "USD", source: "test", net_income: netIncome, shares_outstanding_diluted: shares, shares_outstanding_basic: shares, eps_diluted: eps, eps_basic: eps }) as unknown as IncomeStatement;

describe("countCandidates", () => {
  it("offers the latest split, then the latest two, and so on", () => {
    expect(countCandidates(NVDA, "2020-12-31")).toEqual([1, 10, 40]);
    expect(countCandidates(NVDA, "2023-12-31")).toEqual([1, 10]);
    expect(countCandidates(NVDA, "2025-01-31")).toEqual([1]);
  });
});

describe("share counts", () => {
  it("scales an unrestated history (Booking) to the price basis", () => {
    const rows = [
      { date: "2025-12-31", value: 32.6e6 },
      { date: "2025-09-30", value: 32.6e6 },
      { date: "2024-12-31", value: 33.4e6 },
    ];
    expect(countMultipliers(rows, BKNG, 815e6)).toEqual([25, 25, 25]);
  });

  it("leaves a history that is already restated (NVIDIA) as it is", () => {
    const rows = [
      { date: "2024-01-31", value: 24.9e9 },
      { date: "2021-01-31", value: 25.2e9 },
      { date: "2019-07-31", value: 24.6e9 },
    ];
    expect(countMultipliers(rows, NVDA, 24.3e9)).toEqual([1, 1, 1]);
  });

  it("fixes the rows a source restated and leaves the ones it did", () => {
    const rows = [
      { date: "2026-03-31", value: 815e6 }, // filed after the split, already on the new basis
      { date: "2025-12-31", value: 32.6e6 },
    ];
    expect(countMultipliers(rows, BKNG, 812e6)).toEqual([1, 25]);
  });
});

describe("EPS", () => {
  it("sets a mixed history on one basis against GAAP EPS", () => {
    // Booking as Alpha Vantage serves it: Q3 2024 as reported, Q2 2024 already divided by 25.
    const fin = {
      ticker: "BKNG",
      income_statement: {
        annual: [],
        quarterly: [
          income("2024-06-30", 1.521e9, 34.27e6, 1.68),
          income("2024-09-30", 2.517e9, 33.86e6, 83.89),
          income("2024-12-31", 1.068e9, 33.43e6, 41.55),
          income("2025-03-31", 0.333e9, 33.09e6, 0.99),
        ],
      },
    } as unknown as CompanyFinancials;
    const out = normalizeShareBasis(fin, { splits: BKNG, sharesNow: 815e6 });
    const eps = out.income_statement.quarterly.map((r) => Number(r.eps_diluted.toFixed(2)));
    expect(eps).toEqual([1.68, 3.36, 1.66, 0.99]);
    expect(out.income_statement.quarterly[0].shares_outstanding_diluted).toBeCloseTo(34.27e6 * 25, -3);
  });

  it("falls back to the neighbouring EPS when there is no share count", () => {
    const rows = [
      { date: "2025-12-31", value: 48.8 },
      { date: "2026-03-31", value: 1.14 },
      { date: "2026-06-30", value: 2.54 },
      { date: "2025-09-30", value: 3.98 },
    ];
    expect(perShareMultipliers(rows, BKNG, () => null)).toEqual([1 / 25, 1, 1, 1]);
  });

  it("returns the statements untouched when the company never split", () => {
    const fin = { ticker: "X", income_statement: { annual: [], quarterly: [income("2024-06-30", 1, 1, 1)] } } as unknown as CompanyFinancials;
    expect(normalizeShareBasis(fin, { splits: [], sharesNow: 1 })).toBe(fin);
  });
});
