import { describe, expect, it } from "vitest";
import {
  MARKET_CAP_TOLERANCE,
  STALE_FACT_DAYS,
  adjustFCFForSBC,
  buildNetDebt,
  checkMarketCap,
  extractFactRows,
  factAgeInDays,
  selectLatestFact,
  selectShareCount,
  sumFacts,
} from "../sec-edgar";
import type { SECFact } from "../sec-edgar";

describe("selectLatestFact", () => {
  const facts = [
    { end: "2025-09-30", val: 100, form: "10-Q", filed: "2025-10-30" },
    { end: "2026-03-31", val: 130, form: "10-Q", filed: "2026-05-03" },
    { end: "2025-12-31", val: 120, form: "10-K", filed: "2026-02-01" },
  ];

  it("returns the most recent period", () => {
    expect(selectLatestFact(facts)?.value).toBe(130);
  });

  it("keeps the paperwork alongside the number", () => {
    const fact = selectLatestFact(facts);
    expect(fact?.form).toBe("10-Q");
    expect(fact?.filed).toBe("2026-05-03");
    expect(fact?.periodEnd).toBe("2026-03-31");
  });

  /**
   * An amendment for an older quarter can be filed after a newer one. The
   * balance sheet we want is the latest that exists, not the most recently
   * submitted piece of paper.
   */
  it("prefers the newest period over the newest filing date", () => {
    const withLateAmendment = [
      ...facts,
      { end: "2024-12-31", val: 50, form: "10-K/A", filed: "2026-08-01" },
    ];
    expect(selectLatestFact(withLateAmendment)?.value).toBe(130);
  });

  it("breaks ties on the same period with the later filing", () => {
    const restated = [
      { end: "2026-03-31", val: 130, form: "10-Q", filed: "2026-05-03" },
      { end: "2026-03-31", val: 125, form: "10-Q/A", filed: "2026-07-01" },
    ];
    expect(selectLatestFact(restated)?.value).toBe(125);
  });

  it("skips rows with no usable number", () => {
    const messy = [
      { end: "2026-03-31", form: "10-Q", filed: "2026-05-03" },
      { end: "2025-12-31", val: 120, form: "10-K", filed: "2026-02-01" },
    ];
    expect(selectLatestFact(messy)?.value).toBe(120);
  });

  it("returns null when nothing is usable", () => {
    expect(selectLatestFact([])).toBeNull();
    expect(selectLatestFact([{ val: 5 }])).toBeNull();
  });
});

describe("extractFactRows", () => {
  it("reads the rows out of the units object", () => {
    const payload = { units: { USD: [{ end: "2026-03-31", val: 10 }] } };
    expect(extractFactRows(payload)).toHaveLength(1);
  });

  /**
   * A company reporting a handful of figures in a secondary currency should
   * not be able to win the recency contest with an unrelated number.
   */
  it("takes the unit with the most rows when there are several", () => {
    const payload = {
      units: {
        EUR: [{ end: "2026-06-30", val: 999 }],
        USD: [
          { end: "2026-03-31", val: 10 },
          { end: "2025-12-31", val: 9 },
        ],
      },
    };
    const rows = extractFactRows(payload);
    expect(rows).toHaveLength(2);
    expect(selectLatestFact(rows)?.value).toBe(10);
  });

  it("survives a malformed payload", () => {
    expect(extractFactRows(null)).toEqual([]);
    expect(extractFactRows({})).toEqual([]);
    expect(extractFactRows({ units: "nope" })).toEqual([]);
  });
});

describe("factAgeInDays", () => {
  const fact = {
    value: 1,
    form: "10-Q",
    filed: "2026-05-03",
    periodEnd: "2026-03-31",
    concept: "TestConcept",
    durationDays: 0,
  };

  it("measures from the filing date", () => {
    expect(factAgeInDays(fact, new Date("2026-05-13"))).toBeCloseTo(10, 1);
  });

  it("flags anything past a quarter as stale", () => {
    expect(factAgeInDays(fact, new Date("2026-09-01"))).toBeGreaterThan(
      STALE_FACT_DAYS
    );
  });

  it("treats an unparseable date as infinitely old rather than fresh", () => {
    expect(factAgeInDays({ ...fact, filed: "not a date" })).toBe(
      Number.POSITIVE_INFINITY
    );
  });
});

