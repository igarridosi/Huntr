"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { STALE_TIMES } from "@/lib/constants";
import {
  fetchStockProfile,
  fetchStockQuote,
} from "@/app/actions/stock";
import type {
  PortfolioStore,
  Portfolio,
  PortfolioPosition,
  EnrichedPosition,
  PortfolioSummary,
} from "@/types/portfolio";

// ---- Storage Key ----

const STORAGE_KEY = "huntr_portfolio_v1";

// ---- Default Store ----

function createDefaultStore(): PortfolioStore {
  return {
    portfolios: [
      {
        id: "default",
        name: "My Portfolio",
        positions: [],
        created_at: new Date().toISOString(),
      },
    ],
    activePortfolioId: "default",
  };
}

// ---- Store Access ----

function getStore(): PortfolioStore {
  if (typeof window === "undefined") return createDefaultStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PortfolioStore;
    const fresh = createDefaultStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return createDefaultStore();
  }
}

function saveStore(store: PortfolioStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Unique ID ----

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- CSV helpers ----

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Escaped quote inside quoted field
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  cols.push(current.trim());
  return cols;
}

function parseCSVRows(csv: string): string[][] {
  return csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseCSVLine);
}

// ---- Query Keys ----

const PORTFOLIO_KEY = ["portfolio", "v1"] as const;
const PORTFOLIO_ENRICHED_KEY = ["portfolio", "enriched"] as const;

// ---- Enrichment helpers ----

function enrichPositions(
  positions: PortfolioPosition[],
  profiles: (import("@/types/stock").StockProfile | null)[],
  quotes: (import("@/types/stock").StockQuote | null)[]
): EnrichedPosition[] {
  // Total market value for weight calculation
  let totalMarketValue = 0;
  const raw = positions.map((pos, i) => {
    const quote = quotes[i];
    const profile = profiles[i];
    const price = quote?.price ?? 0;
    const market_value = price * pos.shares;
    const cost_basis = pos.avg_cost * pos.shares;
    const gain_loss = market_value - cost_basis;
    const gain_loss_percent = cost_basis > 0 ? gain_loss / cost_basis : 0;
    const dayChangePercent = (quote?.day_change_percent ?? 0) / 100;
    const previousValue = market_value / (1 + dayChangePercent);
    const day_gain_loss = market_value - previousValue;
    const day_gain_loss_percent = dayChangePercent;

    totalMarketValue += market_value;

    return {
      ...pos,
      profile,
      quote,
      market_value,
      cost_basis,
      gain_loss,
      gain_loss_percent,
      weight: 0, // computed below
      day_gain_loss,
      day_gain_loss_percent,
    };
  });

  // Calculate weights
  return raw.map((p) => ({
    ...p,
    weight: totalMarketValue > 0 ? p.market_value / totalMarketValue : 0,
  }));
}

function computeSummary(positions: EnrichedPosition[]): PortfolioSummary {
  const total_market_value = positions.reduce((s, p) => s + p.market_value, 0);
  const total_cost_basis = positions.reduce((s, p) => s + p.cost_basis, 0);
  const total_gain_loss = total_market_value - total_cost_basis;
  const total_gain_loss_percent =
    total_cost_basis > 0 ? total_gain_loss / total_cost_basis : 0;

  const total_day_gain_loss = positions.reduce((s, p) => s + p.day_gain_loss, 0);
  const previousTotalValue = total_market_value - total_day_gain_loss;
  const total_day_gain_loss_percent =
    previousTotalValue > 0 ? total_day_gain_loss / previousTotalValue : 0;

  // Sector allocation
  const sector_allocation: Record<string, number> = {};
  for (const p of positions) {
    const sector = p.profile?.sector || "Unknown";
    sector_allocation[sector] = (sector_allocation[sector] ?? 0) + p.weight;
  }

  // Weighted metrics
  let weighted_pe = 0;
  let weighted_dividend_yield = 0;
  let weighted_beta = 0;
  let peWeightSum = 0;

  for (const p of positions) {
    if (!p.quote) continue;
    if (p.quote.pe_ratio > 0 && p.quote.pe_ratio < 500) {
      weighted_pe += p.quote.pe_ratio * p.weight;
      peWeightSum += p.weight;
    }
    weighted_dividend_yield += (p.quote.dividend_yield ?? 0) * p.weight;
    weighted_beta += (p.quote.beta ?? 1) * p.weight;
  }
  if (peWeightSum > 0) weighted_pe /= peWeightSum;

  return {
    total_market_value,
    total_cost_basis,
    total_gain_loss,
    total_gain_loss_percent,
    total_day_gain_loss,
    total_day_gain_loss_percent,
    position_count: positions.length,
    sector_allocation,
    top_holding_weight: positions.length > 0 ? Math.max(...positions.map((p) => p.weight)) : 0,
    weighted_pe: peWeightSum > 0 ? weighted_pe * peWeightSum : 0,
    weighted_dividend_yield,
    weighted_beta,
  };
}

