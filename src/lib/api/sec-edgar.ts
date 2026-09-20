/**
 * SEC EDGAR XBRL client.
 *
 * Why this exists: yfinance's `info` dictionary is unofficial scraping. It
 * exposes several share-count fields that do not agree with each other and are
 * not always current, and the equity value gets divided by whichever one you
 * happened to read. The result still looks plausible, which is what makes it
 * dangerous - a 6% error in the share count is enough to move a decision and
 * nothing on screen says anything is wrong.
 *
 * EDGAR is the filing itself: free, no API key, and it carries the form and
 * filing date alongside every figure so the interface can say how old a number
 * is. It requires an identifying User-Agent, which the SEC enforces.
 *
 * Everything here degrades rather than fails. A foreign issuer with no XBRL, a
 * ticker with no CIK, a concept a company does not report - each returns null
 * and the caller falls back to Yahoo, marked as such in the UI.
 */

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_CONCEPT_URL = "https://data.sec.gov/api/xbrl/companyconcept";
const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";

/**
 * The SEC asks for a real contact address here and rate-limits anything that
 * does not identify itself. Configurable so a deployment can use its own.
 */
const USER_AGENT =
  process.env.SEC_USER_AGENT?.trim() || "Huntr huntrvalue.me contact@huntrvalue.me";

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
} as const;

export type SECConceptKey = keyof typeof SEC_CONCEPTS;

/** One figure, with the paperwork behind it. */
export interface SECFact {
  value: number;
  /** e.g. "10-Q", "10-K". */
  form: string;
  /** ISO date the filing was accepted. */
  filed: string;
  /** ISO date the period ends - what the number actually describes. */
  periodEnd: string;
  /** Which XBRL tag this came from, since several may have been tried. */
  concept: string;
  /** Days the fact covers. Zero for a balance-sheet instant. */
  durationDays: number;
  /** Accession number of the filing the figure was read from, when the feed carried it. */
  accession?: string;
  /**
   * True when this figure is known to be missing a component - one half of a
   * two-part total that could not be paired. The value is still the best
   * available, but it understates, and the interface should say so rather than
   * present a partial sum as a total.
   */
  partial?: boolean;
  /**
   * True when this cash figure still contains restricted balances because the
   * issuer does not disclose the split. Restricted cash cannot be used to
   * repay debt, so netting it at full value overstates the equity value - and
   * the interface should say so rather than let the number pass as free cash.
   */
  includesRestricted?: boolean;
}

/** A raw fact row as EDGAR returns it. Fields we do not use are ignored. */
interface RawSECFact {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  filed?: string;
  fp?: string;
  fy?: number;
  /** The filing's accession number, e.g. "0001136893-26-000050": the document the figure can be traced to. */
  accn?: string;
}

// ─────────────────────────────────────────────────────────
// Pure helpers — the parts worth testing on their own
// ─────────────────────────────────────────────────────────

/** Forms that carry a reviewed balance sheet. */
const ACCEPTED_FORMS = ["10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"];

function durationInDays(fact: RawSECFact): number {
  if (!fact.start || !fact.end) return 0;
  const start = new Date(fact.start).getTime();
  const end = new Date(fact.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / (24 * 60 * 60 * 1000));
}

export type FactPeriod = "any" | "quarterly" | "annual";

/**
 * How old a fact may be and still describe the company today.
 *
 * Companies abandon tags. Ford last filed LongTermDebtNoncurrent in 2021, and
 * without a cutoff that five-year-old 291M is returned as the current debt of
 * a company that carries over a hundred billion - a wrong number wearing a
 * filing date, which is worse than no number at all. Past this age the figure
 * is refused so the caller falls back to a source that is at least current.
 *
 * Set beyond a year so a lease balance or any other figure disclosed only in
 * the annual report still counts as current between 10-Ks.
 */
export const MAX_FACT_AGE_DAYS = 450;

/**
 * Picks the fact that describes the most recent period.
 *
 * Three things this has to get right, each of which produced a wrong number
 * on screen when it did not:
 *
 *  - Recency by period end, not filing date. An amendment covering an older
 *    quarter can be filed after a newer one; the balance sheet we want is the
 *    latest that exists, not the most recently submitted piece of paper.
 *  - Only reviewed forms. EDGAR carries 8-K exhibits and registration
 *    statements under the same concept, and those can be years old or scoped
 *    to a transaction rather than the company.
 *  - The right period length. A flow concept like diluted shares appears in a
 *    10-Q both as the quarter and as the year to date, under the same tag and
 *    the same end date. Taking whichever came first in the array is how a
 *    share count ends up ~5% away from the one the market cap implies.
 */
