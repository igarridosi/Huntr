"use client";

import { useParams } from "next/navigation";
import {
  useStockQuote,
  useFinancials,
} from "@/hooks/use-stock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart } from "@/components/charts/area-chart";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { MetricChart } from "@/components/financials/metric-chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatPercent,
  formatCompactNumber,
} from "@/lib/utils";
import {
  calculateROIC,
  calculateFCFYield,
  calculateAllCAGRs,
} from "@/lib/calculations";

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export default function ValuationPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const { data: quote, isLoading: qLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: fLoading } = useFinancials(ticker);

  const isLoading = qLoading || fLoading;

  if (isLoading) return <ValuationSkeleton />;

  if (!quote || !financials) {
    return (
      <p className="text-sm text-mist py-8 text-center">
        No valuation data found for {ticker}.
      </p>
    );
  }

  const annualIncome = sortByDateAsc(financials.income_statement.annual);
  const annualBalance = sortByDateAsc(financials.balance_sheet.annual);
  const annualCashFlow = sortByDateAsc(financials.cash_flow.annual);

  const latest = annualIncome.at(-1);
  const latestBal = annualBalance.at(-1);
  const latestCF = annualCashFlow.at(-1);

  // ---- Valuation Metrics ----
  const marketCap = quote.market_cap;
  const ps = latest ? marketCap / latest.revenue : null;
  const pb = latestBal && latestBal.total_equity > 0
    ? marketCap / latestBal.total_equity
    : null;
  const evEbitda = (() => {
    if (!latest || !latestBal || latest.ebitda <= 0) return null;
    const ev =
      marketCap +
      latestBal.long_term_debt -
      latestBal.cash_and_equivalents;
    return ev / latest.ebitda;
  })();

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

  const fcfYield = latestCF
    ? calculateFCFYield(
        latestCF.free_cash_flow,
        quote.price,
        quote.shares_outstanding
      )
    : null;

  const metrics = [
    { label: "P/E Ratio", value: quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A" },
    { label: "P/S Ratio", value: ps !== null ? ps.toFixed(1) : "N/A" },
    { label: "P/B Ratio", value: pb !== null ? pb.toFixed(1) : "N/A" },
    { label: "EV/EBITDA", value: evEbitda !== null ? evEbitda.toFixed(1) : "N/A" },
    { label: "ROIC", value: roic !== null ? formatPercent(roic) : "N/A" },
    { label: "FCF Yield", value: fcfYield !== null ? formatPercent(fcfYield) : "N/A" },
    { label: "Market Cap", value: formatCompactNumber(marketCap) },
    {
      label: "Enterprise Value",
      value: latestBal
        ? formatCompactNumber(
            marketCap + latestBal.long_term_debt - latestBal.cash_and_equivalents
          )
        : "N/A",
    },
  ];

  // ---- Historical P/E (approximate from earnings) ----
  // Use price ÷ EPS from each annual period (simplification)
  const historicalPE = sortByDateAsc(annualIncome)
    .filter((is) => is.eps_diluted > 0)
    .map((is) => ({
      period: is.period.replace("FY", ""),
      pe: +(quote.price / is.eps_diluted).toFixed(1),
    }));

  const avgPE =
    historicalPE.length > 0
      ? historicalPE.reduce((sum, h) => sum + h.pe, 0) / historicalPE.length
      : null;

  // ---- CAGR Indicators ----
  const revenueSeries = annualIncome.map((is) => is.revenue);
  const epsSeries = annualIncome.map((is) => is.eps_diluted);
  const fcfSeries = annualCashFlow.map((cf) => cf.free_cash_flow);

  const revenueChartData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.revenue,
  }));
  const epsChartData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.eps_diluted,
  }));
  const fcfChartData = annualCashFlow.map((cf) => ({
    period: cf.period.replace("FY", ""),
    value: cf.free_cash_flow,
  }));

  const revenueCAGRs = calculateAllCAGRs(revenueSeries);
  const epsCAGRs = calculateAllCAGRs(epsSeries);
  const fcfCAGRs = calculateAllCAGRs(fcfSeries);

  return (
    <div className="space-y-6">
      {/* Valuation Metrics Grid */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Valuation Multiples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="space-y-1 p-3 rounded-lg bg-wolf-black/40 border border-wolf-border/30"
              >
                <p className="text-[11px] text-mist uppercase tracking-wider font-medium">
                  {m.label}
                </p>
                <p className="text-sm font-mono font-bold font-tabular text-snow-peak">
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Historical P/E Chart */}
      {historicalPE.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Historical P/E Ratio</CardTitle>
                {avgPE !== null && (
                  <span className="text-xs text-mist font-mono">
                    Avg: {avgPE.toFixed(1)}
                  </span>
                )}
              </div>
              <ExpandChartDialog title="Historical P/E Ratio">
                <AreaChart
                  data={historicalPE}
                  dataKey="pe"
                  xAxisKey="period"
                  height={420}
                  color="#FFBF69"
                  formatter={(v) => `${v.toFixed(1)}x`}
                />
              </ExpandChartDialog>
            </div>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={historicalPE}
              dataKey="pe"
              xAxisKey="period"
              height={260}
              color="#FFBF69"
              formatter={(v) => `${v.toFixed(1)}x`}
            />
          </CardContent>
        </Card>
      )}

      {/* CAGR Indicators */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Growth Rates (CAGR)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <CAGRBlock
              label="Revenue"
              cagrs={revenueCAGRs}
              chartData={revenueChartData}
              color="#FF8C42"
            />
            <CAGRBlock
              label="EPS"
              cagrs={epsCAGRs}
              chartData={epsChartData}
              color="#9FD5CC"
            />
            <CAGRBlock
              label="Free Cash Flow"
              cagrs={fcfCAGRs}
              chartData={fcfChartData}
              color="#4DC990"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- CAGR Block ----

function CAGRBlock({
  label,
  cagrs,
  chartData,
  color,
}: {
  label: string;
  cagrs: { cagr3Y: number | null; cagr5Y: number | null; cagr10Y: number | null };
  chartData: { period: string; value: number }[];
  color: string;
}) {
  const windows = [
    { label: "3Y", value: cagrs.cagr3Y },
    { label: "5Y", value: cagrs.cagr5Y },
    { label: "10Y", value: cagrs.cagr10Y },
  ];

  return (
    <div className="space-y-2">
      <MetricChart
        title={label}
        data={chartData}
        dataKey="value"
        type="area"
        color={color}
      />
      <div className="flex items-center gap-2">
        {windows.map((w) => (
          <Badge
            key={w.label}
            variant={
              w.value === null
                ? "secondary"
                : w.value > 0
                  ? "bullish"
                  : "bearish"
            }
            className="font-mono text-xs"
          >
            {w.label}:{" "}
            {w.value !== null ? formatPercent(w.value, 1) : "N/A"}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---- Skeleton ----

function ValuationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
