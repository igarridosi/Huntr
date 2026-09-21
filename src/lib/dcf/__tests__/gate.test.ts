import { describe, expect, it } from "vitest";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";
import type { CashFlowStatement, IncomeStatement } from "@/types/financials";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import { buildMarginHistory } from "@/lib/calculations/margin-history";
import { engineInputsFor, interestAddBack, STATUTORY_TAX_RATE } from "../cash-flow-basis";
import { quartersOfYear, valuationGate } from "../gate";
import { buildProvenance } from "../provenance";
import { BASE_INPUTS } from "@/lib/calculations/__tests__/dcf-fixtures";

const cf = (date: string, ocf: number, capex: number, source: "yahoo" | "alphavantage" = "yahoo"): CashFlowStatement => ({
  period: date, date, currency: "USD", source, operating_cash_flow: ocf, capital_expenditures: capex, free_cash_flow: ocf - Math.abs(capex), dividends_paid: 0, share_repurchases: 0, net_investing: 0, net_financing: 0, net_change_in_cash: 0,
});
const inc = (date: string, revenue: number, extra: Partial<IncomeStatement> = {}): IncomeStatement => ({
  period: date, date, currency: "USD", source: "yahoo", revenue, cost_of_revenue: 0, gross_profit: 0, operating_expenses: 0, operating_income: 0, interest_expense: 0, pre_tax_income: 0, income_tax: 0, net_income: 0, eps_basic: 0, eps_diluted: 0, shares_outstanding_basic: 0, shares_outstanding_diluted: 0, ebitda: 0, ...extra,
});
const fact = (concept: string, value: number, periodEnd: string, accession = "0000000000-26-000001"): SECFact => ({ value, form: "10-Q", filed: "2026-08-01", periodEnd, concept, durationDays: 0, accession });

// YETI: Yahoo's 2025 year and the four quarters that make it up (Q1 from Alpha Vantage, the rest from Yahoo).
const yetiAnnual = [cf("2024-12-31", 261_386e3, -95_284e3), cf("2025-12-31", 254_737e3, -101_839e3)];
const yetiQuarters = [cf("2025-03-31", -80_296e3, -15_510e3, "alphavantage"), cf("2025-06-30", 61_195e3, -15_576e3), cf("2025-09-30", 100_940e3, -50_156e3), cf("2025-12-31", 172_898e3, -20_597e3), cf("2026-03-31", -32_649e3, -14_527e3), cf("2026-06-30", 62_450e3, -25_426e3)];

const passing = () =>
  valuationGate({
    shares: 75_782_000,
    price: 41.9,
    reportedMarketCap: 75_782_000 * 41.9 * 1.004,
    cashFlow: { annual: yetiAnnual, quarterly: yetiQuarters },
    debtInUse: 75_018e3,
    debtSource: "sec",
    filedDebt: fact("LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", 75_018e3, "2026-06-30"),
    revenue: { basis: "ttm", divergence: null, perimeterConfirmed: false },
    marginHistory: buildMarginHistory({ revenues: [inc("2022-12-31", 1_595e6), inc("2023-12-31", 1_659e6), inc("2024-12-31", 1_830e6), inc("2025-12-31", 1_868e6)], cashFlows: [cf("2022-12-31", 100.9e6, -56.9e6), cf("2023-12-31", 285.9e6, -72.8e6), ...yetiAnnual], years: 5 }),
    lender: false,
  });

