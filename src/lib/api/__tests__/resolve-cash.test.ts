import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveCash } from "../sec-edgar";

/**
 * Restricted cash is the quiet one. It arrives inside a legitimate tag, it is
 * real money, and the model nets 100% of it against debt - which is exactly
 * what a company is not allowed to do with it. SBUX reports the combined tag
 * and no split; VZ reports both halves of the split. Both have to work.
 */
const END = "2026-06-30";

function unit(value: number, end = END) {
  return { val: value, end, fy: 2026, fp: "Q3", form: "10-Q", filed: END };
}

function stubFacts(concepts: Record<string, number | [number, string]>) {
  const usGaap: Record<string, unknown> = {};
  for (const [concept, raw] of Object.entries(concepts)) {
    const [value, end] = Array.isArray(raw) ? raw : [raw, END];
    usGaap[concept] = { units: { USD: [unit(value, end)] } };
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ facts: { "us-gaap": usGaap } }),
    }))
  );
}

let cik = 1000;
const nextCik = () => String(cik++).padStart(10, "0");

describe("resolveCash", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a plain cash tag unchanged and unflagged", async () => {
    stubFacts({ CashAndCashEquivalentsAtCarryingValue: 3_000 });
    const cash = await resolveCash(nextCik());
    expect(cash?.value).toBe(3_000);
    expect(cash?.includesRestricted).toBeUndefined();
  });

  it("subtracts both halves of the split when the issuer discloses them", async () => {
    // The VZ shape: combined tag, current and noncurrent restricted alongside.
    stubFacts({
      CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: 3_000,
      RestrictedCashCurrent: 140,
      RestrictedCashAndCashEquivalentsNoncurrent: 162,
    });
    const cash = await resolveCash(nextCik());
    expect(cash?.value).toBe(2_698);
    expect(cash?.includesRestricted).toBeUndefined();
    expect(cash?.concept).toContain("less restricted");
  });

  it("flags the figure instead of guessing when no split is disclosed", async () => {
    // The SBUX shape. Deducting an assumed amount would be inventing a number;
    // saying the figure is impure lets the reader discount it themselves.
    stubFacts({
      CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: 3_000,
    });
    const cash = await resolveCash(nextCik());
    expect(cash?.value).toBe(3_000);
    expect(cash?.includesRestricted).toBe(true);
  });

  it("ignores a restricted figure from a different period", async () => {
    // Subtracting last year's restricted balance from this quarter's cash
    // produces a number that matches no filing at all.
    stubFacts({
      CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: 3_000,
      RestrictedCashCurrent: [140, "2025-06-30"],
    });
    const cash = await resolveCash(nextCik());
    expect(cash?.value).toBe(3_000);
    expect(cash?.includesRestricted).toBe(true);
  });

  it("returns null when there is no cash tag at all", async () => {
    stubFacts({ RestrictedCashCurrent: 140 });
    expect(await resolveCash(nextCik())).toBeNull();
  });
});
