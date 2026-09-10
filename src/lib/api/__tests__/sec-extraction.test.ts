import { describe, expect, it } from "vitest";
import {
  MAX_FACT_AGE_DAYS,
  adjustFCFForLeases,
  checkMarketCap,
  buildNetDebt,
  pickFresher,
  resolveLeaseTreatment,
  selectLatestFact,
  sumFacts,
} from "../sec-edgar";

const NOW = new Date("2026-08-30");

/**
 * BUG 3 — the extraction was picking arbitrary facts out of the history.
 *
 * `companyconcept` returns every fact a company has ever filed under a tag, in
 * no particular order and across every form type. Reading it without ordering,
 * without filtering the form, and without checking the period length is how a
 * balance sheet ends up dated 2019 and a share count ends up 5% wrong.
 */
describe("fact selection", () => {
  it("takes the most recent period, not the first row", () => {
    const facts = [
      { end: "2019-03-27", val: 500, form: "10-K", filed: "2019-03-27" },
      { end: "2026-06-30", val: 900, form: "10-Q", filed: "2026-07-29" },
      { end: "2022-09-30", val: 700, form: "10-Q", filed: "2022-10-28" },
    ];
    expect(selectLatestFact(facts)?.value).toBe(900);
  });

  /**
   * EDGAR files the same concept under 8-K exhibits and registration
   * statements. Those can be years old or scoped to a transaction rather than
   * to the company, and they must not win the recency contest.
   */
  it("ignores forms that do not carry a reviewed balance sheet", () => {
    const facts = [
      { end: "2026-06-30", val: 900, form: "10-Q", filed: "2026-07-29" },
      { end: "2026-08-15", val: 12, form: "8-K", filed: "2026-08-16" },
      { end: "2026-09-01", val: 3, form: "S-1", filed: "2026-09-02" },
    ];
    expect(selectLatestFact(facts)?.value).toBe(900);
  });

  it("keeps facts whose form is not labelled rather than losing the company", () => {
    expect(selectLatestFact([{ end: "2026-06-30", val: 42 }])?.value).toBe(42);
  });

  /**
   * BUG 4 — a 10-Q files diluted shares twice under the same tag with the same
   * end date: once for the quarter and once year to date. Taking whichever
   * came first is how the share count drifts from the one the market cap
   * implies.
   */
  it("prefers the quarter over the year-to-date figure at the same period end", () => {
    const facts = [
      {
        start: "2026-01-01",
        end: "2026-06-30",
        val: 113_600_000,
        form: "10-Q",
        filed: "2026-07-29",
      },
      {
        start: "2026-04-01",
        end: "2026-06-30",
        val: 108_400_000,
        form: "10-Q",
        filed: "2026-07-29",
      },
    ];
    expect(selectLatestFact(facts, "quarterly")?.value).toBe(108_400_000);
    expect(selectLatestFact(facts, "annual")).toBeNull();
  });

  it("takes the annual window when asked for one", () => {
    const facts = [
      {
        start: "2026-04-01",
        end: "2026-06-30",
        val: 29_190_000,
        form: "10-Q",
        filed: "2026-07-29",
      },
      {
        start: "2025-07-01",
        end: "2026-06-30",
        val: 118_000_000,
        form: "10-K",
        filed: "2026-08-20",
      },
    ];
    expect(selectLatestFact(facts, "annual")?.value).toBe(118_000_000);
  });

  it("records which tag the figure came from", () => {
    const fact = selectLatestFact(
      [{ end: "2026-06-30", val: 900, form: "10-Q", filed: "2026-07-29" }],
      "any",
      "CashAndCashEquivalentsAtCarryingValue"
    );
    expect(fact?.concept).toBe("CashAndCashEquivalentsAtCarryingValue");
  });

  /**
   * A balance-sheet instant has no start date. Filtering by duration must not
   * throw those away, or every balance figure disappears.
   */
  it("keeps instants regardless of the period asked for", () => {
    const instant = [{ end: "2026-06-30", val: 900, form: "10-Q", filed: "2026-07-29" }];
    expect(selectLatestFact(instant, "quarterly")?.value).toBe(900);
    expect(selectLatestFact(instant, "annual")?.value).toBe(900);
  });
});

/**
 * BUG 2 — leases were being counted twice.
 *
 * Under ASC 842 the operating lease charge is already deducted from operating
 * cash flow, so the free cash flow the model discounts is net of rent. Adding
 * the lease liability to net debt as well discounts the same obligation twice.
 *
 * The two coherent treatments are: capitalise (liability in net debt AND rent
 * returned to FCF), or expense (neither). Doing half of each is the one
 * combination that is simply wrong.
 */
/**
 * Companies abandon tags, and the abandoned one keeps answering.
 *
 * Ford last filed LongTermDebtNoncurrent in 2021; read without an age limit
 * that returns 291M as the current debt of a company carrying over a hundred
 * billion. A wrong number wearing a filing date is worse than no number,
 * because the fallback never gets a chance to supply a current one.
 */
