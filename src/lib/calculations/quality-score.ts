/**
 * Quality Score Engine — Huntr
 *
 * Converts fundamental financial data into a composite quality grade (A–F)
 * across five dimensions. Each dimension returns a 0–100 score, then a
 * weighted average produces the overall grade.
 *
 * Methodology is inspired by institutional quality factors (ROIC, FCF
 * conversion, leverage, margin durability) while remaining transparent
 * and explainable.
 */

import type { CompanyFinancials } from "@/types/financials";
import type { StockQuote } from "@/types/stock";
import {
  calculateROIC,
  calculateGrossMargin,
  calculateOperatingMargin,
  calculateNetMargin,
  calculateFCFMargin,
  calculateAllCAGRs,
  calculateFCFYield,
} from "@/lib/calculations";

// ─── Public types ──────────────────────────────────────────────────────────

export type QualityGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface QualityMetric {
  label: string;
  value: string;
  /** 0–100 */
  score: number;
  tooltip: string;
}

export interface QualityDimension {
  key: string;
  name: string;
  /** 0–100 weighted average of sub-metrics */
  score: number;
  grade: QualityGrade;
  metrics: QualityMetric[];
  /** One-line summary visible at a glance */
  summary: string;
}

export interface QualityScoreResult {
  /** 0–100 */
  overall: number;
  grade: QualityGrade;
  /** Text used in the headline badge */
  headline: string;
  dimensions: [
    QualityDimension, // Profitability
    QualityDimension, // Growth
    QualityDimension, // Financial Health
    QualityDimension, // Cash Generation
    QualityDimension, // Capital Allocation
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Clamp to [0, 100] */
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Linearly interpolate a score given a set of thresholds.
 * thresholds: [[value, score], ...] sorted ascending by value.
 * Below first threshold → 0. Above last → 100.
 */
function scoreFromThresholds(
  value: number,
  thresholds: [number, number][]
): number {
  if (thresholds.length === 0) return 0;
  if (value <= thresholds[0][0]) return 0;
  if (value >= thresholds[thresholds.length - 1][0])
    return thresholds[thresholds.length - 1][1];

  for (let i = 1; i < thresholds.length; i++) {
    const [v0, s0] = thresholds[i - 1];
    const [v1, s1] = thresholds[i];
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0);
      return clamp(s0 + t * (s1 - s0));
    }
  }
  return 0;
}

function weightedAvg(scores: [number, number][]): number {
  const totalWeight = scores.reduce((s, [, w]) => s + w, 0);
  if (totalWeight === 0) return 0;
  return scores.reduce((s, [score, w]) => s + score * w, 0) / totalWeight;
}

