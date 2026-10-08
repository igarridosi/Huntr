import { describe, expect, it } from "vitest";
import { calculateQualityScore, weightedAvg } from "../quality-score";
import type { BalanceSheet, CashFlowStatement, CompanyFinancials, IncomeStatement } from "@/types/financials";
import type { StockProfile, StockQuote } from "@/types/stock";

const years = ["2022", "2023", "2024", "2025"];

function income(i: number, over: Partial<IncomeStatement> = {}): IncomeStatement {
  const revenue = 1000 * 1.1 ** i;
  return {
    period: `FY${years[i]}`, date: `${years[i]}-12-31`, currency: "USD",
    revenue, cost_of_revenue: revenue * 0.4, gross_profit: revenue * 0.6, operating_expenses: revenue * 0.35,
    operating_income: revenue * 0.25, interest_expense: 10, pre_tax_income: revenue * 0.24, income_tax: revenue * 0.05,
    net_income: revenue * 0.19, eps_basic: (revenue * 0.19) / 100, eps_diluted: (revenue * 0.19) / 100,
    shares_outstanding_basic: 100, shares_outstanding_diluted: 100, ebitda: revenue * 0.3,
    ...over,
  };
}

function balance(i: number, over: Partial<BalanceSheet> = {}): BalanceSheet {
  return {
    period: `FY${years[i]}`, date: `${years[i]}-12-31`, currency: "USD",
    cash_and_equivalents: 300, short_term_investments: 0, total_current_assets: 900, total_non_current_assets: 2000,
    total_assets: 2900, total_current_liabilities: 500, long_term_debt: 400, total_non_current_liabilities: 600,
    total_liabilities: 1100, total_equity: 1800, retained_earnings: 1000, shares_outstanding: 100 - i,
    ...over,
  };
}

function cash(i: number, over: Partial<CashFlowStatement> = {}): CashFlowStatement {
  const revenue = 1000 * 1.1 ** i;
  return {
    period: `FY${years[i]}`, date: `${years[i]}-12-31`, currency: "USD",
    operating_cash_flow: revenue * 0.28, capital_expenditures: -revenue * 0.06, free_cash_flow: revenue * 0.22,
    dividends_paid: -revenue * 0.05, share_repurchases: -revenue * 0.06, net_investing: 0, net_financing: 0, net_change_in_cash: 0,
    ...over,
  };
}

function company(over: { income?: IncomeStatement[]; balance?: BalanceSheet[]; cash?: CashFlowStatement[] } = {}): CompanyFinancials {
  return {
    ticker: "TEST",
    income_statement: { annual: over.income ?? years.map((_, i) => income(i)), quarterly: [] },
    balance_sheet: { annual: over.balance ?? years.map((_, i) => balance(i)), quarterly: [] },
    cash_flow: { annual: over.cash ?? years.map((_, i) => cash(i)), quarterly: [] },
  } as CompanyFinancials;
}

const quote = (price: number) => ({ ticker: "TEST", price, market_cap: price * 100, shares_outstanding: 100, beta: 1 }) as StockQuote;
const profile = { sector: "Technology", industry: "Software" } as StockProfile;

describe("weightedAvg", () => {
  it("leaves missing values out and renormalises the weights", () => {
    expect(weightedAvg([[80, 1], [null, 3]])).toBe(80);
    expect(weightedAvg([[80, 1], [40, 1]])).toBe(60);
    expect(weightedAvg([[null, 1]])).toBeNull();
  });
});

describe("calculateQualityScore", () => {
  it("does not depend on the share price", () => {
    // FCF yield used to be part of Cash Generation, so the same business
    // graded worse the more the market paid for it.
    const cheap = calculateQualityScore(company(), quote(20), profile);
    const dear = calculateQualityScore(company(), quote(2000), profile);
    expect(dear.overall).toBeCloseTo(cheap.overall, 10);
    expect(dear.dimensions[3].score).toBeCloseTo(cheap.dimensions[3].score, 10);
  });

  it("leaves a dimension with no data out of the overall instead of scoring it zero", () => {
    const full = calculateQualityScore(company(), quote(100), profile);
    const noBalance = calculateQualityScore(company({ balance: [] }), quote(100), profile);
    const health = noBalance.dimensions[2];
    expect(health.insufficient).toBe(true);
    // Without the fix, a 0 weighted at 20% pulled the overall down by a fifth.
    expect(noBalance.overall).toBeGreaterThan(full.overall * 0.85);
  });

  it("does not fill a missing FCF conversion in with a good score", () => {
    const losses = years.map((_, i) => income(i, { net_income: -50, eps_diluted: -0.5 }));
    const result = calculateQualityScore(company({ income: losses }), quote(100), profile);
    const conversion = result.dimensions[3].metrics.find((m) => m.label === "FCF / Net Income Conversion");
    expect(conversion?.value).toBe("N/A");
  });

  it("measures a CAGR over consecutive years, not over the years left after dropping losses", () => {
    // EPS: positive, a loss, then positive again. The old code filtered the
    // loss out and reported a CAGR across the remaining three points.
    const eps = [1, -0.2, 1.2, 1.5];
    const rows = years.map((_, i) => income(i, { eps_diluted: eps[i] }));
    const growth = calculateQualityScore(company({ income: rows }), quote(100), profile).dimensions[1];
    const epsMetric = growth.metrics.find((m) => m.label.startsWith("EPS Growth"));
    expect(epsMetric?.value).toBe(`${(((1.5 / 1) ** (1 / 3) - 1) * 100).toFixed(1)}%`);
  });

  it("penalises returning more than the free cash flow earned", () => {
    const heavy = years.map((_, i) => cash(i, { share_repurchases: -(1000 * 1.1 ** i) * 0.5 }));
    const modest = calculateQualityScore(company(), quote(100), profile).dimensions[4];
    const excessive = calculateQualityScore(company({ cash: heavy }), quote(100), profile).dimensions[4];
    const ratio = (d: typeof modest) => d.metrics.find((m) => m.label === "Returns / FCF")!.score;
    expect(ratio(excessive)).toBeLessThan(ratio(modest));
  });

  it("no longer claims a sector rank it cannot measure", () => {
    const result = calculateQualityScore(company(), quote(100), profile) as unknown as Record<string, unknown>;
    expect(result.sectorPercentile).toBeUndefined();
  });
});
