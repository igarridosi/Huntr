/**
 * The value-moving failures found between 26 September and 8 October 2026,
 * each pinned with the company it broke on. As in September, none was in
 * the two-stage engine: every one was in what fed it — a deduction applied
 * to some scenarios and not others, cash missing a line, interest counted
 * twice, a claim nobody showed, a wing with a 44x exit.
 */
import { describe, expect, it } from "vitest";
import { buildNetDebt, debtClaims, type SECFact } from "@/lib/api/sec-edgar";
import { runDCF, type DCFInputs } from "@/lib/calculations/dcf";
import { composeCash } from "@/lib/sec/fundamentals";
import { preferredIsDebt } from "@/lib/calculations/dcf-inputs-source";
import { engineInputsFor, interestIncomeStrip, marginAdjustment } from "../cash-flow-basis";
import type { IncomeStatement } from "@/types/financials";

const M = 1e6;

const fact = (value: number, periodEnd: string, concept: string): SECFact => ({
  value,
  form: "10-Q",
  filed: "2026-08-07",
  periodEnd,
  concept,
  durationDays: 0,
  accession: "0000000000-26-000000",
});

const income = (extra: Partial<IncomeStatement>): IncomeStatement => ({
  period: "FY2025", date: "2025-12-31", currency: "USD", source: "yahoo", revenue: 0, cost_of_revenue: 0, gross_profit: 0, operating_expenses: 0, operating_income: 0, interest_expense: 0, pre_tax_income: 0, income_tax: 0, net_income: 0, eps_basic: 0, eps_diluted: 0, shares_outstanding_basic: 0, shares_outstanding_diluted: 0, ebitda: 0, ...extra,
});

describe("Instacart — SBC deducted on all three scenarios, both margins, whenever they were typed", () => {
  // CART, 8 October: TTM revenue $3,993M, SBC $401M (10.0 points), cash plus
  // securities $885M, 248.9M diluted shares, $45.21. The margins typed after
  // the switch reached the engine undeducted on Base and Bull, and the Base
  // read $78.95 against roughly $72 on the definition the user meant.
  const cart = (over: Partial<DCFInputs>): DCFInputs => ({
    baseRevenue: 3_993 * M,
    growthRatePhase1: 0.11,
    growthRatePhase2: 0.06,
    yearsPhase1: 5,
    yearsPhase2: 5,
    baseFCFMargin: 0.25,
    terminalFCFMargin: 0.28,
    wacc: 0.095,
    terminalGrowthRate: 0.03,
    totalDebt: 0,
    cashAndEquivalents: 885 * M,
    sharesOutstanding: 248.935 * M,
    currentPrice: 45.21,
    ...over,
  });
  const sbcPoints = (401 * M) / (3_993 * M);

  it("takes the same points off both margins of every scenario", () => {
    for (const scenario of [cart({ baseFCFMargin: 0.22, terminalFCFMargin: 0.22 }), cart({}), cart({ baseFCFMargin: 0.27, terminalFCFMargin: 0.32 })]) {
      const run = engineInputsFor(scenario, "unlevered", { sbcPoints });
      expect(run.baseFCFMargin).toBeCloseTo(scenario.baseFCFMargin - sbcPoints, 10);
      expect(run.terminalFCFMargin).toBeCloseTo(scenario.terminalFCFMargin - sbcPoints, 10);
    }
  });

  it("values the Base at about $72, not $78.95", () => {
    const value = runDCF(engineInputsFor(cart({}), "unlevered", { sbcPoints })).intrinsicValuePerShare;
    expect(value).toBeGreaterThan(71);
    expect(value).toBeLessThan(73);
  });

  it("deducts on the levered basis too, where interest is left as reported", () => {
    expect(marginAdjustment("levered", { sbcPoints, interestPoints: 0.02, interestIncomePoints: 0.01 })).toBeCloseTo(-sbcPoints, 10);
    expect(marginAdjustment("unlevered", { sbcPoints, interestPoints: 0.02, interestIncomePoints: 0.01 })).toBeCloseTo(0.01 - sbcPoints, 10);
  });

  it("still reads a bare number as the interest add-back, as Haleon's fix wrote it", () => {
    const typed = cart({ baseFCFMargin: 0.2026, terminalFCFMargin: 0.21 });
    expect(engineInputsFor(typed, "unlevered", 0.0246).baseFCFMargin).toBeCloseTo(0.2272, 10);
  });
});

