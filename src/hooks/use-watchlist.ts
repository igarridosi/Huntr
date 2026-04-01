"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { STALE_TIMES } from "@/lib/constants";
import { useSupabase } from "@/providers/supabase-provider";
import {
  fetchStockProfile,
  fetchStockQuote,
} from "@/app/actions/stock";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WatchlistStore,
  WatchlistEntry,
  PriceAlert,
} from "@/types/watchlist";
import { DEFAULT_TAGS, LIST_COLORS, DEFAULT_TICKERS } from "@/types/watchlist";

// Re-export for backward compatibility
export type { WatchlistEntry };

// ---- Storage Keys ----

const STORAGE_KEY_V2 = "huntr_watchlist_v2";
const STORAGE_KEY_LEGACY = "huntr_watchlist";
const ALERTS_KEY = "huntr_price_alerts";

// ---- Default Store ----

function createDefaultStore(): WatchlistStore {
  return {
    lists: [
      {
        id: "default",
        name: "Main Watchlist",
        color: LIST_COLORS[0],
        items: DEFAULT_TICKERS.map((ticker) => ({
          ticker,
          added_at: new Date().toISOString(),
          notes: "",
          tags: [],
          target_price: null,
        })),
        created_at: new Date().toISOString(),
      },
    ],
    customTags: [...DEFAULT_TAGS],
    activeListId: "default",
  };
}

// ---- Migration from V1 (plain ticker array) ----

function migrateFromV1(): WatchlistStore | null {
  if (typeof window === "undefined") return null;
  try {
    const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!legacy) return null;
    const tickers = JSON.parse(legacy) as string[];
    if (!Array.isArray(tickers) || tickers.length === 0) return null;

    const store: WatchlistStore = {
      lists: [
        {
          id: "default",
          name: "Main Watchlist",
          color: LIST_COLORS[0],
          items: tickers.map((ticker) => ({
            ticker: ticker.toUpperCase(),
            added_at: new Date().toISOString(),
            notes: "",
            tags: [],
            target_price: null,
          })),
          created_at: new Date().toISOString(),
        },
      ],
      customTags: [...DEFAULT_TAGS],
      activeListId: "default",
    };

    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store));
    localStorage.removeItem(STORAGE_KEY_LEGACY);
    return store;
  } catch {
    return null;
  }
}

// ---- Store Access ----

function getStore(): WatchlistStore {
  if (typeof window === "undefined") return createDefaultStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) return JSON.parse(raw) as WatchlistStore;

    const migrated = migrateFromV1();
    if (migrated) return migrated;

    const fresh = createDefaultStore();
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(fresh));
    return fresh;
  } catch {
    return createDefaultStore();
  }
}

function saveStore(store: WatchlistStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store));
}

// ---- Alerts Storage ----

function getAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? (JSON.parse(raw) as PriceAlert[]) : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: PriceAlert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

type CloudWatchlistState = {
  data: WatchlistStore;
  alerts: PriceAlert[];
};

async function persistCloudWatchlistState(
  supabase: SupabaseClient,
  userId: string,
  state: CloudWatchlistState
): Promise<void> {
  const payload: CloudWatchlistState = {
    data: state.data,
    alerts: state.alerts,
  };

  const { error } = await supabase
    .from("user_watchlist_state")
    .upsert({ user_id: userId, data: payload.data, alerts: payload.alerts }, { onConflict: "user_id" });

  if (error) {
    console.error("[Watchlist] Failed to persist cloud state:", error.message);
  }
}

async function fetchCloudWatchlistState(
  supabase: SupabaseClient,
  userId: string
): Promise<CloudWatchlistState> {
  const { data, error } = await supabase
    .from("user_watchlist_state")
    .select("data, alerts")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Watchlist] Failed to fetch cloud state:", error.message);
    return {
      data: getStore(),
      alerts: getAlerts(),
    };
  }

  if (data?.data) {
    return {
      data: data.data as WatchlistStore,
      alerts: Array.isArray(data.alerts) ? (data.alerts as PriceAlert[]) : [],
    };
  }

  const initial: CloudWatchlistState = {
    data: getStore(),
    alerts: getAlerts(),
  };

  await persistCloudWatchlistState(supabase, userId, initial);
  return initial;
}

// ---- Unique ID ----

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Query Keys ----

