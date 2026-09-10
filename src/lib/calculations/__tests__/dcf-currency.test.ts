import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_UPSIDE,
  MIN_PLAUSIBLE_UPSIDE,
  assessValuation,
} from "../dcf-currency";

describe("assessValuation — currency", () => {
  /**
   * The Honda case. Statements in yen, an ADR priced in dollars, and a model
   * that divided one by the other to produce +566% and a Strong Buy.
   */
  it("blocks when the statements and the price are in different currencies", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "JPY",
      upside: 5.66,
    });

    expect(guard.usable).toBe(false);
    expect(guard.reason).toBe("currency-mismatch");
    expect(guard.currencyMismatch).toBe(true);
    expect(guard.message).toContain("JPY");
    expect(guard.message).toContain("USD");
  });

  it("passes a domestic filer through", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "USD",
      upside: 0.32,
    });

    expect(guard.usable).toBe(true);
    expect(guard.reason).toBeNull();
    expect(guard.currency).toBe("USD");
  });

  /** A company reporting and trading in euros is not a mismatch. */
  it("passes a foreign filer whose two currencies agree", () => {
    const guard = assessValuation({
      priceCurrency: "EUR",
      financialCurrency: "EUR",
      upside: 0.12,
    });

    expect(guard.usable).toBe(true);
    expect(guard.currency).toBe("EUR");
  });

  /**
   * Most tickers resolve one field and not the other. Treating a missing
   * currency as a mismatch would block the majority of correct valuations,
   * which is the fastest way to get a safety check switched off.
   */
  it("does not block on an unknown currency", () => {
    expect(assessValuation({ priceCurrency: "USD", upside: 0.2 }).usable).toBe(true);
    expect(assessValuation({ financialCurrency: "JPY", upside: 0.2 }).usable).toBe(true);
    expect(assessValuation({ upside: 0.2 }).usable).toBe(true);
    expect(assessValuation({ priceCurrency: "", financialCurrency: "JPY" }).usable).toBe(
      true
    );
  });

  it("normalises case and whitespace before comparing", () => {
    const guard = assessValuation({
      priceCurrency: " usd ",
      financialCurrency: "USD",
      upside: 0.1,
    });
    expect(guard.usable).toBe(true);
    expect(guard.priceCurrency).toBe("USD");
  });

  it("reports the reporting currency as the unit for labelling", () => {
    expect(
      assessValuation({ priceCurrency: "USD", financialCurrency: "USD" }).currency
    ).toBe("USD");
    // With only a price currency known, that is the best label available.
    expect(assessValuation({ priceCurrency: "GBP" }).currency).toBe("GBP");
  });
});

describe("assessValuation — plausibility", () => {
  /**
   * The blunt backstop. It exists for the failures nobody anticipated - a
   * share count off by a factor, an unapplied ADR ratio, a debt figure that
   * resolved to zero - so it is deliberately not narrow.
   */
  it("blocks an upside no legitimate analysis produces", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "USD",
      upside: 5.66,
    });

    expect(guard.usable).toBe(false);
    expect(guard.reason).toBe("implausible-upside");
    expect(guard.message).toContain("share count");
  });

  it("blocks a near-total wipeout as an input error rather than a call", () => {
    expect(
      assessValuation({ priceCurrency: "USD", financialCurrency: "USD", upside: -0.95 })
        .usable
    ).toBe(false);
  });

  it("leaves an ordinary result alone in both directions", () => {
    for (const upside of [-0.7, -0.2, 0, 0.45, 1.2, 2.9]) {
      expect(
        assessValuation({ priceCurrency: "USD", financialCurrency: "USD", upside })
          .usable
      ).toBe(true);
    }
  });

  it("treats the thresholds themselves as still usable", () => {
    expect(
      assessValuation({ upside: MAX_PLAUSIBLE_UPSIDE, priceCurrency: "USD" }).usable
    ).toBe(true);
    expect(
      assessValuation({ upside: MIN_PLAUSIBLE_UPSIDE, priceCurrency: "USD" }).usable
    ).toBe(true);
  });

  it("ignores a missing or non-finite upside", () => {
    expect(assessValuation({ priceCurrency: "USD" }).usable).toBe(true);
    expect(assessValuation({ upside: Number.NaN, priceCurrency: "USD" }).usable).toBe(
      true
    );
    expect(
      assessValuation({ upside: Number.POSITIVE_INFINITY, priceCurrency: "USD" }).usable
    ).toBe(true);
  });

  /** Currency is a fact about the data; plausibility is a heuristic. */
  it("reports the currency mismatch first when both apply", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "JPY",
      upside: 5.66,
    });
    expect(guard.reason).toBe("currency-mismatch");
  });
});

describe("assessValuation — unresolved balance sheet", () => {
  it("blocks and names the fields that could not be established", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "USD",
      upside: 0.4,
      unresolvedFields: ["financialDebt"],
    });

    expect(guard.usable).toBe(false);
    expect(guard.reason).toBe("unresolved-balance-sheet");
    expect(guard.message).toContain("financial debt");
    expect(guard.unresolvedFields).toEqual(["financialDebt"]);
  });

  /**
   * The dangerous case: an unfound debt produces a perfectly ordinary-looking
   * upside, so the plausibility rule never fires and only this check catches
   * it.
   */
  it("blocks even when the resulting upside looks entirely reasonable", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "USD",
      upside: 0.18,
      unresolvedFields: ["financialDebt"],
    });
    expect(guard.usable).toBe(false);
  });

  it("passes once the list is empty", () => {
    expect(
      assessValuation({
        priceCurrency: "USD",
        financialCurrency: "USD",
        upside: 0.4,
        unresolvedFields: [],
      }).usable
    ).toBe(true);
  });

  /** Currency is the more fundamental fact, so it is the one reported. */
  it("reports the currency mismatch ahead of the missing data", () => {
    const guard = assessValuation({
      priceCurrency: "USD",
      financialCurrency: "JPY",
      unresolvedFields: ["financialDebt"],
    });
    expect(guard.reason).toBe("currency-mismatch");
  });
});
