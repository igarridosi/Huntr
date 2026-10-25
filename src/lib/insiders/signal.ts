import type { InsiderSummary } from "./activity";

/** An insider record in a line: enough for a list to mark the companies whose insiders are buying. */
export interface InsiderSignal {
  /** Open-market purchases over the last year. */
  buys: number;
  /** Distinct people behind them. */
  buyers: number;
  /** Open-market sales over the last year. */
  sells: number;
  /** Three or more insiders buying within 90 days. */
  cluster: boolean;
}

export function toInsiderSignal(summary: InsiderSummary): InsiderSignal {
  return {
    buys: summary.buys.count,
    buyers: summary.buyers,
    sells: summary.sells.count,
    cluster: summary.cluster != null,
  };
}