const WATCHLIST_KEY = ["watchlist", "v2"] as const;
const WATCHLIST_ENRICHED_KEY = ["watchlist", "enriched"] as const;
const ALERTS_QUERY_KEY = ["watchlist", "alerts"] as const;

// ---- The Hook ----

export function useWatchlist() {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const queryClient = useQueryClient();
  const watchlistQueryKey = [...WATCHLIST_KEY, user?.id ?? "anon"] as const;
  const alertsQueryKey = [...ALERTS_QUERY_KEY, user?.id ?? "anon"] as const;

  // ── Store query ──

  const storeQuery = useQuery<WatchlistStore>({
    queryKey: watchlistQueryKey,
    queryFn: async () => {
      if (!user) return getStore();
      const cloud = await fetchCloudWatchlistState(supabase, user.id);
      queryClient.setQueryData(alertsQueryKey, cloud.alerts);
      return cloud.data;
    },
    staleTime: Infinity,
    enabled: !isAuthLoading,
  });

  const store = storeQuery.data ?? createDefaultStore();
  const activeListId = store.activeListId;
  const lists = store.lists;
  const customTags = store.customTags;
  const activeList = lists.find((l) => l.id === activeListId) ?? lists[0];

  // ── Update store helper ──

  const updateStore = useCallback(
    (updater: (s: WatchlistStore) => WatchlistStore) => {
      if (!user) return;

      queryClient.setQueryData<WatchlistStore>(watchlistQueryKey, (previous) => {
        const current = previous ?? createDefaultStore();
        const updated = updater(current);
        const currentAlerts = queryClient.getQueryData<PriceAlert[]>(alertsQueryKey) ?? [];
        void persistCloudWatchlistState(supabase, user.id, {
          data: updated,
          alerts: currentAlerts,
        });
        return updated;
      });
      queryClient.invalidateQueries({ queryKey: WATCHLIST_ENRICHED_KEY });
    },
    [alertsQueryKey, queryClient, supabase, user, watchlistQueryKey]
  );

  // ── Set active list ──

  const setActiveList = useCallback(
    (id: string) => {
      updateStore((s) => ({ ...s, activeListId: id }));
    },
    [updateStore]
  );

  // ── List CRUD ──

  const createList = useCallback(
    (name: string) => {
      const id = uid();
      const colorIndex = lists.length % LIST_COLORS.length;
      updateStore((s) => ({
        ...s,
        lists: [
          ...s.lists,
          {
            id,
            name,
            color: LIST_COLORS[colorIndex],
            items: [],
            created_at: new Date().toISOString(),
          },
        ],
      }));
      return id;
    },
    [lists.length, updateStore]
  );

  const renameList = useCallback(
    (id: string, name: string) => {
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
      }));
    },
    [updateStore]
  );

  const deleteList = useCallback(
    (id: string) => {
      if (id === "default") return;
      updateStore((s) => ({
        ...s,
        lists: s.lists.filter((l) => l.id !== id),
        activeListId: s.activeListId === id ? "default" : s.activeListId,
      }));
    },
    [updateStore]
  );

  // ── Ticker CRUD ──

  const addTicker = useCallback(
    (ticker: string, listId?: string) => {
      const targetId = listId ?? activeListId;
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => {
          if (l.id !== targetId) return l;
          if (l.items.some((i) => i.ticker === upper)) return l;
          return {
            ...l,
            items: [
              ...l.items,
              {
                ticker: upper,
                added_at: new Date().toISOString(),
                notes: "",
                tags: [],
                target_price: null,
              },
            ],
          };
        }),
      }));
    },
    [activeListId, updateStore]
  );

  const removeTicker = useCallback(
    (ticker: string, listId?: string) => {
      const targetId = listId ?? activeListId;
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => {
          if (l.id !== targetId) return l;
          return { ...l, items: l.items.filter((i) => i.ticker !== upper) };
        }),
      }));
    },
    [activeListId, updateStore]
  );

  const isInWatchlist = useCallback(
    (ticker: string): boolean => {
      const upper = ticker.toUpperCase();
      return store.lists.some((l) =>
        l.items.some((i) => i.ticker === upper)
      );
    },
    [store.lists]
  );

  const isInActiveList = useCallback(
    (ticker: string): boolean => {
      const upper = ticker.toUpperCase();
      return activeList?.items.some((i) => i.ticker === upper) ?? false;
    },
    [activeList]
  );

  const toggleTicker = useCallback(
    (ticker: string) => {
      if (isInActiveList(ticker)) {
        removeTicker(ticker);
      } else {
        addTicker(ticker);
      }
    },
    [isInActiveList, removeTicker, addTicker]
  );

  // ── Notes ──

  const updateNotes = useCallback(
    (ticker: string, notes: string) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => ({
          ...l,
          items: l.items.map((i) =>
            i.ticker === upper ? { ...i, notes } : i
          ),
        })),
      }));
    },
    [updateStore]
  );

  // ── Tags ──

  const addTag = useCallback(
    (ticker: string, tag: string) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => ({
          ...l,
          items: l.items.map((i) => {
            if (i.ticker !== upper || i.tags.includes(tag)) return i;
            return { ...i, tags: [...i.tags, tag] };
          }),
        })),
      }));
    },
    [updateStore]
  );

  const removeTag = useCallback(
    (ticker: string, tag: string) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => ({
          ...l,
          items: l.items.map((i) => {
            if (i.ticker !== upper) return i;
            return { ...i, tags: i.tags.filter((t) => t !== tag) };
          }),
        })),
      }));
    },
    [updateStore]
  );

  const createCustomTag = useCallback(
    (tag: string) => {
      updateStore((s) => ({
        ...s,
        customTags: s.customTags.includes(tag)
          ? s.customTags
          : [...s.customTags, tag],
      }));
    },
    [updateStore]
  );

  const deleteCustomTag = useCallback(
    (tag: string) => {
      updateStore((s) => ({
        ...s,
        customTags: s.customTags.filter((t) => t !== tag),
        lists: s.lists.map((l) => ({
          ...l,
          items: l.items.map((i) => ({
            ...i,
            tags: i.tags.filter((t) => t !== tag),
          })),
        })),
      }));
    },
    [updateStore]
  );

  // ── Target Price ──

  const setTargetPrice = useCallback(
    (ticker: string, price: number | null) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        lists: s.lists.map((l) => ({
          ...l,
          items: l.items.map((i) =>
            i.ticker === upper ? { ...i, target_price: price } : i
          ),
        })),
      }));
    },
    [updateStore]
  );

  // ── Alerts ──

  const alertsQuery = useQuery<PriceAlert[]>({
    queryKey: alertsQueryKey,
    queryFn: async () => {
      if (!user) return getAlerts();
      const cloud = await fetchCloudWatchlistState(supabase, user.id);
      return cloud.alerts;
    },
    staleTime: Infinity,
    enabled: !isAuthLoading,
  });

  const alerts = alertsQuery.data ?? [];

  const addAlert = useCallback(
    (alert: Omit<PriceAlert, "id" | "created_at">) => {
      const current = queryClient.getQueryData<PriceAlert[]>(alertsQueryKey) ?? alerts;
      const updated = [
        ...current,
        { ...alert, id: uid(), created_at: new Date().toISOString() },
      ];
      queryClient.setQueryData(alertsQueryKey, updated);

      if (user) {
        const currentStore = queryClient.getQueryData<WatchlistStore>(watchlistQueryKey) ?? store;
        void persistCloudWatchlistState(supabase, user.id, {
          data: currentStore,
          alerts: updated,
        });
      }
    },
    [alerts, alertsQueryKey, queryClient, store, supabase, user, watchlistQueryKey]
  );

  const removeAlert = useCallback(
    (id: string) => {
      const current = queryClient.getQueryData<PriceAlert[]>(alertsQueryKey) ?? alerts;
      const updated = current.filter((a) => a.id !== id);
      queryClient.setQueryData(alertsQueryKey, updated);

      if (user) {
        const currentStore = queryClient.getQueryData<WatchlistStore>(watchlistQueryKey) ?? store;
        void persistCloudWatchlistState(supabase, user.id, {
          data: currentStore,
          alerts: updated,
        });
      }
    },
    [alerts, alertsQueryKey, queryClient, store, supabase, user, watchlistQueryKey]
  );

  const updateAlert = useCallback(
    (id: string, patch: Partial<Pick<PriceAlert, "price" | "type" | "active">>) => {
      const current = queryClient.getQueryData<PriceAlert[]>(alertsQueryKey) ?? alerts;
      const updated = current.map((a) => (a.id === id ? { ...a, ...patch } : a));
      queryClient.setQueryData(alertsQueryKey, updated);

      if (user) {
        const currentStore = queryClient.getQueryData<WatchlistStore>(watchlistQueryKey) ?? store;
        void persistCloudWatchlistState(supabase, user.id, {
          data: currentStore,
          alerts: updated,
        });
      }
    },
    [alerts, alertsQueryKey, queryClient, store, supabase, user, watchlistQueryKey]
  );

  const toggleAlert = useCallback(
    (id: string) => {
      const current = queryClient.getQueryData<PriceAlert[]>(alertsQueryKey) ?? alerts;
      const updated = current.map((a) =>
        a.id === id ? { ...a, active: !a.active } : a
      );

      queryClient.setQueryData(alertsQueryKey, updated);

      if (user) {
        const currentStore = queryClient.getQueryData<WatchlistStore>(watchlistQueryKey) ?? store;
        void persistCloudWatchlistState(supabase, user.id, {
          data: currentStore,
          alerts: updated,
        });
      }
    },
    [alerts, alertsQueryKey, queryClient, store, supabase, user, watchlistQueryKey]
  );

  // ── Data Enrichment ──

  const activeTickers = useMemo(
    () => activeList?.items.map((i) => i.ticker) ?? [],
    [activeList]
  );

  const enrichedQuery = useQuery<WatchlistEntry[]>({
    queryKey: [
      ...WATCHLIST_ENRICHED_KEY,
      activeListId,
      activeTickers.join(","),
    ],
    queryFn: async () => {
      if (!activeList || activeList.items.length === 0) return [];

      const entries = await Promise.all(
        activeList.items.map(async (item) => {
          const [profile, quote] = await Promise.all([
            fetchStockProfile(item.ticker),
            fetchStockQuote(item.ticker),
          ]);
          return {
            ticker: item.ticker,
            added_at: item.added_at,
            notes: item.notes,
            tags: item.tags,
            target_price: item.target_price,
            profile,
            quote,
          };
        })
      );

      return entries;
    },
    staleTime: STALE_TIMES.WATCHLIST,
    enabled: activeTickers.length > 0,
  });

  // Merge enriched data with latest store metadata so notes/tags
  // updates reflect instantly without waiting for a re-fetch.
  const data = useMemo(() => {
    const enriched = enrichedQuery.data ?? [];
    if (!activeList) return enriched;
    return enriched.map((e) => {
      const storeItem = activeList.items.find((i) => i.ticker === e.ticker);
      if (!storeItem) return e;
      return {
        ...e,
        notes: storeItem.notes,
        tags: storeItem.tags,
        target_price: storeItem.target_price,
      };
    });
  }, [enrichedQuery.data, activeList]);

  // ── Import / Export ──

  const exportToCSV = useCallback((): string => {
    if (!activeList) return "";
    const headers = ["Ticker", "Added At", "Notes", "Tags", "Target Price"];
    const rows = activeList.items.map((item) => [
      item.ticker,
      item.added_at,
      `"${item.notes.replace(/"/g, '""')}"`,
      `"${item.tags.join(", ")}"`,
      item.target_price?.toString() ?? "",
    ]);
    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }, [activeList]);

  const importFromCSV = useCallback(
    (csv: string) => {
      const lines = csv.trim().split("\n");
      if (lines.length < 2) return;
      const tickers = lines
        .slice(1)
        .map((line) => {
          const cols = line.split(",");
          return cols[0]?.trim().toUpperCase();
        })
        .filter(Boolean);
      for (const ticker of tickers) {
        if (ticker) addTicker(ticker);
      }
    },
    [addTicker]
  );

  return {
    // Enriched data (with instant metadata sync)
    data,
    isLoading: isAuthLoading || enrichedQuery.isLoading || storeQuery.isLoading,
    isError: enrichedQuery.isError,

    // List management
    lists,
    activeListId,
    activeList,
    setActiveList,
    createList,
    renameList,
    deleteList,

    // Ticker CRUD
    addTicker,
    removeTicker,
    toggleTicker,
    isInWatchlist,
    isInActiveList,

    // Notes
    updateNotes,

    // Tags
    addTag,
    removeTag,
    customTags,
    createCustomTag,
    deleteCustomTag,

    // Target price
    setTargetPrice,

    // Alerts
    alerts,
    addAlert,
    removeAlert,
    updateAlert,
    toggleAlert,

    // Import/Export
    exportToCSV,
    importFromCSV,

    // Backward compat (mutation states)
    isAdding: false,
    isRemoving: false,
  };
}
