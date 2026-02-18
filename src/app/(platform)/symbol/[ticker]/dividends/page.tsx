"use client";

import { useParams } from "next/navigation";
import { useStockQuote, useFinancials } from "@/hooks/use-stock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/bar-chart";
import { ExpandChartDialog } from "@/components/charts/expand-chart-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatCurrency } from "@/lib/utils";
import { calculatePayoutRatio } from "@/lib/calculations";

export default function DividendsPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const { data: quote, isLoading: qLoading } = useStockQuote(ticker);
  const { data: financials, isLoading: fLoading } = useFinancials(ticker);

  const isLoading = qLoading || fLoading;

  if (isLoading) return <DividendsSkeleton />;

  if (!quote || !financials) {
    return (
      <p className="text-sm text-mist py-8 text-center">
        No dividend data found for {ticker}.
      </p>
    );
  }

  const annualCF = financials.cash_flow.annual;
  const annualIncome = financials.income_statement.annual;

  // Check if company pays dividends
  const paysDividends =
    quote.dividend_yield > 0 ||
    annualCF.some((cf) => cf.dividends_paid < 0);

  if (!paysDividends) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <p className="text-lg font-bold text-snow-peak">
            {ticker} Does Not Pay Dividends
          </p>
          <p className="text-sm text-mist">
            This company currently does not distribute dividends to shareholders.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---- Dividend Metrics ----
  const latestCF = annualCF[0];
  const latestIncome = annualIncome[0];

  const annualDPS =
    latestCF && quote.shares_outstanding > 0
      ? Math.abs(latestCF.dividends_paid) / quote.shares_outstanding
      : 0;

  const payoutRatio =
    latestCF && latestIncome
      ? calculatePayoutRatio(latestCF.dividends_paid, latestIncome.net_income)
      : null;

  // Estimate frequency from dividend yield + DPS (heuristic: if REIT → Monthly, else Quarterly)
  // Very simplified — in a real app this would come from an API
  const frequency = "Quarterly";

  // ---- DPS History ----
  const dpsHistory = annualCF
    .filter((cf) => cf.dividends_paid < 0)
    .slice()
    .reverse()
    .map((cf) => {
      const matchingIncome = annualIncome.find(
        (is) => is.period === cf.period
      );
      const shares =
        matchingIncome?.shares_outstanding_diluted || quote.shares_outstanding;
      return {
        period: cf.period.replace("FY", ""),
        dps: shares > 0 ? +(Math.abs(cf.dividends_paid) / shares).toFixed(2) : 0,
        totalPaid: Math.abs(cf.dividends_paid),
      };
    });

  // Consecutive years of payment
  const yearsOfPayment = dpsHistory.length;

  // Growth: compare first vs last DPS in history
  const dpsGrowth =
    dpsHistory.length >= 2
      ? (() => {
          const first = dpsHistory[0].dps;
          const last = dpsHistory[dpsHistory.length - 1].dps;
          if (first > 0 && last > 0) {
            const years = dpsHistory.length - 1;
            return Math.pow(last / first, 1 / years) - 1;
          }
          return null;
        })()
      : null;

  const summaryMetrics = [
    {
      label: "Dividend Yield",
      value: formatPercent(quote.dividend_yield / 100, 2),
    },
    {
      label: "Annual DPS",
      value: formatCurrency(annualDPS),
    },
    {
      label: "Payout Ratio",
      value: payoutRatio !== null ? formatPercent(payoutRatio) : "N/A",
    },
    {
      label: "Frequency",
      value: frequency,
    },
    {
      label: "History",
      value: `${yearsOfPayment} years`,
    },
    {
      label: "DPS CAGR",
      value: dpsGrowth !== null ? formatPercent(dpsGrowth) : "N/A",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Dividend Summary</CardTitle>
            <Badge variant="golden" className="text-xs">
              Income
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {summaryMetrics.map((m) => (
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

      {/* DPS History Chart */}
      {dpsHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  Dividend Per Share History
                </CardTitle>
                {dpsGrowth !== null && (
                  <Badge
                    variant={dpsGrowth > 0 ? "bullish" : "bearish"}
                    className="text-xs font-mono"
                  >
                    CAGR: {formatPercent(dpsGrowth)}
                  </Badge>
                )}
              </div>
              <ExpandChartDialog title="Dividend Per Share History">
                <BarChart
                  data={dpsHistory}
                  dataKey="dps"
                  xAxisKey="period"
                  height={420}
                  color="#FFBF69"
                  formatter={(v) => formatCurrency(v)}
                />
              </ExpandChartDialog>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart
              data={dpsHistory}
              dataKey="dps"
              xAxisKey="period"
              height={260}
              color="#FFBF69"
              formatter={(v) => formatCurrency(v)}
            />
          </CardContent>
        </Card>
      )}

      {/* Total Dividends Paid Chart */}
      {dpsHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Total Dividends Paid (Annual)
              </CardTitle>
              <ExpandChartDialog title="Total Dividends Paid (Annual)">
                <BarChart
                  data={dpsHistory}
                  dataKey="totalPaid"
                  xAxisKey="period"
                  height={420}
                  color="#FF8C42"
                  formatter={(v) =>
                    `$${(v / 1e9).toFixed(2)}B`
                  }
                />
              </ExpandChartDialog>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart
              data={dpsHistory}
              dataKey="totalPaid"
              xAxisKey="period"
              height={220}
              color="#FF8C42"
              formatter={(v) =>
                `$${(v / 1e9).toFixed(2)}B`
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Skeleton ----

function DividendsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}
