/**
 * Whether a company's cash flow is a balance-sheet movement rather than a
 * measure of what the business earns — the case for a bank, an insurer or
 * a lender, where cash from operations swings with deposits, reserves and
 * the loan book.
 *
 * Decided from the business, not from the sector label. Yahoo files S&P
 * Global, Visa and Mastercard under "Financial Services" next to SoFi and
 * JPMorgan, and a label-based rule told the reverse DCF that S&P Global's
 * 35% FCF margin was "not a usable margin record". What a lender cannot
 * avoid leaving in its statements:
 *
 *  - thin equity against its assets, because the assets are funded by
 *    deposits, policyholder liabilities or wholesale borrowing; and with
 *    it, either
 *  - interest as a cost of doing business — interest expense a tenth of
 *    revenue or more (American Express 10%, SoFi 32%, JPMorgan 35–54%;
 *    Mastercard 2%, a power producer 5%), or
 *  - an unclassified balance sheet: banks, insurers and lenders do not
 *    split assets into current and non-current, so the current-asset
 *    line arrives empty while total assets are there. (Alpha Vantage
 *    fills the line in for banks; Yahoo leaves it empty.)
 *
 * An industry that names banking, insurance or lending outright counts on
 * its own; "Credit Services" does not, because it holds Visa and SoFi
 * alike, and the statements tell them apart.
 */

/** Equity over total assets at or below this is the funding structure of a lender — necessary, not sufficient. */
export const LENDER_EQUITY_RATIO = 0.3;
/** Interest expense over revenue at or above this makes interest the business, not a financing cost. */
export const LENDER_INTEREST_RATIO = 0.08;

const LENDING_INDUSTRY = /\b(bank|banks|banking|insurance|insurer|reinsurance|mortgage|consumer finance|lending|thrift|savings & loan)\b/i;

export interface BusinessModelInput {
  industry?: string | null;
  /** The latest balance sheet, as the statements carry it. */
  balance?: {
    total_assets: number;
    total_current_assets: number;
    total_equity: number;
  } | null;
  /** The latest income statement, for interest against revenue. */
  income?: { revenue: number; interest_expense: number } | null;
}

export function looksLikeLender(input: BusinessModelInput): boolean {
  if (input.industry && LENDING_INDUSTRY.test(input.industry)) return true;
  const b = input.balance;
  if (!b || !(b.total_assets > 0)) return false;
  const thinEquity = b.total_equity / b.total_assets <= LENDER_EQUITY_RATIO;
  if (!thinEquity) return false;
  const unclassified = !(b.total_current_assets > 0);
  const i = input.income;
  const interestHeavy = !!i && i.revenue > 0 && Math.abs(i.interest_expense) / i.revenue >= LENDER_INTEREST_RATIO;
  return unclassified || interestHeavy;
}