export function selectLatestFact(
  facts: RawSECFact[],
  period: FactPeriod = "any",
  concept: string = "unknown",
  now: Date = new Date()
): SECFact | null {
  const oldestAcceptable =
    now.getTime() - MAX_FACT_AGE_DAYS * 24 * 60 * 60 * 1000;

  const usable = facts.filter((fact) => {
    if (typeof fact.val !== "number" || !Number.isFinite(fact.val)) return false;
    if (typeof fact.end !== "string" || fact.end.length === 0) return false;
    // An unlabelled form is kept: some older filings omit it, and dropping
    // them would lose companies rather than bad data.
    if (fact.form && !ACCEPTED_FORMS.includes(fact.form)) return false;

    // A tag the company stopped using is not a current figure, whatever its
    // filing date says.
    const end = new Date(fact.end).getTime();
    if (Number.isFinite(end) && end < oldestAcceptable) return false;

    if (period === "any") return true;
    const days = durationInDays(fact);
    if (days === 0) return true;
    // 330, not 250. A 10-Q files a nine-month year-to-date figure that runs
    // 272 days, and a loose threshold lets it through - where it then wins on
    // recency against the genuine full year in the last 10-K. That is how
    // Apple's stock compensation came out at 10.5B against a real annual
    // 12.9B, and Crocs' at 25M against 37M: a partial year presented as a
    // whole one, understating every adjustment built on it.
    return period === "quarterly" ? days <= 120 : days >= 330;
  });

  if (usable.length === 0) return null;

  const best = usable.reduce((winner, candidate) => {
    const byPeriod = (candidate.end ?? "").localeCompare(winner.end ?? "");
    if (byPeriod !== 0) return byPeriod > 0 ? candidate : winner;

    // Same period end: prefer the shorter window when we asked for quarterly,
    // so the year-to-date figure filed alongside it cannot win.
    if (period === "quarterly") {
      const byLength = durationInDays(candidate) - durationInDays(winner);
      if (byLength !== 0) return byLength < 0 ? candidate : winner;
    }

    return (candidate.filed ?? "").localeCompare(winner.filed ?? "") > 0
      ? candidate
      : winner;
  });

  return {
    value: best.val as number,
    form: best.form ?? "unknown",
    filed: best.filed ?? (best.end as string),
    periodEnd: best.end as string,
    concept,
    durationDays: durationInDays(best),
    ...(best.accn ? { accession: best.accn } : {}),
  };
}

/**
 * Flattens EDGAR's units object into one list.
 *
 * A concept is filed under a unit key - "USD" for money, "shares" for counts -
 * and the caller does not care which, only that the numbers are comparable. We
 * take the unit with the most rows, which is always the primary one; a stray
 * secondary unit (a company reporting a handful of figures in EUR alongside
 * USD) would otherwise be able to win the recency contest with an unrelated
 * number.
 */
export function extractFactRows(payload: unknown): RawSECFact[] {
  const units = (payload as { units?: Record<string, unknown> })?.units;
  if (!units || typeof units !== "object") return [];

  let best: RawSECFact[] = [];
  for (const rows of Object.values(units)) {
    if (Array.isArray(rows) && rows.length > best.length) {
      best = rows as RawSECFact[];
    }
  }
  return best;
}

/**
 * How stale a figure is, in days, against a reference date.
 *
 * A quarterly filing is roughly 90 days old by the time the next one lands, so
 * anything past that is either an annual figure being used as a current one or
 * a company that has gone quiet. Either is worth flagging in amber.
 */
export function factAgeInDays(fact: SECFact, now: Date = new Date()): number {
  const filed = new Date(fact.filed).getTime();
  if (!Number.isFinite(filed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - filed) / (24 * 60 * 60 * 1000));
}

export const STALE_FACT_DAYS = 90;

/**
 * Whether a share count squares with the market capitalisation.
 *
 * The cheapest check in the whole model per line of code: price times shares
 * has to land on the reported market cap, and when it does not, one of the two
 * is from the wrong company, the wrong class of stock, or the wrong quarter.
 */
export interface MarketCapCheck {
  implied: number;
  reported: number;
  deviation: number;
  agrees: boolean;
}

export const MARKET_CAP_TOLERANCE = 0.03;

