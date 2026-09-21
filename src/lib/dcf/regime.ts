/**
 * Which kind of company the model is looking at, read off the balance
 * sheet and the cash flow — never off a sector label — and what each
 * kind means for the tool: which tab to use and what to watch.
 *
 * A two-stage DCF on unlevered free cash flow is the right instrument
 * for a business whose cash flow measures its profitability, whose
 * capex is steady, whose debt is a financing detail and whose history
 * describes the company being valued. Each label below is one of those
 * assumptions not holding.
 */
export type RegimeId = "lender" | "capexPeak" | "leveraged" | "thinMargin" | "shiftingPerimeter";

export interface Regime {
  id: RegimeId;
  label: string;
  /** The figure that triggered it. */
  detail: string;
  /** What to do with the model. */
  recommendation: string;
  /** The tab that fits, when the DCF does not. */
  tab: "EPS Multiple" | "DCF" | null;
  /** What to keep an eye on. */
  watch: string;
}

export const CAPEX_PEAK_RATIO = 0.25;
export const TERMINAL_WEIGHT_FRAGILE = 0.65;
export const LEVERAGE_HIGH = 2.5;
export const THIN_MARGIN = 0.06;
export const PERIMETER_MONTHS = 24;

export interface RegimeInput {
  lender: boolean;
  /** |capex| over revenue for the latest fiscal year, on the defined basis. */
  capexToRevenue: number | null;
  /** PV of the terminal value over enterprise value, from the current run. */
  terminalWeight: number | null;
  /** Total debt over EBITDA, latest fiscal year. */
  debtToEbitda: number | null;
  /** Free cash flow over revenue, latest fiscal year, as the statements have it. */
  fcfMargin: number | null;
  perimeter: {
    /** TTM against the closed year, as a fraction, when the two are on file. */
    divergence: number | null;
    /** A business bought or sold in the filings of the last 24 months. */
    acquisitions: { value: number; periodEnd: string } | null;
    divestitures: { value: number; periodEnd: string } | null;
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const m = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);

export function detectRegimes(input: RegimeInput): Regime[] {
  const out: Regime[] = [];

  if (input.lender) {
    out.push({
      id: "lender",
      label: "Lender or insurer",
      detail: "Thin equity against assets with interest as the business, or an unclassified balance sheet.",
      recommendation: "Cash from operations moves with the loan book or the reserves, not with profitability. Value it on earnings.",
      tab: "EPS Multiple",
      watch: "Net interest margin, credit losses, capital ratios — none of which a free cash flow margin sees.",
    });
  }

  const capexHigh = input.capexToRevenue !== null && input.capexToRevenue > CAPEX_PEAK_RATIO;
  const terminalHeavy = input.terminalWeight !== null && input.terminalWeight > TERMINAL_WEIGHT_FRAGILE;
  if (capexHigh || terminalHeavy) {
    out.push({
      id: "capexPeak",
      label: "Capex peak",
      detail: [capexHigh ? `capex ${pct(input.capexToRevenue!)} of revenue` : null, terminalHeavy ? `${pct(input.terminalWeight!)} of value in the terminal` : null].filter(Boolean).join("; "),
      recommendation: "Free cash flow is depressed by investment the projection cannot see the return on, so the value rests on the terminal year. Fragile: check it against an earnings multiple.",
      tab: "EPS Multiple",
      watch: "Guided capex against realised capex, and whether the margin path assumes the spend rolls off.",
    });
  }

  if (input.debtToEbitda !== null && input.debtToEbitda > LEVERAGE_HIGH) {
    out.push({
      id: "leveraged",
      label: "Leveraged",
      detail: `debt ${input.debtToEbitda.toFixed(1)}× EBITDA`,
      recommendation: "The cash-flow basis switch is not optional here: unlevered flows with net debt subtracted, or levered flows with none. A static net debt taken off ten years of flows assumes the debt is still there in year ten; read the paydown schedule under the switch.",
      tab: "DCF",
      watch: "Interest cover, maturities and the rate the debt refinances at.",
    });
  }

  if (input.fcfMargin !== null && input.fcfMargin < THIN_MARGIN) {
    out.push({
      id: "thinMargin",
      label: "Thin margin",
      detail: `FCF margin ${pct(input.fcfMargin)}`,
      recommendation: `At this margin half a point moves the value by roughly ${pct(0.005 / Math.max(input.fcfMargin, 0.005))}. The slider is the valuation.`,
      tab: "DCF",
      watch: "The margin record year by year, and what the terminal margin assumes about it.",
    });
  }

  const { divergence, acquisitions, divestitures } = input.perimeter;
  const moved = (divergence !== null && Math.abs(divergence) > 0.1) || acquisitions !== null || divestitures !== null;
  if (moved) {
    const parts = [
      acquisitions ? `acquisition of ${m(acquisitions.value)} to ${acquisitions.periodEnd}` : null,
      divestitures ? `disposal of ${m(divestitures.value)} to ${divestitures.periodEnd}` : null,
      divergence !== null && Math.abs(divergence) > 0.1 ? `trailing twelve months ${pct(Math.abs(divergence))} ${divergence > 0 ? "above" : "below"} the closed year` : null,
    ].filter(Boolean);
    out.push({
      id: "shiftingPerimeter",
      label: "Shifting perimeter",
      detail: parts.join("; "),
      recommendation: "The history does not describe the same company: growth and margin bands read off it belong to a different perimeter. Use the trailing twelve months as the base and rebuild the bands from post-deal quarters.",
      tab: "DCF",
      watch: "The first full-year comparison on the new perimeter, and the divergence notice clearing.",
    });
  }

  return out;
}

/**
 * How many years of free cash flow it takes to repay the debt, year by
 * year, at the projected flows: the paydown the static net-debt
 * deduction stands in for.
 */
export interface PaydownYear {
  year: number;
  freeCashFlow: number;
  debtStart: number;
  repaid: number;
  debtEnd: number;
}

export function debtPaydown(debt: number, projectedFcf: readonly number[]): { schedule: PaydownYear[]; yearsToRepay: number | null } {
  const schedule: PaydownYear[] = [];
  let remaining = Math.max(0, debt);
  let yearsToRepay: number | null = null;
  projectedFcf.forEach((fcf, i) => {
    const repaid = Math.max(0, Math.min(remaining, fcf));
    const debtStart = remaining;
    remaining -= repaid;
    schedule.push({ year: i + 1, freeCashFlow: fcf, debtStart, repaid, debtEnd: remaining });
    if (yearsToRepay === null && remaining === 0 && debt > 0) yearsToRepay = i + 1;
  });
  return { schedule, yearsToRepay: debt > 0 ? yearsToRepay : 0 };
}
