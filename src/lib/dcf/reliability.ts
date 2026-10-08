/**
 * How far the valuation can be trusted, given what it was built from.
 *
 * The checks, the provenance, the regimes and the warnings each say
 * something about the number; read one by one, they left the reader to add
 * them up. This adds them up, in three blocks, and says which deductions
 * cost the most and what would win the points back.
 *
 * It measures confidence in the calculation, not the attractiveness of the
 * stock: a dear company can score A and a cheap one D. It is informative
 * only and does not touch the decision or the position size.
 *
 *  - Data (40%): are the inputs facts? Provenance of the five inputs, the
 *    checks run before the value, figures converted or typed by hand.
 *  - Fit (35%): is a DCF the right tool for this company? Regimes, the
 *    length and steadiness of the margin record, negative free cash flow.
 *  - Robustness (25%): how much rides on fragile assumptions? Terminal
 *    weight, the WACC-to-growth spread, sensitivity to a point of WACC,
 *    a Base outside the record, the gap between Bear and Bull.
 */

import type { FieldProvenance, ProvenanceField } from "./provenance";
import type { GateCheck } from "./gate";
import type { RegimeId } from "./regime";

export type ReliabilityBlockId = "data" | "fit" | "robustness";
export type ReliabilityGrade = "A" | "B" | "C" | "D";

export interface ReliabilityDeduction {
  block: ReliabilityBlockId;
  /** What cost the points, in the words the panel uses. */
  label: string;
  /** Points off this block, 0-100. */
  points: number;
  /** What would win them back, when the reader can do something about it. */
  fix?: string;
}

export interface ReliabilityBlock {
  id: ReliabilityBlockId;
  label: string;
  weight: number;
  /** 0-100 within the block. */
  score: number;
  deductions: ReliabilityDeduction[];
}

export interface Reliability {
  /** 0-100, the weighted blocks. */
  score: number;
  grade: ReliabilityGrade;
  blocks: ReliabilityBlock[];
  /** The deductions that cost the most points on the total, largest first. */
  detractors: Array<ReliabilityDeduction & { totalPoints: number }>;
}

export interface ReliabilityInput {
  provenance: FieldProvenance[];
  /** Balance-sheet figures nobody could establish and the reader has not answered yet. */
  unresolved: number;
  checks: GateCheck[];
  regimes: RegimeId[];
  /** Statements converted from another currency, or an ADR ratio applied. */
  converted: boolean;
  marginRecord: {
    years: number;
    comparable: boolean;
    volatile: boolean;
    /** Years in the record with negative free cash flow. */
    negativeYears: number;
    latestNegative: boolean;
  } | null;
  /** PV of the terminal value over enterprise value, active scenario. */
  terminalWeight: number | null;
  /** WACC less terminal growth, active scenario. */
  spread: number | null;
  /** Fall in value per share for one more point of WACC, as a fraction of the value. */
  waccSensitivity: number | null;
  /** The Base's phase-1 growth above the fastest year on record. */
  growthAboveRecord: boolean;
  /** The Base's terminal margin above the best year on record. */
  terminalMarginAboveRecord: boolean;
  /** (Bull − Bear) / Base value. */
  dispersion: number | null;
}

export const RELIABILITY_WEIGHTS: Record<ReliabilityBlockId, number> = { data: 0.4, fit: 0.35, robustness: 0.25 };

/** The total never sits more than this above the model-fit block. */
export const FIT_CAP_MARGIN = 40;

/** How much each input weighs in the data block, out of 100. */
const PROVENANCE_WEIGHT: Record<ProvenanceField, number> = {
  baseRevenue: 20,
  fcfMargin: 20,
  netDebt: 20,
  sharesOutstanding: 25,
  currentPrice: 15,
};

const FIELD_LABEL: Record<ProvenanceField, string> = {
  baseRevenue: "Revenue base",
  fcfMargin: "FCF margin",
  netDebt: "Net debt",
  sharesOutstanding: "Share count",
  currentPrice: "Price",
};