describe("valuationGate", () => {
  it("passes the five checks on a clean set and does not block", () => {
    const g = passing();
    expect(g.checks.map((c) => `${c.id}:${c.status}`)).toEqual(["marketCap:pass", "fcfQuarters:pass", "totalDebt:pass", "revenuePerimeter:pass", "marginRecord:pass"]);
    expect(g.blocked).toBe(false);
  });

  it("the four quarters of the fiscal year are found on the issuer's calendar and summed on the defined basis", () => {
    const four = quartersOfYear(yetiQuarters, "2025-12-31")!;
    expect(four.map((q) => q.date)).toEqual(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"]);
    expect(quartersOfYear(yetiQuarters.slice(1), "2025-12-31")).toBeNull();
  });

  it("blocks on a market cap the shares and price do not reproduce: Visa's cover count", () => {
    const g = valuationGate({ ...gateInput(), shares: 1_704_112_694, price: 404, reportedMarketCap: 1_877_355_334 * 404 });
    const cap = g.checks.find((c) => c.id === "marketCap")!;
    expect(cap.status).toBe("fail");
    expect(cap.detail).toContain("9.2% below");
    expect(g.blocked).toBe(true);
    expect(g.reasons[0]).toMatch(/^Market cap = shares × price/);
  });

  it("blocks on debt in use that is not the filed total: FIS's 16.9B against 21.2B", () => {
    const g = valuationGate({ ...gateInput(), debtInUse: 16_948e6, debtSource: "yahoo", filedDebt: fact("LongTermDebtNoncurrent + LongTermDebtCurrent + ShortTermBorrowings", 21_174e6, "2026-06-30", "0001136893-26-000050") });
    expect(g.checks.find((c) => c.id === "totalDebt")!.status).toBe("fail");
    expect(g.blocked).toBe(true);
  });

  it("blocks on a revenue perimeter that diverged until the reader confirms it, and on a lender's margin record", () => {
    const divergence = { ttm: 3_047e6, fiscalYear: 2_515e6, deviation: 0.2115, message: "…" };
    const blocked = valuationGate({ ...gateInput(), revenue: { basis: "ttm", divergence, perimeterConfirmed: false } });
    expect(blocked.checks.find((c) => c.id === "revenuePerimeter")!.status).toBe("fail");
    const confirmed = valuationGate({ ...gateInput(), revenue: { basis: "ttm", divergence, perimeterConfirmed: true } });
    expect(confirmed.checks.find((c) => c.id === "revenuePerimeter")!.status).toBe("pass");
    expect(confirmed.blocked).toBe(false);
    expect(valuationGate({ ...gateInput(), lender: true }).checks.find((c) => c.id === "marginRecord")!.status).toBe("fail");
  });

  it("reports what it cannot verify without blocking on it", () => {
    const g = valuationGate({ ...gateInput(), reportedMarketCap: null, filedDebt: null, cashFlow: { annual: yetiAnnual, quarterly: yetiQuarters.slice(2) } });
    expect(g.checks.filter((c) => c.status === "unverifiable").map((c) => c.id)).toEqual(["marketCap", "fcfQuarters", "totalDebt"]);
    expect(g.blocked).toBe(false);
  });
});

function gateInput(): Parameters<typeof valuationGate>[0] {
  return {
    shares: 75_782_000,
    price: 41.9,
    reportedMarketCap: 75_782_000 * 41.9,
    cashFlow: { annual: yetiAnnual, quarterly: yetiQuarters },
    debtInUse: 75_018e3,
    debtSource: "sec",
    filedDebt: fact("LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", 75_018e3, "2026-06-30"),
    revenue: { basis: "ttm", divergence: null, perimeterConfirmed: false },
    marginHistory: buildMarginHistory({ revenues: [inc("2022-12-31", 1_595e6), inc("2023-12-31", 1_659e6), inc("2024-12-31", 1_830e6), inc("2025-12-31", 1_868e6)], cashFlows: [cf("2022-12-31", 100.9e6, -56.9e6), cf("2023-12-31", 285.9e6, -72.8e6), ...yetiAnnual], years: 5 }),
    lender: false,
  };
}

describe("buildProvenance", () => {
  const sec = {
    cik: "0001670592",
    dilutedShares: { ...fact("WeightedAverageNumberOfDilutedSharesOutstanding", 75_782_000, "2026-06-30", "0001670592-26-000040"), durationDays: 91 },
    coverShares: null,
    weightedDilutedShares: null,
    financialDebt: fact("LongTermDebtNoncurrent + LongTermDebtCurrent", 75_018e3, "2026-06-30", "0001670592-26-000040"),
    cash: fact("CashAndCashEquivalentsAtCarryingValue", 59_823e3, "2026-06-30", "0001670592-26-000040"),
    operatingLeases: null,
    operatingLeaseExpense: null,
    shareBasedCompensation: null,
    revenueTtm: { value: 1_935_756e3, periodStart: "2025-06-29", periodEnd: "2026-06-30", method: "10-K FY + 10-Q YTD − prior-year YTD", accessions: ["0001670592-26-000013", "0001670592-26-000040"], concept: "RevenueFromContractWithCustomerExcludingAssessedTax" },
    operatingCashFlowAnnual: { ...fact("NetCashProvidedByUsedInOperatingActivities", 254_737e3, "2025-12-31", "0001670592-26-000013"), form: "10-K", durationDays: 371 },
  } satisfies SECFundamentals;
  const fields = {
    sharesOutstanding: { value: 75_782_000, source: "sec", asOf: "2026-06-30", stale: false, resolved: true },
    financialDebt: { value: 75_018e3, source: "sec", asOf: "2026-06-30", stale: false, resolved: true },
    cash: { value: 59_823e3, source: "sec", asOf: "2026-06-30", stale: false, resolved: true },
    shareCount: { value: 75_782_000, basis: "filings", filed: 75_782_000, implied: 73_000_000, deviation: null, ratio: null, splitLike: false },
  } as unknown as SourcedDCFFields;

  it("traces each of the five inputs to a filing with its accession, or says it cannot", () => {
    const rows = buildProvenance({
      inputs: { baseRevenue: 1_936e6, baseFCFMargin: 0.079, totalDebt: 75_018e3, cashAndEquivalents: 59_823e3, sharesOutstanding: 75_782_000, currentPrice: 41.9 },
      revenue: { basis: "ttm", periodStart: "2025-07-01", periodEnd: "2026-06-30", source: "yahoo" },
      marginRows: { cash: cf("2025-12-31", 254_737e3, -101_839e3), income: inc("2025-12-31", 1_868e6) },
      fields,
      sec,
      quote: { price: 41.9, marketCap: 75_782_000 * 41.9, asOf: null },
    });
    const by = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(by.baseRevenue.verified).toBe(true);
    expect(by.baseRevenue.document?.accession).toBe("0001670592-26-000013 + 0001670592-26-000040");
    expect(by.fcfMargin.verified).toBe(true);
    expect(by.fcfMargin.document?.form).toBe("10-K");
    expect(by.netDebt).toMatchObject({ value: 15_195e3, source: "sec", verified: true, periodEnd: "2026-06-30" });
    expect(by.sharesOutstanding).toMatchObject({ source: "sec", verified: true, document: { accession: "0001670592-26-000040" } });
    expect(by.currentPrice).toMatchObject({ source: "market", verified: true, document: null });
  });

  it("marks a margin from an Alpha Vantage annual row, a manual revenue and an implied count as unverified", () => {
    const rows = buildProvenance({
      inputs: { baseRevenue: 2_000e6, baseFCFMargin: 0.113, totalDebt: 75_018e3, cashAndEquivalents: 59_823e3, sharesOutstanding: 73_000_000, currentPrice: 41.9 },
      revenue: { basis: "manual", periodStart: null, periodEnd: null, source: "alphavantage" },
      marginRows: { cash: cf("2025-12-31", 254_737e3, -42_667e3, "alphavantage"), income: inc("2025-12-31", 1_868e6) },
      fields: { ...fields, shareCount: { ...fields.shareCount, basis: "implied" } } as unknown as SourcedDCFFields,
      sec,
      quote: null,
    });
    const by = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(by.baseRevenue).toMatchObject({ source: "manual", verified: false });
    expect(by.fcfMargin.verified).toBe(false);
    expect(by.fcfMargin.note).toMatch(/not on the defined basis/);
    expect(by.sharesOutstanding).toMatchObject({ source: "implied", verified: false });
    expect(by.currentPrice).toMatchObject({ source: "unavailable", verified: false });
  });
});

describe("cash flow basis", () => {
  it("adds back after-tax interest at the effective rate, or the statutory one when the statements give none", () => {
    // FIS-like: interest 8% of revenue, effective tax 22%.
    const eff = interestAddBack(inc("2025-12-31", 10_680e6, { interest_expense: 854e6, pre_tax_income: 1_000e6, income_tax: 220e6 }))!;
    expect(eff.taxRateSource).toBe("effective");
    expect(eff.marginPoints).toBeCloseTo((854e6 * 0.78) / 10_680e6, 6);
    const stat = interestAddBack(inc("2025-12-31", 10_680e6, { interest_expense: 854e6, pre_tax_income: -50e6, income_tax: 10e6 }))!;
    expect(stat.taxRateSource).toBe("statutory");
    expect(stat.taxRate).toBe(STATUTORY_TAX_RATE);
    expect(interestAddBack(null)).toBeNull();
  });

  it("levered flows run with no net debt to subtract; unlevered flows keep it", () => {
    expect(engineInputsFor(BASE_INPUTS, "unlevered")).toBe(BASE_INPUTS);
    expect(engineInputsFor(BASE_INPUTS, "levered")).toMatchObject({ totalDebt: 0, cashAndEquivalents: 0, baseRevenue: BASE_INPUTS.baseRevenue });
  });
});
