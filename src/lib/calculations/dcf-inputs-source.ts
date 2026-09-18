import {
  type MarketCapCheck,
  type NetDebtBreakdown,
  type SECFact,
  type SECFundamentals,
  buildNetDebt,
  checkMarketCap,
  selectShareCount,
  MARKET_CAP_TOLERANCE,
  factAgeInDays,
  STALE_FACT_DAYS,
} from "@/lib/api/sec-edgar";

/**
 * Where a single figure came from, and how old it is.
 *
 * Provenance is carried per field rather than per company because that is how
 * it actually resolves: a US filer gives us a share count from a 10-Q and no
 * lease balance at all, and the interface should be able to say so field by
 * field instead of claiming the whole model is "from EDGAR".
 */
export interface SourcedValue {
  value: number;
  source: "sec" | "yahoo" | "unavailable" | "manual" | "implied";
  /**
   * False when `value` is a stand-in rather than a figure anyone reported.
   *
   * The distinction between "this company has no debt" and "we could not find
   * this company's debt" is invisible once both are the number 0, and the
   * second one is catastrophic: Honda came through with `financialDebt: 0`
   * against 5.07tn of cash, which the model read as 5.07tn of *net cash* and
   * added straight to equity value. Honda's debt-to-equity is 113.8%.
   *
   * A figure that is not resolved must not be allowed to participate in a
   * valuation, so this travels with the value everywhere it goes.
   */
  resolved: boolean;
  /** Set when the figure is known to be imprecise in a specific, nameable way. */
  caveat?: string;
  /** e.g. "10-Q, 3 May 2026". Null when the source does not date its figures. */
  asOf: string | null;
  /** True when the figure is older than a reporting quarter. */
  stale: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function describeFact(fact: SECFact, now: Date): { asOf: string; stale: boolean } {
  const filed = new Date(fact.filed);
  const readable = Number.isNaN(filed.getTime())
    ? fact.filed
    : DATE_FORMAT.format(filed);
  return {
    asOf: `${fact.form}, ${readable}`,
    stale: factAgeInDays(fact, now) > STALE_FACT_DAYS,
  };
}

/**
 * Prefers the filing, falls back to the scrape, and says which it used.
 *
 * A zero from EDGAR is treated as a real answer only when the company plausibly
 * reports zero; for the figures here (share count, cash, debt) a zero almost
 * always means the concept was not found, so it falls through to Yahoo rather
 * than silently zeroing out part of the valuation.
 */
export function pickSourced(
  fact: SECFact | null,
  yahooValue: number | null | undefined,
  now: Date = new Date(),
  options: { allowZero?: boolean } = {}
): SourcedValue {
  const allowZero = options.allowZero ?? false;

  if (fact && Number.isFinite(fact.value) && (allowZero || fact.value !== 0)) {
    const { asOf, stale } = describeFact(fact, now);
    return {
      value: fact.value,
      source: "sec",
      asOf,
      stale,
      resolved: true,
      caveat: fact.includesRestricted
        ? "Includes restricted cash — this issuer does not disclose the split, so part of this cannot actually be used to repay debt."
        : fact.partial
          ? "Only one half of this figure could be paired, so it understates."
          : undefined,
    };
  }

  if (typeof yahooValue === "number" && Number.isFinite(yahooValue)) {
    // Yahoo does not date its figures, so we cannot claim freshness we do not
    // know. Saying nothing is better than implying it is current.
    return {
      value: yahooValue,
      source: "yahoo",
      asOf: null,
      stale: false,
      resolved: true,
    };
  }

  return {
    value: 0,
    source: "unavailable",
    asOf: null,
    stale: false,
    resolved: false,
  };
}

/**
 * The balance-sheet fields a zero cannot be taken at face value for.
 *
 * Operating leases and stock compensation are left out deliberately: plenty of
 * companies genuinely report neither, so a zero there is an answer. Debt, cash
 * and the share count are different - an operating company has all three, and
 * a zero in any of them is far more likely to be a tag we failed to find than
 * a fact about the business.
 */
/**
 * Which share count the model is dividing by, and what the alternatives were.
 *
 * Every per-share figure is scaled by this one number, so getting it wrong is
 * wrong by a clean multiplicative factor - the least visible kind of error
 * there is. Two failure modes produce it, and they pull in opposite
 * directions:
 *
 *  - A multi-class issuer files the cover count per class, and EDGAR's
 *    companyfacts drops dimensional facts entirely. Alphabet has no cover
 *    concept at all; Visa's was abandoned in 2010. What survives is one class
 *    or a weighted average, and both undercount.
 *
 *  - The market cap can itself be wrong. Monster's filed count is 979.5M and
 *    the implied one is 1,959.1M - exactly 2.00x, the signature of a stock
 *    split that one side has not applied. Here the filing is right and
 *    deferring to the market cap would halve every per-share figure.
 *
 * So both candidates are kept, the interface says which is in use, and a
 * near-integer ratio is called out by name rather than being averaged over.
 */
export interface ShareCountResolution {
  /** Where the number in use came from. */
  basis: "filings" | "implied" | "manual";
  /** The count from the filings or the scrape. Null when nothing resolved. */
  filed: number | null;
  /** Market capitalisation divided by price. Null when either is missing. */
  implied: number | null;
  /** How far the filed count sits from the implied one, as a decimal. */
  deviation: number | null;
  /** implied / filed, when both exist. */
  ratio: number | null;
  /**
   * True when the ratio is within a whisker of a whole number ≥ 2.
   *
   * A missing share class produces an arbitrary ratio; a split or an ADR
   * ratio produces 2.00, 3.00, 4.00. The distinction decides which side to
   * believe, so it is worth naming.
   */
  splitLike: boolean;
}

/** How close to a whole number counts as "exactly" one. */
const INTEGER_RATIO_TOLERANCE = 0.02;

export function resolveShareCount(params: {
  filed: number | null;
  price: number;
  reportedMarketCap: number;
  /** The user's explicit choice, which beats the default either way. */
  preference?: "filings" | "implied";
  manual?: number | null;
  tolerance?: number;
}): ShareCountResolution & { value: number } {
  const { filed, price, reportedMarketCap, preference, manual } = params;
  const tolerance = params.tolerance ?? MARKET_CAP_TOLERANCE;

  // Rounded: shares are whole things, and a count carrying three decimals
  // reads as a bug even when the arithmetic is right.
  const implied =
    price > 0 && reportedMarketCap > 0
      ? Math.round(reportedMarketCap / price)
      : null;

  const deviation =
    filed !== null && filed > 0 && implied !== null && implied > 0
      ? (price * filed) / reportedMarketCap - 1
      : null;

  const ratio =
    filed !== null && filed > 0 && implied !== null ? implied / filed : null;

  const splitLike =
    ratio !== null &&
    ratio >= 1.5 &&
    Math.abs(ratio - Math.round(ratio)) <= INTEGER_RATIO_TOLERANCE;

  if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
    return { value: manual, basis: "manual", filed, implied, deviation, ratio, splitLike };
  }