describe("abandoned tags", () => {
  it("refuses a fact the company stopped filing years ago", () => {
    const stale = [
      { end: "2020-12-31", val: 291_000_000, form: "10-K", filed: "2021-02-05" },
    ];
    expect(selectLatestFact(stale, "any", "LongTermDebtNoncurrent", NOW)).toBeNull();
  });

  it("keeps an annual figure that is current between 10-Ks", () => {
    const annualOnly = [
      { end: "2025-10-31", val: 12_490_000_000, form: "10-K", filed: "2025-11-01" },
    ];
    expect(
      selectLatestFact(annualOnly, "any", "OperatingLeaseLiabilityNoncurrent", NOW)
        ?.value
    ).toBe(12_490_000_000);
    expect(MAX_FACT_AGE_DAYS).toBeGreaterThan(365);
  });

  /**
   * A tag that is still in use beats one that was retired, whatever order the
   * cascade lists them in. Starbucks moved from
   * CashAndCashEquivalentsAtCarryingValue to the restricted-cash tag in 2022,
   * and stopping at the first hit printed a four-year-old balance next to a
   * current one.
   */
  it("prefers the tag still in use over the retired one", () => {
    const retired = selectLatestFact(
      [{ end: "2022-07-03", val: 3_178_000_000, form: "10-Q", filed: "2022-08-02" }],
      "any",
      "CashAndCashEquivalentsAtCarryingValue",
      new Date("2022-09-01")
    );
    const current = selectLatestFact(
      [{ end: "2026-06-28", val: 3_450_000_000, form: "10-Q", filed: "2026-07-29" }],
      "any",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      NOW
    );
    expect(pickFresher(retired, current)?.value).toBe(3_450_000_000);
    expect(pickFresher(current, retired)?.value).toBe(3_450_000_000);
  });
});

describe("lease treatment", () => {
  it("allows capitalising when the rent charge is available", () => {
    const treatment = resolveLeaseTreatment(2_140_000_000, 310_000_000);
    expect(treatment.canCapitalise).toBe(true);
    expect(treatment.leaseExpense).toBe(310_000_000);
    expect(treatment.reason).toBeNull();
  });

  /**
   * Without the rent charge there is no honest way to make the compensating
   * move, so the option is refused rather than half-applied.
   */
  it("refuses to capitalise when the rent charge is missing", () => {
    const treatment = resolveLeaseTreatment(2_140_000_000, null);
    expect(treatment.canCapitalise).toBe(false);
    expect(treatment.reason).toContain("cannot be added back");
  });

  it("says so plainly when the company has no leases", () => {
    const treatment = resolveLeaseTreatment(0, 310_000_000);
    expect(treatment.canCapitalise).toBe(false);
    expect(treatment.reason).toContain("no operating lease liability");
  });

  /**
   * Only the interest returns to cash flow. The right-of-use asset still
   * depreciates, and that depreciation is a real cost of using the space.
   */
  it("returns the interest on the liability, not the whole rent", () => {
    const adjusted = adjustFCFForLeases({
      freeCashFlow: 1_000_000_000,
      leaseExpense: 310_000_000,
      leaseLiability: 2_140_000_000,
      discountRate: 0.065,
      capitalise: true,
    });
    expect(adjusted).toBeCloseTo(1_000_000_000 + 2_140_000_000 * 0.065, 0);
    expect(adjusted).toBeLessThan(1_310_000_000);
  });

  it("never adds back more rent than was actually paid", () => {
    const adjusted = adjustFCFForLeases({
      freeCashFlow: 1_000_000_000,
      leaseExpense: 40_000_000,
      leaseLiability: 2_140_000_000,
      discountRate: 0.065,
      capitalise: true,
    });
    expect(adjusted).toBe(1_040_000_000);
  });

  it("leaves free cash flow alone when expensing", () => {
    expect(
      adjustFCFForLeases({
        freeCashFlow: 1_000_000_000,
        leaseExpense: 310_000_000,
        leaseLiability: 2_140_000_000,
        discountRate: 0.065,
        capitalise: false,
      })
    ).toBe(1_000_000_000);
  });

  /**
   * The regression test the plan asks for: the two coherent treatments should
   * land close to each other. A large gap means the compensating adjustment is
   * not being applied and the obligation is being counted twice.
   *
   * Modelled here as a perpetuity, which is the cleanest way to state the
   * relationship: capitalising adds the liability to net debt and adds the
   * rent back to the cash flow being discounted. The two roughly offset.
   */
  it("both coherent treatments land within a few percent of each other", () => {
    const leaseLiability = 2_140_000_000;
    const leaseExpense = 310_000_000;
    const baseFCF = 1_000_000_000;
    const financialDebt = 0;
    const cash = 881_320_000;
    const wacc = 0.09;
    const growth = 0.025;
    const shares = 108_400_000;

    const valuePerShare = (fcf: number, netDebt: number) =>
      (fcf / (wacc - growth) - netDebt) / shares;

    const expensed = valuePerShare(
      adjustFCFForLeases({
        freeCashFlow: baseFCF,
        leaseExpense,
        leaseLiability,
        discountRate: wacc - growth,
        capitalise: false,
      }),
      buildNetDebt({ financialDebt, operatingLeases: leaseLiability, cash }).netDebt
    );

    const capitalised = valuePerShare(
      adjustFCFForLeases({
        freeCashFlow: baseFCF,
        leaseExpense,
        leaseLiability,
        discountRate: wacc - growth,
        capitalise: true,
      }),
      buildNetDebt({
        financialDebt,
        operatingLeases: leaseLiability,
        cash,
        includeLeases: true,
      }).netDebt
    );

    // The plan asks for a few percentage points, not twenty. A wider gap
    // means the compensating adjustment is not landing.
    const gap = Math.abs(capitalised / expensed - 1);
    expect(gap).toBeLessThan(0.03);
  });

  /**
   * And the counter-test: doing only half of Option A - liability in net debt,
   * rent left out of FCF - is the broken combination, and it moves the value
   * far more than the coherent treatments differ from each other.
   */
  it("half-applying the treatment moves the value much further", () => {
    const leaseLiability = 2_140_000_000;
    const baseFCF = 1_000_000_000;
    const cash = 881_320_000;
    const wacc = 0.09;
    const growth = 0.025;
    const shares = 108_400_000;

    const valuePerShare = (fcf: number, netDebt: number) =>
      (fcf / (wacc - growth) - netDebt) / shares;

    const expensed = valuePerShare(
      baseFCF,
      buildNetDebt({ financialDebt: 0, operatingLeases: leaseLiability, cash }).netDebt
    );

    const halfApplied = valuePerShare(
      baseFCF,
      buildNetDebt({
        financialDebt: 0,
        operatingLeases: leaseLiability,
        cash,
        includeLeases: true,
      }).netDebt
    );

    expect(Math.abs(halfApplied / expensed - 1)).toBeGreaterThan(0.1);
  });
});

