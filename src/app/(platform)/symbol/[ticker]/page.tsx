"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  useStockProfile,
  useStockQuote,
  useFinancials,
} from "@/hooks/use-stock-data";
import { CategorizedMetrics } from "@/components/stock/categorized-metrics";
import {
  MetricChartCard,
  type MetricChartCardData,
} from "@/components/stock/metric-chart-card";
import { PeriodToggle } from "@/components/financials/period-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { PeriodType } from "@/types/financials";

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export default function OverviewPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const [periodType, setPeriodType] = useState<PeriodType>("annual");

  const { data: profile } = useStockProfile(ticker);
  const { data: quote, isLoading: quoteLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: finLoading } = useFinancials(ticker);

  const isLoading = quoteLoading || finLoading;

  // Most recent annual statements (for categorized metrics)
  const latestIncome = financials?.income_statement.annual.at(-1) ?? null;
  const latestBalance = financials?.balance_sheet.annual.at(-1) ?? null;
  const latestCashFlow = financials?.cash_flow.annual.at(-1) ?? null;

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
    }));
    const revenueQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue,
    }));

    const ebitdaAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.ebitda,
    }));
    const ebitdaQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.ebitda,
    }));

    const fcfAnnual: MetricChartCardData[] = cashFlowAnnual.map((cf) => ({
      period: fmt(cf.period, "annual"),
      value: cf.free_cash_flow,
    }));
    const fcfQuarterly: MetricChartCardData[] = cashFlowQuarterly.map((cf) => ({
      period: fmt(cf.period, "quarterly"),
      value: cf.free_cash_flow,
    }));

    const netIncomeAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.net_income,
    }));
    const netIncomeQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.net_income,
    }));

    const epsAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.eps_diluted,
    }));
    const epsQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.eps_diluted,
    }));

    const cashDebtAnnual: MetricChartCardData[] = balanceAnnual.map((bs) => ({
      period: fmt(bs.period, "annual"),
      value: bs.cash_and_equivalents,
    }));
    const cashDebtQuarterly: MetricChartCardData[] = balanceQuarterly.map((bs) => ({
      period: fmt(bs.period, "quarterly"),
      value: bs.cash_and_equivalents,
    }));

    const dividendsAnnual: MetricChartCardData[] = cashFlowAnnual.map((cf) => ({
      period: fmt(cf.period, "annual"),
      value: Math.abs(cf.dividends_paid),
    }));
    const dividendsQuarterly: MetricChartCardData[] = cashFlowQuarterly.map((cf) => ({
      period: fmt(cf.period, "quarterly"),
      value: Math.abs(cf.dividends_paid),
    }));

    const sharesOutAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.shares_outstanding_diluted,
    }));
    const sharesOutQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.shares_outstanding_diluted,
    }));

    const grossMarginAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.revenue > 0 ? is.gross_profit / is.revenue : 0,
    }));
    const grossMarginQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue > 0 ? is.gross_profit / is.revenue : 0,
    }));

    const opMarginAnnual: MetricChartCardData[] = incomeAnnual.map((is) => ({
      period: fmt(is.period, "annual"),
      value: is.revenue > 0 ? is.operating_income / is.revenue : 0,
    }));
    const opMarginQuarterly: MetricChartCardData[] = incomeQuarterly.map((is) => ({
      period: fmt(is.period, "quarterly"),
      value: is.revenue > 0 ? is.operating_income / is.revenue : 0,
    }));

    return {
      revenue: {
        data: byPeriod(revenueAnnual, revenueQuarterly),
        annualData: revenueAnnual,
        quarterlyData: revenueQuarterly,
        growth: growth(byPeriod(revenueAnnual, revenueQuarterly)),
      },
      ebitda: {
        data: byPeriod(ebitdaAnnual, ebitdaQuarterly),
        annualData: ebitdaAnnual,
        quarterlyData: ebitdaQuarterly,
        growth: growth(byPeriod(ebitdaAnnual, ebitdaQuarterly)),
      },
      fcf: {
        data: byPeriod(fcfAnnual, fcfQuarterly),
        annualData: fcfAnnual,
        quarterlyData: fcfQuarterly,
        growth: growth(byPeriod(fcfAnnual, fcfQuarterly)),
      },
      netIncome: {
        data: byPeriod(netIncomeAnnual, netIncomeQuarterly),
        annualData: netIncomeAnnual,
        quarterlyData: netIncomeQuarterly,
        growth: growth(byPeriod(netIncomeAnnual, netIncomeQuarterly)),
      },
      eps: {
        data: byPeriod(epsAnnual, epsQuarterly),
        annualData: epsAnnual,
        quarterlyData: epsQuarterly,
        growth: growth(byPeriod(epsAnnual, epsQuarterly)),
      },
      cashDebt: {
        data: byPeriod(cashDebtAnnual, cashDebtQuarterly),
        annualData: cashDebtAnnual,
        quarterlyData: cashDebtQuarterly,
        growth: growth(byPeriod(cashDebtAnnual, cashDebtQuarterly)),
      },
      dividends: {
        data: byPeriod(dividendsAnnual, dividendsQuarterly),
        annualData: dividendsAnnual,
        quarterlyData: dividendsQuarterly,
        growth: growth(byPeriod(dividendsAnnual, dividendsQuarterly)),
      },
      sharesOut: {
        data: byPeriod(sharesOutAnnual, sharesOutQuarterly),
        annualData: sharesOutAnnual,
        quarterlyData: sharesOutQuarterly,
        growth: growth(byPeriod(sharesOutAnnual, sharesOutQuarterly)),
      },
      grossMargin: {
        data: byPeriod(grossMarginAnnual, grossMarginQuarterly),
        annualData: grossMarginAnnual,
        quarterlyData: grossMarginQuarterly,
        growth: null as number | null,
      },
      opMargin: {
        data: byPeriod(opMarginAnnual, opMarginQuarterly),
        annualData: opMarginAnnual,
        quarterlyData: opMarginQuarterly,
        growth: null as number | null,
      },
    };
  }, [financials, periodType]);

  if (isLoading) {
    return <OverviewSkeleton />;
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
      {/* Categorized Metrics Bar */}
      {quote && (
        <CategorizedMetrics
          quote={quote}
          income={latestIncome}
          balance={latestBalance}
          cashFlow={latestCashFlow}
        />
      )}

      {/* Controls */}
      <div className="flex items-center justify-end gap-3">
        <PeriodToggle value={periodType} onChange={setPeriodType} />
      </div>

      {/* Charts Grid — 5 columns × 2 rows */}
      {charts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
            color="#5A9BD5"
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
        </div>
      )}

      {/* Company Description */}
      {profile?.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">About {profile.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-mist leading-relaxed">
              {profile.description}
            </p>
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-sunset-orange hover:text-sunset-orange/80 transition-colors"
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

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metrics bar skeleton */}
      <Skeleton className="h-36 rounded-xl" />
      {/* Period toggle */}
      <div className="flex justify-end">
        <Skeleton className="h-8 w-40" />
      </div>
      {/* Charts grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