/**
 * Credit for an input by where it came from. A live quote is the price by
 * definition; a figure typed or confirmed by the reader is an answer, but
 * one no document stands behind.
 */
function provenanceCredit(p: FieldProvenance): number {
  if (p.verified || p.source === "market") return 1;
  if (p.source === "manual") return 0.6;
  if (p.source === "sec" || p.source === "implied") return 0.75;
  if (p.source === "unavailable") return 0;
  return 0.5;
}

function provenanceFix(p: FieldProvenance): string | undefined {
  if (p.field === "baseRevenue" && p.source === "manual") return "Choose the trailing twelve months as the revenue base: it ties to the filings.";
  if (p.field === "netDebt" && p.source === "manual") return "A confirmed zero is an answer, not a filing: nothing to do if the company has no debt.";
  if (p.field === "sharesOutstanding" && p.source === "implied") return "Resolve the share count against the filing before relying on per-share figures.";
  return undefined;
}

const REGIME_PENALTY: Partial<Record<RegimeId, { points: number; label: string; fix?: string }>> = {
  lender: { points: 90, label: "Lender or insurer: free cash flow does not measure profitability", fix: "Value it on the EPS Multiple tab." },
  capexPeak: { points: 35, label: "Capex peak: free cash flow is depressed by investment", fix: "Cross-check on the EPS Multiple tab." },
  thinMargin: { points: 25, label: "Thin margin: half a point moves the value a lot" },
  shiftingPerimeter: { points: 25, label: "Material acquisition or disposal: the history describes another perimeter" },
  leveraged: { points: 15, label: "Leveraged: the debt takes a large share of the value" },
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

function block(id: ReliabilityBlockId, label: string, deductions: ReliabilityDeduction[]): ReliabilityBlock {
  const lost = deductions.reduce((sum, d) => sum + d.points, 0);
  return { id, label, weight: RELIABILITY_WEIGHTS[id], score: clamp(100 - lost), deductions };
}

export function gradeFor(score: number): ReliabilityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function assessReliability(input: ReliabilityInput): Reliability {
  // ── Data ─────────────────────────────────────────────────
  const data: ReliabilityDeduction[] = [];
  for (const p of input.provenance) {
    const lost = PROVENANCE_WEIGHT[p.field] * (1 - provenanceCredit(p));
    if (lost >= 0.5) {
      data.push({ block: "data", label: `${FIELD_LABEL[p.field]} not traced to a filing (${p.source})`, points: lost, fix: provenanceFix(p) });
    }
  }
  if (input.unresolved > 0) {
    data.push({
      block: "data",
      label: `${input.unresolved} balance-sheet figure${input.unresolved === 1 ? "" : "s"} missing`,
      points: 25 * input.unresolved,
      fix: "Enter the figure, or confirm the zero in the panel below.",
    });
  }
  for (const c of input.checks) {
    if (c.status === "fail") data.push({ block: "data", label: `Check failed: ${c.label}`, points: 15 });
    else if (c.status === "unverifiable") data.push({ block: "data", label: `Not verifiable: ${c.label}`, points: 3 });
  }
  if (input.converted) data.push({ block: "data", label: "Statements converted from another currency or per ADR", points: 5 });

  // ── Fit ──────────────────────────────────────────────────
  const fit: ReliabilityDeduction[] = [];
  for (const id of input.regimes) {
    const penalty = REGIME_PENALTY[id];
    if (penalty) fit.push({ block: "fit", label: penalty.label, points: penalty.points, fix: penalty.fix });
  }
  const record = input.marginRecord;
  if (!record || record.years === 0) {
    fit.push({ block: "fit", label: "No margin record to project from", points: 40 });
  } else {
    if (record.years < 3) fit.push({ block: "fit", label: `Only ${record.years} year${record.years === 1 ? "" : "s"} of margin record`, points: 30 });
    else if (record.years < 5) fit.push({ block: "fit", label: `${record.years} years of margin record, not five`, points: record.years === 3 ? 10 : 5 });
    if (!record.comparable) fit.push({ block: "fit", label: "Margin record not comparable across the window", points: 30 });
    else if (record.volatile) fit.push({ block: "fit", label: "Margin record swings by more than 15 points in a year", points: 10 });
    if (record.latestNegative) fit.push({ block: "fit", label: "Free cash flow negative in the latest year", points: 25 });
    else if (record.negativeYears > 0) fit.push({ block: "fit", label: `Free cash flow negative in ${record.negativeYears} year${record.negativeYears === 1 ? "" : "s"} of the record`, points: Math.min(20, 10 * record.negativeYears) });
  }

  // ── Robustness ───────────────────────────────────────────
  const robust: ReliabilityDeduction[] = [];
  const tw = input.terminalWeight;
  if (tw !== null && tw > 0.5) {
    // 0 at 50%, 20 at 65%, 35 at 80% and beyond.
    const points = tw <= 0.65 ? ((tw - 0.5) / 0.15) * 20 : 20 + (Math.min(tw, 0.8) - 0.65) / 0.15 * 15;
    robust.push({ block: "robustness", label: `${pct(tw)} of the value in the terminal`, points });
  }
  const s = input.spread;
  if (s !== null) {
    const multiple = s > 0 ? ` (${(1 / s).toFixed(0)}x exit)` : "";
    if (s < 0.03) robust.push({ block: "robustness", label: `WACC only ${(s * 100).toFixed(1)} points above terminal growth${multiple}`, points: 25 });
    else if (s < 0.04) robust.push({ block: "robustness", label: `WACC ${(s * 100).toFixed(1)} points above terminal growth${multiple}`, points: 15 });
    else if (s < 0.05) robust.push({ block: "robustness", label: `WACC ${(s * 100).toFixed(1)} points above terminal growth${multiple}`, points: 5 });
  }
  const ws = input.waccSensitivity;
  if (ws !== null) {
    if (ws > 0.25) robust.push({ block: "robustness", label: `One point of WACC moves the value ${pct(ws)}`, points: 20 });
    else if (ws > 0.15) robust.push({ block: "robustness", label: `One point of WACC moves the value ${pct(ws)}`, points: 10 });
  }
  if (input.growthAboveRecord) robust.push({ block: "robustness", label: "Base growth above the fastest year on record", points: 10 });
  if (input.terminalMarginAboveRecord) robust.push({ block: "robustness", label: "Base terminal margin above the best year on record", points: 10 });
  const d = input.dispersion;
  if (d !== null) {
    if (d > 2.5) robust.push({ block: "robustness", label: `Bull and Bear ${d.toFixed(1)}× the Base apart`, points: 15 });
    else if (d > 1.5) robust.push({ block: "robustness", label: `Bull and Bear ${d.toFixed(1)}× the Base apart`, points: 10 });
    else if (d > 1) robust.push({ block: "robustness", label: `Bull and Bear ${d.toFixed(1)}× the Base apart`, points: 5 });
  }

  const blocks = [
    block("data", "Data quality", data),
    block("fit", "Model fit", fit),
    block("robustness", "Robustness", robust),
  ];
  // A model that does not fit the company cannot be rescued by clean data:
  // a lender with every input filed is still a lender. The total stays within
  // 40 points of the fit.
  const weighted = blocks.reduce((sum, b) => sum + b.score * b.weight, 0);
  const score = Math.round(Math.min(weighted, blocks[1].score + FIT_CAP_MARGIN));
  const detractors = blocks
    .flatMap((b) => b.deductions.map((dd) => ({ ...dd, totalPoints: dd.points * b.weight })))
    .filter((dd) => dd.totalPoints >= 0.5)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 3);

  return { score, grade: gradeFor(score), blocks, detractors };
}