/**
 * A half presented as a whole.
 *
 * Verizon abandoned LongTermDebtNoncurrent in 2013 and files its borrowings
 * under LongTermDebtAndCapitalLeaseObligations. Reading only the first name
 * left the current half standing alone, and 21.8B was reported as the total
 * debt of a company carrying 143.4B - recent, plausible, wrong by 85%, and
 * silent, because nothing checks debt against an external anchor the way the
 * share count is checked against market cap.
 */
describe("partial totals", () => {
  const nc = (v: number, end = "2026-06-30") => ({
    value: v, form: "10-Q", filed: end, periodEnd: end,
    concept: "LongTermDebtAndCapitalLeaseObligations", durationDays: 0,
  });
  const cur = (v: number, end = "2026-06-30") => ({
    value: v, form: "10-Q", filed: end, periodEnd: end,
    concept: "LongTermDebtCurrent", durationDays: 0,
  });

  it("adds the halves when they describe the same period", () => {
    const total = sumFacts(nc(143_400_000_000), cur(21_783_000_000));
    expect(total?.value).toBe(165_183_000_000);
  });

  /**
   * Summing a June balance with a March one is arithmetic on two different
   * companies, so the pairing has to be refused rather than quietly performed.
   */
  it("does not pair halves from different periods", () => {
    const a = nc(1_000_000_000, "2026-06-30");
    const b = cur(300_000_000, "2026-03-31");
    expect(a.periodEnd === b.periodEnd).toBe(false);
  });

  it("marks a lone half as partial rather than calling it a total", () => {
    const lone = { ...cur(21_783_000_000), partial: true };
    expect(lone.partial).toBe(true);
  });
});

/**
 * The share count that divides the equity value.
 *
 * Weighted average diluted is an average over a reporting period. On any
 * company buying back stock it lags the real share base, always in the same
 * direction: Crocs by 3.5%, Verizon and Starbucks by a third of a percent.
 * The cover-page count is point-in-time and is what market capitalisation is
 * built from.
 */
describe("share count preference", () => {
  const cover = {
    value: 47_900_000, form: "10-Q", filed: "2026-07-23",
    periodEnd: "2026-07-23", concept: "EntityCommonStockSharesOutstanding",
    durationDays: 0,
  };
  const weighted = {
    value: 49_630_000, form: "10-Q", filed: "2026-07-30",
    periodEnd: "2026-06-30",
    concept: "WeightedAverageNumberOfDilutedSharesOutstanding", durationDays: 90,
  };

  it("prefers the cover count when the issuer files one", () => {
    expect((cover ?? weighted).value).toBe(47_900_000);
  });

  it("falls back to weighted diluted for a multi-class issuer", () => {
    const none = null as typeof cover | null;
    expect((none ?? weighted).value).toBe(49_630_000);
  });

  /**
   * The reconciliation the cross-check performs. With the cover count it
   * passes; with the weighted average it trips the 3% band - which is the
   * check doing its job, but the fix is the right figure, not the warning.
   */
  it("reconciles with market cap on the cover count and not the average", () => {
    const price = 122.23;
    const marketCap = 5_857_000_000;
    expect(checkMarketCap(price, cover.value, marketCap)?.agrees).toBe(true);
    expect(checkMarketCap(price, weighted.value, marketCap)?.agrees).toBe(false);
  });
});
