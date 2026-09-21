import { describe, expect, it } from "vitest";
import type { CompanyFinancials, IncomeStatement } from "@/types/financials";
import { buildScenarioExport } from "@/lib/calculations/dcf-export";
import type { DCFScenarioSet } from "@/lib/calculations";
import { BASE_INPUTS, BEAR_INPUTS, BULL_INPUTS } from "@/lib/calculations/__tests__/dcf-fixtures";
import { basisOf, revenueBaseDivergence, revenueBases } from "../revenue-base";
import { parseRevenueEntry } from "@/components/dcf/revenue-base-picker";

const row = (date: string, period: string, revenue: number): IncomeStatement => ({
  period, date, currency: "USD", revenue, cost_of_revenue: 0, gross_profit: 0, operating_expenses: 0, operating_income: 0, interest_expense: 0, pre_tax_income: 0, income_tax: 0, net_income: 0, eps_basic: 0, eps_diluted: 0, shares_outstanding_basic: 0, shares_outstanding_diluted: 0, ebitda: 0,
});
const fin = (annual: IncomeStatement[], quarterly: IncomeStatement[]): CompanyFinancials => ({
  ticker: "X", income_statement: { annual, quarterly }, balance_sheet: { annual: [], quarterly: [] }, cash_flow: { annual: [], quarterly: [] },
});

describe("revenueBases", () => {
  // Celsius: calendar year, two quarters reported since the 10-K.
  const celh = fin(
    [row("2024-12-31", "FY2024", 1_356e6), row("2025-12-31", "FY2025", 2_515e6)],
    [row("2025-06-30", "Q2 2025", 739e6), row("2025-09-30", "Q3 2025", 725e6), row("2025-12-31", "Q4 2025", 712e6), row("2026-03-31", "Q1 2026", 780e6), row("2026-06-30", "Q2 2026", 830e6)]
  );

  it("sums the latest four quarters when they reach past the closed year, and recommends them", () => {
    const b = revenueBases(celh);
    expect(b.recommended).toBe("ttm");
    expect(b.ttm).toMatchObject({ value: 3_047e6, periodStart: "2025-07-01", periodEnd: "2026-06-30", periods: "Q3 2025 – Q2 2026" });
    expect(b.fiscalYear).toMatchObject({ value: 2_515e6, periodStart: "2025-01-01", periodEnd: "2025-12-31" });
  });

  it("builds the twelve months on the issuer's own quarters: Adobe closes near the end of November", () => {
    const adbe = fin(
      [row("2025-11-28", "FY2025", 23_770e6)],
      [row("2025-05-30", "Q2 2025", 5_870e6), row("2025-08-29", "Q3 2025", 5_990e6), row("2025-11-28", "Q4 2025", 6_150e6), row("2026-02-27", "Q1 2026", 6_400e6), row("2026-05-29", "Q2 2026", 6_660e6)]
    );
    const b = revenueBases(adbe);
    expect(b.ttm).toMatchObject({ value: 5_990e6 + 6_150e6 + 6_400e6 + 6_660e6, periodStart: "2025-05-31", periodEnd: "2026-05-29" });
  });

  it("offers only the closed year when no quarter has been reported past it, or the quarters are not consecutive", () => {
    const fresh = fin([row("2026-06-30", "FY2026", 331e9)], [row("2025-09-30", "Q3", 80e9), row("2025-12-31", "Q4", 82e9), row("2026-03-31", "Q1", 84e9), row("2026-06-30", "Q2", 85e9)]);
    expect(revenueBases(fresh)).toMatchObject({ ttm: null, recommended: "fiscal_year" });
    const gappy = fin([row("2025-12-31", "FY2025", 100)], [row("2025-06-30", "Q2", 25), row("2025-12-31", "Q4", 25), row("2026-03-31", "Q1", 27), row("2026-06-30", "Q2", 28)]);
    expect(revenueBases(gappy).ttm).toBeNull();
    expect(revenueBases(null)).toEqual({ ttm: null, fiscalYear: null, recommended: null });
  });

  it("flags the two bases more than 10% apart, with both figures, the gap and its direction", () => {
    const d = revenueBaseDivergence(revenueBases(celh))!;
    expect(d.deviation).toBeCloseTo(0.2115, 3);
    expect(d.message).toContain("$3.05B");
    expect(d.message).toContain("$2.52B");
    expect(d.message).toContain("21.2% above");
    expect(d.message).toMatch(/acquisition or a spin-off/);
    const steady = fin([row("2025-12-31", "FY2025", 1_000)], [row("2025-06-30", "Q2", 250), row("2025-09-30", "Q3", 255), row("2025-12-31", "Q4", 260), row("2026-03-31", "Q1", 262), row("2026-06-30", "Q2", 265)]);
    expect(revenueBaseDivergence(revenueBases(steady))).toBeNull();
  });

  it("names the basis a stored figure came from", () => {
    const b = revenueBases(celh);
    expect(basisOf(2_515e6, b)).toBe("fiscal_year");
    expect(basisOf(3_047e6, b)).toBe("ttm");
    expect(basisOf(2_800e6, b)).toBe("manual");
  });
});

describe("parseRevenueEntry", () => {
  it("reads dollars with or without a scale letter", () => {
    expect(parseRevenueEntry("3.05B")).toBe(3.05e9);
    expect(parseRevenueEntry("3,047M")).toBe(3_047e6);
    expect(parseRevenueEntry("$3047000000")).toBe(3_047e6);
    expect(parseRevenueEntry("abc")).toBeNull();
    expect(parseRevenueEntry("0")).toBeNull();
  });
});

describe("export", () => {
  it("records the revenue base with its period and close", () => {
    const set: DCFScenarioSet = {
      bear: { key: "bear", label: "Bear", icon: "🐻", inputs: BEAR_INPUTS },
      base: { key: "base", label: "Base", icon: "⚓", inputs: BASE_INPUTS },
      bull: { key: "bull", label: "Bull", icon: "🐂", inputs: BULL_INPUTS },
      waccEstimate: null as never,
    };
    const exported = buildScenarioExport({
      ticker: "celh", currentPrice: BASE_INPUTS.currentPrice, scenarios: set, activeScenario: "base", liveInputs: BASE_INPUTS, now: new Date("2026-09-20T10:00:00Z"),
      revenueBase: { basis: "ttm", value: BASE_INPUTS.baseRevenue, periodStart: "2025-07-01", periodEnd: "2026-06-30", periods: "Q3 2025 – Q2 2026" },
    });
    expect(exported.revenueBase).toEqual({ basis: "ttm", value: BASE_INPUTS.baseRevenue, periodStart: "2025-07-01", periodEnd: "2026-06-30", periods: "Q3 2025 – Q2 2026" });
    expect(buildScenarioExport({ ticker: "x", currentPrice: 1, scenarios: set, activeScenario: "base", liveInputs: BASE_INPUTS }).revenueBase).toBeUndefined();
  });
});
