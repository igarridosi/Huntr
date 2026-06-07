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
import { Tooltip } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricItem {
  label: string;
  value: string;
  /** Optional tooltip explaining methodology */
  tooltip?: string;
  /** Highlight style variant */
  variant?: "normal" | "warning" | "positive" | "negative";
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
  /** Period label for fundamentals, e.g. "Q4 2024" or "FY2024" */
  fundamentalsPeriod?: string;
}

// ─── P/E Anomaly Detection (Rule 1) ──────────────────────────────────────────

/**
 * Detects anomalously low P/E that may be caused by one-time non-operating
 * gains (e.g. asset sales, M&A accounting). Flags if:
 *   - Company is large-cap (market_cap > $10B) — typically stable earnings
 *   - P/E < 5x — unusually cheap for a blue-chip stock
 */
function isPeAnomaly(pe: number, marketCap: number): boolean {
  return pe > 0 && pe < 5 && marketCap >= 10_000_000_000;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Qualtrim-inspired categorized metrics bar.
 * Groups key numbers into Valuation, Quality, Margins & Growth, Balance, Dividend.
 *
 * Follows financial standards:
 *   - P/E labeled as "(TTM)" — trailing twelve months
 *   - Growth labeled with explicit window (YoY / TTM / CAGR)
 *   - Beta labeled as "5Y Monthly" per standard institutional convention
 *   - Anomaly flag when P/E < 5x on large-cap (potential non-recurring distortion)
 */
export function CategorizedMetrics({
  quote,
  income,
  balance,
  cashFlow,
  fundamentalsPeriod,
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
                  <span className="text-[11px] text-mist truncate flex items-center gap-1">
                    {item.tooltip ? (
                      <Tooltip content={item.tooltip} side="top">
                        <span className="border-b border-dashed border-mist/30 cursor-help">
                          {item.label}
                        </span>
                      </Tooltip>
                    ) : (
                      item.label
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-mono font-semibold font-tabular whitespace-nowrap flex items-center gap-1",
                      item.variant === "warning"
                        ? "text-golden-hour"
                        : item.variant === "positive"
                          ? "text-bullish"
                          : item.variant === "negative"
                            ? "text-bearish"
                            : "text-snow-peak"
                    )}
                  >
                    {item.variant === "warning" && (
                      <Tooltip
                        content="P/E may be distorted by a one-time non-operating gain (e.g. asset sale, M&A accounting). Verify with Adjusted/Operating EPS."
                        side="left"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0 cursor-help" />
                      </Tooltip>
                    )}
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Rule 4 — Data freshness footer */}
      <div className="border-t border-wolf-border/20 px-4 py-1.5 flex items-center justify-between gap-4">
        <span className="text-[9px] text-mist/40 font-mono">
          Price data: real-time · Fundamentals: {fundamentalsPeriod ?? "latest available"} (GAAP reported)
        </span>
        <span className="text-[9px] text-mist/40">
          P/E = TTM GAAP · β = 5Y Monthly vs S&P 500
        </span>
      </div>
    </div>
  );
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function buildCategories(
  quote: StockQuote,
  income: IncomeStatement | null,
  balance: BalanceSheet | null,
  cashFlow: CashFlowStatement | null
): MetricCategory[] {

  // ── Valuation ────────────────────────────────────────────────────────────

  const ps =
    income && income.revenue > 0
      ? (quote.market_cap / income.revenue).toFixed(2)
      : "N/A";

  const evEbitda = (() => {
    if (!income || !balance || income.ebitda <= 0) return "N/A";
    const ev =
      quote.market_cap + balance.long_term_debt - balance.cash_and_equivalents;
    return (ev / income.ebitda).toFixed(2);
  })();

  const pb =
    balance && balance.total_equity > 0
      ? (quote.market_cap / balance.total_equity).toFixed(2)
      : "N/A";

  const fcfYield = cashFlow
    ? calculateFCFYield(
        cashFlow.free_cash_flow,
        quote.price,
        quote.shares_outstanding
      )
    : null;

  // Rule 1 — P/E anomaly check
  const peValue = quote.pe_ratio > 0 ? quote.pe_ratio : null;
  const peAnomaly = peValue !== null && isPeAnomaly(peValue, quote.market_cap);

  // ── Quality ───────────────────────────────────────────────────────────────

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

  const grossMargin = income
    ? calculateGrossMargin(income.gross_profit, income.revenue)
    : null;
  const opMargin = income
    ? calculateOperatingMargin(income.operating_income, income.revenue)
    : null;
  const netMargin = income
    ? calculateNetMargin(income.net_income, income.revenue)
    : null;

  // ── Dividend ──────────────────────────────────────────────────────────────

  const payoutRatio =
    cashFlow && income && income.net_income > 0
      ? Math.abs(cashFlow.dividends_paid) / income.net_income
      : null;

  // Rule 2 — Revenue growth YoY (requires previous period data; use quote field)
  const revenueGrowthYoY = quote.revenue_growth ?? null;
  const earningsGrowthYoY = quote.earnings_growth ?? null;

  const categories: MetricCategory[] = [
    {
      title: "Valuation",
      items: [
        {
          label: "Market Cap",
          value: formatCompactNumber(quote.market_cap),
          tooltip: "Total shares outstanding × current price",
        },
        {
          // Rule 1 — explicit TTM label
          label: "P/E (TTM)",
          value: peValue !== null ? `${peValue.toFixed(1)}x` : "N/A",
          tooltip: peAnomaly
            ? "⚠ P/E < 5x on large-cap — likely distorted by a one-time non-operating gain. Verify with Adjusted/Operating EPS."
            : "Trailing twelve-month GAAP P/E. Calculated as Price ÷ Diluted EPS (last 4 quarters).",
          variant: peAnomaly ? "warning" : "normal",
        },
        {
          label: "P/S (TTM)",
          value: ps,
          tooltip: "Market Cap ÷ Revenue (trailing 12 months)",
        },
        {
          label: "EV/EBITDA (TTM)",
          value: evEbitda,
          tooltip: "Enterprise Value ÷ EBITDA (trailing 12 months). EV = Market Cap + Debt − Cash.",
        },
        {
          label: "P/B (TTM)",
          value: pb,
          tooltip: "Market Cap ÷ Book Value (Shareholders' Equity)",
        },
        {
          label: "FCF Yield (TTM)",
          value: fcfYield !== null ? formatPercent(fcfYield) : "N/A",
          tooltip: "Free Cash Flow ÷ Market Cap. Acts as a 'real' earnings yield — hard to manipulate.",
          variant: fcfYield !== null && fcfYield > 0.04 ? "positive" : "normal",
        },
      ],
    },
    {
      title: "Quality",
      items: [
        {
          label: "ROIC (TTM)",
          value: roic !== null ? formatPercent(roic) : "N/A",
          tooltip: "Return on Invested Capital = NOPAT ÷ (Equity + Debt − Cash). > 15% signals a durable competitive advantage.",
          variant: roic !== null && roic > 0.15 ? "positive" : roic !== null && roic < 0 ? "negative" : "normal",
        },
        {
          label: "Gross Margin (TTM)",
          value: grossMargin !== null ? formatPercent(grossMargin) : "N/A",
          tooltip: "Gross Profit ÷ Revenue. High margins signal pricing power.",
        },
        {
          label: "Net Margin (TTM)",
          value: netMargin !== null ? formatPercent(netMargin) : "N/A",
          tooltip: "Net Income ÷ Revenue. Bottom-line profitability after all costs.",
          variant: netMargin !== null && netMargin > 0.15 ? "positive" : netMargin !== null && netMargin < 0 ? "negative" : "normal",
        },
      ],
    },
    {
      title: "Margins & Growth",
      items: [
        {
          // Rule 2 — explicit TTM window
          label: "Op. Margin (TTM)",
          value: opMargin !== null ? formatPercent(opMargin) : "N/A",
          tooltip: "Operating Income ÷ Revenue (trailing 12 months)",
        },
        {
          // Rule 2 — EPS must specify it's a point-in-time snapshot, not growth
          label: "EPS Diluted (TTM)",
          value: income ? formatCurrency(income.eps_diluted) : "N/A",
          tooltip: "Diluted GAAP EPS for the most recent reported period. Includes all dilutive securities.",
        },
        ...(revenueGrowthYoY !== null
          ? [{
              // Rule 2 — explicit YoY label
              label: "Rev. Growth (YoY)",
              value: `${revenueGrowthYoY >= 0 ? "+" : ""}${formatPercent(revenueGrowthYoY, 1)}`,
              tooltip: "Year-over-Year revenue growth: current TTM vs prior TTM period.",
              variant: (revenueGrowthYoY > 0 ? "positive" : "negative") as MetricItem["variant"],
            }]
          : [{
              label: "Revenue (TTM)",
              value: income ? formatCurrency(income.revenue, { compact: true }) : "N/A",
              tooltip: "Total revenue for the trailing twelve-month period (GAAP).",
            }]
        ),
      ],
    },
    {
      title: "Balance",
      items: [
        {
          label: "Cash & Equiv.",
          value: balance
            ? formatCompactNumber(balance.cash_and_equivalents)
            : "N/A",
          tooltip: "Cash and short-term investments on the balance sheet",
        },
        {
          label: "Long-term Debt",
          value: balance
            ? formatCompactNumber(balance.long_term_debt)
            : "N/A",
          tooltip: "Total long-term debt obligations",
        },
        {
          label: "Net Cash / Debt",
          value: balance
            ? formatCompactNumber(
                balance.cash_and_equivalents - balance.long_term_debt
              )
            : "N/A",
          tooltip: "Cash − Long-term Debt. Positive = net cash position.",
          variant: balance
            ? balance.cash_and_equivalents > balance.long_term_debt
              ? "positive"
              : "negative"
            : "normal",
        },
      ],
    },
    {
      title: "Dividend",
      items: [
        {
          label: "Div. Yield (TTM)",
          value:
            quote.dividend_yield > 0
              ? formatPercent(quote.dividend_yield / 100, 2)
              : "—",
          tooltip: "Annual dividends paid ÷ current price (trailing 12 months)",
          variant: quote.dividend_yield > 3 ? "positive" : "normal",
        },
        {
          label: "Payout Ratio (TTM)",
          value:
            payoutRatio !== null ? formatPercent(payoutRatio) : "N/A",
          tooltip: "Dividends Paid ÷ Net Income. >80% may be unsustainable.",
          variant:
            payoutRatio !== null && payoutRatio > 0.8
              ? "warning"
              : "normal",
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
          tooltip: "Dividend Per Share — total dividends paid ÷ shares outstanding",
        },
      ],
    },
  ];

  return categories;
}
