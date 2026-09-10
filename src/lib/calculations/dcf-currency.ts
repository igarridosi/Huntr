/**
 * Whether a valuation is allowed to produce a number at all.
 *
 * A DCF divides an equity value derived from the financial statements by a
 * share count and compares the result to a market price. That comparison is
 * arithmetic on two quantities, and arithmetic does not check units. Honda
 * reports in yen and its ADR trades in dollars, so the model divided a
 * ¥21.8tn revenue base by a share count and set the result against $32.43 -
 * producing "+566% upside", a Strong Buy, and a suggested position of 8-10%
 * of capital.
 *
 * Nothing about that output looked wrong. Every intermediate figure was
 * internally consistent; only the units were incompatible, and units are the
 * one thing a spreadsheet never shows you. So the check lives here, in front
 * of the result, rather than as a warning beside it.
 */

/** Blown up by more than this and the model is not describing the company. */
export const MAX_PLAUSIBLE_UPSIDE = 3;
/** Below this the equity is worth essentially nothing, which is rarely news. */
export const MIN_PLAUSIBLE_UPSIDE = -0.9;

export type ValuationBlockReason =
  | "currency-mismatch"
  | "unresolved-balance-sheet"
  | "implausible-upside";

/** Human labels for the balance-sheet fields, for the blocking message. */
const FIELD_LABELS: Record<string, string> = {
  financialDebt: "financial debt",
  cash: "cash",
  sharesOutstanding: "share count",
};

export interface ValuationGuard {
  /** True when the result may be shown as a valuation. */
  usable: boolean;
  reason: ValuationBlockReason | null;
  /** What to put on screen instead. Empty when usable. */
  message: string;
  /** The currency the figures are in, for labelling the panel. */
  currency: string | null;
  priceCurrency: string | null;
  financialCurrency: string | null;
  /** True when the two currencies are known and differ. */
  currencyMismatch: boolean;
  /** Balance-sheet fields that could not be established. */
  unresolvedFields: readonly string[];
}

export interface ValuationGuardInput {
  /** The currency `currentPrice` is quoted in, e.g. "USD". */
  priceCurrency?: string | null;
  /** The currency the statements are reported in, e.g. "JPY". */
  financialCurrency?: string | null;
  /** Upside as a decimal, as the model computed it. */
  upside?: number | null;
  /**
   * Balance-sheet fields whose value is a stand-in rather than a figure.
   *
   * A zero that means "not found" is worse than a missing panel, because it
   * is arithmetically valid: Honda's unfound debt became 5.07tn of net cash
   * and went straight into equity value.
   */
  unresolvedFields?: readonly string[];
}

function normalise(code?: string | null): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length === 3 ? trimmed : null;
}

/**
 * Decides whether the model's output can be believed, and says why not.
 *
 * Three independent checks, in order of how certain each one is:
 *
 *  1. Currency. If the statements and the price are in different currencies
 *     the per-share figure is not comparable to the price at all, and no
 *     amount of care in the assumptions fixes it. This is a fact about the
 *     data, so it blocks unconditionally.
 *
 *  2. Unresolved balance sheet. A debt figure nobody reported is not a zero,
 *     and the difference is invisible once it becomes one. Also a fact about
 *     the data, and unlike the rule below it catches the cases where the
 *     resulting number looks entirely reasonable.
 *
 *  3. Plausibility. A backstop for everything that produces a wrong unit
 *     without announcing itself - a share count off by a factor, an ADR
 *     ratio, a debt figure that resolved to zero. An upside past +300% or
 *     below -90% is not a bargain the market missed, it is a broken input.
 *     Deliberately a blunt rule: it exists to catch the failures nobody
 *     anticipated, so it cannot be narrow.
 *
 * Conversion is not attempted. Multiplying by a spot rate would silence the
 * warning without making Honda correct, because its ADR represents three
 * ordinary shares - so the denominator is wrong too, and a converted figure
 * would be a plausible number with an invisible 3x error in it. Better to
 * refuse and say so than to answer confidently in the wrong unit.
 */
export function assessValuation(input: ValuationGuardInput): ValuationGuard {
  const priceCurrency = normalise(input.priceCurrency);
  const financialCurrency = normalise(input.financialCurrency);

  // Only a mismatch between two *known* currencies counts. Treating a missing
  // field as a mismatch would block most of the tickers that are fine.
  const currencyMismatch =
    priceCurrency !== null &&
    financialCurrency !== null &&
    priceCurrency !== financialCurrency;

  const unresolvedFields = input.unresolvedFields ?? [];

  const base = {
    currency: financialCurrency ?? priceCurrency,
    priceCurrency,
    financialCurrency,
    currencyMismatch,
    unresolvedFields,
  };

  if (currencyMismatch) {
    return {
      ...base,
      usable: false,
      reason: "currency-mismatch",
      message: `The statements are reported in ${financialCurrency} and the shares trade in ${priceCurrency}. A per-share value built from ${financialCurrency} accounts cannot be compared with a ${priceCurrency} price, so no valuation is shown. This is common for ADRs, where the receipt may also represent more than one ordinary share.`,
    };
  }

  /**
   * Checked before plausibility and after currency, matching how certain each
   * one is. An unresolved balance-sheet field is a fact about the data, not a
   * judgement about the output - and unlike the plausibility rule it catches
   * the cases where the wrong number happens to look reasonable.
   */
  if (unresolvedFields.length > 0) {
    const named = unresolvedFields
      .map((field) => FIELD_LABELS[field] ?? field)
      .join(", ");
    return {
      ...base,
      usable: false,
      reason: "unresolved-balance-sheet",
      message: `Could not establish ${named} for this company. The figure shown is a placeholder, not a reported zero, and valuing on it would treat missing debt as net cash. Enter the value or confirm it really is zero.`,
    };
  }

  const upside = input.upside;
  if (typeof upside === "number" && Number.isFinite(upside)) {
    if (upside > MAX_PLAUSIBLE_UPSIDE || upside < MIN_PLAUSIBLE_UPSIDE) {
      return {
        ...base,
        usable: false,
        reason: "implausible-upside",
        message:
          "Result outside the plausible range — check the currency, the share count and net debt. No legitimate analysis produces this, so the figure is almost certainly a broken input rather than an opportunity.",
      };
    }
  }

  return { ...base, usable: true, reason: null, message: "" };
}
