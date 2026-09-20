import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";
import type { CashFlowStatement, IncomeStatement } from "@/types/financials";
import type { RevenueBasis } from "./revenue-base";
import { statementFreeCashFlow } from "./free-cash-flow";

/**
 * Where each of the five model inputs came from, down to the filing.
 *
 * The engine reproduces its arithmetic to the cent; every failure of the
 * week of 14 September 2026 was in what fed it. So each input carries
 * its value, its source, the document it can be traced to with the
 * accession number, the period it covers and the close it runs to — and
 * a field that cannot be traced to a document is marked unverified
 * rather than presented like the others.
 */
export type ProvenanceField = "baseRevenue" | "fcfMargin" | "netDebt" | "sharesOutstanding" | "currentPrice";
export type ProvenanceSource = "sec" | "yahoo" | "alphavantage" | "market" | "manual" | "implied" | "unavailable";

export interface FieldProvenance {
  field: ProvenanceField;
  value: number;
  source: ProvenanceSource;
  /** The filing, when the figure traces to one. */
  document: { form: string; accession: string | null; filed: string | null } | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** True only when the figure ties to a filed document (or, for the price, to the market cap). */
  verified: boolean;
  /** Why it is or is not verified, in one line. */
  note: string;
}

/** Within this, a statement figure and the filed one are the same figure. */
export const VERIFY_TOLERANCE = 0.01;

const doc = (fact: SECFact | null | undefined) => (fact ? { form: fact.form, accession: fact.accession ?? null, filed: fact.filed } : null);
const within = (a: number, b: number, tol = VERIFY_TOLERANCE) => b !== 0 && Math.abs(a / b - 1) <= tol;

export interface ProvenanceInput {
  inputs: { baseRevenue: number; baseFCFMargin: number; totalDebt: number; cashAndEquivalents: number; sharesOutstanding: number; currentPrice: number };
  revenue: { basis: RevenueBasis; periodStart: string | null; periodEnd: string | null; source: "yahoo" | "alphavantage" | null };
  /** The latest annual cash-flow row the margin was read from, and the income row of the same year. */
  marginRows: { cash: CashFlowStatement | null; income: IncomeStatement | null };
  fields: SourcedDCFFields | null;
  sec: SECFundamentals | null;
  quote: { price: number; marketCap: number; asOf: string | null } | null;
}