  const agrees = deviation !== null && Math.abs(deviation) <= tolerance;

  // The requested default: when the filed count does not reconcile, the
  // market's own arithmetic wins, because that is the count every quoted
  // per-share figure is built on. The filing stays one click away.
  const basis: ShareCountResolution["basis"] =
    preference ??
    (implied !== null && filed !== null && !agrees ? "implied" : "filings");

  const value =
    basis === "implied" && implied !== null
      ? implied
      : (filed ?? implied ?? 0);

  return { value, basis, filed, implied, deviation, ratio, splitLike };
}

export const ZERO_SUSPECT_FIELDS = [
  "financialDebt",
  "cash",
  "sharesOutstanding",
] as const;

export type ZeroSuspectField = (typeof ZERO_SUSPECT_FIELDS)[number];

/**
 * Whether a zero on this field should be read as "not found".
 *
 * Two conditions, both needed. The figure has to be zero from somewhere other
 * than the filings - a zero that survived the EDGAR cascade is at least a zero
 * someone looked for. And there has to be evidence the rest of the balance
 * sheet did resolve, because a company where nothing at all came back is a
 * different failure and blocking on each field individually would say so three
 * times.
 */
export function isUnreportedZero(
  field: SourcedValue,
  otherFigures: readonly number[]
): boolean {
  if (!field.resolved) return true;
  if (field.source === "manual" || field.source === "sec") return false;
  if (field.value !== 0) return false;
  return otherFigures.some((value) => Number.isFinite(value) && value !== 0);
}

export interface SourcedDCFFields {
  sharesOutstanding: SourcedValue;
  financialDebt: SourcedValue;
  cash: SourcedValue;
  operatingLeases: SourcedValue;
  shareBasedCompensation: SourcedValue;
  netDebt: NetDebtBreakdown;
  marketCapCheck: MarketCapCheck | null;
  /** True when at least one figure came from the filings. */
  usesSEC: boolean;
  /** Which share count is in use, and what the alternatives were. */
  shareCount: ShareCountResolution;
  /**
   * Fields whose value is a stand-in, in the order the panel lists them.
   *
   * Non-empty means the valuation must not be shown. The user resolves it by
   * supplying the figure or by confirming the zero, either of which arrives
   * back as an override.
   */
  unresolved: ZeroSuspectField[];
}