export function checkMarketCap(
  price: number,
  shareCount: number,
  reportedMarketCap: number,
  tolerance: number = MARKET_CAP_TOLERANCE
): MarketCapCheck | null {
  if (!(price > 0) || !(shareCount > 0) || !(reportedMarketCap > 0)) return null;

  const implied = price * shareCount;
  const deviation = implied / reportedMarketCap - 1;

  return {
    implied,
    reported: reportedMarketCap,
    deviation,
    agrees: Math.abs(deviation) <= tolerance,
  };
}

/**
 * Which filed share count to divide by: the weighted diluted count of the
 * latest quarterly filing, whenever there is one.
 *
 * One criterion, so two companies' per-share figures are built the same
 * way. The diluted count covers every class and the options and units
 * that will become shares; the cover-page count is one class, basic, on
 * one day. The diluted count is an average over the quarter and lags a
 * buyback by up to three months — that is what the market-cap cross-check
 * is for, and it now reports the gap and its direction instead of
 * quietly switching counts. The cover count is used only when no diluted
 * count was filed.
 */
export function selectShareCount(cover: SECFact | null, weightedDiluted: SECFact | null): SECFact | null {
  return weightedDiluted ?? cover;
}

/**
 * Net debt, itemised.
 *
 * Yahoo generally leaves operating lease liabilities out of debt. For a
 * retailer, a restaurant group or a gym chain that understates net debt by
 * billions and inflates equity value by the same amount, silently. The
 * breakdown exists so the number can be argued with rather than trusted.
 *
 * A negative result is a real answer - the company holds more cash than debt -
 * and callers must add it to enterprise value rather than subtract it. Getting
 * that sign wrong is a common and expensive mistake, so the shape here makes
 * it explicit rather than leaving it to a subtraction somewhere downstream.
 */
export interface NetDebtBreakdown {
  financialDebt: number;
  operatingLeases: number;
  cash: number;
  netDebt: number;
  includesLeases: boolean;
  /** True when the company holds more cash than debt. */
  isNetCash: boolean;
}

export function buildNetDebt(params: {
  financialDebt: number;
  operatingLeases: number;
  cash: number;
  includeLeases?: boolean;
}): NetDebtBreakdown {
  // Option B by default. Under ASC 842 the operating lease charge is already
  // deducted from operating cash flow, so the FCF the model discounts is
  // already net of rent. Adding the lease liability to net debt as well
  // discounts the same obligation twice - and doing only that, without
  // returning the rent to FCF, is the one combination that is simply wrong.
  // Off by default because it needs less data and agrees with the cash flow
  // already in hand.
  const includesLeases = params.includeLeases ?? false;
  const financialDebt = Math.max(0, params.financialDebt || 0);
  const operatingLeases = Math.max(0, params.operatingLeases || 0);
  const cash = Math.max(0, params.cash || 0);

  const netDebt =
    financialDebt + (includesLeases ? operatingLeases : 0) - cash;

  return {
    financialDebt,
    operatingLeases,
    cash,
    netDebt,
    includesLeases,
    isNetCash: netDebt < 0,
  };
}

/**
 * Whether leases can be capitalised at all, and what it costs the FCF.
 *
 * Capitalising them (Option A) means two moves that have to happen together:
 * the lease liability joins net debt, and the rent charge comes back into free
 * cash flow, because the obligation is now being valued on the balance sheet
 * instead of expensed through the cash flow. Doing the first without the
 * second double counts.
 *
 * When the rent charge cannot be found there is no honest way to make the
 * second move, so the option is refused rather than half-applied.
 */
export interface LeaseTreatment {
  /** True when the rent charge is available and the toggle can be offered. */
  canCapitalise: boolean;
  /** Annual operating lease expense to add back, or null when unavailable. */
  leaseExpense: number | null;
  /** Why the option is unavailable, for the interface to explain. */
  reason: string | null;
}

export function resolveLeaseTreatment(
  operatingLeases: number,
  leaseExpense: number | null
): LeaseTreatment {
  if (!(operatingLeases > 0)) {
    return {
      canCapitalise: false,
      leaseExpense: null,
      reason: "This company reports no operating lease liability.",
    };
  }

  if (leaseExpense === null || !(leaseExpense > 0)) {
    return {
      canCapitalise: false,
      leaseExpense: null,
      reason:
        "The annual operating lease charge is not in this filing, so the rent cannot be added back to free cash flow. Capitalising leases without that adjustment would count the same obligation twice.",
    };
  }

  return { canCapitalise: true, leaseExpense, reason: null };
}

