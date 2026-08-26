"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useFullStockData,
  useStockProfile,
  useStockQuote,
} from "@/hooks/use-stock-data";
import { CategorizedMetrics } from "@/components/stock/categorized-metrics";
import {
  MetricChartCard,
  type MetricChartCardData,
} from "@/components/stock/metric-chart-card";
import { StockPriceCard } from "@/components/stock/stock-price-card";
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { PeriodToggle } from "@/components/financials/period-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Check, LineChart } from "lucide-react";
import { FeedbackToast, type FeedbackToastVariant } from "@/components/ui/feedback-toast";
import { ChartErrorBoundary } from "@/components/ui/chart-error-boundary";
import { QualityScorecard, QualityScorecardSkeleton } from "@/components/stock/quality-scorecard";
import { calculateQualityScore } from "@/lib/calculations/quality-score";
import { fetchAlphaFinancials, getAlphaAvailability } from "@/app/actions/stock";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { PeriodType } from "@/types/financials";
import type { CompanyFinancials } from "@/types/financials";

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getMostRecentByDate<T extends { date: string }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return rows.reduce<T | null>((latest, current) => {
    if (!latest) return current;
    return new Date(current.date).getTime() > new Date(latest.date).getTime()
      ? current
      : latest;
  }, null);
}

function pickMostRecentPeriod<T extends { date: string }>(
  annualRows: T[],
  quarterlyRows: T[]
): T | null {
  const annualLatest = getMostRecentByDate(annualRows);
  const quarterlyLatest = getMostRecentByDate(quarterlyRows);

  if (!annualLatest) return quarterlyLatest;
  if (!quarterlyLatest) return annualLatest;

  return new Date(quarterlyLatest.date).getTime() > new Date(annualLatest.date).getTime()
    ? quarterlyLatest
    : annualLatest;
}

type YearRange = 5 | 10 | 15 | 20;

const ALPHA_LIMIT_MESSAGE =
  "Alpha Vantage is currently rate-limiting or rejecting this request. We are still displaying quick data from Yahoo Finance; please try again later to load the full historical data.";

function isAlphaLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ALPHA_VANTAGE_LIMIT_REACHED|AlphaVantage rate limited|cooling down|rate limit/i.test(message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("ALPHA_VANTAGE_TIMEOUT"));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function findNearestBalanceRow<T extends { date: string }>(rows: T[], targetDate: string): T | null {
  if (!rows.length) return null;
  const targetTs = new Date(targetDate).getTime();
  if (!Number.isFinite(targetTs)) return null;

  const sorted = rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (let i = sorted.length - 1; i >= 0; i--) {
    const ts = new Date(sorted[i].date).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts <= targetTs) return sorted[i];
  }

  return sorted[0] ?? null;
}

