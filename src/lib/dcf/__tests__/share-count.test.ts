import { describe, expect, it } from "vitest";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import { shareCountAlert, shareCountDrift } from "../share-count";

const fields = (filed: number, implied: number, basis: "filings" | "implied" | "manual" = "filings") =>
  ({
    shareCount: { value: filed, basis, filed, implied, deviation: null, ratio: null, splitLike: false },
    marketCapCheck: { implied: filed, reported: implied, deviation: filed / implied - 1, agrees: Math.abs(filed / implied - 1) <= 0.03 },
  }) as unknown as SourcedDCFFields;

describe("shareCountDrift", () => {
  it("names a filed count above the implied one as a downward bias on per-share figures", () => {
    // Universal Health: 59.91M diluted on the 10-Q, 58.94M implied by the market cap.
    const d = shareCountDrift(fields(59_910_000, 58_940_000))!;
    expect(d.bias).toBe("downward");
    expect(d.deviation).toBeCloseTo(0.0165, 3);
  });

  it("names a filed count below the implied one as an upward bias", () => {
    expect(shareCountDrift(fields(100, 103))?.bias).toBe("upward");
  });

  it("says nothing within 1%, without a filed count, or when the model is not dividing by the filing", () => {
    expect(shareCountDrift(fields(100, 100.9))).toBeNull();
    expect(shareCountDrift(fields(100, 110, "implied"))).toBeNull();
    expect(shareCountDrift(null)).toBeNull();
  });
});

describe("shareCountAlert", () => {
  it("raises Visa's class-A-only count as unreliable, with the direction of the bias", () => {
    const a = shareCountAlert(fields(1_704_112_694, 1_877_355_334))!;
    expect(a.bias).toBe("upward");
    expect(a.deviation).toBeCloseTo(-0.0923, 3);
    expect(a.message).toContain("9.2% below");
    expect(a.message).toContain("biased upward");
    expect(a.message).toMatch(/^Share count unreliable/);
  });

  it("says what the model divides by meanwhile when the user switched to the implied count", () => {
    expect(shareCountAlert(fields(1_704e6, 1_877e6, "implied"))?.message).toContain("dividing by the implied count");
  });

  it("stays quiet when the cross-check agrees and the gap is under 5%: that is a drift, not an alert", () => {
    expect(shareCountAlert(fields(59_910_000, 58_940_000))).toBeNull();
    expect(shareCountDrift(fields(59_910_000, 58_940_000))?.bias).toBe("downward");
  });
});
