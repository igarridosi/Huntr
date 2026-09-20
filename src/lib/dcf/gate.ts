import type { CashFlowStatement } from "@/types/financials";
import type { MarginHistory } from "@/lib/calculations/margin-history";
import type { SECFact } from "@/lib/api/sec-edgar";
import { statementFreeCashFlow } from "./free-cash-flow";
import type { RevenueBaseDivergence, RevenueBasis } from "./revenue-base";

/**
 * Five checks that run before an intrinsic value is shown.
 *
 * A warning printed next to a number already on screen gets read as a
 * footnote; that is how a valuation built on the wrong share count, the
 * wrong debt and the wrong revenue base each went out this week. When a
 * check fails the value is covered, with the reason on the cover, and
 * uncovered by a click that says the reader saw it. A check that cannot
 * be run — the figures to run it against are not on file — is reported
 * as such and does not cover the value: absence of proof is stated, not
 * treated as failure.
 */
export type CheckId = "marketCap" | "fcfQuarters" | "totalDebt" | "revenuePerimeter" | "marginRecord";
export type CheckStatus = "pass" | "fail" | "unverifiable";

export interface GateCheck {
  id: CheckId;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ValuationGate {
  checks: GateCheck[];
  /** True when any check failed: the value is covered until the reader uncovers it. */
  blocked: boolean;
  reasons: string[];
}

export const MARKET_CAP_TOLERANCE = 0.01;
export const FCF_QUARTERS_TOLERANCE = 0.02;
export const DEBT_TOLERANCE = 0.02;

export interface GateInput {
  shares: number;
  price: number;
  reportedMarketCap: number | null;
  /** The annual cash-flow rows and the quarterly ones the four-quarter check sums. */
  cashFlow: { annual: CashFlowStatement[]; quarterly: CashFlowStatement[] };
  /** The debt figure in use and the filed total, when there is one. */
  debtInUse: number;
  debtSource: string | null;
  filedDebt: SECFact | null;
  revenue: { basis: RevenueBasis; divergence: RevenueBaseDivergence | null; perimeterConfirmed: boolean };
  marginHistory: MarginHistory | null;
  lender: boolean;
}

const m = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
const sortAsc = <T extends { date: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The four quarterly rows that make up the fiscal year ending on `fyEnd`, if all four are on file and consecutive. */
export function quartersOfYear(quarterly: CashFlowStatement[], fyEnd: string): CashFlowStatement[] | null {
  const rows = sortAsc(quarterly);
  const last = rows.findIndex((r) => Math.abs(daysBetween(r.date, fyEnd)) <= 7);
  if (last < 3) return null;
  const four = rows.slice(last - 3, last + 1);
  for (let i = 1; i < 4; i++) {
    const gap = daysBetween(four[i - 1].date, four[i].date);
    if (gap < 75 || gap > 105) return null;
  }
  return four;
}

export function valuationGate(input: GateInput): ValuationGate {
  const checks: GateCheck[] = [];

  // 1. Shares × price has to land on the reported market cap.
  {
    const cap = input.reportedMarketCap;
    if (!cap || !(input.shares > 0) || !(input.price > 0)) {
      checks.push({ id: "marketCap", label: "Market cap = shares × price", status: "unverifiable", detail: "No reported market cap, share count or price to check." });
    } else {
      const implied = input.shares * input.price;
      const dev = implied / cap - 1;
      checks.push({
        id: "marketCap",
        label: "Market cap = shares × price",
        status: Math.abs(dev) <= MARKET_CAP_TOLERANCE ? "pass" : "fail",
        detail: `${m(implied)} from ${(input.shares / 1e6).toFixed(1)}M shares at $${input.price.toFixed(2)} against ${m(cap)} reported: ${(Math.abs(dev) * 100).toFixed(1)}% ${dev >= 0 ? "above" : "below"}.`,
      });
    }
  }

  // 2. The four quarters of the last fiscal year have to sum to the 10-K's free cash flow.
  {
    const fy = sortAsc(input.cashFlow.annual).at(-1);
    const four = fy ? quartersOfYear(input.cashFlow.quarterly, fy.date) : null;
    if (!fy || !four) {
      checks.push({ id: "fcfQuarters", label: "Four quarters of FCF = fiscal-year FCF", status: "unverifiable", detail: fy ? `The four quarters of the year to ${fy.date} are not all on file.` : "No annual cash flow on file." });
    } else {
      const annual = statementFreeCashFlow(fy, "annual").value;
      const summed = four.reduce((s, r) => s + statementFreeCashFlow(r, "quarterly").value, 0);
      const dev = annual !== 0 ? summed / annual - 1 : summed === 0 ? 0 : Infinity;
      checks.push({
        id: "fcfQuarters",
        label: "Four quarters of FCF = fiscal-year FCF",
        status: Math.abs(dev) <= FCF_QUARTERS_TOLERANCE ? "pass" : "fail",
        detail: `Quarters to ${fy.date} sum to ${m(summed)}; the year's row says ${m(annual)}${Number.isFinite(dev) ? ` (${(Math.abs(dev) * 100).toFixed(1)}% apart)` : ""}.`,
      });
    }
  }

  // 3. Total debt has to be the filed total: long-term, its current portion and short-term borrowings.
  {
    const filed = input.filedDebt;
    if (!filed) {
      checks.push({ id: "totalDebt", label: "Total debt = filed debt", status: "unverifiable", detail: "No filed debt to check against." });
    } else {
      const dev = filed.value !== 0 ? input.debtInUse / filed.value - 1 : input.debtInUse === 0 ? 0 : Infinity;
      const ok = Math.abs(dev) <= DEBT_TOLERANCE;
      checks.push({
        id: "totalDebt",
        label: "Total debt = filed debt",
        status: ok ? (filed.partial ? "unverifiable" : "pass") : "fail",
        detail: ok
          ? filed.partial
            ? `Matches the filing's ${m(filed.value)}, but that figure is one half of the debt (${filed.concept}).`
            : `${m(input.debtInUse)} in use; filing to ${filed.periodEnd} carries ${m(filed.value)} (${filed.concept}).`
          : `${m(input.debtInUse)} in use (${input.debtSource ?? "unknown source"}) against ${m(filed.value)} filed to ${filed.periodEnd} (${filed.concept}).`,
      });
    }
  }

  // 4. The revenue period has to describe the company as it is now.
  {
    const d = input.revenue.divergence;
    if (!d) {
      checks.push({ id: "revenuePerimeter", label: "Revenue period matches today's perimeter", status: "pass", detail: "Trailing twelve months and the closed year agree within 10%: no sign of a changed perimeter." });
    } else if (input.revenue.perimeterConfirmed) {
      checks.push({ id: "revenuePerimeter", label: "Revenue period matches today's perimeter", status: "pass", detail: `Bases ${(Math.abs(d.deviation) * 100).toFixed(1)}% apart; the reader confirmed the base in use describes today's perimeter.` });
    } else {
      checks.push({
        id: "revenuePerimeter",
        label: "Revenue period matches today's perimeter",
        status: "fail",
        detail: `Trailing twelve months (${m(d.ttm)}) and the closed year (${m(d.fiscalYear)}) are ${(Math.abs(d.deviation) * 100).toFixed(1)}% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.`,
      });
    }
  }

  // 5. There has to be a usable margin record.
  {
    const h = input.marginHistory;
    if (input.lender) {
      checks.push({ id: "marginRecord", label: "Usable margin record", status: "fail", detail: "A lender's or insurer's operating cash flow moves with its book, not its profitability: no FCF margin record to project from." });
    } else if (!h || h.series.length === 0) {
      checks.push({ id: "marginRecord", label: "Usable margin record", status: "unverifiable", detail: "No paired revenue and cash flow on file." });
    } else {
      checks.push({
        id: "marginRecord",
        label: "Usable margin record",
        status: h.comparable ? "pass" : "fail",
        detail: h.comparable ? `${h.series.length} years of realised margin, median ${((h.median ?? 0) * 100).toFixed(1)}%.` : h.reasons.join(" "),
      });
    }
  }

  const failed = checks.filter((c) => c.status === "fail");
  return { checks, blocked: failed.length > 0, reasons: failed.map((c) => `${c.label}: ${c.detail}`) };
}
