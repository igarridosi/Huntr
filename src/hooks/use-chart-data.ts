"use client";

import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { fetchCompanyFinancials } from "@/app/actions/stock";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import { METRICS, resolveChart, type ChartSpec, type ResolveInputs, type ResolvedChart } from "@/lib/chart-builder";
import type { CompanyFinancials } from "@/types/financials";
import { useBatchDailyHistory } from "./use-stock-data";

type StatementResult = UseQueryResult<CompanyFinancials | null>;

function combineStatements(results: StatementResult[]) {
  return {
    data: results.map((r) => r.data),
    pending: results.map((r) => r.isPending),
  };
}

export interface ChartData {
  chart: ResolvedChart;
  /** Statements per ticker as currently cached (undefined while loading). */
  financials: Record<string, CompanyFinancials | null | undefined>;
  /** Every distinct ticker on the chart. */
  tickers: string[];
  /** Tickers whose statements or prices are still on their way. */
  pendingTickers: string[];
  /** True until every needed query has settled at least once. */
  isLoading: boolean;
}

/**
 * Fetches what a spec needs and resolves it.
 *
 * Statements are one query per ticker under the same key `useFinancials`
 * uses, so a company opened earlier on its ticker page is already in the
 * cache. `fetchCompanyFinancials` returns annual and quarterly together;
 * granularity is a resolver concern, but it stays in the key to match the
 * existing hook. Prices come in one batch for every ticker that needs them.
 */
export function useChartData(spec: ChartSpec): ChartData {
  const tickers = useMemo(
    () => Array.from(new Set(spec.series.map((s) => s.ticker))),
    [spec.series]
  );
  const statementTickers = useMemo(
    () =>
      tickers.filter((t) =>
        spec.series.some((s) => s.ticker === t && METRICS[s.metric].source !== "price")
      ),
    [tickers, spec.series]
  );
  const priceTickers = useMemo(
    () =>
      tickers.filter((t) =>
        spec.series.some((s) => s.ticker === t && METRICS[s.metric].source !== "statements")
      ),
    [tickers, spec.series]
  );

  const statements = useQueries({
    queries: statementTickers.map((ticker) => ({
      queryKey: [...QUERY_KEYS.FINANCIALS(ticker), spec.granularity],
      queryFn: () => fetchCompanyFinancials(ticker),
      staleTime: STALE_TIMES.FINANCIALS,
      meta: { ticker },
    })),
    // A stable `combine` lets React Query hand back the same object while
    // nothing inside changed, which keeps the memos below honest.
    combine: combineStatements,
  });

  const prices = useBatchDailyHistory(priceTickers, "ALL", priceTickers.length > 0);

  const financials = useMemo(() => {
    const out: Record<string, CompanyFinancials | null | undefined> = {};
    statementTickers.forEach((ticker, i) => {
      out[ticker] = statements.data[i];
    });
    return out;
  }, [statementTickers, statements.data]);

  const pendingTickers = useMemo(() => {
    const pending = new Set<string>();
    statementTickers.forEach((ticker, i) => {
      if (statements.pending[i]) pending.add(ticker);
    });
    if (prices.isPending && priceTickers.length > 0) priceTickers.forEach((t) => pending.add(t));
    return Array.from(pending);
  }, [statementTickers, statements.pending, priceTickers, prices.isPending]);

  const chart = useMemo(() => {
    const inputs: ResolveInputs = {
      // A ticker still loading is left out entirely so the resolver does not
      // warn about "no statements" for something that is merely on its way.
      financials: Object.fromEntries(
        Object.entries(financials).filter(([t]) => !pendingTickers.includes(t))
      ),
      prices: prices.data ?? {},
    };
    const visible: ChartSpec = {
      ...spec,
      series: spec.series.filter((s) => !pendingTickers.includes(s.ticker)),
    };
    return resolveChart(visible, inputs);
  }, [spec, financials, prices.data, pendingTickers]);

  return { chart, financials, tickers, pendingTickers, isLoading: pendingTickers.length > 0 };
}
