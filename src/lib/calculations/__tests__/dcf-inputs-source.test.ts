import { describe, expect, it } from "vitest";
import {
  applySourcedBalanceSheet,
  buildSourcedFields,
  isUnreportedZero,
  pickSourced,
  resolveShareCount,
  type SourcedValue,
} from "../dcf-inputs-source";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";

const NOW = new Date("2026-08-30");

function fact(value: number, filed = "2026-07-31", form = "10-Q"): SECFact {
  return { value, form, filed, periodEnd: filed, concept: "TestConcept", durationDays: 0 };
}

describe("pickSourced", () => {
  it("prefers the filing over the scrape", () => {
    const picked = pickSourced(fact(1_481_000_000), 1_202_110_951, NOW);
    expect(picked.value).toBe(1_481_000_000);
    expect(picked.source).toBe("sec");
  });

  it("labels the filing with its form and date", () => {
    expect(pickSourced(fact(100), 90, NOW).asOf).toBe("10-Q, 31 Jul 2026");
  });

  it("falls back to Yahoo when the concept is missing", () => {
    const picked = pickSourced(null, 90, NOW);
    expect(picked.value).toBe(90);
    expect(picked.source).toBe("yahoo");
  });

  /**
   * A zero almost always means the concept was not found, not that the company
   * genuinely holds no cash. Zeroing out part of a valuation silently is worse
   * than using the less reliable source.
   */
  it("treats a zero from EDGAR as missing unless told otherwise", () => {
    expect(pickSourced(fact(0), 90, NOW).source).toBe("yahoo");
    expect(pickSourced(fact(0), 90, NOW, { allowZero: true }).source).toBe("sec");
  });

  it("reports nothing rather than guessing when neither source has it", () => {
    const picked = pickSourced(null, null, NOW);
    expect(picked.source).toBe("unavailable");
    expect(picked.value).toBe(0);
  });

  it("flags a figure older than a reporting quarter", () => {
    expect(pickSourced(fact(100, "2026-08-01"), null, NOW).stale).toBe(false);
    expect(pickSourced(fact(100, "2026-01-15"), null, NOW).stale).toBe(true);
  });

  /**
   * Yahoo does not date its figures, so claiming freshness for them would be
   * inventing provenance.
   */
  it("makes no freshness claim about Yahoo figures", () => {
    const picked = pickSourced(null, 90, NOW);
    expect(picked.asOf).toBeNull();
    expect(picked.stale).toBe(false);
  });
});

describe("buildSourcedFields", () => {
  const sec: SECFundamentals = {
    cik: "0000320193",
    coverShares: null,
    weightedDilutedShares: null,
    dilutedShares: fact(1_481_000_000),
    financialDebt: fact(7_942_000_000),
    cash: fact(7_563_000_000),
    operatingLeases: fact(3_091_000_000),
    operatingLeaseExpense: fact(420_000_000),
    shareBasedCompensation: fact(715_000_000),
  };

  /**
   * Nike, as measured live: Yahoo reports a share count that is 23% below the
   * diluted count in the filing, and its own market cap does not agree with it.
   */
  it("catches the share count that disagrees with market cap", () => {
    const price = 75;
    const reportedMarketCap = 111_000_000_000;

    const withYahoo = buildSourcedFields({
      sec: null,
      yahoo: { sharesOutstanding: 1_202_110_951 },
      price,
      reportedMarketCap,
    });
    const withSEC = buildSourcedFields({
      sec,
      yahoo: { sharesOutstanding: 1_202_110_951 },
      price,
      reportedMarketCap,
    });

    expect(withYahoo.marketCapCheck?.agrees).toBe(false);
    expect(withSEC.marketCapCheck?.agrees).toBe(true);
    expect(withSEC.sharesOutstanding.source).toBe("sec");
  });

  /** Option B by default: the rent is already out of operating cash flow. */
  it("leaves lease liabilities out of net debt by default", () => {
    const fields = buildSourcedFields({
      sec,
      yahoo: {},
      price: 75,
      reportedMarketCap: 111_000_000_000,
    });
    expect(fields.netDebt.operatingLeases).toBe(3_091_000_000);
    expect(fields.netDebt.includesLeases).toBe(false);
    expect(fields.netDebt.netDebt).toBe(7_942_000_000 - 7_563_000_000);
  });

  it("can exclude them, and the difference is the lease balance", () => {
    const base = { sec, yahoo: {}, price: 75, reportedMarketCap: 111_000_000_000 };
    const withLeases = buildSourcedFields({ ...base, includeLeases: true });
    const without = buildSourcedFields({ ...base, includeLeases: false });
    expect(withLeases.netDebt.netDebt - without.netDebt.netDebt).toBe(3_091_000_000);
  });

  it("reports net cash as negative", () => {
    const fields = buildSourcedFields({
      sec: { ...sec, financialDebt: fact(100), operatingLeases: fact(0) },
      yahoo: {},
      price: 75,
      reportedMarketCap: 111_000_000_000,
      includeLeases: true,
    });
    expect(fields.netDebt.isNetCash).toBe(true);
    expect(fields.netDebt.netDebt).toBeLessThan(0);
  });

  it("falls back cleanly when EDGAR has nothing", () => {
    const fields = buildSourcedFields({
      sec: null,
      yahoo: { sharesOutstanding: 1_000, totalDebt: 500, cash: 200 },
      price: 10,
      reportedMarketCap: 10_000,
    });
    expect(fields.usesSEC).toBe(false);
    expect(fields.sharesOutstanding.source).toBe("yahoo");
    expect(fields.netDebt.netDebt).toBe(300);
  });
});

