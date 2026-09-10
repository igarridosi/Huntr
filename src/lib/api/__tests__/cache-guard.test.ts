import { describe, expect, it } from "vitest";
import { isCacheablePayload } from "../cache";

/**
 * The rule that turns one day's outage into a structural guarantee.
 *
 * A failing upstream call very often returns a structurally valid, entirely
 * empty result. A cache that accepts it serves that emptiness as fresh for the
 * whole TTL, so repairing the fetch changes nothing - nothing is fetching any
 * more. These cases are the shapes that actually occurred.
 */
describe("isCacheablePayload", () => {
  it("accepts real answers", () => {
    expect(isCacheablePayload({ revenue: 100 })).toBe(true);
    expect(isCacheablePayload([1, 2, 3])).toBe(true);
    expect(isCacheablePayload("AAPL")).toBe(true);
    expect(isCacheablePayload(0)).toBe(true);
    expect(isCacheablePayload(false)).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(isCacheablePayload(null)).toBe(false);
    expect(isCacheablePayload(undefined)).toBe(false);
    expect(isCacheablePayload("")).toBe(false);
    expect(isCacheablePayload(Number.NaN)).toBe(false);
  });

  /** The exact shape that broke the financials: valid, and empty. */
  it("refuses the six-empty-arrays shape", () => {
    expect(
      isCacheablePayload({
        income: { annual: [], quarterly: [] },
        balance: { annual: [], quarterly: [] },
        cashflow: { annual: [], quarterly: [] },
      })
    ).toBe(false);
  });

  it("refuses an empty array and an empty object", () => {
    expect(isCacheablePayload([])).toBe(false);
    expect(isCacheablePayload({})).toBe(false);
  });

  /** Partial data is still data: one populated statement is worth keeping. */
  it("accepts a result that is only partly filled", () => {
    expect(
      isCacheablePayload({
        income: { annual: [{ revenue: 1 }], quarterly: [] },
        balance: { annual: [], quarterly: [] },
        cashflow: { annual: [], quarterly: [] },
      })
    ).toBe(true);
  });

  it("accepts a record whose values are plain scalars", () => {
    expect(isCacheablePayload({ price: 120.81, currency: "USD" })).toBe(true);
  });
});
