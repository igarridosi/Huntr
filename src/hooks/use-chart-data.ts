"use client";

import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { fetchAlphaStatements, fetchCompanyFinancials } from "@/app/actions/stock";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import {
  METRICS,
  availableDates,
  coversStatements,
  defaultRange,
  mergeFinancials,
  resolveChart,
  statementsFor,
  type ChartSpec,
  type ResolveInputs,
  type ResolvedChart,
  type StatementKind,
} from "@/lib/chart-builder";
import type { CompanyFinancials } from "@/types/financials";
import { useBatchDailyHistory } from "./use-stock-data";

type FinResult = UseQueryResult<CompanyFinancials | null>;

function combineFinancials(results: FinResult[]) {
  return {
    data: results.map((r) => r.data),
    pending: results.map((r) => r.isPending),
  };
}

/** Cache key of the deep-history overlay for one ticker and statement set. */
export function deepQueryKey(ticker: string, statements: readonly StatementKind[]) {
  return ["chart-builder", "deep", ticker, statements.join("+")] as const;
}

export interface ChartData {
  chart: ResolvedChart;
  /** Quick statements per ticker with the deep overlay merged in. */
  financials: Record<string, CompanyFinancials | null | undefined>;
  /** Every distinct ticker on the chart. */
  tickers: string[];
  /** Statements the chart's metrics read. */
  statements: StatementKind[];
  /** Tickers whose statements come from the deep (Alpha Vantage) overlay. */
  deepTickers: string[];
  /** Period-end dates the chart could show, before the range is applied. */
  dates: string[];
  /** The range in effect: the spec's, or the default window when unset. */
  range: { from: string | null; to: string | null };
  /** Tickers whose statements or prices are still on their way. */
  pendingTickers: string[];
  /** True until every needed query has settled at least once. */
  isLoading: boolean;
}

/**
 * Fetches what a spec needs and resolves it.
 *
 * Quick statements are one query per ticker under the same key
 * `useFinancials` uses, so a company opened earlier on its ticker page is
 * already in the cache. On top of that, a deep overlay per ticker holds
 * only the statements this chart reads, from Alpha Vantage: read from the
 * server cache for free here, filled by "Load 20-year history". Kept
 * under its own key because it is partial — the ticker page must never
 * see an income-only object under the shared key.
 */
export function useChartData(spec: ChartSpec): ChartData {
  const tickers = useMemo(() => Array.from(new Set(spec.series.map((s) => s.ticker))), [spec.series]);
  const statementTickers = useMemo(
    () => tickers.filter((t) => spec.series.some((s) => s.ticker === t && METRICS[s.metric].source !== "price")),
    [tickers, spec.series]
  );
  const priceTickers = useMemo(
    () => tickers.filter((t) => spec.series.some((s) => s.ticker === t && METRICS[s.metric].source !== "statements")),
    [tickers, spec.series]
  );
  const statements = useMemo(() => statementsFor(spec), [spec]);
  const statementsKey = statements.join("+");

  const quick = useQueries({
    queries: statementTickers.map((ticker) => ({
      queryKey: [...QUERY_KEYS.FINANCIALS(ticker), spec.granularity],
      queryFn: () => fetchCompanyFinancials(ticker),
      staleTime: STALE_TIMES.FINANCIALS,
    })),
    combine: combineFinancials,
  });

  const deep = useQueries({
    queries: statementTickers.map((ticker) => ({
      queryKey: deepQueryKey(ticker, statements),
      // Cache-only: never spends an Alpha Vantage call by itself.
      queryFn: () => (statements.length ? fetchAlphaStatements(ticker, statements, true) : Promise.resolve(null)),
      staleTime: STALE_TIMES.STATIC,
    })),
    combine: combineFinancials,
  });

  const prices = useBatchDailyHistory(priceTickers, "ALL", priceTickers.length > 0);

  const { financials, deepTickers } = useMemo(() => {
    const out: Record<string, CompanyFinancials | null | undefined> = {};
    const deepList: string[] = [];
    statementTickers.forEach((ticker, i) => {
      const overlay = deep.data[i];
      const covered = coversStatements(overlay, statements);
      if (covered) deepList.push(ticker);
      out[ticker] = quick.pending[i] && !covered ? undefined : mergeFinancials(quick.data[i], covered ? overlay : null);
    });
    return { financials: out, deepTickers: deepList };
    // statementsKey stands in for the statements array's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementTickers, quick.data, quick.pending, deep.data, statementsKey]);

  const pendingTickers = useMemo(() => {
    const pending = new Set<string>();
    statementTickers.forEach((ticker, i) => {
      if (quick.pending[i] && !deepTickers.includes(ticker)) pending.add(ticker);
    });
    if (prices.isPending && priceTickers.length > 0) priceTickers.forEach((t) => pending.add(t));
    return Array.from(pending);
  }, [statementTickers, quick.pending, deepTickers, priceTickers, prices.isPending]);

  const dates = useMemo(() => availableDates(spec, financials), [spec, financials]);

  // No range chosen → the last ten years with deep history, five with
  // Yahoo's quick data (all it carries). Not written to the spec, so a
  // shared link keeps meaning "whatever is available".
  const range = useMemo(() => {
    if (spec.range.from !== null || spec.range.to !== null) return spec.range;
    const allDeep = statementTickers.length > 0 && statementTickers.every((t) => deepTickers.includes(t));
    return defaultRange(dates, allDeep ? 10 : 5);
  }, [spec.range, dates, statementTickers, deepTickers]);

  const chart = useMemo(() => {
    const inputs: ResolveInputs = {
      // A ticker still loading is left out entirely so the resolver does not
      // warn about "no statements" for something that is merely on its way.
      financials: Object.fromEntries(Object.entries(financials).filter(([t]) => !pendingTickers.includes(t))),
      prices: prices.data ?? {},
    };
    const visible: ChartSpec = { ...spec, range, series: spec.series.filter((s) => !pendingTickers.includes(s.ticker)) };
    return resolveChart(visible, inputs);
  }, [spec, range, financials, prices.data, pendingTickers]);

  return { chart, financials, tickers, statements, deepTickers, dates, range, pendingTickers, isLoading: pendingTickers.length > 0 };
}