describe("checkMarketCap", () => {
  it("agrees when price times shares lands on the reported cap", () => {
    const check = checkMarketCap(100, 1_000_000, 100_000_000);
    expect(check?.agrees).toBe(true);
    expect(check?.deviation).toBeCloseTo(0, 6);
  });

  /**
   * The 6% share-count error the plan describes: plausible-looking, and enough
   * to move a decision.
   */
  it("catches a share count that is off by six percent", () => {
    const check = checkMarketCap(100, 1_060_000, 100_000_000);
    expect(check?.agrees).toBe(false);
    expect(check?.deviation).toBeCloseTo(0.06, 4);
  });

  it("tolerates drift inside the band", () => {
    expect(checkMarketCap(100, 1_020_000, 100_000_000)?.agrees).toBe(true);
    expect(MARKET_CAP_TOLERANCE).toBe(0.03);
  });

  it("declines to judge when an input is missing", () => {
    expect(checkMarketCap(0, 1_000, 1_000)).toBeNull();
    expect(checkMarketCap(10, 0, 1_000)).toBeNull();
    expect(checkMarketCap(10, 1_000, 0)).toBeNull();
  });
});

describe("buildNetDebt", () => {
  /**
   * Option B is the default. Under ASC 842 the operating lease charge is
   * already deducted from operating cash flow, so the free cash flow the model
   * discounts is net of rent. Adding the lease liability to net debt as well
   * discounts the same obligation twice.
   */
  it("excludes lease liabilities by default", () => {
    const result = buildNetDebt({
      financialDebt: 100,
      operatingLeases: 40,
      cash: 30,
    });
    expect(result.netDebt).toBe(70);
    expect(result.includesLeases).toBe(false);
  });

  it("adds them when capitalising is asked for", () => {
    const result = buildNetDebt({
      financialDebt: 100,
      operatingLeases: 40,
      cash: 30,
      includeLeases: true,
    });
    expect(result.netDebt).toBe(110);
  });

  /**
   * The lease gap the plan warns about: for a lease-heavy business, leaving
   * them out understates net debt by the whole lease balance and inflates
   * equity value by the same amount.
   */
  it("shows the gap leases make", () => {
    const withLeases = buildNetDebt({
      financialDebt: 2_000,
      operatingLeases: 6_000,
      cash: 500,
      includeLeases: true,
    });
    const without = buildNetDebt({
      financialDebt: 2_000,
      operatingLeases: 6_000,
      cash: 500,
      includeLeases: false,
    });
    expect(withLeases.netDebt - without.netDebt).toBe(6_000);
  });

  it("reports net cash as negative and says so", () => {
    const result = buildNetDebt({
      financialDebt: 10,
      operatingLeases: 5,
      cash: 100,
      includeLeases: true,
    });
    expect(result.netDebt).toBeLessThan(0);
    expect(result.isNetCash).toBe(true);
  });

  it("keeps every component visible for auditing", () => {
    const result = buildNetDebt({
      financialDebt: 100,
      operatingLeases: 40,
      cash: 30,
      includeLeases: true,
    });
    expect(
      result.financialDebt + result.operatingLeases - result.cash
    ).toBe(result.netDebt);
  });
});

describe("adjustFCFForSBC", () => {
  it("leaves free cash flow alone when the toggle is off", () => {
    const result = adjustFCFForSBC({
      freeCashFlow: 200,
      shareBasedCompensation: 50,
      revenue: 1_000,
      deductSBC: false,
    });
    expect(result.fcf).toBe(200);
    expect(result.margin).toBeCloseTo(0.2, 6);
  });

  it("deducts stock compensation when it is on", () => {
    const result = adjustFCFForSBC({
      freeCashFlow: 200,
      shareBasedCompensation: 50,
      revenue: 1_000,
      deductSBC: true,
    });
    expect(result.fcf).toBe(150);
    expect(result.margin).toBeCloseTo(0.15, 6);
  });

  /**
   * Both margins are reported so the difference is visible rather than
   * implied. For a company paying 10% of revenue in stock these describe two
   * different businesses.
   */
  it("always reports the unadjusted margin alongside", () => {
    const result = adjustFCFForSBC({
      freeCashFlow: 300,
      shareBasedCompensation: 100,
      revenue: 1_000,
      deductSBC: true,
    });
    expect(result.margin).toBeCloseTo(0.2, 6);
    expect(result.unadjustedMargin).toBeCloseTo(0.3, 6);
  });

  it("handles a company with no revenue without dividing by zero", () => {
    const result = adjustFCFForSBC({
      freeCashFlow: -50,
      shareBasedCompensation: 10,
      revenue: 0,
      deductSBC: true,
    });
    expect(result.margin).toBe(0);
    expect(Number.isFinite(result.fcf)).toBe(true);
  });
});