export function buildProvenance(p: ProvenanceInput): FieldProvenance[] {
  const out: FieldProvenance[] = [];
  const m = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);

  // Revenue base: the statements' figure, verified against the filed twelve months.
  {
    const filed = p.sec?.revenueTtm ?? null;
    const sameWindow = !!filed && p.revenue.periodEnd === filed.periodEnd;
    const ties = !!filed && sameWindow && within(p.inputs.baseRevenue, filed.value);
    out.push({
      field: "baseRevenue",
      value: p.inputs.baseRevenue,
      source: p.revenue.basis === "manual" ? "manual" : (p.revenue.source ?? "unavailable"),
      document: ties ? { form: filed.method, accession: filed.accessions.join(" + ") || null, filed: null } : null,
      periodStart: p.revenue.periodStart,
      periodEnd: p.revenue.periodEnd,
      verified: ties,
      note: ties
        ? `Ties to the filings' twelve months (${m(filed.value)}, ${filed.method}).`
        : filed
          ? sameWindow
            ? `Filings give ${m(filed.value)} for the same window — ${((p.inputs.baseRevenue / filed.value - 1) * 100).toFixed(1)}% apart.`
            : `Filings' latest twelve months run to ${filed.periodEnd}, this figure to ${p.revenue.periodEnd ?? "?"}.`
          : "No filed revenue to check against.",
    });
  }

  // FCF margin: numerator verified against the 10-K's operating cash flow; capex on the defined basis by source.
  {
    const cash = p.marginRows.cash;
    const filedOcf = p.sec?.operatingCashFlowAnnual ?? null;
    const fcf = cash ? statementFreeCashFlow(cash, "annual") : null;
    const ocfTies = !!cash && !!filedOcf && filedOcf.periodEnd === cash.date && within(cash.operating_cash_flow, filedOcf.value);
    const verified = ocfTies && !!fcf?.defined;
    out.push({
      field: "fcfMargin",
      value: p.inputs.baseFCFMargin,
      source: (cash?.source as ProvenanceSource | undefined) ?? "unavailable",
      document: ocfTies ? doc(filedOcf) : null,
      periodStart: null,
      periodEnd: cash?.date ?? null,
      verified,
      note: !cash
        ? "No cash-flow statement on file."
        : !fcf?.defined
          ? `Capex from ${cash.source ?? "an unknown source"} is not on the defined basis (plant plus intangibles); the margin is unverified.`
          : ocfTies
            ? `Operating cash flow ties to the 10-K (${m(filedOcf!.value)}); capex is plant plus intangibles per ${cash.source}.`
            : filedOcf
              ? `10-K operating cash flow ${m(filedOcf.value)} to ${filedOcf.periodEnd} does not tie to the statement's ${m(cash.operating_cash_flow)} to ${cash.date}.`
              : "No filed operating cash flow to check against.",
    });
  }

  // Net debt: debt and cash, each from the filing or not.
  {
    const debt = p.fields?.financialDebt;
    const cash = p.fields?.cash;
    const secDebt = p.sec?.financialDebt ?? null;
    const secCash = p.sec?.cash ?? null;
    const debtFromSec = debt?.source === "sec" && !!secDebt;
    const cashFromSec = cash?.source === "sec" && !!secCash;
    const verified = debtFromSec && cashFromSec;
    const source: ProvenanceSource = debt?.source === "manual" || cash?.source === "manual" ? "manual" : verified ? "sec" : debt?.source === "yahoo" || cash?.source === "yahoo" ? "yahoo" : "unavailable";
    out.push({
      field: "netDebt",
      value: p.inputs.totalDebt - p.inputs.cashAndEquivalents,
      source,
      document: verified ? { form: secDebt!.form, accession: [secDebt!.accession, secCash!.accession].filter(Boolean).join(" + ") || null, filed: secDebt!.filed } : null,
      periodStart: null,
      periodEnd: verified ? secDebt!.periodEnd : (debt?.asOf ?? null),
      verified,
      note: verified
        ? `Debt ${m(secDebt!.value)} (${secDebt!.concept}) and cash ${m(secCash!.value)} from the filing to ${secDebt!.periodEnd}${secDebt!.partial ? " — debt marked partial" : ""}.`
        : `Debt from ${debt?.source ?? "nowhere"}, cash from ${cash?.source ?? "nowhere"}: not both traced to a filing.`,
    });
  }

  // Shares: the diluted count of the latest filing, or whatever stood in.
  {
    const sc = p.fields?.shareCount;
    const fact = p.sec?.dilutedShares ?? null;
    const fromFiling = sc?.basis === "filings" && !!fact && p.fields?.sharesOutstanding.source === "sec";
    out.push({
      field: "sharesOutstanding",
      value: p.inputs.sharesOutstanding,
      source: sc?.basis === "manual" ? "manual" : sc?.basis === "implied" ? "implied" : fromFiling ? "sec" : (p.fields?.sharesOutstanding.source as ProvenanceSource | undefined) ?? "unavailable",
      document: fromFiling ? doc(fact) : null,
      periodStart: null,
      periodEnd: fromFiling ? fact!.periodEnd : null,
      verified: fromFiling,
      note: fromFiling
        ? `${fact!.concept}, ${fact!.form} to ${fact!.periodEnd}.`
        : sc?.basis === "implied"
          ? "Implied from the market cap at today's price — not a filed count."
          : sc?.basis === "manual"
            ? "Entered by hand."
            : "Not traced to a filing.",
    });
  }

  // Price: a market figure, never a document; verified by the market cap it has to reproduce.
  {
    const q = p.quote;
    const ties = !!q && q.marketCap > 0 && within(p.inputs.sharesOutstanding * p.inputs.currentPrice, q.marketCap);
    out.push({
      field: "currentPrice",
      value: p.inputs.currentPrice,
      source: q ? "market" : "unavailable",
      document: null,
      periodStart: null,
      periodEnd: q?.asOf ?? null,
      verified: ties,
      note: !q
        ? "No quote."
        : ties
          ? `Shares × price reproduces the reported market cap (${m(q.marketCap)}) within 1%.`
          : `Shares × price = ${m(p.inputs.sharesOutstanding * p.inputs.currentPrice)} against a reported market cap of ${m(q.marketCap)}.`,
    });
  }

  return out;
}