// ---- The Hook ----

export function usePortfolio() {
  const queryClient = useQueryClient();
  const [activePortfolioId, setActiveIdState] = useState<string>(() =>
    typeof window !== "undefined" ? getStore().activePortfolioId : "default"
  );

  // ── Store query ──

  const storeQuery = useQuery<PortfolioStore>({
    queryKey: PORTFOLIO_KEY,
    queryFn: () => getStore(),
    staleTime: Infinity,
  });

  const store = storeQuery.data ?? createDefaultStore();
  const portfolios = store.portfolios;
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0];

  // ── Update store helper ──

  const updateStore = useCallback(
    (updater: (s: PortfolioStore) => PortfolioStore) => {
      const current = getStore();
      const updated = updater(current);
      saveStore(updated);
      queryClient.setQueryData(PORTFOLIO_KEY, updated);
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_ENRICHED_KEY });
    },
    [queryClient]
  );

  // ── Set active portfolio ──

  const setActivePortfolio = useCallback(
    (id: string) => {
      setActiveIdState(id);
      updateStore((s) => ({ ...s, activePortfolioId: id }));
    },
    [updateStore]
  );

  // ── Portfolio CRUD ──

  const createPortfolio = useCallback(
    (name: string) => {
      const id = uid();
      updateStore((s) => ({
        ...s,
        portfolios: [
          ...s.portfolios,
          { id, name, positions: [], created_at: new Date().toISOString() },
        ],
        activePortfolioId: id,
      }));
      setActiveIdState(id);
      return id;
    },
    [updateStore]
  );

  const renamePortfolio = useCallback(
    (id: string, name: string) => {
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) =>
          p.id === id ? { ...p, name } : p
        ),
      }));
    },
    [updateStore]
  );

  const deletePortfolio = useCallback(
    (id: string) => {
      if (id === "default") return;
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.filter((p) => p.id !== id),
        activePortfolioId: s.activePortfolioId === id ? "default" : s.activePortfolioId,
      }));
      if (activePortfolioId === id) setActiveIdState("default");
    },
    [activePortfolioId, updateStore]
  );

  // ── Position CRUD ──

  const addPosition = useCallback(
    (ticker: string, shares: number, avg_cost: number, portfolioId?: string) => {
      const targetId = portfolioId ?? activePortfolioId;
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) => {
          if (p.id !== targetId) return p;
          const existing = p.positions.find((pos) => pos.ticker === upper);
          if (existing) {
            // Average up/down: recalculate avg_cost
            const totalShares = existing.shares + shares;
            const totalCost = existing.avg_cost * existing.shares + avg_cost * shares;
            const newAvgCost = totalShares > 0 ? totalCost / totalShares : 0;
            return {
              ...p,
              positions: p.positions.map((pos) =>
                pos.ticker === upper
                  ? { ...pos, shares: totalShares, avg_cost: newAvgCost }
                  : pos
              ),
            };
          }
          return {
            ...p,
            positions: [
              ...p.positions,
              {
                ticker: upper,
                shares,
                avg_cost,
                added_at: new Date().toISOString(),
                notes: "",
              },
            ],
          };
        }),
      }));
    },
    [activePortfolioId, updateStore]
  );

  const updatePosition = useCallback(
    (ticker: string, updates: Partial<Pick<PortfolioPosition, "shares" | "avg_cost" | "notes">>) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) => {
          if (p.id !== activePortfolioId) return p;
          return {
            ...p,
            positions: p.positions.map((pos) =>
              pos.ticker === upper ? { ...pos, ...updates } : pos
            ),
          };
        }),
      }));
    },
    [activePortfolioId, updateStore]
  );

  const removePosition = useCallback(
    (ticker: string) => {
      const upper = ticker.toUpperCase();
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) => {
          if (p.id !== activePortfolioId) return p;
          return {
            ...p,
            positions: p.positions.filter((pos) => pos.ticker !== upper),
          };
        }),
      }));
    },
    [activePortfolioId, updateStore]
  );

  const hasPosition = useCallback(
    (ticker: string): boolean => {
      const upper = ticker.toUpperCase();
      return activePortfolio?.positions.some((pos) => pos.ticker === upper) ?? false;
    },
    [activePortfolio]
  );

  // ── Data Enrichment ──

  const activeTickers = useMemo(
    () => activePortfolio?.positions.map((p) => p.ticker) ?? [],
    [activePortfolio]
  );

  const enrichedQuery = useQuery<EnrichedPosition[]>({
    queryKey: [
      ...PORTFOLIO_ENRICHED_KEY,
      activePortfolioId,
      activeTickers.join(","),
    ],
    queryFn: async () => {
      if (!activePortfolio || activePortfolio.positions.length === 0) return [];

      const results = await Promise.all(
        activePortfolio.positions.map(async (pos) => {
          const [profile, quote] = await Promise.all([
            fetchStockProfile(pos.ticker),
            fetchStockQuote(pos.ticker),
          ]);
          return { profile, quote };
        })
      );

      return enrichPositions(
        activePortfolio.positions,
        results.map((r) => r.profile),
        results.map((r) => r.quote)
      );
    },
    staleTime: STALE_TIMES.WATCHLIST,
    enabled: activeTickers.length > 0,
  });

  // Merge enriched data with latest store metadata
  const positions = useMemo(() => {
    const enriched = enrichedQuery.data ?? [];
    if (!activePortfolio) return enriched;
    return enriched.map((e) => {
      const storePos = activePortfolio.positions.find(
        (p) => p.ticker === e.ticker
      );
      if (!storePos) return e;
      return {
        ...e,
        shares: storePos.shares,
        avg_cost: storePos.avg_cost,
        notes: storePos.notes,
      };
    });
  }, [enrichedQuery.data, activePortfolio]);

  // ── Summary ──

  const summary = useMemo(() => computeSummary(positions), [positions]);

  // ── Import / Export ──

  const exportToCSV = useCallback((): string => {
    if (!activePortfolio) return "";
    const headers = ["Ticker", "Shares", "Avg Cost", "Added At", "Notes"];
    const rows = activePortfolio.positions.map((pos) => [
      pos.ticker,
      pos.shares.toString(),
      pos.avg_cost.toString(),
      pos.added_at,
      `"${pos.notes.replace(/"/g, '""')}"`,
    ]);
    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }, [activePortfolio]);

  const importFromCSV = useCallback(
    (csv: string) => {
      const rows = parseCSVRows(csv);
      if (rows.length < 2) return;

      const headers = rows[0].map((h) => h.toLowerCase());

      // Format A (legacy app CSV): Ticker,Shares,Avg Cost,Added At,Notes
      const tickerIdx = headers.indexOf("ticker");
      const sharesIdx = headers.indexOf("shares");
      const avgCostIdx = headers.indexOf("avg cost");

      if (tickerIdx >= 0 && sharesIdx >= 0 && avgCostIdx >= 0) {
        for (const cols of rows.slice(1)) {
          const ticker = cols[tickerIdx]?.trim().toUpperCase();
          const shares = parseFloat(cols[sharesIdx] ?? "0");
          const avg_cost = parseFloat(cols[avgCostIdx] ?? "0");
          if (ticker && shares > 0 && avg_cost > 0) {
            addPosition(ticker, shares, avg_cost);
          }
        }
        return;
      }

      // Format B (broker transactions CSV):
      // Action,Time,ISIN,Ticker,Name,ID,No. of shares,Price / share,...
      const actionIdx = headers.indexOf("action");
      const timeIdx = headers.indexOf("time");
      const brokerTickerIdx = headers.indexOf("ticker");
      const brokerSharesIdx = headers.indexOf("no. of shares");
      const brokerPriceIdx = headers.indexOf("price / share");

      if (
        actionIdx >= 0 &&
        brokerTickerIdx >= 0 &&
        brokerSharesIdx >= 0 &&
        brokerPriceIdx >= 0
      ) {
        type RunningPos = { shares: number; totalCost: number };
        const running = new Map<string, RunningPos>();

        // Start from existing active positions so imports can extend/update them.
        for (const pos of activePortfolio?.positions ?? []) {
          running.set(pos.ticker, {
            shares: pos.shares,
            totalCost: pos.shares * pos.avg_cost,
          });
        }

        const txRows = [...rows.slice(1)];
        if (timeIdx >= 0) {
          txRows.sort((a, b) => {
            const tA = Date.parse(a[timeIdx] ?? "");
            const tB = Date.parse(b[timeIdx] ?? "");
            if (Number.isNaN(tA) || Number.isNaN(tB)) return 0;
            return tA - tB;
          });
        }

        for (const cols of txRows) {
          const action = (cols[actionIdx] ?? "").trim().toLowerCase();
          const ticker = (cols[brokerTickerIdx] ?? "").trim().toUpperCase();
          const shares = parseFloat(cols[brokerSharesIdx] ?? "0");
          const price = parseFloat(cols[brokerPriceIdx] ?? "0");

          if (!ticker || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
            continue;
          }

          const current = running.get(ticker) ?? { shares: 0, totalCost: 0 };

          if (action.includes("buy")) {
            current.totalCost += shares * price;
            current.shares += shares;
            running.set(ticker, current);
            continue;
          }

          if (action.includes("sell")) {
            // Reduce position using moving-average cost basis.
            if (current.shares <= 0) continue;
            const sellShares = Math.min(shares, current.shares);
            const avgCost = current.shares > 0 ? current.totalCost / current.shares : 0;
            current.shares -= sellShares;
            current.totalCost -= sellShares * avgCost;

            if (current.shares <= 1e-9) {
              running.delete(ticker);
            } else {
              running.set(ticker, current);
            }
          }
        }

        const importedPositions: PortfolioPosition[] = Array.from(running.entries())
          .map(([ticker, pos]) => {
            const avg_cost = pos.shares > 0 ? pos.totalCost / pos.shares : 0;
            return {
              ticker,
              shares: pos.shares,
              avg_cost,
              added_at: new Date().toISOString(),
              notes: "",
            };
          })
          .filter((p) => p.shares > 0 && p.avg_cost > 0);

        updateStore((s) => ({
          ...s,
          portfolios: s.portfolios.map((p) =>
            p.id === activePortfolioId
              ? { ...p, positions: importedPositions }
              : p
          ),
        }));
      }
    },
    [activePortfolio?.positions, activePortfolioId, addPosition, updateStore]
  );

  return {
    // Enriched positions
    positions,
    summary,
    isLoading: enrichedQuery.isLoading || storeQuery.isLoading,
    isError: enrichedQuery.isError,

    // Portfolio management
    portfolios,
    activePortfolioId,
    activePortfolio,
    setActivePortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,

    // Position CRUD
    addPosition,
    updatePosition,
    removePosition,
    hasPosition,

    // Import/Export
    exportToCSV,
    importFromCSV,
  };
}
