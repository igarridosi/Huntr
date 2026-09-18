import { describe, expect, it } from "vitest";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import { shareCountDrift } from "../share-count";

const fields = (filed: number, implied: number, basis: "filings" | "implied" | "manual" = "filings") =>
  ({ shareCount: { value: filed, basis, filed, implied, deviation: null, ratio: null, splitLike: false } }) as unknown as SourcedDCFFields;

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
