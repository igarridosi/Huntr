/**
 * The benchmark: one company's raw data in, what the DCF page would show on
 * Auto-Populate out, judged against a fixed bar.
 *
 * It answers "does the tool read this company correctly", not "is the
 * company cheap". So it runs the generated scenarios exactly as the page
 * populates them, records every figure that came from a source and every
 * check, and grades the data, never the valuation:
 *
 *  - fail: a figure is wrong or missing in a way that moves the value - the
 *    share count disagrees with the market cap, the debt in use is not the
 *    debt filed, a balance-sheet figure is unresolved, the currency cannot
 *    be valued, or an adjustment lands outside anything a real company has.
 *  - warn: the data is right but the model fits the company poorly, or a
 *    figure could only be read from a vendor - a material deal, a record
 *    that is not comparable, statements from another currency.
 *  - pass: every check the filings allow passed.
 */
import type { CompanyFinancials } from "@/types/financials";
import type { StockQuote } from "@/types/stock";
import type { SECFundamentals } from "@/lib/api/sec-edgar";
import { runDCF } from "@/lib/calculations";
import { assessValuation } from "@/lib/calculations/dcf-currency";
import { assembleCompanyData, gateFor, populateScenarios, regimesFor } from "./company-data";
import { engineInputsFor } from "./cash-flow-basis";
import { buildProvenance } from "./provenance";
import { assessReliability } from "./reliability";

export interface BenchmarkRaw {
  ticker: string;
  quote: StockQuote | null;
  profile: { name?: string | null; sector?: string | null; industry?: string | null } | null;
  financials: CompanyFinancials | null;
  sec: SECFundamentals | null;
  fxRate: number | null;
}

export type BenchmarkVerdict = "pass" | "warn" | "fail";

/** An adjustment beyond these is a misread, not a company: the widest seen on a real filer is SBC near 25 points. */
export const SHIFT_BOUNDS = { min: -0.3, max: 0.1 } as const;

const round = (value: number | null | undefined, digits = 4) =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;