describe("applySourcedBalanceSheet", () => {
  const sec: SECFundamentals = {
    cik: "0000320193",
    coverShares: null,
    weightedDilutedShares: null,
    dilutedShares: fact(1_481_000_000),
    financialDebt: fact(7_942_000_000),
    cash: fact(7_563_000_000),
    operatingLeases: fact(3_091_000_000),
    operatingLeaseExpense: fact(420_000_000),
    shareBasedCompensation: fact(715_000_000),
  };

  const fields = buildSourcedFields({
    sec,
    yahoo: { sharesOutstanding: 1_202_110_951 },
    price: 75,
    reportedMarketCap: 111_000_000_000,
    includeLeases: true,
  });

  const scenario = {
    totalDebt: 999,
    cashAndEquivalents: 111,
    sharesOutstanding: 1_202_110_951,
    growthRatePhase1: 0.1,
  };

  it("swaps in the filed share count", () => {
    expect(applySourcedBalanceSheet(scenario, fields).sharesOutstanding).toBe(
      1_481_000_000
    );
  });

  it("rolls lease liabilities into debt so the model sees them", () => {
    expect(applySourcedBalanceSheet(scenario, fields).totalDebt).toBe(
      7_942_000_000 + 3_091_000_000
    );
  });

  it("leaves the operating assumptions untouched", () => {
    expect(applySourcedBalanceSheet(scenario, fields).growthRatePhase1).toBe(0.1);
  });

  it("keeps the existing share count when nothing better is available", () => {
    const empty = buildSourcedFields({
      sec: null,
      yahoo: {},
      price: 75,
      reportedMarketCap: 111_000_000_000,
    });
    expect(applySourcedBalanceSheet(scenario, empty).sharesOutstanding).toBe(
      1_202_110_951
    );
  });
});

/**
 * BUG E — a zero nobody reported.
 *
 * Honda arrived with `financialDebt: 0` against ¥5.07tn of cash, which the
 * model read as ¥5.07tn of net cash and added to equity value. Honda's
 * debt-to-equity is 113.8%. The zero was not a fact about the company, it was
 * a tag we failed to find, and once it became the number 0 nothing downstream
 * could tell the two apart.
 */
describe("unreported zeros", () => {
  const yahooZero = (): SourcedValue => ({
    value: 0,
    source: "yahoo",
    asOf: null,
    stale: false,
    resolved: true,
  });

  it("treats a zero from the fallback as not found when the rest resolved", () => {
    expect(isUnreportedZero(yahooZero(), [5_066_828_000_000, 1_297_672_194])).toBe(
      true
    );
  });

  it("says nothing when the whole balance sheet came back empty", () => {
    // A company where nothing resolved is a different failure, and naming
    // three fields for one cause is noise.
    expect(isUnreportedZero(yahooZero(), [0, 0])).toBe(false);
  });

  it("accepts a zero that survived the filings cascade", () => {
    const filed: SourcedValue = {
      value: 0,
      source: "sec",
      asOf: "10-Q, 31 Jul 2026",
      stale: false,
      resolved: true,
    };
    expect(isUnreportedZero(filed, [3_000_000_000])).toBe(false);
  });

  /** Someone vouching for the zero is exactly what makes it usable. */
  it("accepts a zero the user confirmed by hand", () => {
    const manual: SourcedValue = {
      value: 0,
      source: "manual",
      asOf: null,
      stale: false,
      resolved: true,
    };
    expect(isUnreportedZero(manual, [3_000_000_000])).toBe(false);
  });

  it("flags a field that resolved to nothing at all", () => {
    const missing: SourcedValue = {
      value: 0,
      source: "unavailable",
      asOf: null,
      stale: false,
      resolved: false,
    };
    expect(isUnreportedZero(missing, [3_000_000_000])).toBe(true);
  });

  it("leaves a real figure alone", () => {
    const real: SourcedValue = { ...yahooZero(), value: 4_500_000_000 };
    expect(isUnreportedZero(real, [3_000_000_000])).toBe(false);
  });
});

