import { describe, expect, it } from "vitest";
import { runDCF } from "../dcf";
import { applySourcedBalanceSheet, buildSourcedFields } from "../dcf-inputs-source";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";
import { BASE_INPUTS } from "./dcf-fixtures";

function fact(value: number, filed = "2026-07-31", form = "10-Q"): SECFact {
  return { value, form, filed, periodEnd: filed, concept: "TestConcept", durationDays: 0 };
}

function fundamentals(overrides: Partial<SECFundamentals> = {}): SECFundamentals {
  return {
    cik: "0000000001",
    coverShares: null,
    weightedDilutedShares: null,
    dilutedShares: fact(108_400_000),
    financialDebt: fact(0),
    cash: fact(881_320_000),
    operatingLeases: fact(2_140_000_000),
    operatingLeaseExpense: fact(310_000_000),
    shareBasedCompensation: fact(29_190_000),
    ...overrides,
  };
}

/**
 * The bug this file exists to prevent.
 *
 * The breakdown panel and the value bridge printed different net debt on the
 * same screen - one computed from the filings, the other left holding an older
 * figure from a different route. Both numbers looked plausible, which is what
 * made it dangerous: on the reported case it moved equity value from 14.9B to
 * 11.84B and the per-share figure by about a fifth, enough to flip the
 * undervalued label without anything appearing wrong.
 */
