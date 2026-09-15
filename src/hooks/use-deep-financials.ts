"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAlphaStatements, getAlphaAvailability } from "@/app/actions/stock";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { useSupabase } from "@/providers/supabase-provider";
import type { StatementKind } from "@/lib/chart-builder";
import { deepQueryKey } from "./use-chart-data";

export interface DeepFinancialsState {
  loading: boolean;
  blocked: "throttled" | "not_configured" | null;
  /** Loads the chart's statements for the tickers that lack them. */
  load: (tickers: string[], statements: StatementKind[]) => Promise<void>;
}

export interface DeepLoadOutcome {
  loaded: string[];
  limitHit: boolean;
  failed: string[];
  /** Alpha Vantage calls this run cost at most (one per statement per ticker). */
  calls: number;
}

/**
 * The Chart Builder's "Load 20-year history": Alpha Vantage, but only the
 * statements the chart reads — one call per statement per ticker instead
 * of the ticker page's full bundle — written into the deep overlay the
 * chart merges over its quick data. Guests are sent to the auth gate; a
 * rate limit stops the run and leaves the rest on Yahoo data.
 */
export function useDeepFinancials(onDone?: (outcome: DeepLoadOutcome) => void): DeepFinancialsState {
  const queryClient = useQueryClient();
  const { user } = useSupabase();
  const { openGate } = useAuthGate();
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<"throttled" | "not_configured" | null>(null);

  const load = useCallback(
    async (tickers: string[], statements: StatementKind[]) => {
      if (tickers.length === 0 || statements.length === 0 || loading) return;
      if (!user) {
        openGate("deepData");
        return;
      }
      setLoading(true);
      setBlocked(null);
      const outcome: DeepLoadOutcome = { loaded: [], limitHit: false, failed: [], calls: tickers.length * statements.length };
      try {
        const availability = await getAlphaAvailability();
        if (!availability.available) {
          setBlocked(availability.reason ?? "throttled");
          outcome.limitHit = availability.reason === "throttled";
          return;
        }
        // Sequential on purpose: Alpha Vantage counts calls per minute.
        for (const ticker of tickers) {
          try {
            const data = await withTimeout(fetchAlphaStatements(ticker, statements, false), 50_000);
            if (!data) {
              outcome.failed.push(ticker);
              continue;
            }
            queryClient.setQueryData(deepQueryKey(ticker, statements), data);
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
    [loading, user, openGate, queryClient, onDone]
  );

  return { loading, blocked, load };
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
