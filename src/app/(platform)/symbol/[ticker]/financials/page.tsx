"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useFinancials } from "@/hooks/use-stock-data";
import { PeriodToggle } from "@/components/financials/period-toggle";
import {
  FinancialTable,
  type FinancialRowDef,
} from "@/components/financials/financial-table";
import { MetricChart } from "@/components/financials/metric-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PeriodType, FinancialPeriod } from "@/types/financials";

function sortByDateAsc<T extends FinancialPeriod>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ---- Statement Section Toggle ----

type StatementType = "income" | "balance" | "cashflow";

const statementTabs: { key: StatementType; label: string }[] = [
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "cashflow", label: "Cash Flow" },
];

// ---- Row Definitions ----

const incomeRows: FinancialRowDef[] = [
  { label: "Revenue", key: "revenue", bold: true },
  { label: "Cost of Revenue", key: "cost_of_revenue", indent: true },
  { label: "Gross Profit", key: "gross_profit", bold: true },
  { label: "Operating Expenses", key: "operating_expenses", indent: true },
  { label: "Operating Income", key: "operating_income", bold: true },
  { label: "Interest Expense", key: "interest_expense", indent: true },
  { label: "Pre-Tax Income", key: "pre_tax_income" },
  { label: "Income Tax", key: "income_tax", indent: true },
  { label: "Net Income", key: "net_income", bold: true },
  { label: "EBITDA", key: "ebitda" },
  { label: "EPS (Basic)", key: "eps_basic", format: "eps" },
  { label: "EPS (Diluted)", key: "eps_diluted", format: "eps" },
  { label: "Shares Out. (Diluted)", key: "shares_outstanding_diluted" },
];

const balanceRows: FinancialRowDef[] = [
  { label: "Cash & Equivalents", key: "cash_and_equivalents" },
  { label: "Short-Term Investments", key: "short_term_investments", indent: true },
  { label: "Total Current Assets", key: "total_current_assets", bold: true },
  { label: "Total Non-Current Assets", key: "total_non_current_assets" },
  { label: "Total Assets", key: "total_assets", bold: true },
  { label: "Total Current Liabilities", key: "total_current_liabilities" },
  { label: "Long-Term Debt", key: "long_term_debt" },
  { label: "Total Non-Current Liabilities", key: "total_non_current_liabilities" },
  { label: "Total Liabilities", key: "total_liabilities", bold: true },
  { label: "Total Equity", key: "total_equity", bold: true },
  { label: "Retained Earnings", key: "retained_earnings", indent: true },
  { label: "Shares Outstanding", key: "shares_outstanding" },
];

const cashFlowRows: FinancialRowDef[] = [
  { label: "Operating Cash Flow", key: "operating_cash_flow", bold: true },
  { label: "Capital Expenditures", key: "capital_expenditures", indent: true },
  { label: "Free Cash Flow", key: "free_cash_flow", bold: true },
  { label: "Dividends Paid", key: "dividends_paid", indent: true },
  { label: "Share Repurchases", key: "share_repurchases", indent: true },
  { label: "Net Investing", key: "net_investing" },
  { label: "Net Financing", key: "net_financing" },
  { label: "Net Change in Cash", key: "net_change_in_cash", bold: true },
];

// ---- Page ----

export default function FinancialsPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const [activeStatement, setActiveStatement] = useState<StatementType>("income");

  const { data: financials, isLoading } = useFinancials(ticker, periodType);

  if (isLoading) {
    return <FinancialsSkeleton />;
  }

  if (!financials) {
    return (
      <p className="text-sm text-mist py-8 text-center">
        No financial data found for {ticker}.
      </p>
    );
  }

  // Select data based on active statement
  const getData = (): FinancialPeriod[] => {
    switch (activeStatement) {
      case "income":
        return sortByDateAsc(financials.income_statement[periodType]);
      case "balance":
        return sortByDateAsc(financials.balance_sheet[periodType]);
      case "cashflow":
        return sortByDateAsc(financials.cash_flow[periodType]);
    }
  };

  const getRows = (): FinancialRowDef[] => {
    switch (activeStatement) {
      case "income":
        return incomeRows;
      case "balance":
        return balanceRows;
      case "cashflow":
        return cashFlowRows;
    }
  };

  // Chart data (annual chronological for trends)
  const annualIncome = sortByDateAsc(financials.income_statement.annual);
  const annualCashFlow = sortByDateAsc(financials.cash_flow.annual);

  const revenueData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.revenue,
  }));

  const netIncomeData = annualIncome.map((is) => ({
    period: is.period.replace("FY", ""),
    value: is.net_income,
  }));

  const fcfData = annualCashFlow.map((cf) => ({
    period: cf.period.replace("FY", ""),
    value: cf.free_cash_flow,
  }));

  return (
    <div className="space-y-6">
      {/* Controls: Statement tabs + Period toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Statement tabs */}
        <div className="flex items-center gap-1">
          {statementTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveStatement(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                activeStatement === tab.key
                  ? "bg-wolf-surface text-snow-peak border border-wolf-border"
                  : "text-mist hover:text-snow-peak"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <PeriodToggle value={periodType} onChange={setPeriodType} />
      </div>

      {/* Financial Table */}
      <div className="bg-wolf-surface rounded-xl border border-wolf-border/50 px-6 py-4">
        <FinancialTable data={getData()} rows={getRows()} />
      </div>

      {/* Metric Trend Charts (annual only) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricChart
          title="Revenue"
          data={revenueData}
          dataKey="value"
          type="bar"
        />
        <MetricChart
          title="Net Income"
          data={netIncomeData}
          dataKey="value"
          type="area"
          color="#FFBF69"
        />
        <MetricChart
          title="Free Cash Flow"
          data={fcfData}
          dataKey="value"
          type="area"
        />
      </div>
    </div>
  );
}

function FinancialsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    </div>
  );
}
