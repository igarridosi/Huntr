"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAlphaFinancials, getAlphaAvailability } from "@/app/actions/stock";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { useSupabase } from "@/providers/supabase-provider";
import type { CompanyFinancials } from "@/types/financials";

/** More history than Yahoo's quick statements ever carry. */
const DEEP_QUARTERS = 8;

export function isDeepFinancials(fin: CompanyFinancials | null | undefined): boolean {
  return !!fin && (fin.income_statement.quarterly.length > DEEP_QUARTERS || fin.income_statement.annual.length > 5);
}

export interface DeepFinancialsState {
  /** Tickers whose statements in the cache come from Alpha Vantage. */
  deepTickers: string[];
  loading: boolean;
  blocked: "throttled" | "not_configured" | null;
  /** Loads the full history for the tickers that do not have it yet. */
  load: (tickers: string[]) => Promise<void>;
}

export interface DeepLoadOutcome {
  loaded: string[];
  limitHit: boolean;
  failed: string[];
}

/**
 * The Chart Builder's "Load 20-year history": the same Alpha Vantage flow
 * the ticker page uses, applied to every ticker on the chart and written
 * into the React Query cache under the keys the chart reads, so the plot
 * updates as each company arrives. Guests are sent to the auth gate;
 * a rate limit stops the run and leaves the rest on Yahoo data.
 */
export function useDeepFinancials(
  tickers: string[],
  financials: Record<string, CompanyFinancials | null | undefined>,
  onDone?: (outcome: DeepLoadOutcome) => void
): DeepFinancialsState {
  const queryClient = useQueryClient();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<"throttled" | "not_configured" | null>(null);

  const deepTickers = useMemo(() => tickers.filter((t) => isDeepFinancials(financials[t])), [tickers, financials]);

  const load = useCallback(
    async (wanted: string[]) => {
      const todo = wanted.filter((t) => !isDeepFinancials(financials[t]));
      if (todo.length === 0 || loading) return;
      if (!user) {
        openGate("deepData");
        return;
      }
      setLoading(true);
      setBlocked(null);
      const outcome: DeepLoadOutcome = { loaded: [], limitHit: false, failed: [] };
      try {
        const availability = await getAlphaAvailability();
        if (!availability.available) {
          setBlocked(availability.reason ?? "throttled");
          outcome.limitHit = availability.reason === "throttled";
          return;
        }
        // Sequential on purpose: Alpha Vantage counts calls per minute.
        for (const ticker of todo) {
          try {
            const data = await withTimeout(fetchAlphaFinancials(ticker), 50_000);
            if (!data) {
              outcome.failed.push(ticker);
              continue;
            }
            for (const granularity of ["annual", "quarterly"] as const) {
              queryClient.setQueryData([...QUERY_KEYS.FINANCIALS(ticker), granularity], data);
            }
            outcome.loaded.push(ticker);
          } catch (error) {
            if (isAlphaLimitError(error)) {
              outcome.limitHit = true;
              setBlocked("throttled");
              break;
            }
            outcome.failed.push(ticker);
          }
        }
      } finally {
        setLoading(false);
        onDone?.(outcome);
      }
    },
    [financials, loading, user, openGate, queryClient, onDone]
  );

  return { deepTickers, loading, blocked, load };
}

function isAlphaLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ALPHA_VANTAGE_LIMIT_REACHED|rate limit|cooling down/i.test(message);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("ALPHA_VANTAGE_TIMEOUT")), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}
