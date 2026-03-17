"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/providers/supabase-provider";
import type { DCFScenarioKey, DCFScenarioSet, WACCEstimate } from "@/lib/calculations";

export interface SavedDCFScenario {
  ticker: string;
  scenarios: DCFScenarioSet;
  activeScenario: DCFScenarioKey;
  waccEstimate: WACCEstimate | null;
  updatedAt: string;
}

type DCFScenarioRow = {
  ticker: string;
  scenarios: DCFScenarioSet;
  active_scenario: DCFScenarioKey;
  wacc_estimate: WACCEstimate | null;
  updated_at: string;
};

const DCF_SCENARIOS_KEY = ["dcf", "scenarios", "v1"] as const;

export function useDCFScenarios() {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const queryClient = useQueryClient();
  const queryKey = [...DCF_SCENARIOS_KEY, user?.id ?? "anon"] as const;

  const scenariosQuery = useQuery<SavedDCFScenario[]>({
    queryKey,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_dcf_scenarios")
        .select("ticker, scenarios, active_scenario, wacc_estimate, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[DCF] Failed to fetch saved scenarios:", error.message);
        return [];
      }

      return ((data ?? []) as DCFScenarioRow[]).map((row) => ({
        ticker: row.ticker,
        scenarios: row.scenarios,
        activeScenario: row.active_scenario,
        waccEstimate: row.wacc_estimate,
        updatedAt: row.updated_at,
      }));
    },
    enabled: !isAuthLoading,
    staleTime: 30_000,
  });

  const saveScenario = useCallback(
    async (payload: {
      ticker: string;
      scenarios: DCFScenarioSet;
      activeScenario: DCFScenarioKey;
      waccEstimate: WACCEstimate | null;
    }): Promise<boolean> => {
      if (!user) return false;

      const { error } = await supabase.from("user_dcf_scenarios").upsert(
        {
          user_id: user.id,
          ticker: payload.ticker.toUpperCase(),
          scenarios: payload.scenarios,
          active_scenario: payload.activeScenario,
          wacc_estimate: payload.waccEstimate,
        },
        { onConflict: "user_id,ticker" }
      );

      if (error) {
        console.error("[DCF] Failed to save scenarios:", error.message);
        return false;
      }

      await queryClient.invalidateQueries({ queryKey });
      return true;
    },
    [queryClient, queryKey, supabase, user]
  );

  const deleteScenario = useCallback(
    async (ticker: string): Promise<boolean> => {
      if (!user) return false;

      const { error } = await supabase
        .from("user_dcf_scenarios")
        .delete()
        .eq("user_id", user.id)
        .eq("ticker", ticker.toUpperCase());

      if (error) {
        console.error("[DCF] Failed to delete scenarios:", error.message);
        return false;
      }

      await queryClient.invalidateQueries({ queryKey });
      return true;
    },
    [queryClient, queryKey, supabase, user]
  );

  return {
    savedScenarios: scenariosQuery.data ?? [],
    isLoading: scenariosQuery.isLoading,
    saveScenario,
    deleteScenario,
    refetch: scenariosQuery.refetch,
  };
}
