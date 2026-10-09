/**
 * The value-moving failures found between 26 September and 8 October 2026,
 * each pinned with the company it broke on. As in September, none was in
 * the two-stage engine: every one was in what fed it — a deduction applied
 * to some scenarios and not others, cash missing a line, interest counted
 * twice, a claim nobody showed, a wing with a 44x exit.
 */
import { describe, expect, it } from "vitest";
import { buildNetDebt, debtClaims, shareCountReconciles, type SECFact } from "@/lib/api/sec-edgar";
import { buildMarginHistory } from "@/lib/calculations/margin-history";
import { buildHistoricalBand, checkGrowthVsRecord } from "@/lib/calculations/dcf-anchors";
import { runDCF, type DCFInputs } from "@/lib/calculations/dcf";
import { composeCash } from "@/lib/sec/fundamentals";
import { confirmNoDebt, preferredIsDebt } from "@/lib/calculations/dcf-inputs-source";
import { isMaterialDeal } from "../regime";
import { assessReliability } from "../reliability";
import { debtInterestPoints, engineInputsFor, interestAddBack, interestIncomeStrip, marginAdjustment, trailingIncome } from "../cash-flow-basis";
import { selectLargestRecentFact } from "@/lib/sec/facts";
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

describe("Phase 2 — false alarms that blocked sound valuations", () => {
  it("lets a diluted count run above the market cap's basic one, but not below it", () => {
    // RDDT 202.0M against 192.4M (+5.0%), CART 248.9M against 237.3M (+4.9%).
    expect(shareCountReconciles(0.05, true)).toBe(true);
    expect(shareCountReconciles(0.049, true)).toBe(true);
    // Visa's class A alone was 9% short; Lululemon's tag 6%; On's 11%.
    expect(shareCountReconciles(-0.09, true)).toBe(false);
    expect(shareCountReconciles(-0.06, true)).toBe(false);
    // A count that is not diluted keeps the plain tolerance; Haleon's ordinary
    // shares against the ADR price were 100% above.
    expect(shareCountReconciles(0.05, false)).toBe(false);
    expect(shareCountReconciles(1.0, true)).toBe(false);
  });

  it("keeps an organic swing in the margin record comparable (Reddit −10.6% → 16.6%)", () => {
    const rows = [
      { date: "2022-12-31", revenue: 667e6, ocf: -100e6 },
      { date: "2023-12-31", revenue: 804e6, ocf: -85e6 },
      { date: "2024-12-31", revenue: 1_300e6, ocf: 216e6 },
      { date: "2025-12-31", revenue: 2_200e6, ocf: 690e6 },
    ];
    const input = {
      revenues: rows.map((r) => ({ date: r.date, revenue: r.revenue })),
      cashFlows: rows.map((r) => ({ date: r.date, operating_cash_flow: r.ocf, capital_expenditures: 0 })),
    };
    const organic = buildMarginHistory({ ...input, perimeterEvent: false });
    expect(organic.comparable).toBe(true);
    expect(organic.flags).toContain("volatile");
    // Without the filings read, the same step is still treated as a possible new perimeter.
    expect(buildMarginHistory(input).comparable).toBe(false);
  });

  it("does not say growth is below the record when the company is already running below it (Lululemon)", () => {
    const band = buildHistoricalBand([0.049, 0.1, 0.19, 0.3], 0.01)!;
    expect(checkGrowthVsRecord(0.01, band, -0.02)).toBeNull();
    expect(checkGrowthVsRecord(-0.05, band, -0.02)?.message).toContain("trailing twelve months");
  });
});