describe("buildSourcedFields — the Honda shape", () => {
  const hondaish = () =>
    buildSourcedFields({
      sec: null,
      yahoo: { totalDebt: 0, cash: 5_066_828_000_000, sharesOutstanding: 1_297_672_194 },
      price: 32.425,
      reportedMarketCap: 42_790_739_968,
      includeLeases: false,
    });

  it("reports the debt as unresolved rather than zero", () => {
    const fields = hondaish();
    expect(fields.unresolved).toEqual(["financialDebt"]);
  });

  it("takes the override and clears the block", () => {
    const fields = buildSourcedFields({
      sec: null,
      yahoo: { totalDebt: 0, cash: 5_066_828_000_000, sharesOutstanding: 1_297_672_194 },
      price: 32.425,
      reportedMarketCap: 42_790_739_968,
      includeLeases: false,
      overrides: { financialDebt: 9_000_000_000_000 },
    });

    expect(fields.unresolved).toEqual([]);
    expect(fields.financialDebt.value).toBe(9_000_000_000_000);
    expect(fields.financialDebt.source).toBe("manual");
    // The whole point: net debt flips from -5.07tn of net cash to real debt.
    expect(fields.netDebt.isNetCash).toBe(false);
  });

  /**
   * Confirming the zero is a different act from the zero arriving unattended,
   * even though the number is identical. Only one of them may be valued on.
   */
  it("accepts a confirmed zero and unblocks with the same number", () => {
    const fields = buildSourcedFields({
      sec: null,
      yahoo: { totalDebt: 0, cash: 5_066_828_000_000, sharesOutstanding: 1_297_672_194 },
      price: 32.425,
      reportedMarketCap: 42_790_739_968,
      includeLeases: false,
      overrides: { financialDebt: 0 },
    });

    expect(fields.unresolved).toEqual([]);
    expect(fields.financialDebt.value).toBe(0);
    expect(fields.financialDebt.source).toBe("manual");
  });

  it("does not flag a company whose figures all resolved", () => {
    const fields = buildSourcedFields({
      sec: null,
      yahoo: { totalDebt: 78_328_000_000, cash: 35_934_000_000, sharesOutstanding: 15_000_000_000 },
      price: 329.87,
      reportedMarketCap: 4_813_014_695_936,
      includeLeases: false,
    });
    expect(fields.unresolved).toEqual([]);
  });

  /** Leases and stock compensation legitimately are zero for many companies. */
  it("never blocks on leases or stock compensation", () => {
    const fields = hondaish();
    expect(fields.unresolved).not.toContain("operatingLeases");
    expect(fields.operatingLeases.value).toBe(0);
  });
});

/**
 * BUG C — the denominator.
 *
 * Every per-share figure is scaled by the share count, so an error here is a
 * clean multiplicative one: the output stays plausible and moves by exactly
 * the factor you got wrong. Visa came through 12% light with the warning
 * firing and the model dividing by the bad number anyway.
 */