/**
 * Assembles the balance-sheet side of the model, field by field, with sources.
 *
 * The share count is always the diluted one where EDGAR has it. Basic counts
 * ignore options and restricted units, which overstates value per share
 * systematically - never dramatically enough to look wrong, which is what makes
 * it worth being deliberate about.
 */
export function buildSourcedFields(params: {
  sec: SECFundamentals | null;
  yahoo: {
    sharesOutstanding?: number | null;
    totalDebt?: number | null;
    cash?: number | null;
    shareBasedCompensation?: number | null;
  };
  price: number;
  reportedMarketCap: number;
  includeLeases?: boolean;
  /**
   * Figures the user supplied by hand, which win over both sources.
   *
   * This is also how a zero gets confirmed: an override of 0 is someone
   * saying "the company really has none", which is a different statement from
   * a 0 nobody vouched for, and only the first one may be valued on.
   */
  overrides?: Partial<Record<ZeroSuspectField, number>>;
  /** Which share count to divide by, when the user has picked one. */
  shareCountBasis?: "filings" | "implied";
  now?: Date;
}): SourcedDCFFields {
  const {
    sec,
    yahoo,
    price,
    reportedMarketCap,
    overrides = {},
    shareCountBasis,
    now = new Date(),
  } = params;

  const withOverride = (
    field: ZeroSuspectField,
    sourced: SourcedValue
  ): SourcedValue => {
    const override = overrides[field];
    if (typeof override !== "number" || !Number.isFinite(override)) return sourced;
    return {
      value: override,
      source: "manual",
      asOf: null,
      stale: false,
      resolved: true,
    };
  };

  // The diluted count of the latest quarterly filing; the market-cap
  // cross-check reports how far it drifts, it does not pick.
  const filedShares = sec ? selectShareCount(sec.coverShares, sec.weightedDilutedShares) : null;
  const sharesOutstandingSourced = pickSourced(
    filedShares ?? sec?.dilutedShares ?? null,
    yahoo.sharesOutstanding,
    now
  );
  const financialDebtSourced = pickSourced(
    sec?.financialDebt ?? null,
    yahoo.totalDebt,
    now
  );
  const cashSourced = pickSourced(sec?.cash ?? null, yahoo.cash, now);

  /**
   * The denominator, chosen rather than assumed.
   *
   * Until now a filed count that disagreed with the market cap by a fifth
   * produced a warning and was then divided by anyway, which is the alarm
   * standing in for the fix again.
   */
  const shareCount = resolveShareCount({
    filed: sharesOutstandingSourced.resolved ? sharesOutstandingSourced.value : null,
    price,
    reportedMarketCap,
    preference: shareCountBasis,
    manual: overrides.sharesOutstanding ?? null,
  });

  const sharesOutstanding: SourcedValue =
    shareCount.basis === "manual"
      ? withOverride("sharesOutstanding", sharesOutstandingSourced)
      : shareCount.basis === "implied"
        ? {
            value: shareCount.value,
            source: "implied",
            asOf: null,
            stale: false,
            resolved: true,
          }
        : sharesOutstandingSourced;
  const financialDebt = withOverride("financialDebt", financialDebtSourced);
  const cash = withOverride("cash", cashSourced);
  // A company with no leases legitimately reports nothing here, and there is no
  // Yahoo field to fall back to, so zero is the honest answer.
  const operatingLeases = pickSourced(sec?.operatingLeases ?? null, 0, now, {
    allowZero: true,
  });
  const shareBasedCompensation = pickSourced(
    sec?.shareBasedCompensation ?? null,
    yahoo.shareBasedCompensation,
    now,
    { allowZero: true }
  );

  /**
   * Which of the three could not be established.
   *
   * Each field is judged against the other two: a zero debt figure alongside
   * a real cash balance means the debt tag was not found, whereas a company
   * where nothing resolved is a different failure and does not need saying
   * three times.
   */
  const unresolved = ZERO_SUSPECT_FIELDS.filter((field) => {
    const candidates = { sharesOutstanding, financialDebt, cash };
    const others = ZERO_SUSPECT_FIELDS.filter((other) => other !== field).map(
      (other) => candidates[other].value
    );
    return isUnreportedZero(candidates[field], others);
  });

  const netDebt = buildNetDebt({
    financialDebt: financialDebt.value,
    operatingLeases: operatingLeases.value,
    cash: cash.value,
    includeLeases: params.includeLeases,
  });

  return {
    sharesOutstanding,
    financialDebt,
    cash,
    operatingLeases,
    shareBasedCompensation,
    netDebt,
    // Always measured against the *filed* count, never the one in use.
    // Checking the implied count against the market cap it was derived from
    // is a tautology, and it would make the disagreement vanish from the
    // screen at the exact moment the model started working around it.
    marketCapCheck: checkMarketCap(
      price,
      shareCount.filed ?? sharesOutstanding.value,
      reportedMarketCap
    ),
    usesSEC: [
      sharesOutstanding,
      financialDebt,
      cash,
      operatingLeases,
      shareBasedCompensation,
    ].some((field) => field.source === "sec"),
    shareCount,
    unresolved,
  };
}