export default function OverviewPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();
  const queryClient = useQueryClient();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();

  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const [yearRange, setYearRange] = useState<YearRange>(10);
  const [deepFinancials, setDeepFinancials] = useState<CompanyFinancials | null>(null);
  const [isLoadingDeepFinancials, setIsLoadingDeepFinancials] = useState(false);
  const [deepFinancialsError, setDeepFinancialsError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    message?: string;
    variant: FeedbackToastVariant;
  } | null>(null);

  const {
    data: stockData,
    isLoading: stockDataLoading,
    isFetching: stockDataFetching,
  } = useFullStockData(ticker);
  const { data: quickProfile } = useStockProfile(ticker);
  const {
    data: quickQuote,
    isLoading: quickQuoteLoading,
    isFetching: quickQuoteFetching,
  } = useStockQuote(ticker);

  const profile = stockData?.profile ?? quickProfile ?? null;
  const quote = stockData?.quote ?? quickQuote ?? null;
  const financials = deepFinancials ?? stockData?.financials ?? null;
  const financialsSource = deepFinancials ? "alpha-cache" : stockData?.financialsSource;
  const quoteLoading = quickQuoteLoading || quickQuoteFetching || stockDataLoading || stockDataFetching;
  const finLoading = stockDataLoading || stockDataFetching || !financials;
  const hasDeepFinancials = financialsSource === "alpha-cache";

  useEffect(() => {
    setDeepFinancials(null);
    setIsLoadingDeepFinancials(false);
    setDeepFinancialsError(null);
  }, [ticker]);

  const handleLoadDeepFinancials = async (): Promise<void> => {
    if (!ticker || isLoadingDeepFinancials || hasDeepFinancials) return;
    if (!user) {
      openGate("deepData");
      return;
    }

    setIsLoadingDeepFinancials(true);
    setDeepFinancialsError(null);
    try {
      const alphaAvailability = await getAlphaAvailability();
      if (!alphaAvailability.available) {
        throw new Error(
          alphaAvailability.reason === "throttled"
            ? "ALPHA_VANTAGE_LIMIT_REACHED"
            : "ALPHA_VANTAGE_NOT_CONFIGURED"
        );
      }

      const alphaFinancials = await withTimeout(fetchAlphaFinancials(ticker), 50_000);
      if (alphaFinancials) {
        setDeepFinancials(alphaFinancials);
        queryClient.setQueryData(["stock", "full", ticker], {
          ...(stockData ?? { profile, quote }),
          financials: alphaFinancials,
          financialsSource: "alpha-cache" as const,
        });
      }
    } catch (error) {
      setDeepFinancialsError(
        isAlphaLimitError(error)
          ? "Alpha Vantage is currently rate-limited. Yahoo data remains available."
          : "Full historical data is temporarily unavailable."
      );
      setToast({
        title: isAlphaLimitError(error) ? "Alpha Vantage is rate-limited" : "The complete history could not be loaded",
        message: isAlphaLimitError(error)
          ? ALPHA_LIMIT_MESSAGE
          : "We're still showing quick data from Yahoo Finance. Please try again later.",
        variant: "warning",
      });
    } finally {
      setIsLoadingDeepFinancials(false);
    }
  };

  const latestIncome = useMemo(() => {
    if (!financials) return null;
    return pickMostRecentPeriod(
      financials.income_statement.annual,
      financials.income_statement.quarterly
    );
  }, [financials]);

  const latestBalance = useMemo(() => {
    if (!financials) return null;
    return pickMostRecentPeriod(
      financials.balance_sheet.annual,
      financials.balance_sheet.quarterly
    );
  }, [financials]);

  const latestCashFlow = useMemo(() => {
    if (!financials) return null;
    return pickMostRecentPeriod(
      financials.cash_flow.annual,
      financials.cash_flow.quarterly
    );
  }, [financials]);

  // Build all chart series from selected period
  const charts = useMemo(() => {
    if (!financials) return null;

    const incomeAnnual = sortByDateAsc(financials.income_statement.annual);
    const incomeQuarterly = sortByDateAsc(financials.income_statement.quarterly);
    const balanceAnnual = sortByDateAsc(financials.balance_sheet.annual);
    const balanceQuarterly = sortByDateAsc(financials.balance_sheet.quarterly);
    const cashFlowAnnual = sortByDateAsc(financials.cash_flow.annual);
    const cashFlowQuarterly = sortByDateAsc(financials.cash_flow.quarterly);

    const fmt = (p: string, type: PeriodType) =>
      type === "annual" ? p.replace("FY", "'") : p;

    const byPeriod = <T,>(annual: T, quarterly: T): T =>
      periodType === "annual" ? annual : quarterly;

    const filterMetricRows = (rows: MetricChartCardData[]): MetricChartCardData[] => {
      if (!rows.length) return rows;

      const latestDateMs = rows.reduce((latest, row) => {
        const ts = row.date ? new Date(row.date).getTime() : Number.NaN;
        if (!Number.isFinite(ts)) return latest;
        return Math.max(latest, ts);
      }, Number.NEGATIVE_INFINITY);

      if (!Number.isFinite(latestDateMs)) {
        return rows.slice(-yearRange);
      }

      const cutoff = new Date(latestDateMs);
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - yearRange);
      const cutoffMs = cutoff.getTime();

      const filtered = rows.filter((row) => {
        const ts = row.date ? new Date(row.date).getTime() : Number.NaN;
        if (!Number.isFinite(ts)) return false;
        return ts >= cutoffMs;
      });

      return filtered.length ? filtered : rows;
    };

    const displaySeries = (
      annual: MetricChartCardData[],
      quarterly: MetricChartCardData[]
    ): MetricChartCardData[] => {
      const source = byPeriod(annual, quarterly);
      return filterMetricRows(source);
    };

    // Helper to compute growth between first and last element
    const growth = (arr: MetricChartCardData[]): number | null => {
      if (arr.length < 2) return null;
      const start = arr[0].value;
      const end = arr[arr.length - 1].value;
      if (start === 0 || start < 0) return null;
      return (end - start) / Math.abs(start);
    };

    const revenueAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.revenue,
      date: is.date,
    }));
    const revenueQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue,
      date: is.date,
    }));

    const ebitdaAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.ebitda,
      date: is.date,
    }));
    const ebitdaQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.ebitda,
      date: is.date,
    }));

    const fcfAnnual: MetricChartCardData[] = cashFlowAnnual.map((cf) => ({
      period: fmt(cf.period, "annual"),
      value: cf.free_cash_flow,
      date: cf.date,
    }));
    const fcfQuarterly: MetricChartCardData[] = cashFlowQuarterly.map((cf) => ({
      period: fmt(cf.period, "quarterly"),
      value: cf.free_cash_flow,
      date: cf.date,
    }));

    const netIncomeAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.net_income,
      date: is.date,
    }));
    const netIncomeQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.net_income,
      date: is.date,
    }));

    const epsAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value:
        is.eps_diluted ||
        (is.shares_outstanding_diluted > 0
          ? is.net_income / is.shares_outstanding_diluted
          : 0),
      date: is.date,
    }));
    const epsQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value:
        is.eps_diluted ||
        (is.shares_outstanding_diluted > 0
          ? is.net_income / is.shares_outstanding_diluted
          : 0),
      date: is.date,
    }));

    const cashDebtAnnual: MetricChartCardData[] = balanceAnnual.map((bs) => ({
      period: fmt(bs.period, "annual"),
      value: bs.cash_and_equivalents,
      date: bs.date,
    }));
    const cashDebtQuarterly: MetricChartCardData[] = balanceQuarterly.map((bs) => ({
      period: fmt(bs.period, "quarterly"),
      value: bs.cash_and_equivalents,
      date: bs.date,
    }));

    const dividendsAnnual: MetricChartCardData[] = cashFlowAnnual.map((cf) => ({
      period: fmt(cf.period, "annual"),
      value: Math.abs(cf.dividends_paid),
      date: cf.date,
    }));
    const dividendsQuarterly: MetricChartCardData[] = cashFlowQuarterly.map((cf) => ({
      period: fmt(cf.period, "quarterly"),
      value: Math.abs(cf.dividends_paid),
      date: cf.date,
    }));

    const sharesOutAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value:
        is.shares_outstanding_diluted ||
        balanceAnnual.find((bs) => bs.date === is.date)?.shares_outstanding ||
        quote?.shares_outstanding ||
        0,
      date: is.date,
    }));
    const sharesOutQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      value:
        is.shares_outstanding_diluted ||
        balanceQuarterly.find((bs) => bs.date === is.date)?.shares_outstanding ||
        quote?.shares_outstanding ||
        0,
      period: fmt(is.period, "quarterly"),
      date: is.date,
    }));

    const grossMarginAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.revenue > 0 ? is.gross_profit / is.revenue : 0,
      date: is.date,
    }));
    const grossMarginQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue > 0 ? is.gross_profit / is.revenue : 0,
      date: is.date,
    }));

    const opMarginAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.revenue > 0 ? is.operating_income / is.revenue : 0,
      date: is.date,
    }));
    const opMarginQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue > 0 ? is.operating_income / is.revenue : 0,
      date: is.date,
    }));

    const roicAnnual: MetricChartCardData[] = incomeAnnual.reduce<MetricChartCardData[]>((acc, is) => {
      const bs = findNearestBalanceRow(balanceAnnual, is.date);
      if (!bs) return acc;
      const investedCapital = bs.total_assets - bs.total_current_liabilities;
      if (!Number.isFinite(investedCapital) || Math.abs(investedCapital) < 1e-9) return acc;
      acc.push({
        period: fmt(is.period, "annual"),
        value: is.net_income / investedCapital,
        date: is.date,
      });
      return acc;
    }, []);

    const roicQuarterly: MetricChartCardData[] = incomeQuarterly.reduce<MetricChartCardData[]>((acc, is) => {
      const bs = findNearestBalanceRow(balanceQuarterly, is.date);
      if (!bs) return acc;
      const investedCapital = bs.total_assets - bs.total_current_liabilities;
      if (!Number.isFinite(investedCapital) || Math.abs(investedCapital) < 1e-9) return acc;
      acc.push({
        period: fmt(is.period, "quarterly"),
        value: is.net_income / investedCapital,
        date: is.date,
      });
      return acc;
    }, []);

    const roeAnnual: MetricChartCardData[] = incomeAnnual.reduce<MetricChartCardData[]>((acc, is) => {
      const bs = findNearestBalanceRow(balanceAnnual, is.date);
      if (!bs || Math.abs(bs.total_equity) < 1e-9) return acc;
      acc.push({
        period: fmt(is.period, "annual"),
        value: is.net_income / bs.total_equity,
        date: is.date,
      });
      return acc;
    }, []);

    const roeQuarterly: MetricChartCardData[] = incomeQuarterly.reduce<MetricChartCardData[]>((acc, is) => {
      const bs = findNearestBalanceRow(balanceQuarterly, is.date);
      if (!bs || Math.abs(bs.total_equity) < 1e-9) return acc;
      acc.push({
        period: fmt(is.period, "quarterly"),
        value: is.net_income / bs.total_equity,
        date: is.date,
      });
      return acc;
    }, []);

    const capexAnnual: MetricChartCardData[] = cashFlowAnnual.map((cf) => ({
      period: fmt(cf.period, "annual"),
      value: cf.capital_expenditures,
      date: cf.date,
    }));
    const capexQuarterly: MetricChartCardData[] = cashFlowQuarterly.map((cf) => ({
      period: fmt(cf.period, "quarterly"),
      value: cf.capital_expenditures,
      date: cf.date,
    }));

    const interestCoverageAnnual: MetricChartCardData[] = incomeAnnual.map((is) => {
      const interest = Math.abs(is.interest_expense);
      const ratio = !interest || interest <= 0 ? 50 : is.operating_income / interest;
      return {
        period: fmt(is.period, "annual"),
        value: Number.isFinite(ratio) ? ratio : 50,
        date: is.date,
      };
    });

    const interestCoverageQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => {
      const interest = Math.abs(is.interest_expense);
      const ratio = !interest || interest <= 0 ? 50 : is.operating_income / interest;
      return {
        period: fmt(is.period, "quarterly"),
        value: Number.isFinite(ratio) ? ratio : 50,
        date: is.date,
      };
    });

    const totalDebtAnnual: MetricChartCardData[] = balanceAnnual.map((bs) => {
      const totalDebt = bs.long_term_debt + bs.total_current_liabilities;
      return {
        period: fmt(bs.period, "annual"),
        value: totalDebt,
        date: bs.date,
      };
    });
    const totalDebtQuarterly: MetricChartCardData[] = balanceQuarterly.map((bs) => {
      const totalDebt = bs.long_term_debt + bs.total_current_liabilities;
      return {
        period: fmt(bs.period, "quarterly"),
        value: totalDebt,
        date: bs.date,
      };
    });

    const netDebtAnnual: MetricChartCardData[] = balanceAnnual.map((bs) => {
      const totalDebt = bs.long_term_debt + bs.total_current_liabilities;
      return {
        period: fmt(bs.period, "annual"),
        value: totalDebt - bs.cash_and_equivalents,
        date: bs.date,
      };
    });
    const netDebtQuarterly: MetricChartCardData[] = balanceQuarterly.map((bs) => {
      const totalDebt = bs.long_term_debt + bs.total_current_liabilities;
      return {
        period: fmt(bs.period, "quarterly"),
        value: totalDebt - bs.cash_and_equivalents,
        date: bs.date,
      };
    });

    return {
      revenue: {
        data: displaySeries(revenueAnnual, revenueQuarterly),
        annualData: revenueAnnual,
        quarterlyData: revenueQuarterly,
        growth: growth(displaySeries(revenueAnnual, revenueQuarterly)),
      },
      ebitda: {
        data: displaySeries(ebitdaAnnual, ebitdaQuarterly),
        annualData: ebitdaAnnual,
        quarterlyData: ebitdaQuarterly,
        growth: growth(displaySeries(ebitdaAnnual, ebitdaQuarterly)),
      },
      fcf: {
        data: displaySeries(fcfAnnual, fcfQuarterly),
        annualData: fcfAnnual,
        quarterlyData: fcfQuarterly,
        growth: growth(displaySeries(fcfAnnual, fcfQuarterly)),
      },
      netIncome: {
        data: displaySeries(netIncomeAnnual, netIncomeQuarterly),
        annualData: netIncomeAnnual,
        quarterlyData: netIncomeQuarterly,
        growth: growth(displaySeries(netIncomeAnnual, netIncomeQuarterly)),
      },
      eps: {
        data: displaySeries(epsAnnual, epsQuarterly),
        annualData: epsAnnual,
        quarterlyData: epsQuarterly,
        growth: growth(displaySeries(epsAnnual, epsQuarterly)),
      },
      cashDebt: {
        data: displaySeries(cashDebtAnnual, cashDebtQuarterly),
        annualData: cashDebtAnnual,
        quarterlyData: cashDebtQuarterly,
        growth: growth(displaySeries(cashDebtAnnual, cashDebtQuarterly)),
      },
      dividends: {
        data: displaySeries(dividendsAnnual, dividendsQuarterly),
        annualData: dividendsAnnual,
        quarterlyData: dividendsQuarterly,
        growth: growth(displaySeries(dividendsAnnual, dividendsQuarterly)),
      },
      sharesOut: {
        data: displaySeries(sharesOutAnnual, sharesOutQuarterly),
        annualData: sharesOutAnnual,
        quarterlyData: sharesOutQuarterly,
        growth: growth(displaySeries(sharesOutAnnual, sharesOutQuarterly)),
      },
      grossMargin: {
        data: displaySeries(grossMarginAnnual, grossMarginQuarterly),
        annualData: grossMarginAnnual,
        quarterlyData: grossMarginQuarterly,
        growth: null as number | null,
      },
      opMargin: {
        data: displaySeries(opMarginAnnual, opMarginQuarterly),
        annualData: opMarginAnnual,
        quarterlyData: opMarginQuarterly,
        growth: null as number | null,
      },
      roic: {
        data: displaySeries(roicAnnual, roicQuarterly),
        annualData: roicAnnual,
        quarterlyData: roicQuarterly,
        growth: null as number | null,
      },
      roe: {
        data: displaySeries(roeAnnual, roeQuarterly),
        annualData: roeAnnual,
        quarterlyData: roeQuarterly,
        growth: null as number | null,
      },
      capex: {
        data: displaySeries(capexAnnual, capexQuarterly),
        annualData: capexAnnual,
        quarterlyData: capexQuarterly,
        growth: growth(displaySeries(capexAnnual, capexQuarterly)),
      },
      interestCoverage: {
        data: displaySeries(interestCoverageAnnual, interestCoverageQuarterly),
        annualData: interestCoverageAnnual,
        quarterlyData: interestCoverageQuarterly,
        growth: null as number | null,
      },
      totalDebt: {
        data: displaySeries(totalDebtAnnual, totalDebtQuarterly),
        annualData: totalDebtAnnual,
        quarterlyData: totalDebtQuarterly,
      },
      netDebt: {
        data: displaySeries(netDebtAnnual, netDebtQuarterly),
        annualData: netDebtAnnual,
        quarterlyData: netDebtQuarterly,
        growth: growth(displaySeries(netDebtAnnual, netDebtQuarterly)),
      },
    };
  }, [financials, periodType, quote?.shares_outstanding, yearRange]);

  if (quoteLoading && !quote) {
    return <DataHuntingLoader ticker={ticker} profile={profile} />;
  }

  const dollarFmt = (v: number) => formatCurrency(v, { compact: true });
  const epsFmt = (v: number) => formatCurrency(v);
  const pctFmt = (v: number) => formatPercent(v, 1);
  const sharesFmt = (v: number) =>
    Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(v);

  return (
    <div className="space-y-6">
      <FeedbackToast
        open={!!toast}
        title={toast?.title ?? ""}
        message={toast?.message}
        variant={toast?.variant ?? "warning"}
        onClose={() => setToast(null)}
        durationMs={7000}
      />

      {/* Categorized Metrics Bar — Rule 4: pass fundamentals period for data freshness footer */}
      {quote && (
        <CategorizedMetrics
          quote={quote}
          income={latestIncome}
          balance={latestBalance}
          cashFlow={latestCashFlow}
          fundamentalsPeriod={latestIncome?.period ?? latestBalance?.period ?? undefined}
        />
      )}

      {/* Charts Grid — 5 columns × 2 rows */}
      {finLoading && !charts ? (
        <DataHuntingLoader ticker={ticker} profile={profile} compact />
      ) : charts ? (
        <div className="flex flex-col gap-6">
          <StockPriceCard ticker={ticker} quote={quote ?? null} />

          {/* Wraps on narrow screens — justify-end with no wrap pushed the
              first control off the left edge of the viewport. */}
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
            {deepFinancialsError ? (
              <p className="w-full text-xs text-golden-hour sm:w-auto">{deepFinancialsError}</p>
            ) : null}
            {/* Matches the height and inset-ring language of the toggles beside
                it, instead of carrying its own outline. It also earns accent
                colour while it is still an action, and drops to muted once the
                data is in — the label alone was doing that work before. */}
            <button
              type="button"
              onClick={() => { void handleLoadDeepFinancials(); }}
              disabled={hasDeepFinancials || isLoadingDeepFinancials}
              className={cn(
                "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-medium",
                "ring-1 ring-inset transition-[color,background-color,transform] duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                "motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-9",
                hasDeepFinancials
                  ? "bg-bullish/10 text-bullish ring-bullish/25"
                  : isLoadingDeepFinancials
                    ? "bg-wolf-black/40 text-mist ring-wolf-border/40"
                    : "bg-sunset-orange/10 text-sunset-orange ring-sunset-orange/30 hover:bg-sunset-orange/15 active:scale-[0.97]"
              )}
            >
              {isLoadingDeepFinancials ? (
                <>
                  <Spinner size="xs" color="mist" /> Loading 20Y…
                </>
              ) : hasDeepFinancials ? (
                <>
                  <Check className="h-3.5 w-3.5" /> 20Y loaded
                </>
              ) : (
                <>
                  <LineChart className="h-3.5 w-3.5" /> Load 20Y data
                </>
              )}
            </button>
            <div className="inline-flex items-center gap-0.5 rounded-xl bg-wolf-black/40 p-1 ring-1 ring-inset ring-wolf-border/40">
              {([5, 10, 15, 20] as const).map((years) => (
                <button
                  key={years}
                  type="button"
                  onClick={() => setYearRange(years)}
                  aria-pressed={yearRange === years}
                  className={cn(
                    "min-h-9 cursor-pointer rounded-lg px-3 font-mono text-[11px] font-medium tracking-[0.02em]",
                    "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96]",
                    "motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-7 sm:px-2.5",
                    yearRange === years
                      ? "bg-sunset-orange/12 text-sunset-orange"
                      : "text-mist hover:text-snow-peak"
                  )}
                >
                  {years}Y
                </button>
              ))}
            </div>
            <PeriodToggle value={periodType} onChange={setPeriodType} />
          </div>

          <ChartErrorBoundary label="Financial charts">
          {/* Cards carry their own `insight-enter`; the shared delay makes the
              ten of them settle as one wave instead of ten separate arrivals. */}
          <div
            className="grid grid-cols-1 gap-4 [&>*:nth-child(2)]:[--enter-delay:30ms] [&>*:nth-child(3)]:[--enter-delay:60ms] [&>*:nth-child(4)]:[--enter-delay:90ms] [&>*:nth-child(5)]:[--enter-delay:120ms] [&>*:nth-child(6)]:[--enter-delay:150ms] [&>*:nth-child(7)]:[--enter-delay:180ms] [&>*:nth-child(n+8)]:[--enter-delay:200ms] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          >
            <MetricChartCard
            title="Revenue"
            data={charts.revenue.data}
            annualData={charts.revenue.annualData}
            quarterlyData={charts.revenue.quarterlyData}
            growth={charts.revenue.growth}
            type="bar"
            color="#FF8C42"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="EBITDA"
            data={charts.ebitda.data}
            annualData={charts.ebitda.annualData}
            quarterlyData={charts.ebitda.quarterlyData}
            growth={charts.ebitda.growth}
            type="bar"
            color="#7b59b3"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="Free Cash Flow"
            data={charts.fcf.data}
            annualData={charts.fcf.annualData}
            quarterlyData={charts.fcf.quarterlyData}
            growth={charts.fcf.growth}
            type="bar"
            color="#4DC990"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="Net Income"
            data={charts.netIncome.data}
            annualData={charts.netIncome.annualData}
            quarterlyData={charts.netIncome.quarterlyData}
            growth={charts.netIncome.growth}
            type="bar"
            color="#FFBF69"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="EPS"
            data={charts.eps.data}
            annualData={charts.eps.annualData}
            quarterlyData={charts.eps.quarterlyData}
            growth={charts.eps.growth}
            type="bar"
            color="#7CB9A8"
            formatter={epsFmt}
          />
          <MetricChartCard
            title="Cash & Equivalents"
            data={charts.cashDebt.data}
            annualData={charts.cashDebt.annualData}
            quarterlyData={charts.cashDebt.quarterlyData}
            growth={charts.cashDebt.growth}
            type="bar"
            color="#5A9BD5"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="Dividends Paid"
            data={charts.dividends.data}
            annualData={charts.dividends.annualData}
            quarterlyData={charts.dividends.quarterlyData}
            growth={charts.dividends.growth}
            type="bar"
            color="#FFBF69"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="Shares Outstanding"
            data={charts.sharesOut.data}
            annualData={charts.sharesOut.annualData}
            quarterlyData={charts.sharesOut.quarterlyData}
            growth={charts.sharesOut.growth}
            type="bar"
            color="#8C9DA1"
            formatter={sharesFmt}
          />
          <MetricChartCard
            title="Gross Margin"
            data={charts.grossMargin.data}
            annualData={charts.grossMargin.annualData}
            quarterlyData={charts.grossMargin.quarterlyData}
            type="area"
            color="#4DC990"
            formatter={pctFmt}
          />
          <MetricChartCard
            title="Operating Margin"
            data={charts.opMargin.data}
            annualData={charts.opMargin.annualData}
            quarterlyData={charts.opMargin.quarterlyData}
            type="area"
            color="#FF8C42"
            formatter={pctFmt}
          />
          <MetricChartCard
            title="ROIC"
            data={charts.roic.data}
            annualData={charts.roic.annualData}
            quarterlyData={charts.roic.quarterlyData}
            type="area"
            color="#3DDC97"
            formatter={pctFmt}
            defaultYearRange={20}
          />
          <MetricChartCard
            title="ROE"
            data={charts.roe.data}
            annualData={charts.roe.annualData}
            quarterlyData={charts.roe.quarterlyData}
            type="area"
            color="#4BC0C0"
            formatter={pctFmt}
            defaultYearRange={20}
          />
          <MetricChartCard
            title="Capex"
            data={charts.capex.data}
            annualData={charts.capex.annualData}
            quarterlyData={charts.capex.quarterlyData}
            growth={charts.capex.growth}
            type="bar"
            color="#E57373"
            formatter={dollarFmt}
          />
          <MetricChartCard
            title="Interest Coverage"
            data={charts.interestCoverage.data}
            annualData={charts.interestCoverage.annualData}
            quarterlyData={charts.interestCoverage.quarterlyData}
            type="area"
            color="#d1d5db"
            formatter={(v) => `${v.toFixed(2)}x`}
            yAxisTickFormatter={(v) => `${v.toFixed(0)}x`}
            referenceLineY={3}
            referenceLineColor="#ef4444"
            yMaxClamp={60}
            showPerformanceFooter={false}
            defaultYearRange={20}
          />
          <MetricChartCard
            title="Total Debt vs Net Debt"
            data={charts.netDebt.data}
            annualData={charts.netDebt.annualData}
            quarterlyData={charts.netDebt.quarterlyData}
            compareData={charts.totalDebt.data}
            compareAnnualData={charts.totalDebt.annualData}
            compareQuarterlyData={charts.totalDebt.quarterlyData}
            seriesLabel="Net Debt"
            compareLabel="Total Debt"
            compareColor="#4F9CF9"
            growth={charts.netDebt.growth}
            type="bar"
            color="#FF6B6B"
            formatter={dollarFmt}
            defaultYearRange={20}
          />
        </div>
          </ChartErrorBoundary>
          </div>

      ) : null}

      {/* Quality Scorecard
           Standard mode (4Y): Yahoo data — score is stable regardless of chart range.
           Deep mode (10Y): automatically activated when AlphaVantage data is loaded
           (annual.length ≥ 8). Profile is passed for sector-relative percentile scoring. */}
      {finLoading && !financials ? (
        <QualityScorecardSkeleton />
      ) : (stockData?.financials ?? financials) && quote ? (
        <QualityScorecard
          result={calculateQualityScore(
            deepFinancials ?? stockData?.financials ?? financials!,
            quote,
            profile
          )}
        />
      ) : null}

      {/* Company Description */}
      {profile?.description && (
        <Card className="insight-enter">
          <CardHeader className="pb-3">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/70">
              About {profile.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13.5px] leading-[1.75] text-mist/85">
              {profile.description}
            </p>
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-9 items-center text-[12px] font-medium text-sunset-orange transition-colors hover:text-golden-hour"
              >
                {profile.website.replace(/^https?:\/\//, "")} →
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
