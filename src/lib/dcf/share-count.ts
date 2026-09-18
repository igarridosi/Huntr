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

/** Past this, the count is not a drift to note but a figure to resolve before any per-share value is trusted. */
export const SHARE_COUNT_UNRELIABLE = 0.05;

export interface ShareCountAlert {
  filed: number;
  implied: number;
  /** filed / implied − 1. */
  deviation: number;
  bias: "downward" | "upward";
  basis: "filings" | "implied" | "manual";
  /** One sentence for the screen and for the export's warnings. */
  message: string;
}

/**
 * The filed count and the market's arithmetic disagree beyond what a
 * quarter of buybacks explains: the market-cap cross-check fails, or the
 * gap passes 5%. Visa's cover count is class A alone — 1.70B against
 * 1.88B implied, 9% — and every per-share figure built on it was 10% too
 * high. This is not a field in the JSON; it is a reason not to read the
 * per-share figures until the count is resolved.
 */
export function shareCountAlert(fields: SourcedDCFFields | null | undefined): ShareCountAlert | null {
  const check = fields?.marketCapCheck;
  const sc = fields?.shareCount;
  if (!check || !sc || sc.filed === null || sc.implied === null || !(sc.filed > 0) || !(sc.implied > 0)) return null;
  const deviation = sc.filed / sc.implied - 1;
  if (check.agrees && Math.abs(deviation) <= SHARE_COUNT_UNRELIABLE) return null;
  const bias = deviation > 0 ? "downward" : "upward";
  const pct = `${(Math.abs(deviation) * 100).toFixed(1)}%`;
  const m = (v: number) => `${(v / 1e6).toFixed(1)}M`;
  const dividing =
    sc.basis === "implied"
      ? "The model is dividing by the implied count meanwhile"
      : sc.basis === "manual"
        ? "The model is dividing by the count entered by hand"
        : `The model is dividing by the filed count, so every per-share figure is biased ${bias}`;
  return {
    filed: sc.filed,
    implied: sc.implied,
    deviation,
    bias,
    basis: sc.basis,
    message: `Share count unreliable: the filed count (${m(sc.filed)}) is ${pct} ${deviation > 0 ? "above" : "below"} the count the market cap implies at today's price (${m(sc.implied)}). ${dividing}. Resolve it — a second share class, a stale filing, the wrong class of stock, or a quarter of buybacks the average has not caught up with — before relying on any value per share.`,
  };
}
