"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { PeriodToggle } from "@/components/financials/period-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { PeriodType } from "@/types/financials";

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

function filterByYearRange<T extends { date: string }>(rows: T[], years: YearRange): T[] {
  if (!rows.length) return rows;

  const latest = rows.reduce((acc, row) => {
    const ts = new Date(row.date).getTime();
    return ts > acc ? ts : acc;
  }, 0);

  const cutoff = new Date(latest);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const cutoffTs = cutoff.getTime();

  return rows.filter((row) => new Date(row.date).getTime() >= cutoffTs);
}

export default function OverviewPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const [yearRange, setYearRange] = useState<YearRange>(10);
  const hasAutoSelectedPeriod = useRef(false);

  const { data: profile } = useStockProfile(ticker);
  const { data: quote, isLoading: quoteLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: finLoading } = useFinancials(ticker);

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

  useEffect(() => {
    if (!financials || hasAutoSelectedPeriod.current) return;

    const latestAnnualIncome = getMostRecentByDate(financials.income_statement.annual);
    const latestQuarterlyIncome = getMostRecentByDate(financials.income_statement.quarterly);

    if (!latestQuarterlyIncome) {
      hasAutoSelectedPeriod.current = true;
      return;
    }

    const annualTs = latestAnnualIncome
      ? new Date(latestAnnualIncome.date).getTime()
      : 0;
    const quarterlyTs = new Date(latestQuarterlyIncome.date).getTime();
    const staleThresholdMs = 420 * 24 * 60 * 60 * 1000;

    if (quarterlyTs > annualTs && Date.now() - annualTs > staleThresholdMs) {
      setPeriodType("quarterly");
    }

    hasAutoSelectedPeriod.current = true;
  }, [financials]);

  // Build all chart series from selected period
  const charts = useMemo(() => {
    if (!financials) return null;

    const incomeAnnual = sortByDateAsc(
      filterByYearRange(financials.income_statement.annual, yearRange)
    );
    const incomeQuarterly = sortByDateAsc(
      filterByYearRange(financials.income_statement.quarterly, yearRange)
    );
    const balanceAnnual = sortByDateAsc(
      filterByYearRange(financials.balance_sheet.annual, yearRange)
    );
    const balanceQuarterly = sortByDateAsc(
      filterByYearRange(financials.balance_sheet.quarterly, yearRange)
    );
    const cashFlowAnnual = sortByDateAsc(
      filterByYearRange(financials.cash_flow.annual, yearRange)
    );
    const cashFlowQuarterly = sortByDateAsc(
      filterByYearRange(financials.cash_flow.quarterly, yearRange)
    );

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
  }, [financials, periodType, quote?.shares_outstanding, yearRange]);

  if (quoteLoading && !quote) {
    return <DataHuntingLoader ticker={ticker} />;
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
        <div className="inline-flex items-center rounded-xl bg-wolf-black/60 border border-wolf-border/60 p-0.5 h-8 shadow-sm">
          {([5, 10, 15, 20] as const).map((years) => (
            <button
              key={years}
              type="button"
              onClick={() => setYearRange(years)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150",
                yearRange === years
                  ? "bg-sunset-orange/18 text-sunset-orange border border-sunset-orange/25 shadow-sm"
                  : "text-mist hover:text-snow-peak hover:bg-wolf-border/30"
              )}
            >
              {years}Y
            </button>
          ))}
        </div>
        <PeriodToggle value={periodType} onChange={setPeriodType} />
      </div>

      {/* Charts Grid — 5 columns × 2 rows */}
      {finLoading && !charts ? (
        <DataHuntingLoader ticker={ticker} compact />
      ) : charts ? (
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
      ) : null}

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
