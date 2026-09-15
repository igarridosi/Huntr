"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { migrateSpec, normalizeSpec, type ChartSpec } from "@/lib/chart-builder";

export const MAX_SAVED_CHARTS = 50;

export interface SavedChart {
  id: string;
  name: string;
  spec: ChartSpec;
  updatedAt: string;
}

type ChartRow = {
  id: string;
  name: string;
  spec: unknown;
  updated_at: string;
};

const SAVED_CHARTS_KEY = ["chart-builder", "saved", "v1"] as const;

/**
 * Saved charts in `user_charts`, same shape as the DCF scenarios hook.
 * Rows are read through `migrateSpec` so a chart saved by an older build
 * still opens; one that cannot be read is dropped from the list rather
 * than breaking it.
 */
export function useSavedCharts() {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const { openGate } = useAuthGate();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => [...SAVED_CHARTS_KEY, user?.id ?? "anon"] as const, [user?.id]);

  const query = useQuery<SavedChart[]>({
    queryKey,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_charts")
        .select("id, name, spec, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("[Chart Builder] Failed to fetch saved charts:", error.message);
        return [];
      }
      const out: SavedChart[] = [];
      for (const row of (data ?? []) as ChartRow[]) {
        const migrated = migrateSpec(row.spec);
        if (!migrated.ok) continue;
        out.push({ id: row.id, name: row.name, spec: normalizeSpec(migrated.spec), updatedAt: row.updated_at });
      }
      return out;
    },
    enabled: !isAuthLoading,
    staleTime: 30_000,
  });

  const gate = useCallback(() => {
    if (user) return true;
    openGate("charts");
    return false;
  }, [user, openGate]);

  /** Inserts a new chart, or updates the one with `id`. Returns the row id. */
  const save = useCallback(
    async (payload: { id?: string; name: string; spec: ChartSpec }): Promise<string | null> => {
      if (!gate() || !user) return null;
      if (!payload.id && (query.data?.length ?? 0) >= MAX_SAVED_CHARTS) {
        console.warn(`[Chart Builder] Saved chart limit (${MAX_SAVED_CHARTS}) reached.`);
        return null;
      }
      const row = { user_id: user.id, name: payload.name, spec: payload.spec };
      const result = payload.id
        ? await supabase.from("user_charts").update(row).eq("id", payload.id).eq("user_id", user.id).select("id").single()
        : await supabase.from("user_charts").insert(row).select("id").single();
      if (result.error) {
        console.error("[Chart Builder] Failed to save chart:", result.error.message);
        return null;
      }
      await queryClient.invalidateQueries({ queryKey });
      return (result.data as { id: string }).id;
    },
    [gate, user, supabase, queryClient, queryKey, query.data]
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      if (!gate() || !user) return false;
      const { error } = await supabase.from("user_charts").update({ name }).eq("id", id).eq("user_id", user.id);
      if (error) {
        console.error("[Chart Builder] Failed to rename chart:", error.message);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey });
      return true;
    },
    [gate, user, supabase, queryClient, queryKey]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!gate() || !user) return false;
      const { error } = await supabase.from("user_charts").delete().eq("id", id).eq("user_id", user.id);
      if (error) {
        console.error("[Chart Builder] Failed to delete chart:", error.message);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey });
      return true;
    },
    [gate, user, supabase, queryClient, queryKey]
  );

  return {
    charts: query.data ?? [],
    isLoading: query.isLoading,
    isSignedIn: !!user,
    save,
    rename,
    remove,
  };
}