describe("net debt reaches the engine unchanged", () => {
  /**
   * The five companies used for live validation, with the figures EDGAR
   * actually returns for them.
   *
   * Checking one ticker was not enough, and the reason is instructive: the
   * shapes differ. LULU files no financial-debt concept at all, SBUX reports
   * cash through a tag that includes restricted balances, VZ carries debt two
   * orders of magnitude above its cash, GOOGL is deeply net cash. Each of
   * those broke something at least once. An invariant asserted on a single
   * profile is an invariant asserted on the one shape that already worked.
   */
  const profiles = [
    {
      name: "LULU - no financial debt concept filed",
      sec: fundamentals({
        dilutedShares: fact(108_437_957),
        financialDebt: null,
        cash: fact(1_514_729_000),
        operatingLeases: fact(2_136_008_000),
      }),
      price: 168.2,
      reportedMarketCap: 18_240_000_000,
    },
    {
      name: "CROX - thin coverage, buying back stock",
      sec: fundamentals({
        dilutedShares: fact(47_945_075),
        financialDebt: fact(1_334_000_000),
        cash: fact(170_276_000),
        operatingLeases: fact(381_544_000),
      }),
      price: 122.23,
      reportedMarketCap: 5_860_000_000,
    },
    {
      name: "SBUX - lease intensive, cash includes restricted",
      sec: fundamentals({
        dilutedShares: fact(1_140_000_000),
        financialDebt: fact(13_278_600_000),
        cash: fact(3_449_800_000),
        operatingLeases: fact(9_155_500_000),
      }),
      price: 85.5,
      reportedMarketCap: 97_470_000_000,
    },
    {
      name: "VZ - heavily leveraged",
      sec: fundamentals({
        dilutedShares: fact(4_154_775_202),
        financialDebt: fact(165_231_000_000),
        cash: fact(1_752_000_000),
        operatingLeases: fact(23_227_000_000),
      }),
      price: 43.1,
      reportedMarketCap: 179_070_000_000,
    },
    {
      name: "GOOGL - deeply net cash",
      sec: fundamentals({
        dilutedShares: fact(12_309_000_000),
        financialDebt: fact(100_164_000_000),
        cash: fact(55_911_000_000),
        operatingLeases: fact(18_037_000_000),
      }),
      price: 232.0,
      reportedMarketCap: 2_855_000_000_000,
    },
  ];

  for (const profile of profiles) {
    for (const includeLeases of [true, false]) {
      it(`${profile.name}, leases ${includeLeases ? "on" : "off"}: bridge equals breakdown`, () => {
        const fields = buildSourcedFields({
          sec: profile.sec,
          yahoo: {},
          price: profile.price,
          reportedMarketCap: profile.reportedMarketCap,
          includeLeases,
        });

        const applied = applySourcedBalanceSheet(BASE_INPUTS, fields);
        const result = runDCF(applied);

        expect(result.netDebt).toBeCloseTo(fields.netDebt.netDebt, 2);
        // The share count is the other half of the same guarantee: the panel
        // names a count, and every per-share figure has to be divided by it.
        expect(applied.sharesOutstanding).toBe(fields.sharesOutstanding.value);
      });
    }
  }

  /**
   * The sign is a frequent and expensive mistake. Net cash has to add to
   * enterprise value; net debt has to subtract from it.
   */
  it("net cash adds to enterprise value", () => {
    const fields = buildSourcedFields({
      sec: fundamentals({ financialDebt: fact(100_000_000), cash: fact(5_000_000_000) }),
      yahoo: {},
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
      includeLeases: false,
    });

    expect(fields.netDebt.isNetCash).toBe(true);
    const result = runDCF(applySourcedBalanceSheet(BASE_INPUTS, fields));
    expect(result.netDebt).toBeLessThan(0);
    expect(result.equityValue).toBeGreaterThan(result.enterpriseValue);
  });

  it("net debt subtracts from enterprise value", () => {
    const fields = buildSourcedFields({
      sec: fundamentals({ financialDebt: fact(9_000_000_000), cash: fact(500_000_000) }),
      yahoo: {},
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
      includeLeases: false,
    });

    expect(fields.netDebt.isNetCash).toBe(false);
    const result = runDCF(applySourcedBalanceSheet(BASE_INPUTS, fields));
    expect(result.netDebt).toBeGreaterThan(0);
    expect(result.equityValue).toBeLessThan(result.enterpriseValue);
  });

  /**
   * Toggling leases has to move the engine, not just the panel. Before the fix
   * the toggle changed the breakdown and left the valuation where it was.
   */
  it("the lease toggle moves the bridge by exactly the lease balance", () => {
    const base = {
      sec: fundamentals(),
      yahoo: {},
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
    };

    const withLeases = buildSourcedFields({ ...base, includeLeases: true });
    const without = buildSourcedFields({ ...base, includeLeases: false });

    const on = runDCF(applySourcedBalanceSheet(BASE_INPUTS, withLeases));
    const off = runDCF(applySourcedBalanceSheet(BASE_INPUTS, without));

    expect(on.netDebt - off.netDebt).toBeCloseTo(2_140_000_000, 2);
  });

  /**
   * The circular fallback: the panel used to read its Yahoo default out of the
   * same inputs that populate writes from this result, so at populate time it
   * read zeros and reported them as real figures. The fallback must come from
   * a source that is not downstream of itself.
   */
  it("uses the supplied fallback when EDGAR has no debt concept", () => {
    const fields = buildSourcedFields({
      sec: fundamentals({ financialDebt: null }),
      yahoo: { totalDebt: 4_500_000_000, cash: 900_000_000 },
      price: 120.81,
      reportedMarketCap: 13_720_000_000,
      includeLeases: false,
    });

    expect(fields.financialDebt.value).toBe(4_500_000_000);
    expect(fields.financialDebt.source).toBe("yahoo");

    const result = runDCF(applySourcedBalanceSheet(BASE_INPUTS, fields));
    expect(result.netDebt).toBeCloseTo(4_500_000_000 - 881_320_000, 2);
  });

  /**
   * The race that put -1.81B in the bridge and -1.51B in the panel.
   *
   * EDGAR is a second request. Populate takes whatever is resolved at the
   * moment it is clicked, so on a cold cache the engine was seeded from Yahoo,
   * and when the filings landed the panel moved to them and the engine did
   * not. Both numbers were defensible, both came from a real source, and they
   * disagreed by 300M on the same screen.
   *
   * Re-applying the fields is what the page now does when the filings arrive,
   * so the invariant here is that doing so is enough to converge - and that it
   * is idempotent, since it also runs when nothing was stale.
   */
  for (const profile of profiles) {
    it(`${profile.name}: late filings reconcile the bridge to the panel`, () => {
      const yahooOnly = buildSourcedFields({
        sec: null,
        yahoo: { sharesOutstanding: 111_000_000, totalDebt: 0, cash: 1_810_000_000 },
        price: profile.price,
        reportedMarketCap: profile.reportedMarketCap,
        includeLeases: false,
      });

      // What populate wrote before EDGAR answered.
      const seeded = applySourcedBalanceSheet(BASE_INPUTS, yahooOnly);
      const withSEC = buildSourcedFields({
        sec: profile.sec,
        yahoo: { sharesOutstanding: 111_000_000, totalDebt: 0, cash: 1_810_000_000 },
        price: profile.price,
        reportedMarketCap: profile.reportedMarketCap,
        includeLeases: false,
      });

      const reconciled = applySourcedBalanceSheet(seeded, withSEC);
      const result = runDCF(reconciled);

      expect(result.netDebt).toBeCloseTo(withSEC.netDebt.netDebt, 2);
      expect(reconciled.sharesOutstanding).toBe(withSEC.sharesOutstanding.value);
      // The filed count, not the quote's - the symptom was a share count that
      // looked like it had "fallen back" when it had simply never been read.
      expect(reconciled.sharesOutstanding).not.toBe(111_000_000);

      // Applying twice changes nothing, which is what makes it safe to run on
      // every ticker rather than only the ones that raced.
      const again = applySourcedBalanceSheet(reconciled, withSEC);
      expect(again).toEqual(reconciled);
    });
  }
});