export function gradeFromScore(score: number): QualityGrade {
  if (score >= 90) return "A+";
  if (score >= 78) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function pct(v: number | null): string {
  if (v === null) return "N/A";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtX(v: number | null): string {
  if (v === null) return "N/A";
  return `${v.toFixed(1)}x`;
}
function fmtRaw(v: number | null, decimals = 1): string {
  if (v === null) return "N/A";
  return v.toFixed(decimals);
}

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// ─── Dimension calculators ───────────────────────────────────────────────────

function scoreProfitability(
  financials: CompanyFinancials
): QualityDimension {
  const annual = sortByDateAsc(financials.income_statement.annual);
  const balance = sortByDateAsc(financials.balance_sheet.annual);
  const latest = annual.at(-1);
  const latestBal = balance.at(-1);

  // ROIC
  const roic =
    latest && latestBal
      ? calculateROIC({
          operating_income: latest.operating_income,
          income_tax: latest.income_tax,
          pre_tax_income: latest.pre_tax_income,
          total_equity: latestBal.total_equity,
          long_term_debt: latestBal.long_term_debt,
          cash_and_equivalents: latestBal.cash_and_equivalents,
        })
      : null;

  const grossMargin = latest
    ? calculateGrossMargin(latest.gross_profit, latest.revenue)
    : null;
  const opMargin = latest
    ? calculateOperatingMargin(latest.operating_income, latest.revenue)
    : null;
  const netMargin = latest
    ? calculateNetMargin(latest.net_income, latest.revenue)
    : null;

  // Margin trend: compare last 3 years net margin avg vs first 3 years
  const recent3 = annual.slice(-3);
  const first3 = annual.slice(0, 3);
  const avgRecentMargin =
    recent3.length > 0
      ? recent3
          .map((is) => (is.revenue > 0 ? is.net_income / is.revenue : null))
          .filter((v): v is number => v !== null)
          .reduce((s, v, _, a) => s + v / a.length, 0)
      : null;
  const avgOldMargin =
    first3.length > 0
      ? first3
          .map((is) => (is.revenue > 0 ? is.net_income / is.revenue : null))
          .filter((v): v is number => v !== null)
          .reduce((s, v, _, a) => s + v / a.length, 0)
      : null;

  const marginTrendScore =
    avgRecentMargin !== null && avgOldMargin !== null
      ? avgRecentMargin > avgOldMargin
        ? 80
        : avgRecentMargin > avgOldMargin * 0.85
          ? 50
          : 20
      : 50;

  const roicScore = scoreFromThresholds(roic ?? -1, [
    [0.0, 10], [0.05, 30], [0.08, 45], [0.12, 60], [0.15, 75], [0.20, 90], [0.30, 100],
  ]);
  const grossScore = scoreFromThresholds(grossMargin ?? 0, [
    [0.1, 10], [0.2, 30], [0.3, 50], [0.4, 70], [0.5, 85], [0.6, 95], [0.7, 100],
  ]);
  const opScore = scoreFromThresholds(opMargin ?? -0.5, [
    [0.0, 10], [0.05, 30], [0.10, 50], [0.15, 65], [0.20, 80], [0.25, 90], [0.35, 100],
  ]);
  const netScore = scoreFromThresholds(netMargin ?? -0.5, [
    [0.0, 10], [0.03, 25], [0.07, 45], [0.12, 65], [0.18, 80], [0.25, 95], [0.30, 100],
  ]);

  const score = clamp(
    weightedAvg([
      [roicScore, 35],
      [grossScore, 20],
      [opScore, 20],
      [netScore, 15],
      [marginTrendScore, 10],
    ])
  );

  const hasTrendData = avgRecentMargin !== null && avgOldMargin !== null;
  const trendLabel = hasTrendData
    ? avgRecentMargin! > avgOldMargin!
      ? "Improving"
      : "Declining"
    : "Stable";

  return {
    key: "profitability",
    name: "Profitability",
    score,
    grade: gradeFromScore(score),
    summary:
      roic !== null
        ? `ROIC ${pct(roic)} · Net Margin ${pct(netMargin)} · ${trendLabel}`
        : "Insufficient data",
    metrics: [
      {
        label: "ROIC",
        value: pct(roic),
        score: roicScore,
        tooltip: "ROIC (TTM) = NOPAT ÷ Invested Capital. > 15% signals a durable competitive moat.",
      },
      {
        label: "Gross Margin",
        value: pct(grossMargin),
        score: grossScore,
        tooltip: "Gross Margin (TTM) = Gross Profit ÷ Revenue. High margins signal pricing power.",
      },
      {
        label: "Operating Margin",
        value: pct(opMargin),
        score: opScore,
        tooltip: "Operating Margin (TTM) = Operating Income ÷ Revenue. Reflects operational efficiency before interest and taxes.",
      },
      {
        label: "Net Margin",
        value: pct(netMargin),
        score: netScore,
        tooltip: "Net Margin (TTM) = Net Income ÷ Revenue. Bottom-line GAAP profitability after all costs.",
      },
      {
        label: "Margin Trend",
        value: trendLabel,
        score: marginTrendScore,
        tooltip: "Margin Trend: average net margin of last 3 annual periods vs prior 3 years — shows structural profitability direction.",
      },
    ],
  };
}

function scoreGrowth(financials: CompanyFinancials): QualityDimension {
  const annual = sortByDateAsc(financials.income_statement.annual);
  const cashflow = sortByDateAsc(financials.cash_flow.annual);

  const revenueSeries = annual.map((is) => is.revenue);
  const epsSeries = annual
    .map((is) => is.eps_diluted)
    .filter((v) => v > 0);
  const fcfSeries = cashflow
    .map((cf) => cf.free_cash_flow)
    .filter((v) => v > 0);

  const revCAGR = calculateAllCAGRs(revenueSeries);
  const epsCAGR = calculateAllCAGRs(epsSeries);
  const fcfCAGR = calculateAllCAGRs(fcfSeries);

  const bestRevCAGR = revCAGR.cagr5Y ?? revCAGR.cagr3Y;
  const bestEpsCAGR = epsCAGR.cagr5Y ?? epsCAGR.cagr3Y;
  const bestFcfCAGR = fcfCAGR.cagr5Y ?? fcfCAGR.cagr3Y;

  const revScore = scoreFromThresholds(bestRevCAGR ?? 0, [
    [0.0, 20], [0.03, 35], [0.05, 50], [0.08, 65], [0.12, 80], [0.18, 92], [0.25, 100],
  ]);
  const epsScore = scoreFromThresholds(bestEpsCAGR ?? 0, [
    [0.0, 15], [0.05, 35], [0.08, 50], [0.12, 65], [0.15, 80], [0.20, 92], [0.30, 100],
  ]);
  const fcfScore = scoreFromThresholds(bestFcfCAGR ?? 0, [
    [0.0, 15], [0.03, 30], [0.07, 50], [0.12, 65], [0.18, 82], [0.25, 95], [0.30, 100],
  ]);

  const hasData =
    bestRevCAGR !== null || bestEpsCAGR !== null || bestFcfCAGR !== null;

  const score = hasData
    ? clamp(
        weightedAvg([
          [revScore, 35],
          [epsScore, 35],
          [fcfScore, 30],
        ])
      )
    : 0;

  return {
    key: "growth",
    name: "Growth",
    score,
    grade: gradeFromScore(score),
    summary: hasData
      ? `Rev ${pct(bestRevCAGR)} · EPS ${pct(bestEpsCAGR)} · FCF ${pct(bestFcfCAGR)} (5Y CAGR)`
      : "Insufficient data",
    metrics: [
      {
        label: "Revenue CAGR",
        value: `${pct(bestRevCAGR)} (5Y)`,
        score: revScore,
        tooltip: "Revenue CAGR (5Y): Compound Annual Growth Rate of revenue over 5 annual periods. >10% signals healthy expansion.",
      },
      {
        label: "EPS CAGR",
        value: `${pct(bestEpsCAGR)} (5Y)`,
        score: epsScore,
        tooltip: "EPS Diluted CAGR (5Y, GAAP): EPS growth over 5 annual periods. Growing faster than revenue signals margin expansion.",
      },
      {
        label: "FCF CAGR",
        value: `${pct(bestFcfCAGR)} (5Y)`,
        score: fcfScore,
        tooltip: "FCF CAGR (5Y): Compound Annual Growth Rate of Free Cash Flow. Harder to manipulate than earnings — the gold standard of quality growth.",
      },
    ],
  };
}

function scoreFinancialHealth(
  financials: CompanyFinancials
): QualityDimension {
  const balance = sortByDateAsc(financials.balance_sheet.annual);
  const income = sortByDateAsc(financials.income_statement.annual);
  const latest = balance.at(-1);
  const latestIncome = income.at(-1);

  if (!latest) {
    return {
      key: "financialHealth",
      name: "Financial Health",
      score: 0,
      grade: "F",
      summary: "Insufficient data",
      metrics: [],
    };
  }

  // Debt/Equity
  const debtEquity =
    latest.total_equity > 0
      ? latest.long_term_debt / latest.total_equity
      : null;

  // Net Debt / EBITDA
  const netDebt = latest.long_term_debt - latest.cash_and_equivalents;
  const netDebtToEBITDA =
    latestIncome && latestIncome.ebitda > 0
      ? netDebt / latestIncome.ebitda
      : null;

  // Interest coverage
  const interestCoverage =
    latestIncome && Math.abs(latestIncome.interest_expense) > 0
      ? latestIncome.operating_income / Math.abs(latestIncome.interest_expense)
      : null;

  // Current ratio proxy: current assets / current liabilities
  const currentRatio =
    latest.total_current_liabilities > 0
      ? latest.total_current_assets / latest.total_current_liabilities
      : null;

  const debtScore = debtEquity !== null
    ? scoreFromThresholds(debtEquity, [
        [0, 100], [0.3, 90], [0.5, 80], [0.8, 65], [1.2, 45], [2.0, 25], [3.0, 10],
      ])
    : 50;

  const netDebtScore =
    netDebtToEBITDA !== null
      ? netDebt <= 0
        ? 100 // net cash position
        : scoreFromThresholds(netDebtToEBITDA, [
            [0, 100], [1, 85], [2, 70], [3, 50], [4, 30], [6, 10],
          ])
      : 60;

  const coverageScore =
    interestCoverage !== null
      ? scoreFromThresholds(interestCoverage, [
          [0, 5], [2, 20], [3, 40], [5, 60], [8, 75], [12, 90], [20, 100],
        ])
      : 70; // assume safe if no interest expense

  const currentRatioScore =
    currentRatio !== null
      ? scoreFromThresholds(currentRatio, [
          [0.5, 10], [0.8, 30], [1.0, 55], [1.5, 80], [2.0, 95], [3.0, 100],
        ])
      : 60;

  const score = clamp(
    weightedAvg([
      [debtScore, 30],
      [netDebtScore, 30],
      [coverageScore, 25],
      [currentRatioScore, 15],
    ])
  );

  return {
    key: "financialHealth",
    name: "Financial Health",
    score,
    grade: gradeFromScore(score),
    summary:
      debtEquity !== null
        ? `D/E ${fmtRaw(debtEquity)}x · Coverage ${fmtX(interestCoverage)} · ${netDebt <= 0 ? "Net Cash" : `Net Debt/EBITDA ${fmtX(netDebtToEBITDA)}`}`
        : "Insufficient data",
    metrics: [
      {
        label: "Debt / Equity",
        value: fmtX(debtEquity),
        score: debtScore,
        tooltip: "Long-term Debt / Shareholders' Equity. < 0.5x is conservative; > 2x raises risk flags.",
      },
      {
        label: "Net Debt / EBITDA",
        value: netDebt <= 0 ? "Net Cash" : fmtX(netDebtToEBITDA),
        score: netDebtScore,
        tooltip: "How many years of EBITDA to repay net debt. < 2x is healthy; > 4x is concerning.",
      },
      {
        label: "Interest Coverage",
        value: fmtX(interestCoverage),
        score: coverageScore,
        tooltip: "Operating Income / Interest Expense. > 5x provides a comfortable safety margin.",
      },
      {
        label: "Current Ratio",
        value: fmtX(currentRatio),
        score: currentRatioScore,
        tooltip: "Current Assets / Current Liabilities. > 1.5x suggests good short-term liquidity.",
      },
    ],
  };
}

function scoreCashGeneration(
  financials: CompanyFinancials,
  quote: StockQuote
): QualityDimension {
  const income = sortByDateAsc(financials.income_statement.annual);
  const cashflow = sortByDateAsc(financials.cash_flow.annual);
  const latestIncome = income.at(-1);
  const latestCF = cashflow.at(-1);

  const fcfMargin = latestIncome && latestCF
    ? calculateFCFMargin(latestCF.free_cash_flow, latestIncome.revenue)
    : null;

  const fcfYield = latestCF
    ? calculateFCFYield(
        latestCF.free_cash_flow,
        quote.price,
        quote.shares_outstanding
      )
    : null;

  // FCF / Net Income conversion ratio (> 1 means FCF exceeds accounting earnings)
  const fcfConversion =
    latestCF && latestIncome && latestIncome.net_income > 0
      ? latestCF.free_cash_flow / latestIncome.net_income
      : null;

  // FCF trend: compare last 3 years
  const recent3CF = cashflow.slice(-3).map((cf) => cf.free_cash_flow);
  const isGrowing =
    recent3CF.length >= 2
      ? recent3CF[recent3CF.length - 1] > recent3CF[0]
      : null;

  const fcfMarginScore = scoreFromThresholds(fcfMargin ?? -0.5, [
    [0.0, 10], [0.04, 30], [0.08, 50], [0.12, 65], [0.18, 82], [0.25, 95], [0.30, 100],
  ]);

  const fcfYieldScore = scoreFromThresholds(fcfYield ?? 0, [
    [0.01, 20], [0.02, 40], [0.03, 55], [0.04, 70], [0.06, 85], [0.08, 95], [0.10, 100],
  ]);

  const conversionScore =
    fcfConversion !== null
      ? scoreFromThresholds(fcfConversion, [
          [0.4, 10], [0.6, 30], [0.8, 55], [0.95, 70], [1.05, 82], [1.2, 92], [1.5, 100],
        ])
      : 50;

  const trendScore = isGrowing === null ? 50 : isGrowing ? 85 : 30;

  const score = clamp(
    weightedAvg([
      [fcfMarginScore, 30],
      [fcfYieldScore, 30],
      [conversionScore, 25],
      [trendScore, 15],
    ])
  );

  return {
    key: "cashGeneration",
    name: "Cash Generation",
    score,
    grade: gradeFromScore(score),
    summary:
      fcfMargin !== null
        ? `FCF Margin ${pct(fcfMargin)} · FCF Yield ${pct(fcfYield)} · Conversion ${fmtRaw(fcfConversion)}x`
        : "Insufficient data",
    metrics: [
      {
        label: "FCF Margin",
        value: pct(fcfMargin),
        score: fcfMarginScore,
        tooltip: "Free Cash Flow / Revenue. > 15% signals a capital-light, highly profitable business.",
      },
      {
        label: "FCF Yield",
        value: pct(fcfYield),
        score: fcfYieldScore,
        tooltip: "FCF / Market Cap. Acts like a 'real' earnings yield. > 4% is attractive vs. bonds.",
      },
      {
        label: "FCF Conversion",
        value: fmtX(fcfConversion),
        score: conversionScore,
        tooltip: "Free Cash Flow / Net Income. > 1x means the business generates more cash than it reports in earnings — a quality signal.",
      },
      {
        label: "FCF Trend",
        value: isGrowing === null ? "N/A" : isGrowing ? "Growing" : "Declining",
        score: trendScore,
        tooltip: "Whether FCF has grown over the last 3 years.",
      },
    ],
  };
}

function scoreCapitalAllocation(
  financials: CompanyFinancials,
  quote: StockQuote
): QualityDimension {
  const cashflow = sortByDateAsc(financials.cash_flow.annual);
  const income = sortByDateAsc(financials.income_statement.annual);
  const balance = sortByDateAsc(financials.balance_sheet.annual);
  const latestCF = cashflow.at(-1);
  const latestIncome = income.at(-1);
  const latestBal = balance.at(-1);

  // Share count trend (shrinking = buybacks)
  const sharesSeries = balance
    .map((bs) => bs.shares_outstanding)
    .filter((v) => v > 0);
  const sharesFirst = sharesSeries.at(0);
  const sharesLast = sharesSeries.at(-1);
  const shareReduction =
    sharesFirst && sharesLast && sharesFirst > 0
      ? (sharesFirst - sharesLast) / sharesFirst
      : null;

  // Dividend payout ratio
  const payoutRatio =
    latestCF && latestIncome && latestIncome.net_income > 0
      ? Math.abs(latestCF.dividends_paid) / latestIncome.net_income
      : null;

  // Return to shareholders: (dividends + buybacks) / FCF
  const totalReturns =
    latestCF
      ? Math.abs(latestCF.dividends_paid) + Math.abs(latestCF.share_repurchases)
      : 0;
  const returnRatio =
    latestCF && latestCF.free_cash_flow > 0
      ? totalReturns / latestCF.free_cash_flow
      : null;

  // CapEx efficiency: FCF / Operating CF (high = low capex drag)
  const capexEfficiency =
    latestCF && latestCF.operating_cash_flow > 0
      ? latestCF.free_cash_flow / latestCF.operating_cash_flow
      : null;

  const buybackScore =
    shareReduction !== null
      ? scoreFromThresholds(shareReduction, [
          [-0.05, 10], [0.0, 30], [0.02, 50], [0.05, 70], [0.10, 90], [0.15, 100],
        ])
      : 40;

  const payoutScore =
    payoutRatio !== null
      ? payoutRatio > 1.0
        ? 10 // unsustainable
        : scoreFromThresholds(payoutRatio, [
            [0, 60], [0.2, 75], [0.4, 90], [0.6, 75], [0.8, 50], [1.0, 10],
          ])
      : 60; // no dividend = neutral

  const returnRatioScore =
    returnRatio !== null
      ? scoreFromThresholds(returnRatio, [
          [0, 30], [0.1, 45], [0.3, 65], [0.5, 80], [0.7, 90], [0.9, 75], // returning > FCF is bad
        ])
      : 50;

  const capexScore =
    capexEfficiency !== null
      ? scoreFromThresholds(capexEfficiency, [
          [0, 10], [0.5, 40], [0.7, 65], [0.8, 80], [0.9, 92], [0.95, 100],
        ])
      : 50;

  const score = clamp(
    weightedAvg([
      [buybackScore, 30],
      [payoutScore, 20],
      [returnRatioScore, 25],
      [capexScore, 25],
    ])
  );

  const buybackLabel =
    shareReduction !== null
      ? shareReduction > 0.05
        ? "Active buybacks"
        : shareReduction > 0
          ? "Modest buybacks"
          : "Share dilution"
      : "N/A";

  return {
    key: "capitalAllocation",
    name: "Capital Allocation",
    score,
    grade: gradeFromScore(score),
    summary:
      [
        buybackLabel,
        payoutRatio !== null ? `Payout ${pct(payoutRatio)}` : null,
        capexEfficiency !== null
          ? `CapEx efficiency ${pct(capexEfficiency)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Insufficient data",
    metrics: [
      {
        label: "Share Count Trend",
        value:
          shareReduction !== null
            ? shareReduction >= 0
              ? `−${pct(shareReduction)} (reduction)`
              : `+${pct(Math.abs(shareReduction))} (dilution)`
            : "N/A",
        score: buybackScore,
        tooltip: "Change in shares outstanding over all available years. Reduction indicates buybacks; dilution signals heavy equity issuance.",
      },
      {
        label: "Dividend Payout Ratio",
        value: payoutRatio !== null ? pct(payoutRatio) : "No dividend",
        score: payoutScore,
        tooltip: "Dividends / Net Income. 30–60% is a healthy range — sustainable without over-distributing.",
      },
      {
        label: "Returns / FCF",
        value: pct(returnRatio),
        score: returnRatioScore,
        tooltip: "Total shareholder returns (dividends + buybacks) / Free Cash Flow. Ideally between 30% and 90%.",
      },
      {
        label: "CapEx Efficiency",
        value: pct(capexEfficiency),
        score: capexScore,
        tooltip: "FCF / Operating Cash Flow. High values mean little capital is consumed in generating earnings.",
      },
    ],
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/** Dimension weights in the overall score */
const DIMENSION_WEIGHTS = [
  0.28, // Profitability
  0.22, // Growth
  0.22, // Financial Health
  0.18, // Cash Generation
  0.10, // Capital Allocation
] as const;

const HEADLINES: Record<QualityGrade, string> = {
  "A+": "Exceptional Business",
  A:   "High-Quality Business",
  B:   "Good Business",
  C:   "Average Business",
  D:   "Below Average",
  F:   "Poor Quality",
};

export function calculateQualityScore(
  financials: CompanyFinancials,
  quote: StockQuote
): QualityScoreResult {
  const dimensions = [
    scoreProfitability(financials),
    scoreGrowth(financials),
    scoreFinancialHealth(financials),
    scoreCashGeneration(financials, quote),
    scoreCapitalAllocation(financials, quote),
  ] as QualityScoreResult["dimensions"];

  const overall = clamp(
    dimensions.reduce(
      (sum, dim, i) => sum + dim.score * DIMENSION_WEIGHTS[i],
      0
    )
  );

  const grade = gradeFromScore(overall);

  return {
    overall,
    grade,
    headline: HEADLINES[grade],
    dimensions,
  };
}