describe("resolveShareCount", () => {
  /** Visa: the filed count misses share classes, the market cap has them all. */
  it("switches to the implied count when the filing does not reconcile", () => {
    const resolved = resolveShareCount({
      filed: 1_704_112_694,
      price: 378.75,
      reportedMarketCap: 707_100_000_000,
    });

    expect(resolved.basis).toBe("implied");
    expect(resolved.value).toBeCloseTo(707_100_000_000 / 378.75, 0);
    expect(resolved.filed).toBe(1_704_112_694);
    expect(resolved.splitLike).toBe(false);
  });

  it("keeps the filing when the two already agree", () => {
    const resolved = resolveShareCount({
      filed: 14_594_200_000,
      price: 328.21,
      reportedMarketCap: 14_594_200_000 * 328.21,
    });

    expect(resolved.basis).toBe("filings");
    expect(resolved.value).toBe(14_594_200_000);
    expect(Math.abs(resolved.deviation ?? 1)).toBeLessThan(0.001);
  });

  /**
   * Monster. The filed count is right and the market cap is double, so the
   * requested default lands on the wrong one - which is why the ratio is
   * measured and reported rather than averaged over.
   */
  it("flags a near-integer ratio as a split or ADR rather than a missing class", () => {
    const resolved = resolveShareCount({
      filed: 979_525_882,
      price: 44.08,
      reportedMarketCap: 86_400_000_000,
    });

    expect(resolved.splitLike).toBe(true);
    expect(resolved.ratio).toBeCloseTo(2, 1);
  });

  it("does not call an arbitrary gap a split", () => {
    const resolved = resolveShareCount({
      filed: 1_704_112_694,
      price: 378.75,
      reportedMarketCap: 707_100_000_000,
    });
    expect(resolved.splitLike).toBe(false);
  });

  it("honours an explicit choice in both directions", () => {
    const base = {
      filed: 1_704_112_694,
      price: 378.75,
      reportedMarketCap: 707_100_000_000,
    };

    expect(resolveShareCount({ ...base, preference: "filings" }).value).toBe(
      1_704_112_694
    );
    expect(resolveShareCount({ ...base, preference: "implied" }).basis).toBe(
      "implied"
    );
    // Even when the filing reconciles, asking for the implied count gets it.
    expect(
      resolveShareCount({
        filed: 14_594_200_000,
        price: 328.21,
        reportedMarketCap: 14_594_200_000 * 328.21,
        preference: "implied",
      }).basis
    ).toBe("implied");
  });

  it("lets a hand-entered count beat both", () => {
    const resolved = resolveShareCount({
      filed: 1_704_112_694,
      price: 378.75,
      reportedMarketCap: 707_100_000_000,
      manual: 1_940_000_000,
    });
    expect(resolved.basis).toBe("manual");
    expect(resolved.value).toBe(1_940_000_000);
  });

  /** Visa and Honda both resolve to nothing from the filings. */
  it("falls back to the implied count when nothing was filed", () => {
    const resolved = resolveShareCount({
      filed: null,
      price: 33.04,
      reportedMarketCap: 42_900_000_000,
    });
    expect(resolved.value).toBeCloseTo(42_900_000_000 / 33.04, 0);
    expect(resolved.deviation).toBeNull();
  });

  it("survives a missing price or market cap", () => {
    const resolved = resolveShareCount({
      filed: 1_000_000,
      price: 0,
      reportedMarketCap: 0,
    });
    expect(resolved.value).toBe(1_000_000);
    expect(resolved.implied).toBeNull();
    expect(resolved.basis).toBe("filings");
  });
});

describe("buildSourcedFields — share count basis", () => {
  const visaish = (basis?: "filings" | "implied") =>
    buildSourcedFields({
      sec: null,
      yahoo: {
        sharesOutstanding: 1_704_112_694,
        totalDebt: 20_600_000_000,
        cash: 16_000_000_000,
      },
      price: 378.75,
      reportedMarketCap: 707_100_000_000,
      includeLeases: false,
      shareCountBasis: basis,
    });

  it("divides by the implied count and says so", () => {
    const fields = visaish();
    expect(fields.shareCount.basis).toBe("implied");
    expect(fields.sharesOutstanding.source).toBe("implied");
    expect(fields.sharesOutstanding.value).toBeCloseTo(707_100_000_000 / 378.75, 0);
  });

  /**
   * The cross-check has to keep describing the filing. Measuring the implied
   * count against the market cap it was derived from is a tautology, and it
   * would erase the disagreement from the screen at the moment the model
   * started working around it.
   */
  it("keeps reporting the disagreement against the filed count", () => {
    const fields = visaish();
    expect(fields.marketCapCheck?.agrees).toBe(false);
    expect(fields.marketCapCheck?.implied).toBeCloseTo(378.75 * 1_704_112_694, 0);
  });

  it("goes back to the filing when asked", () => {
    const fields = visaish("filings");
    expect(fields.sharesOutstanding.value).toBe(1_704_112_694);
    expect(fields.shareCount.basis).toBe("filings");
  });
});
