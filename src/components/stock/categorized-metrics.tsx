"use client";

import type { StockQuote } from "@/types/stock";
import type {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
} from "@/types/financials";
import {
  formatCurrency,
  formatPercent,
  formatCompactNumber,
} from "@/lib/utils";
import {
  calculateROIC,
  calculateFCFYield,
  calculateGrossMargin,
  calculateOperatingMargin,
  calculateNetMargin,
} from "@/lib/calculations";

// ---- Types ----

interface MetricItem {
  label: string;
  value: string;
}

interface MetricCategory {
  title: string;
  items: MetricItem[];
}

interface CategorizedMetricsProps {
  quote: StockQuote;
  income: IncomeStatement | null;
  balance: BalanceSheet | null;
  cashFlow: CashFlowStatement | null;
}

/**
 * Qualtrim-inspired categorized metrics bar.
 * Groups key numbers into Valuation, Quality, Margins & Growth, Balance, Dividend.
 */
export function CategorizedMetrics({
  quote,
  income,
  balance,
  cashFlow,
}: CategorizedMetricsProps) {
  const categories = buildCategories(quote, income, balance, cashFlow);

  return (
    <div className="rounded-xl border border-wolf-border/50 bg-wolf-surface overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-wolf-border/40">
        {categories.map((cat) => (
          <div key={cat.title} className="p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-snow-peak uppercase tracking-wider">
              {cat.title}
            </h4>
            <div className="space-y-1.5">
              {cat.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-[11px] text-mist truncate">
                    {item.label}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-snow-peak font-tabular whitespace-nowrap">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Builder ----

function buildCategories(
  quote: StockQuote,
  income: IncomeStatement | null,
  balance: BalanceSheet | null,
  cashFlow: CashFlowStatement | null
): MetricCategory[] {
  // P/S
  const ps =
    income && income.revenue > 0
      ? (quote.market_cap / income.revenue).toFixed(2)
      : "N/A";

  // EV/EBITDA
  const evEbitda = (() => {
    if (!income || !balance || income.ebitda <= 0) return "N/A";
    const ev =
      quote.market_cap + balance.long_term_debt - balance.cash_and_equivalents;
    return (ev / income.ebitda).toFixed(2);
  })();

  // P/B
  const pb =
    balance && balance.total_equity > 0
      ? (quote.market_cap / balance.total_equity).toFixed(2)
      : "N/A";

  // FCF Yield
  const fcfYield = cashFlow
    ? calculateFCFYield(
        cashFlow.free_cash_flow,
        quote.price,
        quote.shares_outstanding
      )
    : null;

  // ROIC
  const roic =
    income && balance
      ? calculateROIC({
          operating_income: income.operating_income,
          income_tax: income.income_tax,
          pre_tax_income: income.pre_tax_income,
          total_equity: balance.total_equity,
          long_term_debt: balance.long_term_debt,
          cash_and_equivalents: balance.cash_and_equivalents,
        })
      : null;

  // Margins
  const grossMargin = income
    ? calculateGrossMargin(income.gross_profit, income.revenue)
    : null;
  const opMargin = income
    ? calculateOperatingMargin(income.operating_income, income.revenue)
    : null;
  const netMargin = income
    ? calculateNetMargin(income.net_income, income.revenue)
    : null;

  // Payout Ratio
  const payoutRatio =
    cashFlow && income && income.net_income > 0
      ? Math.abs(cashFlow.dividends_paid) / income.net_income
      : null;

  const categories: MetricCategory[] = [
    {
      title: "Valuation",
      items: [
        { label: "Market Cap", value: formatCompactNumber(quote.market_cap) },
        {
          label: "P/E (TTM)",
          value: quote.pe_ratio > 0 ? quote.pe_ratio.toFixed(2) : "N/A",
        },
        { label: "Price to Sales (TTM)", value: ps },
        { label: "EV/EBITDA (TTM)", value: evEbitda },
        { label: "Price to Book (TTM)", value: pb },
        {
          label: "FCF Yield (TTM)",
          value: fcfYield !== null ? formatPercent(fcfYield) : "N/A",
        },
      ],
    },
    {
      title: "Quality",
      items: [
        {
          label: "ROIC",
          value: roic !== null ? formatPercent(roic) : "N/A",
        },
        {
          label: "Gross Margin",
          value: grossMargin !== null ? formatPercent(grossMargin) : "N/A",
        },
        {
          label: "Net Margin",
          value: netMargin !== null ? formatPercent(netMargin) : "N/A",
        },
      ],
    },
    {
      title: "Margins & Growth",
      items: [
        {
          label: "Operating Margin (TTM)",
          value: opMargin !== null ? formatPercent(opMargin) : "N/A",
        },
        {
          label: "EPS (Diluted)",
          value: income ? formatCurrency(income.eps_diluted) : "N/A",
        },
        {
          label: "Revenue",
          value: income
            ? formatCurrency(income.revenue, { compact: true })
            : "N/A",
        },
      ],
    },
    {
      title: "Balance",
      items: [
        {
          label: "Cash",
          value: balance
            ? formatCompactNumber(balance.cash_and_equivalents)
            : "N/A",
        },
        {
          label: "Debt",
          value: balance
            ? formatCompactNumber(balance.long_term_debt)
            : "N/A",
        },
        {
          label: "Net",
          value: balance
            ? formatCompactNumber(
                balance.cash_and_equivalents - balance.long_term_debt
              )
            : "N/A",
        },
      ],
    },
    {
      title: "Dividend",
      items: [
        {
          label: "Dividend Yield",
          value:
            quote.dividend_yield > 0
              ? formatPercent(quote.dividend_yield / 100, 2)
              : "—",
        },
        {
          label: "Payout Ratio",
          value:
            payoutRatio !== null ? formatPercent(payoutRatio) : "N/A",
        },
        {
          label: "DPS (Annual)",
          value:
            cashFlow && quote.shares_outstanding > 0
              ? formatCurrency(
                  Math.abs(cashFlow.dividends_paid) /
                    quote.shares_outstanding
                )
              : "—",
        },
      ],
    },
  ];

  return categories;
}