/**
 * Free cash flow under the chosen lease treatment.
 *
 * Capitalising a lease does not hand the whole rent back to free cash flow.
 * The obligation moves onto the balance sheet as a liability with a matching
 * right-of-use asset, and that asset depreciates. Rent is roughly the sum of
 * that depreciation and the interest on the liability, so the only part that
 * genuinely returns to cash flow is the interest - the depreciation is still
 * a real cost of using the space.
 *
 * This matters arithmetically, not just conceptually. Adding the full rent
 * back credits a perpetuity of it against a liability that covers a finite
 * lease term: on a representative case, 310M of rent capitalised at a 6.5%
 * spread is worth 4.77B against a reported liability of 2.14B, so the toggle
 * would move the valuation by 16% in the direction of whichever treatment
 * flattered the company. Returning the interest alone is the standard
 * adjustment and is what makes the two treatments agree, which is the point
 * of offering them as alternatives rather than as different answers.
 *
 * `discountRate` is the rate the caller will capitalise this stream at - the
 * WACC less terminal growth, not the WACC itself. Charge it at the full WACC
 * and the add-back is worth more in present value than the liability it is
 * meant to offset, which turns a compensating adjustment into a thumb on the
 * scale.
 *
 * Capped at the rent actually paid: you can never add back more than left.
 */
export function adjustFCFForLeases(params: {
  freeCashFlow: number;
  leaseExpense: number | null;
  leaseLiability: number;
  discountRate: number;
  capitalise: boolean;
}): number {
  const { freeCashFlow, leaseExpense, leaseLiability, discountRate, capitalise } =
    params;
  if (!capitalise || leaseExpense === null) return freeCashFlow;

  const impliedInterest = Math.max(0, leaseLiability) * Math.max(0, discountRate);
  return freeCashFlow + Math.min(Math.max(0, leaseExpense), impliedInterest);
}

/**
 * FCF with stock compensation treated as the cost to shareholders that it is.
 *
 * Yahoo's free cash flow is operating cash flow less capex, and operating cash
 * flow adds back share-based compensation because no cash left the building.
 * No cash did, but ownership did: the shareholder pays for it in dilution. For
 * a company paying out 10% of revenue in stock, the two margins are a different
 * business.
 */
export function adjustFCFForSBC(params: {
  freeCashFlow: number;
  shareBasedCompensation: number;
  revenue: number;
  deductSBC: boolean;
}): { fcf: number; margin: number; unadjustedMargin: number } {
  const { freeCashFlow, shareBasedCompensation, revenue, deductSBC } = params;
  const sbc = Math.max(0, shareBasedCompensation || 0);
  const fcf = deductSBC ? freeCashFlow - sbc : freeCashFlow;

  return {
    fcf,
    margin: revenue > 0 ? fcf / revenue : 0,
    unadjustedMargin: revenue > 0 ? freeCashFlow / revenue : 0,
  };
}

// ─────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────