describe("Reddit — the interest earned on cash is not counted beside the cash", () => {
  // RDDT carried $2.8B of cash and securities; at roughly 4% that is about
  // $110M a year inside free cash flow, on $2,779M of revenue.
  const rddt = income({ revenue: 2_779 * M, interest_income: 110 * M, pre_tax_income: 900 * M, income_tax: 189 * M });

  it("strips the after-tax interest income on the unlevered basis", () => {
    expect(interestIncomeStrip(rddt)).toBeCloseTo((110 * M * (1 - 0.21)) / (2_779 * M), 6);
    expect(marginAdjustment("unlevered", { interestIncomePoints: interestIncomeStrip(rddt) })).toBeLessThan(0);
  });

  it("leaves it alone when nothing was earned, or on the levered basis where the cash is not added", () => {
    expect(interestIncomeStrip(income({ revenue: 1_000 * M }))).toBe(0);
    expect(marginAdjustment("levered", { interestIncomePoints: 0.03 })).toBe(0);
  });
});

describe("Reddit and Instacart — current marketable securities are cash", () => {
  it("adds them when they describe the same balance sheet (RDDT: $1,486.8M + $1,299.2M)", () => {
    const got = composeCash({
      cash: fact(1_486.838 * M, "2026-06-30", "CashAndCashEquivalentsAtCarryingValue"),
      restrictedCurrent: null,
      restrictedNoncurrent: null,
      marketable: fact(1_299.162 * M, "2026-06-30", "MarketableSecuritiesCurrent"),
    });
    expect(got!.value).toBeCloseTo(2_786 * M, -3);
    expect(got!.concept).toContain("MarketableSecuritiesCurrent");
  });

  it("does not add securities from another quarter", () => {
    const got = composeCash({
      cash: fact(757 * M, "2026-06-30", "CashAndCashEquivalentsAtCarryingValue"),
      restrictedCurrent: null,
      restrictedNoncurrent: null,
      marketable: fact(93 * M, "2025-12-31", "ShortTermInvestments"),
    });
    expect(got!.value).toBe(757 * M);
  });

  it("still nets restricted cash out of a combined tag before adding them", () => {
    const got = composeCash({
      cash: fact(1_000 * M, "2026-06-30", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"),
      restrictedCurrent: fact(117 * M, "2026-06-30", "RestrictedCashCurrent"),
      restrictedNoncurrent: null,
      marketable: fact(93 * M, "2026-06-30", "ShortTermInvestments"),
    });
    expect(got!.value).toBe(976 * M);
  });
});

describe("Instacart — whether preferred is debt is read from the filing", () => {
  const preferred = fact(200 * M, "2026-06-30", "TemporaryEquityCarryingAmountAttributableToParent");

  it("leaves it out when the diluted count already converts it (5.8M incremental shares in Q2 2026)", () => {
    expect(preferredIsDebt({ redeemablePreferred: preferred, preferredConversionShares: fact(5.833 * M, "2026-06-30", "IncrementalCommonSharesAttributableToConversionOfPreferredStock") })).toBe(false);
  });

  it("subtracts it when nothing in the count converts it", () => {
    expect(preferredIsDebt({ redeemablePreferred: preferred, preferredConversionShares: null })).toBe(true);
    expect(preferredIsDebt({ redeemablePreferred: null, preferredConversionShares: null })).toBe(false);
  });
});

describe("Instacart — redeemable preferred is shown, and counted only when it is a claim", () => {
  const parts = { financialDebt: 0, operatingLeases: 34 * M, cash: 885 * M, redeemablePreferred: 200 * M };

  it("carries the $200M without subtracting it by default", () => {
    const net = buildNetDebt(parts);
    expect(net.redeemablePreferred).toBe(200 * M);
    expect(net.includesPreferred).toBe(false);
    expect(net.netDebt).toBe(-885 * M);
    expect(debtClaims(net)).toBe(0);
  });

  it("adds it to the debt the engine subtracts when counted", () => {
    const net = buildNetDebt({ ...parts, includePreferred: true });
    expect(net.netDebt).toBe(-685 * M);
    expect(debtClaims(net)).toBe(200 * M);
  });
});