export function evaluateCompany(raw: BenchmarkRaw) {
  const failures: string[] = [];
  const warnings: string[] = [];
  const { quote } = raw;

  if (!quote || !(quote.price > 0)) {
    return { ticker: raw.ticker, verdict: "fail" as BenchmarkVerdict, failures: ["No quote"], warnings, summary: null };
  }
  const data = assembleCompanyData({ ticker: raw.ticker, quote, profile: raw.profile, financials: raw.financials, sec: raw.sec, fxRate: raw.fxRate });
  if (!data.financials) {
    return { ticker: raw.ticker, verdict: "fail" as BenchmarkVerdict, failures: ["No statements"], warnings, summary: null };
  }
  const populated = populateScenarios(data, quote, raw.profile?.sector);
  if (!populated) {
    return { ticker: raw.ticker, verdict: "fail" as BenchmarkVerdict, failures: ["Scenarios could not be generated"], warnings, summary: null };
  }
  const scenarios = { bear: populated.bear.inputs, base: populated.base.inputs, bull: populated.bull.inputs };
  const base = scenarios.base;
  const engine = (inputs: typeof base) => engineInputsFor(inputs, "unlevered", data.adjustmentsFor(inputs.baseRevenue));
  const engineBase = engine(base);
  const result = runDCF(engineBase);
  const marginShift = engineBase.baseFCFMargin - base.baseFCFMargin;

  const gate = gateFor(data, quote, base);
  const regimes = regimesFor(data, base.totalDebt, result);
  const option = data.revenueBasis === "ttm" ? data.bases.ttm : data.revenueBasis === "fiscal_year" ? data.bases.fiscalYear : null;
  const provenance = buildProvenance({
    inputs: base,
    revenue: { basis: data.revenueBasis, periodStart: option?.periodStart ?? null, periodEnd: option?.periodEnd ?? null, source: data.latestAnnualRows.income?.source ?? null },
    marginRows: data.latestAnnualRows,
    fields: data.sourcedFields,
    sec: data.sec ?? null,
    quote: { price: quote.price, marketCap: quote.market_cap, asOf: null },
  });
  const guard = assessValuation({
    priceCurrency: quote.currency,
    financialCurrency: data.adrBasis ? data.adrBasis.to : quote.financial_currency,
    upside: result.upside,
    unresolvedFields: data.sourcedFields?.unresolved,
  });

  const value = result.intrinsicValuePerShare;
  const plusOne = runDCF({ ...engineBase, wacc: engineBase.wacc + 0.01 }).intrinsicValuePerShare;
  const [bear, bull] = [runDCF(engine(scenarios.bear)).intrinsicValuePerShare, runDCF(engine(scenarios.bull)).intrinsicValuePerShare];
  const record = data.revenueHistory.marginHistory;
  const reliability =
    value > 0
      ? assessReliability({
          provenance,
          unresolved: data.sourcedFields?.unresolved.length ?? 0,
          checks: gate.checks,
          regimes: regimes.map((r) => r.id),
          converted: !!data.adrBasis,
          marginRecord: record
            ? {
                years: record.series.length,
                comparable: record.comparable,
                volatile: record.flags.includes("volatile"),
                negativeYears: record.series.filter((y) => y.freeCashFlow < 0).length,
                latestNegative: (record.series.at(-1)?.freeCashFlow ?? 0) < 0,
              }
            : null,
          terminalWeight: result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : null,
          spread: engineBase.wacc - engineBase.terminalGrowthRate,
          waccSensitivity: Math.max(0, (value - plusOne) / value),
          // The generated scenarios sit inside the record by construction.
          growthAboveRecord: false,
          terminalMarginAboveRecord: false,
          dispersion: (bull - bear) / value,
        })
      : null;

  // ── The bar ────────────────────────────────────────────────
  const check = (id: string) => gate.checks.find((c) => c.id === id);
  if (check("marketCap")?.status === "fail") failures.push(`Share count: ${check("marketCap")!.detail}`);
  if (check("totalDebt")?.status === "fail") failures.push(`Debt: ${check("totalDebt")!.detail}`);
  if (check("fcfQuarters")?.status === "fail") failures.push(`Cash flow: ${check("fcfQuarters")!.detail}`);
  if ((data.sourcedFields?.unresolved.length ?? 0) > 0) failures.push(`Unresolved: ${data.sourcedFields!.unresolved.join(", ")}`);
  // An implausible upside on the generated scenarios is the model, not the
  // data: Amazon's capex peak leaves a near-zero margin to discount.
  if (!guard.usable && guard.reason === "implausible-upside") warnings.push(`Autofill value implausible (${(result.upside * 100).toFixed(0)}% vs price): the model, not the data`);
  else if (!guard.usable && guard.reason !== "unresolved-balance-sheet") failures.push(`Currency: ${guard.message}`);
  if (marginShift < SHIFT_BOUNDS.min || marginShift > SHIFT_BOUNDS.max) failures.push(`Margin shift ${(marginShift * 100).toFixed(1)} pts outside the plausible range`);
  if (!(base.baseRevenue > 0)) failures.push("No revenue base");

  if (check("revenuePerimeter")?.status === "fail") warnings.push(`Perimeter: ${check("revenuePerimeter")!.detail}`);
  if (check("marginRecord")?.status === "fail") warnings.push(`Record: ${check("marginRecord")!.detail}`);
  for (const r of regimes) warnings.push(`Regime ${r.label}: ${r.detail}`);
  const sharesFrom = provenance.find((p) => p.field === "sharesOutstanding")?.source ?? null;
  if (sharesFrom !== "sec") warnings.push(`Share count from ${sharesFrom}, not a filing`);
  if (data.adrBasis?.ratioAssumed) warnings.push("No depositary ratio fits: one share per unit assumed");
  else if (data.adrBasis) warnings.push(`Converted from ${data.adrBasis.from}`);

  const verdict: BenchmarkVerdict = failures.length ? "fail" : warnings.length ? "warn" : "pass";
  const fields = data.sourcedFields;
  return {
    ticker: raw.ticker,
    verdict,
    failures,
    warnings,
    summary: {
      name: raw.profile?.name ?? null,
      price: quote.price,
      currency: { statements: quote.financial_currency ?? null, listing: quote.currency ?? null, adrRatio: data.adrBasis?.ratio ?? null },
      revenueBasis: data.revenueBasis,
      revenueBase: round(base.baseRevenue, 0),
      shares: { inUse: round(base.sharesOutstanding, 0), source: sharesFrom, impliedDeviation: round(fields?.shareCount.deviation ?? null) },
      debt: { financial: round(fields?.netDebt.financialDebt ?? null, 0), source: fields?.financialDebt.source ?? null },
      cash: { value: round(fields?.netDebt.cash ?? null, 0), source: fields?.cash.source ?? null },
      adjustments: {
        sbcPoints: round(data.sbcAmount > 0 ? data.adjustmentsFor(base.baseRevenue).sbcPoints : 0),
        interestPoints: round(data.interestPoints),
        interestIncomePoints: round(data.incomeStrip),
        leasePrincipalPoints: round(data.leasePrincipalPoints),
        taxRateSource: data.addBack?.taxRateSource ?? null,
        marginShift: round(marginShift),
      },
      checks: Object.fromEntries(gate.checks.map((c) => [c.id, c.status])),
      regimes: regimes.map((r) => r.id),
      reliability: reliability
        ? { score: reliability.score, grade: reliability.grade, blocks: Object.fromEntries(reliability.blocks.map((b) => [b.id, Math.round(b.score)])) }
        : null,
      autofillBaseValue: round(value, 2),
    },
  };
}

export type BenchmarkResult = ReturnType<typeof evaluateCompany>;