/**
 * Replaces the balance-sheet half of every scenario with the sourced figures.
 *
 * Applied after the scenario generator rather than inside it: the generator is
 * verified and its job is the operating assumptions - growth, margins, WACC.
 * Share count, debt and cash are not assumptions at all, they are facts the
 * model reads, and the same facts belong in all three scenarios. Overriding
 * here keeps the two concerns apart.
 */
export function applySourcedBalanceSheet<
  T extends {
    totalDebt: number;
    cashAndEquivalents: number;
    sharesOutstanding: number;
  },
>(inputs: T, fields: SourcedDCFFields): T {
  return {
    ...inputs,
    // Net debt is expressed to the model as debt-minus-cash, so leases ride in
    // on the debt side and the cash line stays what it is. Passing the netted
    // figure straight through would lose the breakdown the panel shows.
    totalDebt:
      fields.netDebt.financialDebt +
      (fields.netDebt.includesLeases ? fields.netDebt.operatingLeases : 0),
    cashAndEquivalents: fields.netDebt.cash,
    sharesOutstanding:
      fields.sharesOutstanding.value > 0
        ? fields.sharesOutstanding.value
        : inputs.sharesOutstanding,
  };
}

/**
 * The fields of `DCFInputs` that describe the company rather than a view of it.
 *
 * The distinction is the whole of BUG A. Growth, margins, WACC and the
 * terminal rate are opinions, and Bear, Base and Bull are supposed to disagree
 * about them. Revenue base, debt, cash and the share count are not opinions:
 * one company has one balance sheet, and if the three scenarios disagree about
 * it they are no longer three views of the same business - they are three
 * different companies, and ranking them tells you nothing.
 *
 * Nothing enforces this in the type system, because all eight live in the same
 * flat object that `runDCF` consumes. So it is enforced here instead: one list,
 * one comparison function, and an invariant checked on every export.
 */
export const COMPANY_FACT_KEYS = [
  "baseRevenue",
  "totalDebt",
  "cashAndEquivalents",
  "sharesOutstanding",
  // The market's price is not an assumption either. It belongs here because a
  // scenario holding a different one produces a different upside for the same
  // valuation - and a scenario holding zero produces an upside of zero, which
  // is what made three of four THC scenarios look like they broke even.
  "currentPrice",
] as const;

export type CompanyFactKey = (typeof COMPANY_FACT_KEYS)[number];
export type CompanyFacts = Record<CompanyFactKey, number>;

export function readCompanyFacts(inputs: CompanyFacts): CompanyFacts {
  return {
    baseRevenue: inputs.baseRevenue,
    totalDebt: inputs.totalDebt,
    cashAndEquivalents: inputs.cashAndEquivalents,
    sharesOutstanding: inputs.sharesOutstanding,
    currentPrice: inputs.currentPrice,
  };
}

export function applyCompanyFacts<T extends CompanyFacts>(
  inputs: T,
  facts: CompanyFacts
): T {
  return { ...inputs, ...facts };
}

export interface CompanyFactDivergence {
  scenario: string;
  field: CompanyFactKey;
  expected: number;
  found: number;
}

/**
 * Every place a scenario disagrees with the company about a fact.
 *
 * Returns the list rather than throwing: an export that refuses to write is
 * worse than one that writes the corrected figures and says what it corrected.
 */
export function findCompanyFactDivergence(
  reference: CompanyFacts,
  candidates: ReadonlyArray<{ scenario: string; facts: CompanyFacts }>
): CompanyFactDivergence[] {
  const divergences: CompanyFactDivergence[] = [];

  for (const candidate of candidates) {
    for (const field of COMPANY_FACT_KEYS) {
      const expected = reference[field];
      const found = candidate.facts[field];
      // Exact comparison on purpose. These are copied, never recomputed, so
      // any difference at all is a bug rather than floating-point drift.
      if (found !== expected) {
        divergences.push({ scenario: candidate.scenario, field, expected, found });
      }
    }
  }

  return divergences;
}