async function secFetch(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // Fundamentals move quarterly; the SEC asks callers not to hammer it.
      next: { revalidate: 24 * 60 * 60 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** ticker -> CIK, resolved once and kept for the lifetime of the process. */
let cikMapPromise: Promise<Map<string, string>> | null = null;

export async function getCIKMap(): Promise<Map<string, string>> {
  if (!cikMapPromise) {
    cikMapPromise = (async () => {
      const payload = await secFetch(SEC_TICKERS_URL);
      const map = new Map<string, string>();
      if (!payload || typeof payload !== "object") return map;

      for (const entry of Object.values(payload as Record<string, unknown>)) {
        const row = entry as { ticker?: string; cik_str?: number | string };
        if (!row?.ticker || row.cik_str === undefined) continue;
        // EDGAR keys everything on a zero-padded ten-digit CIK.
        map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
      }
      return map;
    })().catch(() => new Map<string, string>());
  }
  return cikMapPromise;
}

export async function resolveCIK(ticker: string): Promise<string | null> {
  const map = await getCIKMap();
  return map.get(ticker.trim().toUpperCase()) ?? null;
}

/**
 * Every us-gaap fact a company has ever filed, in one request.
 *
 *  is per-tag and, for some issuers, simply broken: Ford
 * returns HTTP 200 with the tag metadata and an empty  object for
 * concepts it demonstrably files - which reads downstream as "this company
 * has no cash".  returns the same data correctly, tells us
 * which tags the issuer actually uses rather than making us guess, and costs
 * one request instead of one per tag in every cascade.
 */
const companyFactsCache = new Map<
  string,
  Promise<Record<string, Record<string, unknown>> | null>
>();

export type SECTaxonomy = "us-gaap" | "dei";

export async function getCompanyFacts(
  cik: string
): Promise<Record<string, Record<string, unknown>> | null> {
  const cached = companyFactsCache.get(cik);
  if (cached) return cached;

  const request = (async () => {
    const payload = await secFetch(`${SEC_FACTS_URL}/CIK${cik}.json`);
    // Every taxonomy, not just us-gaap: the share count that matters lives
    // under dei, on the cover page of the filing.
    const facts = (payload as {
      facts?: Record<string, Record<string, unknown>>;
    })?.facts;
    return facts ?? null;
  })();

  companyFactsCache.set(cik, request);
  return request;
}
/**
 * Resolves a figure from a cascade of tags, preferring the freshest.
 *
 * The obvious implementation - take the first tag that returns anything -
 * is wrong, and wrong in a way that looks fine. Companies change which tag
 * they file under: Starbucks last used
 * CashAndCashEquivalentsAtCarryingValue in 2022 and Ford last used
 * LongTermDebtNoncurrent in 2021. Stopping at the first hit returns those
 * abandoned tags and prints a four-year-old balance next to a current one, as
 * though both described the same company today.
 *
 * So every tag in the cascade is fetched and the one with the most recent
 * period end wins. Order still matters as a tie-break - the first tag is the
 * preferred definition - but recency comes first, because a stale figure is
 * not a worse answer, it is a different company.
 */
export async function fetchConcept(
  cik: string,
  concepts: readonly string[],
  period: FactPeriod = "any",
  taxonomy: SECTaxonomy = "us-gaap"
): Promise<SECFact | null> {
  const allFacts = await getCompanyFacts(cik);
  const scope = allFacts?.[taxonomy];

  const candidates: SECFact[] = [];
  for (const concept of concepts) {
    const entry = scope?.[concept];
    const fact = entry
      ? selectLatestFact(extractFactRows(entry), period, concept)
      : null;
    if (fact) candidates.push(fact);
  }

  // Only fall back to the per-tag endpoint when the bulk file gave nothing at
  // all, so a company missing from companyfacts is still reachable.
  if (candidates.length === 0 && !allFacts) {
    for (const concept of concepts) {
      const payload = await secFetch(
        `${SEC_CONCEPT_URL}/CIK${cik}/${taxonomy}/${concept}.json`
      );
      if (!payload) continue;
      const fact = selectLatestFact(extractFactRows(payload), period, concept);
      if (fact) candidates.push(fact);
    }
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((winner, candidate) => {
    const byPeriod = candidate.periodEnd.localeCompare(winner.periodEnd);
    if (byPeriod !== 0) return byPeriod > 0 ? candidate : winner;
    // Same period: keep the earlier tag in the cascade, which is the
    // preferred definition.
    return winner;
  });
}

export interface SECFundamentals {
  cik: string;
  /** The preferred count before the market cap has had its say. */
  dilutedShares: SECFact | null;
  /**
   * Both candidates, kept so the cross-check can choose rather than complain.
   *
   * The cover-page count is right far more often, but on a multi-class issuer
   * the tag carries one class: LULU files 108.4M against a share base of
   * 113.6M, and the model then divided equity value by a denominator 4.5% too
   * small. Keeping both lets `selectShareCount` pick whichever reconciles.
   */
  coverShares: SECFact | null;
  weightedDilutedShares: SECFact | null;
  financialDebt: SECFact | null;
  cash: SECFact | null;
  operatingLeases: SECFact | null;
  /** Rent charged through the income statement. Needed to undo the double
   *  count when leases are also treated as debt. */
  operatingLeaseExpense: SECFact | null;
  shareBasedCompensation: SECFact | null;
}

/**
 * Every figure we take from EDGAR, for one company.
 *
 * Concepts are judged separately: a company that does not report operating
 * leases should still give us its share count, so one missing concept never
 * sinks the rest. A concept that resolves to nothing stays null rather than
 * becoming zero, because the two mean opposite things - one is a company with
 * no debt, the other is a tag we failed to find.
 */
/**
 * Total borrowings, resolved without ever letting a half stand for the whole.
 *
 * Three rules, each of which existed because breaking it produced a plausible
 * wrong number:
 *
 *  - The two halves are only added when they describe the same period end.
 *    Summing a June non-current balance with a March current one is arithmetic
 *    on two different companies.
 *  - A lone half is never returned as a total while a combined tag exists. If
 *    it is all there is, it comes back marked partial so the interface can say
 *    the figure understates rather than presenting it as complete.
 *  - The combined tags are alternatives to the pair, never additions to it.
 *    Adding them would count the current portion twice.
 */
export async function resolveFinancialDebt(cik: string): Promise<SECFact | null> {
  const [noncurrent, current, combined, shortTerm] = await Promise.all([
    fetchConcept(cik, SEC_CONCEPTS.debtNoncurrent),
    fetchConcept(cik, SEC_CONCEPTS.debtCurrent),
    fetchConcept(cik, SEC_CONCEPTS.debtTotalIncludingCurrent),
    fetchConcept(cik, SEC_CONCEPTS.debtShortTerm),
  ]);
  return composeFinancialDebt({ noncurrent, current, combined, shortTerm });
}

/**
 * Total borrowings from the parts the issuer files: the long-term debt,
 * its current portion, and the short-term borrowings that were never
 * long-term. A combined tag stands in for the first two only. Short-term
 * borrowings are added only when they describe the same balance-sheet
 * date, and never on top of a `DebtCurrent` figure, which already holds
 * them.
 */
export function composeFinancialDebt(parts: {
  noncurrent: SECFact | null;
  current: SECFact | null;
  combined: SECFact | null;
  shortTerm: SECFact | null;
}): SECFact | null {
  const { noncurrent, current, combined, shortTerm } = parts;

  const samePeriod = noncurrent && current && noncurrent.periodEnd === current.periodEnd;
  let core: SECFact | null;
  let currentHoldsShortTerm = false;
  if (samePeriod) {
    const paired = sumFacts(noncurrent, current) as SECFact;
    // A combined tag only wins if it describes a later period than the pair.
    core = combined && combined.periodEnd > paired.periodEnd ? combined : paired;
    currentHoldsShortTerm = core === paired && current!.concept === "DebtCurrent";
  } else if (combined) {
    core = combined;
  } else {
    const lone = pickFresher(noncurrent, current);
    if (!lone) return null;
    core = { ...lone, partial: true };
    currentHoldsShortTerm = lone.concept === "DebtCurrent";
  }

  if (shortTerm && shortTerm.value > 0 && !currentHoldsShortTerm && shortTerm.periodEnd === core.periodEnd) {
    return { ...(sumFacts(core, shortTerm) as SECFact), ...(core.partial ? { partial: true } : {}) };
  }
  return core;
}

export interface SECFundamentals {
  cik: string;
  /**
   * Shares used for per-share figures: the cover-page count where the issuer
   * files one, the weighted average diluted count otherwise.
   */
  dilutedShares: SECFact | null;
  financialDebt: SECFact | null;
  cash: SECFact | null;
  operatingLeases: SECFact | null;
  /** Rent charged through the income statement. Needed to undo the double
   *  count when leases are also treated as debt. */
  operatingLeaseExpense: SECFact | null;
  shareBasedCompensation: SECFact | null;
}

/**
 * Every figure we take from EDGAR, for one company.
 *
 * Concepts are judged separately: a company that does not report operating
 * leases should still give us its share count, so one missing concept never
 * sinks the rest. A concept that resolves to nothing stays null rather than
 * becoming zero, because the two mean opposite things - one is a company with
 * no debt, the other is a tag we failed to find.
 */
/**
 * Cash available to repay debt.
 *
 * The clean tag is preferred, but issuers abandon it: Starbucks last filed
 * CashAndCashEquivalentsAtCarryingValue in 2022 and now reports a combined
 * figure that folds in restricted cash. Restricted balances cannot be used to
 * retire debt, so netting them at full value against borrowings overstates
 * equity value.
 *
 * Where the issuer discloses the restricted portion it is subtracted; where it
 * does not, the figure is returned marked so the panel can say what it still
 * contains. Guessing a haircut would be worse than either.
 */
export async function resolveCash(cik: string): Promise<SECFact | null> {
  const [cash, restrictedCurrent, restrictedNoncurrent] = await Promise.all([
    fetchConcept(cik, SEC_CONCEPTS.cash),
    fetchConcept(cik, SEC_CONCEPTS.restrictedCash),
    fetchConcept(cik, SEC_CONCEPTS.restrictedCashNoncurrent),
  ]);

  if (!cash) return null;

  const combinedTag = cash.concept.includes("RestrictedCash");
  if (!combinedTag) return cash;

  // Only halves describing the same balance-sheet date as the cash figure can
  // be netted against it.
  const restricted = [restrictedCurrent, restrictedNoncurrent]
    .filter((fact): fact is SECFact => !!fact && fact.periodEnd === cash.periodEnd)
    .reduce((sum, fact) => sum + fact.value, 0);

  if (restricted <= 0) {
    return { ...cash, includesRestricted: true };
  }

  return {
    ...cash,
    value: Math.max(0, cash.value - restricted),
    concept: `${cash.concept} less restricted`,
  };
}

// ─────────────────────────────────────────────────────────
// Multi-class issuers: the diluted count from the filing itself
// ─────────────────────────────────────────────────────────

const SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";
const DILUTED_SHARES_TAG = "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding";
/** Berkshire has nothing dilutive and files the basic count only; it is the same count. */
const BASIC_SHARES_TAG = "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic";

/**
 * The diluted share count of an issuer with several classes of stock,
 * read off its latest 10-Q or 10-K.
 *
 * Visa, Berkshire, Alphabet's cousins with two tickers: they report
 * earnings per share by class, so every share count in the filing is
 * tagged with a class dimension, and the SEC's companyfacts feed — which
 * carries undimensioned facts only — has no share count for them at all.
 * The model then fell back to the cover-page count, which for Visa is
 * class A alone: 1.70B against a share base of 1.88B, and every per-share
 * figure 10% too high.
 *
 * The filing's inline XBRL has the facts with their contexts. The count
 * taken is the largest diluted count of the latest period, which is the
 * "as-converted" or "equivalent" basis a multi-class issuer reports its
 * EPS on (Visa's class A with B and C converted in; Berkshire's class B
 * equivalents — basic, since Berkshire has nothing dilutive and files no
 * diluted count). Only consulted when no undimensioned count exists.
 */
export function parseClassDilutedShares(
  html: string,
  meta: { form: string; filed: string }
): SECFact | null {
  const contexts = new Map<string, { start: string | null; end: string | null; members: string[] }>();
  for (const m of html.matchAll(/<(?:xbrli:)?context id="([^"]+)">([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const body = m[2];
    contexts.set(m[1], {
      start: /<(?:xbrli:)?startDate>([^<]+)</.exec(body)?.[1] ?? null,
      end: /<(?:xbrli:)?endDate>([^<]+)</.exec(body)?.[1] ?? null,
      members: [...body.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)</g)].map((d) => `${d[1]}=${d[2]}`),
    });
  }

  type Candidate = { value: number; start: string; end: string; days: number; tag: string };
  const all: Candidate[] = [];
  for (const m of html.matchAll(/<ix:nonFraction([^>]*)>([^<]*)</g)) {
    const attrs = m[1];
    const tag = [DILUTED_SHARES_TAG, BASIC_SHARES_TAG].find((t) => attrs.includes(`name="${t}"`));
    if (!tag) continue;
    const ref = /contextRef="([^"]+)"/.exec(attrs)?.[1];
    const ctx = ref ? contexts.get(ref) : undefined;
    if (!ctx || !ctx.start || !ctx.end) continue;
    // One dimension, and it is the class of stock: nothing else sliced in.
    if (ctx.members.length !== 1 || !ctx.members[0].startsWith("us-gaap:StatementClassOfStockAxis=")) continue;
    const scale = Number(/scale="(-?\d+)"/.exec(attrs)?.[1] ?? "0");
    const raw = Number(m[2].replace(/[,\s]/g, ""));
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const value = raw * Math.pow(10, scale);
    const days = Math.round((Date.parse(ctx.end) - Date.parse(ctx.start)) / 86_400_000);
    all.push({ value, start: ctx.start, end: ctx.end, days, tag });
  }
  const diluted = all.filter((c) => c.tag === DILUTED_SHARES_TAG);
  const candidates = diluted.length > 0 ? diluted : all;
  if (candidates.length === 0) return null;

  // Latest period end; among those, the shortest span (the quarter of a
  // 10-Q rather than its year-to-date column); then the largest class.
  const latestEnd = candidates.reduce((a, c) => (c.end > a ? c.end : a), "");
  const latest = candidates.filter((c) => c.end === latestEnd);
  const shortest = Math.min(...latest.map((c) => c.days));
  const pick = latest.filter((c) => c.days === shortest).reduce((a, c) => (c.value > a.value ? c : a));
  return {
    value: pick.value,
    form: meta.form,
    filed: meta.filed,
    periodEnd: pick.end,
    concept: `${pick.tag.slice("us-gaap:".length)} (by class, largest as-converted)`,
    durationDays: pick.days,
  };
}

