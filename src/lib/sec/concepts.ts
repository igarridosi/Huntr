/**
 * SEC EDGAR — the XBRL concepts the app reads. Shared by the app and the
 * ingest pipeline, so both look for the same tags in the same order.
 */

/**
 * The XBRL concepts we read, in the order we try them.
 *
 * Issuers do not agree on which tag to use, so a single concept name is a
 * guess that works for some companies and silently fails for others - and a
 * failure here reads as a real zero rather than as a gap. The cascade is the
 * fix: the first concept that resolves wins, and the one that resolved is
 * reported so the interface can say which tag the figure actually came from.
 */
export const SEC_CONCEPTS = {
  /**
   * Shares, in preference order.
   *
   * The cover-page count first. It is a point-in-time figure filed on the
   * front of the 10-Q, and it is what the market capitalisation is built from.
   * The weighted average diluted count is an average over a reporting period,
   * so on any company buying back stock it lags the real share base - Crocs by
   * 3.5%, Verizon and Starbucks by a third of a percent each, all in the same
   * direction. Using it divided the equity value by a denominator that no
   * longer existed.
   *
   * Diluted stays as the fallback, because a multi-class issuer files the
   * cover count per class and it may not resolve as a single number.
   */
  sharesOutstandingCover: ["EntityCommonStockSharesOutstanding"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],

  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    // Includes restricted cash, which is not freely available to repay debt.
    // Only reached when the clean tag has been abandoned, and netted down by
    // `restrictedCash` below where the issuer discloses the split.
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "Cash",
  ],
  restrictedCash: [
    "RestrictedCashCurrent",
    "RestrictedCashAndCashEquivalentsAtCarryingValue",
    "RestrictedCashEquivalentsCurrent",
  ],
  restrictedCashNoncurrent: [
    "RestrictedCashNoncurrent",
    "RestrictedCashAndCashEquivalentsNoncurrent",
  ],
  /**
   * Securities held as a cash reserve, current only. Liquid within the year
   * and available to repay debt, so they belong in net cash: Reddit held
   * $1.3B here beside $1.5B of cash, and leaving them out cost $6.43 a share.
   * Alternatives, not parts: a total like ShortTermInvestments already holds
   * the available-for-sale securities, so only one is ever taken.
   * Long-term holdings stay out; they are not a reserve.
   */
  marketableSecuritiesCurrent: [
    "ShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
  ],
  /**
   * Redeemable preferred and other temporary equity attributable to the
   * parent: a claim ahead of the common shareholder, filed between
   * liabilities and equity. Instacart's $200M Series A sits here.
   */
  redeemablePreferred: ["TemporaryEquityCarryingAmountAttributableToParent"],
  /**
   * Shares the diluted count adds for preferred that converts. Present and
   * positive means the preferred is already in the denominator, so it must
   * not be subtracted as debt as well: Instacart's 5.8M in Q2 2026.
   */
  preferredConversionShares: ["IncrementalCommonSharesAttributableToConversionOfPreferredStock"],

  /**
   * Debt, as two halves that must be added.
   *
   * Each half is its own cascade because issuers move between tags: Verizon
   * abandoned LongTermDebtNoncurrent in 2013 and now files the borrowings
   * under LongTermDebtAndCapitalLeaseObligations. Reading only the first name
   * and letting the current half stand alone reported 21.8B of debt for a
   * company carrying 143.4B - recent, plausible, and wrong by 85%.
   */
  debtNoncurrent: [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
    "UnsecuredLongTermDebt",
    "LongTermDebt",
  ],
  debtCurrent: [
    "LongTermDebtCurrent",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "DebtCurrent",
    "UnsecuredDebtCurrent",
  ],
  /**
   * Borrowings that were never long-term: commercial paper, revolver draws,
   * bank loans due within the year. Filed apart from the current portion
   * of long-term debt, and left out of "total debt" by the two halves
   * above. FIS carried 4.2B of them on 30 June 2026 against 16.9B of
   * long-term debt including its current portion: the report said 21.2B,
   * the model read 16.9B, and the gap was $8 a share.
   */
  debtShortTerm: ["ShortTermBorrowings", "CommercialPaper", "ShortTermBankLoansAndNotesPayable"],
  /**
   * Tags that already carry both halves. Never added to the two above - that
   * would count the current portion twice - only used in their place.
   */
  debtTotalIncludingCurrent: [
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "DebtLongtermAndShorttermCombinedAmount",
    "DebtInstrumentCarryingAmount",
    "NotesPayable",
  ],

  /** Revenue, for verifying the base the model starts from against the filings. */
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
  ],

  operatingLeaseNoncurrent: ["OperatingLeaseLiabilityNoncurrent"],
  operatingLeaseCurrent: ["OperatingLeaseLiabilityCurrent"],
  // The rent actually charged through the income statement, needed to undo
  // the double count when leases are treated as debt.
  operatingLeaseExpense: [
    "OperatingLeaseExpense",
    "OperatingLeaseCost",
    "OperatingLeasePayments",
  ],
  shareBasedCompensation: ["ShareBasedCompensation"],
  /** A business bought or sold: the perimeter of the history has moved. */
  acquisitions: ["PaymentsToAcquireBusinessesNetOfCashAcquired", "PaymentsToAcquireBusinessesGross"],
  divestitures: ["ProceedsFromDivestitureOfBusinesses", "ProceedsFromDivestitureOfBusinessesNetOfCashDivested", "ProceedsFromSaleOfBusinessesNetOfCashDivested"],
} as const;

export type SECConceptKey = keyof typeof SEC_CONCEPTS;

export type SECTaxonomy = "us-gaap" | "dei" | "ifrs-full";

/**
 * Lease principal paid, from an IFRS filer's cash flow statement.
 *
 * Under IFRS 16 it is a financing outflow, so operating cash flow is struck
 * before it - unlike US GAAP, where operating-lease rent stays in operating
 * cash flow. On paid CHF 69.9M in 2025; Haleon £60M.
 */
export const IFRS_LEASE_PRINCIPAL_CONCEPTS = ["PaymentsOfLeaseLiabilitiesClassifiedAsFinancingActivities"] as const;

/**
 * Share-based payments added back in an IFRS filer's operating cash flow:
 * the IFRS counterpart of us-gaap ShareBasedCompensation. Without it an IFRS
 * filer had no stock compensation to deduct at all - On's CHF 66.6M.
 */
export const IFRS_SBC_CONCEPTS = ["AdjustmentsForSharebasedPayments"] as const;

/** Operating cash flow of the fiscal year, for verifying the margin's numerator. */
export const OPERATING_CASH_FLOW_CONCEPTS = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
] as const;