describe("Phase 3 — On: IFRS lease principal comes out of free cash flow", () => {
  // On, 20-F 2025: CHF 69.9M of lease principal (financing under IFRS 16)
  // against CHF 3,014M of revenue: 2.3 points the reported FCF did not pay.
  const points = (69.9 * M) / (3_014 * M);

  it("takes it off on either basis, with SBC, and leaves the interest to the unlevered one", () => {
    expect(marginAdjustment("unlevered", { leasePrincipalPoints: points })).toBeCloseTo(-points, 10);
    expect(marginAdjustment("levered", { leasePrincipalPoints: points, sbcPoints: 0.022 })).toBeCloseTo(-(points + 0.022), 10);
    expect(marginAdjustment("unlevered", { leasePrincipalPoints: points, sbcPoints: 0.022, interestIncomePoints: 0.01 })).toBeCloseTo(-(points + 0.022 + 0.01), 10);
  });

  it("is zero for a US GAAP filer, whose rent is already in operating cash flow", () => {
    expect(marginAdjustment("unlevered", { leasePrincipalPoints: 0 })).toBe(0);
  });

  it("does not add back lease interest as a cost of borrowing when there is no financial debt (On: 0.72 points)", () => {
    expect(debtInterestPoints(0.0072, { ifrsLeases: true, financialDebt: 0 })).toBe(0);
    // With borrowings the interest cannot be split, so it is kept.
    expect(debtInterestPoints(0.0072, { ifrsLeases: true, financialDebt: 500 * M })).toBe(0.0072);
    // A US GAAP filer's operating-lease cost is not interest at all.
    expect(debtInterestPoints(0.0072, { ifrsLeases: false, financialDebt: 0 })).toBe(0.0072);
  });

  it("does not take a 0.7% effective tax rate as the company's rate (On)", () => {
    const on = income({ revenue: 3_014 * M, interest_expense: 22 * M, interest_income: 30 * M, pre_tax_income: 137 * M, income_tax: 1 * M });
    expect(interestAddBack(on)!.taxRateSource).toBe("statutory");
    expect(interestIncomeStrip(on)).toBeCloseTo((30 * M * (1 - 0.21)) / (3_014 * M), 8);
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

describe("Synopsys — interest read off the trailing year, and the Ansys deal found", () => {
  // SNPS, 8 October: the closed year to 2025-10-31 carried the interest on the
  // cash raised for Ansys before it was paid out; the base is the trailing
  // twelve months to 2026-07-31, after the deal.
  const annual = income({ date: "2025-10-31", revenue: 7_054 * M, interest_expense: 447 * M, interest_income: 277 * M, pre_tax_income: 600 * M, income_tax: 90 * M });
  const quarter = (date: string, revenue: number, interest: number) =>
    income({ period: date, date, revenue: revenue * M, interest_expense: interest * M, interest_income: 38 * M, pre_tax_income: 150 * M, income_tax: 25 * M });
  const quarters = [
    quarter("2025-10-31", 2_255, 160),
    quarter("2026-01-31", 2_350, 163),
    quarter("2026-04-30", 2_400, 133),
    quarter("2026-07-31", 2_411, 133),
  ];

  it("sums the last four quarters into one statement", () => {
    const ttm = trailingIncome(quarters, annual)!;
    expect(ttm.revenue).toBe(9_416 * M);
    expect(ttm.interest_expense).toBe(589 * M);
    expect(ttm.interest_income).toBe(152 * M);
    expect(interestIncomeStrip(ttm)).toBeLessThan(interestIncomeStrip(annual) / 2);
  });

  it("keeps the closed year when the quarters do not reach past it or are not four", () => {
    expect(trailingIncome(quarters.slice(1), annual)).toBeNull();
    expect(trailingIncome(quarters, income({ date: "2026-07-31", revenue: 1 }))).toBeNull();
  });

  it("takes a line the quarters leave at zero from the closed year, not as zero", () => {
    const noIncome = trailingIncome(quarters.map((row) => ({ ...row, interest_income: 0 })), annual)!;
    expect(noIncome.interest_income).toBe(277 * M);
    expect(noIncome.interest_expense).toBe(589 * M);
    expect(trailingIncome(quarters.map((row) => ({ ...row, interest_expense: 0 })), annual)!.interest_expense).toBe(447 * M);
  });

  it("finds the $16.7B paid for Ansys although the latest year-to-date reads zero", () => {
    const rows = [
      { start: "2022-11-01", end: "2023-07-31", val: 51_324_000, form: "10-Q" },
      { start: "2024-11-01", end: "2025-07-31", val: 16_681_257_000, form: "10-Q" },
      { start: "2025-11-01", end: "2026-07-31", val: 0, form: "10-Q" },
    ];
    const deal = selectLargestRecentFact(rows, 730, "PaymentsToAcquireBusinessesNetOfCashAcquired", new Date("2026-10-09"))!;
    expect(deal.value).toBe(16_681_257_000);
    expect(deal.periodEnd).toBe("2025-07-31");
    expect(selectLargestRecentFact(rows.slice(0, 1), 730, "x", new Date("2026-10-09"))).toBeNull();
  });
});

describe("Benchmark, 9 October — debt-free companies stop asking about debt", () => {
  const yahooZero = { value: 0, source: "yahoo" as const, asOf: null, stale: false, resolved: true };
  const filing = fact(678 * M, "2026-06-30", "CashAndCashEquivalentsAtCarryingValue");

  it("takes the zero when the filings carry no debt and the company pays no interest (Lululemon, Reddit)", () => {
    const confirmed = confirmNoDebt(yahooZero, { financialDebt: null, cash: filing, dilutedShares: null }, { interestToRevenue: 0, ifrsLeases: false });
    expect(confirmed.resolved).toBe(true);
    expect(confirmed.caveat).toContain("No debt line in the filings");
  });

  it("takes a debt tag filed at zero as the filings saying none (Chipotle)", () => {
    const zeroTag = { ...fact(0, "2025-12-31", "LongTermDebt"), partial: true };
    expect(confirmNoDebt(yahooZero, { financialDebt: zeroTag, cash: filing, dilutedShares: null }, { interestToRevenue: 0, ifrsLeases: false }).caveat).toBeDefined();
  });

  it("allows an IFRS filer its lease interest (On, 0.7% of revenue)", () => {
    const onShares = fact(296.9 * M, "2025-12-31", "EntityCommonStockSharesOutstanding");
    expect(confirmNoDebt(yahooZero, { financialDebt: null, cash: null, dilutedShares: onShares }, { interestToRevenue: 0.0071, ifrsLeases: true }).caveat).toBeDefined();
    expect(confirmNoDebt(yahooZero, { financialDebt: null, cash: null, dilutedShares: onShares }, { interestToRevenue: 0.0071, ifrsLeases: false }).caveat).toBeUndefined();
  });

  it("keeps asking when interest is paid on debt nobody found (Honda), or the filings were not read", () => {
    expect(confirmNoDebt(yahooZero, { financialDebt: null, cash: filing, dilutedShares: null }, { interestToRevenue: 0.03, ifrsLeases: false }).caveat).toBeUndefined();
    expect(confirmNoDebt(yahooZero, null, { interestToRevenue: 0, ifrsLeases: false }).caveat).toBeUndefined();
  });
});

describe("Benchmark, 9 October — an acquisition is material against the buyer's value too", () => {
  it("drops deals small against market value (Mastercard's $2.65B for Recorded Future)", () => {
    expect(isMaterialDeal(2.65e9, 30e9)).toBe(true);
    expect(isMaterialDeal(2.65e9, 30e9, 480e9)).toBe(false);
  });
  it("keeps deals that change the company (Synopsys's $16.7B for Ansys, e.l.f.'s Rhode)", () => {
    expect(isMaterialDeal(16.68e9, 7.05e9, 95e9)).toBe(true);
    expect(isMaterialDeal(582 * M, 1_636 * M, 6.25e9)).toBe(true);
  });
});

describe("Benchmark, 9 October — one cause, one deduction in the reliability score", () => {
  it("counts e.l.f.'s deal once, not as a failed check, a regime and a broken record", () => {
    const base = {
      provenance: [],
      unresolved: 0,
      converted: false,
      terminalWeight: null,
      spread: null,
      waccSensitivity: null,
      growthAboveRecord: false,
      terminalMarginAboveRecord: false,
      dispersion: null,
    };
    const r = assessReliability({
      ...base,
      checks: [{ id: "marginRecord", label: "Usable margin record", status: "fail", detail: "" }],
      regimes: ["shiftingPerimeter"],
      marginRecord: { years: 5, comparable: false, volatile: false, negativeYears: 0, latestNegative: false },
    });
    const all = r.blocks.flatMap((b) => b.deductions.map((d) => d.label));
    expect(all.filter((l) => /perimeter|Usable margin record|not comparable/.test(l))).toHaveLength(1);
  });
});
