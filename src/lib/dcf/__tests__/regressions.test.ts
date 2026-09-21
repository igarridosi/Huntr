/**
 * The eight data-layer failures of the week of 14 September 2026, each
 * pinned so it cannot come back unnoticed. None of them was in the
 * two-stage engine; every one was in what fed its five inputs — revenue
 * base, FCF margin, net debt, share count, price. Figures are from the
 * cache as the app read it and from the filings on EDGAR.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapCashFlow } from "@/lib/api/alphavantage";
import { mapTimeSeriesFinancials } from "@/lib/api/mappers";
import { composeFinancialDebt, extractFactRows, parseClassDilutedShares, selectLatestFact, selectShareCount, type SECFact } from "@/lib/api/sec-edgar";
import { buildMarginHistory } from "@/lib/calculations/margin-history";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import { looksLikeLender } from "../business-model";
import { freeCashFlow, statementFreeCashFlow, withDefinedCashFlow } from "../free-cash-flow";
import { revenueBaseDivergence, revenueBases } from "../revenue-base";
import { sbcTreatment } from "../sbc-treatment";
import { shareCountDrift } from "../share-count";
import type { CashFlowStatement, CompanyFinancials, IncomeStatement } from "@/types/financials";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const M = 1e6;

const income = (date: string, period: string, revenue: number, extra: Partial<IncomeStatement> = {}): IncomeStatement => ({
  period, date, currency: "USD", source: "yahoo", revenue, cost_of_revenue: 0, gross_profit: 0, operating_expenses: 0, operating_income: 0, interest_expense: 0, pre_tax_income: 0, income_tax: 0, net_income: 0, eps_basic: 0, eps_diluted: 0, shares_outstanding_basic: 0, shares_outstanding_diluted: 0, ebitda: 0, ...extra,
});
const cashflow = (date: string, ocf: number, capex: number, source: "yahoo" | "alphavantage" = "yahoo"): CashFlowStatement => ({
  period: date, date, currency: "USD", source, operating_cash_flow: ocf, capital_expenditures: capex, free_cash_flow: ocf - Math.abs(capex), dividends_paid: 0, share_repurchases: 0, net_investing: 0, net_financing: 0, net_change_in_cash: 0,
});
const financials = (annualIncome: IncomeStatement[], annualCash: CashFlowStatement[], quarterlyIncome: IncomeStatement[] = [], quarterlyCash: CashFlowStatement[] = []): CompanyFinancials => ({
  ticker: "X", income_statement: { annual: annualIncome, quarterly: quarterlyIncome }, balance_sheet: { annual: [], quarterly: [] }, cash_flow: { annual: annualCash, quarterly: quarterlyCash },
});

describe("1. YETI — the sign of capex", () => {
  // Alpha Vantage's CASH_FLOW rows for YETI, from the cache (alpha-cashflow-v1).
  const quarters = [
    { fiscalDateEnding: "2025-03-31", operatingCashflow: "-80296000", capitalExpenditures: "15510000" },
    { fiscalDateEnding: "2025-06-30", operatingCashflow: "61195000", capitalExpenditures: "4433000" },
    { fiscalDateEnding: "2025-09-30", operatingCashflow: "100940000", capitalExpenditures: "50156000" },
    { fiscalDateEnding: "2025-12-31", operatingCashflow: "172898000", capitalExpenditures: "20597000" },
    { fiscalDateEnding: "2026-03-31", operatingCashflow: "-32649000", capitalExpenditures: "11119000" },
    { fiscalDateEnding: "2026-06-30", operatingCashflow: "62450000", capitalExpenditures: "14360000" },
  ];
  const annual = [{ fiscalDateEnding: "2025-12-31", operatingCashflow: "254737000", capitalExpenditures: "42667000" }];

  it("the four quarters of 2025 sum to the annual operating cash flow: the 10-Qs are not year-to-date", () => {
    const q = mapCashFlow(quarters, "quarterly").filter((r) => r.date.startsWith("2025"));
    expect(q.map((r) => r.operating_cash_flow / M)).toEqual([-80.296, 61.195, 100.94, 172.898]);
    expect(q.reduce((s, r) => s + r.operating_cash_flow, 0)).toBe(254_737_000);
  });

  it("capex is an outflow and free cash flow is operations less it — never operations plus it", () => {
    const [fy] = mapCashFlow(annual, "annual");
    expect(fy.capital_expenditures).toBe(-42_667_000);
    expect(fy.free_cash_flow).toBe(212_070_000);
    expect(fy.free_cash_flow).not.toBeCloseTo(297_404_000, -6);
    const q2025 = mapCashFlow(quarters, "quarterly").filter((r) => r.date.startsWith("2025"));
    const summed = q2025.reduce((s, r) => s + r.free_cash_flow, 0);
    expect(summed).toBeLessThan(200 * M); // the ~$345M of "free" cash the chart showed
    expect(summed).toBe(164_041_000);
  });

  it("on the defined basis the year is $152.9M: Yahoo's row, whose capex carries plant and intangibles", () => {
    // financials-v2 for YETI, as cached: operatingCashFlow 254,737,000, capitalExpenditure −101,839,000.
    const yeti = mapTimeSeriesFinancials("YETI", { income: { annual: [], quarterly: [] }, balance: { annual: [], quarterly: [] }, cashflow: { annual: [{ date: "2025-12-31T00:00:00.000Z", operatingCashFlow: 254_737_000, capitalExpenditure: -101_839_000, freeCashFlow: 152_898_000 }], quarterly: [] } } as never);
    const fy = yeti.cash_flow.annual[0];
    expect(fy.source).toBe("yahoo");
    expect(statementFreeCashFlow(fy, "annual")).toEqual({ value: 152_898_000, defined: true });
  });
});

describe("2. YETI — what capex is", () => {
  // 10-K FY2025, accession 0001670592-26-000013, consolidated statements of cash flows, in thousands.
  const tenK = { operatingCashFlow: 254_737e3, purchasesOfPropertyAndEquipment: 42_667e3, additionsOfIntangibles: 59_172e3, businessAcquisition: 0, revenue: 1_868_494e3 };

  it("free cash flow is operations less purchases of plant less additions of intangibles: $152.9M, 8.2% of revenue", () => {
    const fcf = freeCashFlow(tenK);
    expect(fcf).toBe(152_898e3);
    expect(fcf / tenK.revenue).toBeCloseTo(0.0818, 3);
    expect(fcf).not.toBe(212_070e3); // plant alone
    expect(Math.round(fcf / M)).not.toBe(164); // two definitions mixed across quarters
  });

  it("an Alpha Vantage annual row is not on the defined basis; a Yahoo one is; the model reads Yahoo's year", () => {
    const av = cashflow("2025-12-31", 254_737e3, -42_667e3, "alphavantage");
    expect(statementFreeCashFlow(av, "annual").defined).toBe(false);
    const yh = cashflow("2025-12-31", 254_737e3, -101_839e3, "yahoo");
    expect(statementFreeCashFlow(yh, "annual")).toEqual({ value: 152_898e3, defined: true });
    const bundle = financials([income("2025-12-31", "FY2025", tenK.revenue)], [cashflow("2019-12-31", 86_893e3, -48_691e3, "alphavantage"), av]);
    const yahoo = financials([], [yh]);
    const merged = withDefinedCashFlow(bundle, yahoo);
    expect(merged.cash_flow.annual.map((r) => [r.date, r.source, r.free_cash_flow])).toEqual([["2019-12-31", "alphavantage", 38_202e3], ["2025-12-31", "yahoo", 152_898e3]]);
  });
});

describe("3. Visa, Berkshire, Alphabet — share counts by class", () => {
  it("Visa's 10-Q to 30 June 2026 gives ~1,898M diluted as-converted, not the 1,704M cover count", () => {
    const got = parseClassDilutedShares(fixture("visa-10q-2026-06-30.ixbrl.htm"), { form: "10-Q", filed: "2026-07-29" })!;
    expect(got.value).toBe(1_898_000_000);
    expect(got.periodEnd).toBe("2026-06-30");
    expect(got.value).not.toBe(1_704_112_694);
    // The cover count never wins while a diluted count exists.
    const cover: SECFact = { value: 1_704_112_694, form: "10-Q", filed: "2026-07-29", periodEnd: "2026-07-24", concept: "EntityCommonStockSharesOutstanding", durationDays: 0 };
    expect(selectShareCount(cover, got)?.value).toBe(1_898_000_000);
  });

  it("Berkshire files no diluted count: 2,154.7M class B equivalents, the basic average", () => {
    const got = parseClassDilutedShares(fixture("berkshire-10q-2026-06-30.ixbrl.htm"), { form: "10-Q", filed: "2026-08-02" })!;
    expect(got.value).toBe(2_154_664_073);
    expect(got.concept).toContain("Basic");
  });

  it("Alphabet has an undimensioned count in companyfacts: 12,309M for the June 2026 quarter", () => {
    const entry = JSON.parse(fixture("alphabet-companyfacts-diluted-shares.json"));
    const fact = selectLatestFact(extractFactRows(entry), "quarterly", "WeightedAverageNumberOfDilutedSharesOutstanding", new Date("2026-09-20"))!;
    expect(fact.value).toBe(12_309_000_000);
    expect(fact.periodEnd).toBe("2026-06-30");
    expect(fact.durationDays).toBeLessThanOrEqual(92);
    expect(fact.accession).toBe("0001652044-26-000071");
  });
});

describe("4. S&P Global — lender or not, from the statements", () => {
  // Latest annual rows as cached (financials-v2), in dollars.
  const spgi = { balance: { total_assets: 61_200e6, total_current_assets: 6_296e6, total_equity: 31_127e6 }, income: { revenue: 15_336e6, interest_expense: 287e6 } };
  const sofi = { balance: { total_assets: 30_000e6, total_current_assets: 0, total_equity: 6_300e6 }, income: { revenue: 3_610e6, interest_expense: 1_155e6 } };
  const visa = { balance: { total_assets: 94_500e6, total_current_assets: 33_000e6, total_equity: 38_700e6 }, income: { revenue: 40_000e6, interest_expense: 600e6 } };
  const ma = { balance: { total_assets: 48_000e6, total_current_assets: 20_000e6, total_equity: 6_500e6 }, income: { revenue: 28_000e6, interest_expense: 620e6 } };
  const blk = { balance: { total_assets: 140_000e6, total_current_assets: 14_000e6, total_equity: 46_000e6 }, income: { revenue: 21_000e6, interest_expense: 600e6 } };

  it("S&P Global is not a lender (51% equity, interest 1.9% of revenue); SoFi is (unclassified sheet, interest 32%)", () => {
    expect(looksLikeLender({ industry: "Financial Data & Stock Exchanges", ...spgi })).toBe(false);
    expect(looksLikeLender({ industry: "Credit Services", ...sofi })).toBe(true);
    for (const [industry, c] of [["Credit Services", visa], ["Credit Services", ma], ["Asset Management", blk]] as const) {
      expect(looksLikeLender({ industry, ...c })).toBe(false);
    }
  });

  it("and so its margin record is usable: 22.5 / 28.5 / 39.2 / 35.6%", () => {
    const revenues = [income("2022-12-31", "FY2022", 11_181e6), income("2023-12-31", "FY2023", 12_497e6), income("2024-12-31", "FY2024", 14_208e6), income("2025-12-31", "FY2025", 15_336e6)];
    const cashFlows = [cashflow("2022-12-31", 2_603e6, -89e6), cashflow("2023-12-31", 3_710e6, -143e6), cashflow("2024-12-31", 5_689e6, -124e6), cashflow("2025-12-31", 5_651e6, -195e6)];
    const lender = looksLikeLender({ industry: "Financial Data & Stock Exchanges", ...spgi });
    const history = buildMarginHistory({ revenues, cashFlows, sector: lender ? "Financial Services" : null, years: 5 });
    expect(history.comparable).toBe(true);
    expect(history.series.map((e) => Math.round(e.margin * 1000) / 10)).toEqual([22.5, 28.5, 39.2, 35.6]);
    // The label rule alone would have dismissed it.
    expect(buildMarginHistory({ revenues, cashFlows, sector: "Financial Services", years: 5 }).comparable).toBe(false);
  });
});

describe("5. Celsius — the revenue base", () => {
  // financials-v2 as cached: FY2025 and the five latest quarters.
  const celh = financials(
    [income("2024-12-31", "FY2024", 1_355_630e3), income("2025-12-31", "FY2025", 2_515_269e3)],
    [],
    [income("2025-06-30", "Q2 2025", 739_259e3), income("2025-09-30", "Q3 2025", 725_106e3), income("2025-12-31", "Q4 2025", 721_628e3), income("2026-03-31", "Q1 2026", 782_615e3), income("2026-06-30", "Q2 2026", 817_925e3)]
  );

  it("with Q1 and Q2 2026 reported the base is the twelve months to June 2026, ~$3,047M, and the divergence is flagged", () => {
    const b = revenueBases(celh);
    expect(b.recommended).toBe("ttm");
    expect(Math.round(b.ttm!.value / M)).toBe(3_047);
    expect(b.ttm).toMatchObject({ periodStart: "2025-07-01", periodEnd: "2026-06-30" });
    expect(b.fiscalYear!.value).toBe(2_515_269e3);
    const d = revenueBaseDivergence(b)!;
    expect(d.deviation).toBeCloseTo(0.2115, 3);
    expect(d.message).toContain("21.2% above");
  });
});

describe("6. FIS — short-term borrowings are debt", () => {
  it("total debt at 30 June 2026 is the long-term debt, its current portion and the short-term borrowings: $21.2B, not $16.9B", () => {
    const facts = JSON.parse(fixture("fis-companyfacts-debt.json"));
    const at = (tag: string) => selectLatestFact(extractFactRows(facts[tag]), "any", tag, new Date("2026-09-20"));
    const noncurrent = at("LongTermDebtNoncurrent")!;
    const current = at("LongTermDebtCurrent")!;
    const shortTerm = at("ShortTermBorrowings")!;
    expect([noncurrent.value, current.value, shortTerm.value].map((v) => v / M)).toEqual([15_432, 1_516, 4_226]);
    const debt = composeFinancialDebt({ noncurrent, current, combined: null, shortTerm })!;
    expect(debt.value / M).toBe(21_174);
    expect(debt.value / M).toBeCloseTo(21_200, -2);
    expect(debt.value / M).not.toBe(16_948);
    expect(debt.periodEnd).toBe("2026-06-30");
    expect(debt.accession).toBe("0001136893-26-000050");
  });

  it("does not add short-term borrowings on top of a DebtCurrent figure, which already holds them", () => {
    const f = (concept: string, value: number): SECFact => ({ value, form: "10-Q", filed: "2026-08-01", periodEnd: "2026-06-30", concept, durationDays: 0 });
    expect(composeFinancialDebt({ noncurrent: f("LongTermDebtNoncurrent", 100), current: f("DebtCurrent", 30), combined: null, shortTerm: f("ShortTermBorrowings", 20) })!.value).toBe(130);
    // A different balance-sheet date is not added either.
    expect(composeFinancialDebt({ noncurrent: f("LongTermDebtNoncurrent", 100), current: f("LongTermDebtCurrent", 30), combined: null, shortTerm: { ...f("ShortTermBorrowings", 20), periodEnd: "2026-03-31" } })!.value).toBe(130);
  });
});

describe("7. Universal Health — the count drifts", () => {
  it("59.91M filed against 58.94M implied: 1.7%, and the per-share figures lean downward", () => {
    const fields = { shareCount: { value: 59_910_000, basis: "filings", filed: 59_910_000, implied: 58_940_000, deviation: null, ratio: null, splitLike: false } } as unknown as SourcedDCFFields;
    const d = shareCountDrift(fields)!;
    expect(d.deviation).toBeCloseTo(0.0165, 3);
    expect(d.bias).toBe("downward");
    expect(shareCountDrift({ shareCount: { ...fields.shareCount, filed: 59_400_000 } } as unknown as SourcedDCFFields)).toBeNull();
  });
});

describe("8. Adobe — stock-based compensation deducted once", () => {
  const adbe = { rawMargin: 0.34, sbcMargin: 0.082 };

  it("the switch takes the base margin from 34.0% to 25.8%", () => {
    const t = sbcTreatment({ currentMargin: 0.34, ...adbe });
    expect(t.deductedMargin).toBeCloseTo(0.258, 6);
    expect(t.alreadyDeducted).toBe(false);
    expect(t.warning).toBeNull();
  });

  it("flipping it on a margin that is already post-SBC raises an explicit warning and does not deduct again", () => {
    const t = sbcTreatment({ currentMargin: 0.258, ...adbe });
    expect(t.alreadyDeducted).toBe(true);
    expect(t.warning).toMatch(/already sits at or below/);
    expect(t.warning).toContain("34.0% − 8.2% = 25.8%");
    // The margin applied is the statements' margin less SBC, once.
    expect(t.deductedMargin).toBeCloseTo(0.258, 6);
  });
});
