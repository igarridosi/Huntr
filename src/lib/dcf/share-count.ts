import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";

/** A filed count this far from the market's own arithmetic is worth a line. */
export const SHARE_COUNT_DRIFT = 0.01;

export interface ShareCountDrift {
  filed: number;
  implied: number;
  /** filed / implied − 1: positive when the filing counts more shares than the market cap does. */
  deviation: number;
  /**
   * Which way the per-share figures lean while the model divides by the
   * filed count. More filed shares than the market cap implies means the
   * filing predates buybacks: value per share is spread thinner than it
   * should be, so the bias is downward. Fewer means dilution the filing
   * has not caught up with, and the bias is upward.
   */
  bias: "downward" | "upward";
}

/**
 * The gap between the diluted count on the latest 10-Q and the count the
 * reported market cap implies at today's price, once it passes 1%.
 *
 * The model divides by the filed diluted count: one criterion, so the
 * per-share figures of two companies are built the same way. That count
 * is an average over the quarter and lags a buyback or an issue by up to
 * three months — Universal Health's 59.9M filed against 58.9M implied is
 * a $320M quarter of repurchases showing through. A drift of this size is
 * not a reason to switch counts; it is a reason to know the direction.
 */
export function shareCountDrift(fields: SourcedDCFFields | null | undefined): ShareCountDrift | null {
  const sc = fields?.shareCount;
  if (!sc || sc.basis !== "filings" || sc.filed === null || sc.implied === null || !(sc.filed > 0) || !(sc.implied > 0)) return null;
  const deviation = sc.filed / sc.implied - 1;
  if (Math.abs(deviation) <= SHARE_COUNT_DRIFT) return null;
  return { filed: sc.filed, implied: sc.implied, deviation, bias: deviation > 0 ? "downward" : "upward" };
}