const classDilutedCache = new Map<string, Promise<SECFact | null>>();

export async function fetchClassDilutedShares(cik: string): Promise<SECFact | null> {
  const cached = classDilutedCache.get(cik);
  if (cached) return cached;
  const request = (async () => {
    const submissions = (await secFetch(`${SEC_SUBMISSIONS_URL}/CIK${cik}.json`)) as {
      filings?: { recent?: { form?: string[]; accessionNumber?: string[]; primaryDocument?: string[]; filingDate?: string[] } };
    } | null;
    const recent = submissions?.filings?.recent;
    if (!recent?.form) return null;
    const i = recent.form.findIndex((f) => f === "10-Q" || f === "10-K");
    if (i < 0) return null;
    const accession = recent.accessionNumber?.[i]?.replace(/-/g, "");
    const doc = recent.primaryDocument?.[i];
    if (!accession || !doc) return null;
    try {
      const response = await fetch(`${SEC_ARCHIVES_URL}/${Number(cik)}/${accession}/${doc}`, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 24 * 60 * 60 },
      });
      if (!response.ok) return null;
      return parseClassDilutedShares(await response.text(), { form: recent.form[i], filed: recent.filingDate?.[i] ?? "" });
    } catch {
      return null;
    }
  })();
  classDilutedCache.set(cik, request);
  return request;
}

