"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/constants";
import {
  fetchStockProfile,
  fetchStockQuote,
  fetchDefaultWatchlistTickers,
} from "@/app/actions/stock";
import type { StockProfile, StockQuote } from "@/types/stock";

// ---- Types ----

export interface WatchlistEntry {
  ticker: string;
  profile: StockProfile | null;
  quote: StockQuote | null;
}

// ---- Local Storage Persistence ----

const STORAGE_KEY = "huntr_watchlist";

function getStoredTickers(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : null;
  } catch {
    return null;
  }
}

function setStoredTickers(tickers: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

// ---- Query Key ----

const WATCHLIST_KEY = ["watchlist", "local"] as const;

// ---- Fetch Enriched Watchlist ----

async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  // Use localStorage if available, else default mock tickers
  const stored = getStoredTickers();
  const tickers = stored ?? (await fetchDefaultWatchlistTickers());

  // Persist defaults on first load
  if (!stored) {
    setStoredTickers(tickers);
  }

  // Enrich each ticker with profile + quote data
  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      const [profile, quote] = await Promise.all([
        fetchStockProfile(ticker),
        fetchStockQuote(ticker),
      ]);
      return { ticker, profile, quote };
    })
  );

  return entries;
}

// ---- Hook ----

export function useWatchlist() {
  const queryClient = useQueryClient();

  // Main query: enriched watchlist
  const query = useQuery<WatchlistEntry[]>({
    queryKey: WATCHLIST_KEY,
    queryFn: fetchWatchlist,
    staleTime: STALE_TIMES.WATCHLIST,
  });

  // Add ticker mutation
  const addMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const current = getStoredTickers() ?? [];
      const upper = ticker.toUpperCase();

      if (current.includes(upper)) return;

      const updated = [...current, upper];
      setStoredTickers(updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });

  // Remove ticker mutation
  const removeMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const current = getStoredTickers() ?? [];
      const upper = ticker.toUpperCase();
      const updated = current.filter((t) => t !== upper);
      setStoredTickers(updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });

  // Check if ticker is in watchlist
  const isInWatchlist = (ticker: string): boolean => {
    if (!query.data) return false;
    return query.data.some(
      (entry) => entry.ticker === ticker.toUpperCase()
    );
  };

  // Toggle ticker in watchlist
  const toggleTicker = (ticker: string) => {
    if (isInWatchlist(ticker)) {
      removeMutation.mutate(ticker);
    } else {
      addMutation.mutate(ticker);
    }
  };

  return {
    ...query,
    addTicker: addMutation.mutate,
    removeTicker: removeMutation.mutate,
    toggleTicker,
    isInWatchlist,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