describe("sumFacts", () => {
  const noncurrent = {
    value: 900,
    form: "10-Q",
    filed: "2026-05-03",
    periodEnd: "2026-03-31",
    concept: "LongTermDebtNoncurrent",
    durationDays: 0,
  };
  const current = {
    value: 100,
    form: "10-K",
    filed: "2026-02-01",
    periodEnd: "2025-12-31",
    concept: "LongTermDebtCurrent",
    durationDays: 0,
  };

  it("adds the two halves", () => {
    expect(sumFacts(noncurrent, current)?.value).toBe(1_000);
  });

  /**
   * A total is only as current as its oldest part. Reporting the fresher date
   * would overstate how up to date the combined figure is.
   */
  it("keeps the older provenance of the two", () => {
    expect(sumFacts(noncurrent, current)?.filed).toBe("2026-02-01");
  });

  it("passes through when only one half exists", () => {
    expect(sumFacts(noncurrent, null)?.value).toBe(900);
    expect(sumFacts(null, current)?.value).toBe(100);
    expect(sumFacts(null, null)).toBeNull();
  });
});

/**
 * Both counts are filed, both are real, and each is wrong in its own
 * direction. The market cap is the only tiebreaker that is not a guess.
 */
describe("selectShareCount", () => {
  const cover = (value: number): SECFact => ({
    value,
    form: "10-Q",
    filed: "2026-06-04",
    periodEnd: "2026-05-29",
    concept: "EntityCommonStockSharesOutstanding",
    durationDays: 0,
  });
  const diluted = (value: number): SECFact => ({
    value,
    form: "10-Q",
    filed: "2026-06-04",
    periodEnd: "2026-05-03",
    concept: "WeightedAverageNumberOfDilutedSharesOutstanding",
    durationDays: 0,
  });

  // LULU: the cover tag carries one class and undercounts by 4.5%, which the
  // model turned into a 4.5% overstatement of value per share.
  it("takes the diluted count when the cover count misses a share class", () => {
    const picked = selectShareCount(
      cover(108_437_957),
      diluted(115_482_000),
      120.81,
      13_720_000_000
    );
    expect(picked?.value).toBe(115_482_000);
  });

  // CROX: the mirror image. The cover count reconciles exactly and the
  // weighted average lags the buyback by 3.5%.
  it("keeps the cover count when it is the one that reconciles", () => {
    const picked = selectShareCount(
      cover(47_945_075),
      diluted(49_628_000),
      122.23,
      5_860_000_000
    );
    expect(picked?.value).toBe(47_945_075);
  });

  it("falls back to whichever exists when only one does", () => {
    expect(selectShareCount(null, diluted(12_309_000_000), 232, 2_855_000_000_000)?.value)
      .toBe(12_309_000_000);
    expect(selectShareCount(cover(100), null, 232, 2_855_000_000_000)?.value).toBe(100);
    expect(selectShareCount(null, null, 232, 2_855_000_000_000)).toBeNull();
  });

  it("keeps the cover count's precedence when there is no price to check", () => {
    expect(selectShareCount(cover(108_437_957), diluted(115_482_000), 0, 0)?.value)
      .toBe(108_437_957);
  });

  // A wrong number is still wrong, but the panel keeps saying so, and there is
  // no reason to divide by the worse of the two while it does.
  it("takes the closer count when neither reconciles", () => {
    const picked = selectShareCount(cover(80_000_000), diluted(110_000_000), 120.81, 13_720_000_000);
    expect(picked?.value).toBe(110_000_000);
  });
});
