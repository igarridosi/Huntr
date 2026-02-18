"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatPercent,
  formatCompactNumber,
} from "@/lib/utils";
import type { StockQuote } from "@/types/stock";
import type {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
} from "@/types/financials";
import {
  calculateROIC,
  calculateFCFYield,
  calculateGrossMargin,
  calculateOperatingMargin,
  calculateNetMargin,
} from "@/lib/calculations";

interface KeyMetricsGridProps {
  quote: StockQuote;
  income: IncomeStatement | null;
  balance: BalanceSheet | null;
  cashFlow: CashFlowStatement | null;
}

interface MetricCardData {
  label: string;
  value: string;
  subLabel?: string;
}

export function KeyMetricsGrid({
  quote,
  income,
  balance,
  cashFlow,
}: KeyMetricsGridProps) {
  const metrics = buildMetrics(quote, income, balance, cashFlow);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
              {m.subLabel && (
                <p className="text-[10px] text-mist/60">{m.subLabel}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function buildMetrics(
  quote: StockQuote,
  income: IncomeStatement | null,
  balance: BalanceSheet | null,
  cashFlow: CashFlowStatement | null
): MetricCardData[] {
  const metrics: MetricCardData[] = [
    {
      label: "Market Cap",
      value: formatCompactNumber(quote.market_cap),
    },
    {
      label: "P/E Ratio",
      value: quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(1) : "N/A",
    },
    {
      label: "Dividend Yield",
      value:
        quote.dividend_yield > 0
          ? formatPercent(quote.dividend_yield)
          : "—",
    },
    {
      label: "Beta",
      value: quote.beta.toFixed(2),
    },
  ];

  if (income) {
    metrics.push({
      label: "Revenue (TTM)",
      value: formatCurrency(income.revenue, { compact: true }),
      subLabel: income.period,
    });
    metrics.push({
      label: "Net Income",
      value: formatCurrency(income.net_income, { compact: true }),
    });
    metrics.push({
      label: "EPS (Diluted)",
      value: formatCurrency(income.eps_diluted),
    });

    const grossMargin = calculateGrossMargin(income.gross_profit, income.revenue);
    if (grossMargin !== null) {
      metrics.push({
        label: "Gross Margin",
        value: formatPercent(grossMargin),
      });
    }

    const opMargin = calculateOperatingMargin(
      income.operating_income,
      income.revenue
    );
    if (opMargin !== null) {
      metrics.push({
        label: "Operating Margin",
        value: formatPercent(opMargin),
      });
    }

    const netMargin = calculateNetMargin(income.net_income, income.revenue);
    if (netMargin !== null) {
      metrics.push({
        label: "Net Margin",
        value: formatPercent(netMargin),
      });
    }
  }

  if (income && balance) {
    const roic = calculateROIC({
      operating_income: income.operating_income,
      income_tax: income.income_tax,
      pre_tax_income: income.pre_tax_income,
      total_equity: balance.total_equity,
      long_term_debt: balance.long_term_debt,
      cash_and_equivalents: balance.cash_and_equivalents,
    });
    if (roic !== null) {
      metrics.push({
        label: "ROIC",
        value: formatPercent(roic),
      });
    }
  }

  if (cashFlow) {
    metrics.push({
      label: "Free Cash Flow",
      value: formatCurrency(cashFlow.free_cash_flow, { compact: true }),
    });

    const fcfYield = calculateFCFYield(
      cashFlow.free_cash_flow,
      quote.price,
      quote.shares_outstanding
    );
    if (fcfYield !== null) {
      metrics.push({
        label: "FCF Yield",
        value: formatPercent(fcfYield),
      });
    }
  }

  return metrics;
}