export async function getSECFundamentals(
  ticker: string
): Promise<SECFundamentals | null> {
  const cik = await resolveCIK(ticker);
  if (!cik) return null;

  const [
    coverShares,
    undimensionedDilutedShares,
    financialDebt,
    cash,
    leaseNoncurrent,
    leaseCurrent,
    operatingLeaseExpense,
    shareBasedCompensation,
  ] = await Promise.all([
    // Point in time, from the cover of the filing, under the dei taxonomy:
    // the fallback when no diluted count was filed.
    fetchConcept(cik, SEC_CONCEPTS.sharesOutstandingCover, "any", "dei"),
    // The count in use: diluted, from the latest quarterly filing.
    fetchConcept(cik, SEC_CONCEPTS.dilutedShares, "quarterly"),
    resolveFinancialDebt(cik),
    resolveCash(cik),
    fetchConcept(cik, SEC_CONCEPTS.operatingLeaseNoncurrent),
    fetchConcept(cik, SEC_CONCEPTS.operatingLeaseCurrent),
    // Annual: an adjustment applied to a full-year FCF has to be a full year
    // of rent, not a quarter of it.
    fetchConcept(cik, SEC_CONCEPTS.operatingLeaseExpense, "annual"),
    fetchConcept(cik, SEC_CONCEPTS.shareBasedCompensation, "annual"),
  ]);

  // A multi-class issuer files its share counts by class only; the
  // filing itself is the only place the as-converted count exists.
  const weightedDilutedShares = undimensionedDilutedShares ?? (await fetchClassDilutedShares(cik));

  return {
    cik,
    dilutedShares: weightedDilutedShares ?? coverShares,
    coverShares,
    weightedDilutedShares,
    financialDebt,
    cash,
    operatingLeases: sumFacts(leaseNoncurrent, leaseCurrent),
    operatingLeaseExpense,
    shareBasedCompensation,
  };
}

/** Of two candidates for the same figure, the one describing a later period. */
export function pickFresher(
  a: SECFact | null,
  b: SECFact | null
): SECFact | null {
  if (!a) return b;
  if (!b) return a;
  return b.periodEnd.localeCompare(a.periodEnd) > 0 ? b : a;
}

/**
 * Adds two facts that make up one figure - the current and non-current halves
 * of debt, or of lease liabilities.
 *
 * The provenance kept is the older of the two, because that is how stale the
 * combined number really is. Reporting the fresher date would overstate how
 * current the total is.
 */
export function sumFacts(a: SECFact | null, b: SECFact | null): SECFact | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const older = a.filed <= b.filed ? a : b;
  const accession = a.accession === b.accession ? a.accession : [a.accession, b.accession].filter(Boolean).join(" + ") || undefined;
  return {
    value: a.value + b.value,
    form: older.form,
    filed: older.filed,
    periodEnd: older.periodEnd,
    concept: `${a.concept} + ${b.concept}`,
    durationDays: older.durationDays,
    ...(accession ? { accession } : {}),
  };
}
