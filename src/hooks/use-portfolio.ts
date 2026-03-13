"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { STALE_TIMES } from "@/lib/constants";
import { useSupabase } from "@/providers/supabase-provider";
import {
  fetchStockProfile,
  fetchStockQuote,
} from "@/app/actions/stock";
import type {
  PortfolioStore,
  Portfolio,
  PortfolioPosition,
  PortfolioTransaction,
  EnrichedPosition,
  PortfolioSummary,
  PortfolioImportResult,
} from "@/types/portfolio";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- Legacy migration key ----

const LEGACY_STORAGE_KEY = "huntr_portfolio_v1";

// ---- Default Store ----

function createDefaultStore(): PortfolioStore {
  return {
    portfolios: [
      {
        id: "default",
        name: "My Portfolio",
        positions: [],
        transaction_history: [],
        created_at: new Date().toISOString(),
        realized_gain_loss: 0,
      },
    ],
    activePortfolioId: "default",
  };
}

function normalizePortfolio(portfolio: Portfolio): Portfolio {
  return {
    ...portfolio,
    transaction_history: Array.isArray(portfolio.transaction_history)
      ? portfolio.transaction_history
      : [],
    realized_gain_loss: Number.isFinite(portfolio.realized_gain_loss)
      ? portfolio.realized_gain_loss
      : 0,
  };
}

function normalizeStore(store: PortfolioStore): PortfolioStore {
  const normalizedPortfolios = Array.isArray(store.portfolios)
    ? store.portfolios.map(normalizePortfolio)
    : createDefaultStore().portfolios;

  return {
    ...store,
    portfolios: normalizedPortfolios,
    activePortfolioId:
      normalizedPortfolios.find((p) => p.id === store.activePortfolioId)?.id ??
      normalizedPortfolios[0]?.id ??
      "default",
  };
}

function getLegacyLocalStore(): PortfolioStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioStore;
    return normalizeStore(parsed);
  } catch {
    return null;
  }
}

async function persistPortfolioStore(
  supabase: SupabaseClient,
  userId: string,
  store: PortfolioStore
): Promise<void> {
  const payload = normalizeStore(store);
  const { error } = await supabase
    .from("user_portfolio_state")
    .upsert({ user_id: userId, data: payload }, { onConflict: "user_id" });

  if (error) {
    console.error("[Portfolio] Failed to persist store:", error.message);
  }
}

async function fetchPortfolioStore(
  supabase: SupabaseClient,
  userId: string
): Promise<PortfolioStore> {
  const { data, error } = await supabase
    .from("user_portfolio_state")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Portfolio] Failed to fetch store:", error.message);
    return getLegacyLocalStore() ?? createDefaultStore();
  }

  if (data?.data) {
    return normalizeStore(data.data as PortfolioStore);
  }

  const legacy = getLegacyLocalStore();
  const initial = legacy ?? createDefaultStore();
  await persistPortfolioStore(supabase, userId, initial);
  return normalizeStore(initial);
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

function normalizeDividendYield(raw: number | null | undefined): number {
  if (!Number.isFinite(raw) || raw === null || raw === undefined || raw <= 0) {
    return 0;
  }
  // Some providers return 0.034 (3.4%), others return 3.4
  return raw > 1 ? raw / 100 : raw;
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
    weighted_dividend_yield += normalizeDividendYield(p.quote.dividend_yield ?? 0) * p.weight;
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
    realized_gain_loss: 0,
    unrealized_gain_loss: total_gain_loss,
    total_return_gain_loss: total_gain_loss,
  };
}

// ---- The Hook ----

export function usePortfolio() {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const queryClient = useQueryClient();
  const portfolioQueryKey = [...PORTFOLIO_KEY, user?.id ?? "anon"] as const;

  // ── Store query ──

  const storeQuery = useQuery<PortfolioStore>({
    queryKey: portfolioQueryKey,
    queryFn: async () => {
      if (!user) return createDefaultStore();
      return fetchPortfolioStore(supabase, user.id);
    },
    staleTime: Infinity,
    enabled: !isAuthLoading,
  });

  const store = storeQuery.data ?? createDefaultStore();
  const activePortfolioId = store.activePortfolioId;
  const portfolios = store.portfolios;
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0];

  // ── Update store helper ──

  const updateStore = useCallback(
    (updater: (s: PortfolioStore) => PortfolioStore) => {
      if (!user) return;

      queryClient.setQueryData<PortfolioStore>(portfolioQueryKey, (previous) => {
        const current = normalizeStore(previous ?? createDefaultStore());
        const updated = normalizeStore(updater(current));
        void persistPortfolioStore(supabase, user.id, updated);
        return updated;
      });
    },
    [portfolioQueryKey, queryClient, supabase, user]
  );

  // ── Set active portfolio ──

  const setActivePortfolio = useCallback(
    (id: string) => {
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
          {
            id,
            name,
            positions: [],
            transaction_history: [],
            created_at: new Date().toISOString(),
            realized_gain_loss: 0,
          },
        ],
        activePortfolioId: id,
      }));
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
    },
    [updateStore]
  );

  // ── Position CRUD ──

  const addPosition = useCallback(
    (ticker: string, shares: number, avg_cost: number, added_at?: string, portfolioId?: string) => {
      const targetId = portfolioId ?? activePortfolioId;
      const upper = ticker.toUpperCase();
      const normalizedAddedAt = (() => {
        if (!added_at) return new Date().toISOString();
        const parsed = new Date(added_at);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })();
      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) => {
          if (p.id !== targetId) return p;
          const existing = p.positions.find((pos) => pos.ticker === upper);
          const transaction: PortfolioTransaction = {
            id: uid(),
            ticker: upper,
            side: "buy",
            shares,
            price: avg_cost,
            executed_at: normalizedAddedAt,
            realized_gain_loss: 0,
          };
          if (existing) {
            // Average up/down: recalculate avg_cost
            const totalShares = existing.shares + shares;
            const totalCost = existing.avg_cost * existing.shares + avg_cost * shares;
            const newAvgCost = totalShares > 0 ? totalCost / totalShares : 0;
            return {
              ...p,
              transaction_history: [...p.transaction_history, transaction],
              positions: p.positions.map((pos) =>
                pos.ticker === upper
                  ? { ...pos, shares: totalShares, avg_cost: newAvgCost }
                  : pos
              ),
            };
          }
          return {
            ...p,
            transaction_history: [...p.transaction_history, transaction],
            positions: [
              ...p.positions,
              {
                ticker: upper,
                shares,
                avg_cost,
                added_at: normalizedAddedAt,
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
    (ticker: string, updates: Partial<Pick<PortfolioPosition, "shares" | "avg_cost" | "notes" | "added_at">>) => {
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

  const applyTransaction = useCallback(
    (
      ticker: string,
      side: "buy" | "sell",
      shares: number,
      price: number,
      transactionDate?: string,
      portfolioId?: string
    ) => {
      if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
        return;
      }

      const targetId = portfolioId ?? activePortfolioId;
      const upper = ticker.toUpperCase();
      const normalizedTransactionDate = (() => {
        if (!transactionDate) return new Date().toISOString();
        const parsed = new Date(transactionDate);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })();

      updateStore((s) => ({
        ...s,
        portfolios: s.portfolios.map((p) => {
          if (p.id !== targetId) return p;

          const existing = p.positions.find((pos) => pos.ticker === upper);
          const currentRealized = p.realized_gain_loss ?? 0;

          if (side === "buy") {
            const transaction: PortfolioTransaction = {
              id: uid(),
              ticker: upper,
              side: "buy",
              shares,
              price,
              executed_at: normalizedTransactionDate,
              realized_gain_loss: 0,
            };

            if (existing) {
              const totalShares = existing.shares + shares;
              const totalCost = existing.avg_cost * existing.shares + shares * price;
              const newAvgCost = totalShares > 0 ? totalCost / totalShares : existing.avg_cost;
              return {
                ...p,
                transaction_history: [...p.transaction_history, transaction],
                positions: p.positions.map((pos) =>
                  pos.ticker === upper
                    ? { ...pos, shares: totalShares, avg_cost: newAvgCost }
                    : pos
                ),
              };
            }

            return {
              ...p,
              transaction_history: [...p.transaction_history, transaction],
              positions: [
                ...p.positions,
                {
                  ticker: upper,
                  shares,
                  avg_cost: price,
                  added_at: normalizedTransactionDate,
                  notes: "",
                },
              ],
            };
          }

          // Sell
          if (!existing || existing.shares <= 0) return p;

          const sellShares = Math.min(shares, existing.shares);
          const costBasisPerShare = existing.avg_cost;
          const realized = (price - costBasisPerShare) * sellShares;
          const totalCostBefore = existing.shares * costBasisPerShare;
          const totalCostAfter = totalCostBefore - sellShares * costBasisPerShare;
          const nextShares = existing.shares - sellShares;
          const nextAvgCost = nextShares > 0 ? totalCostAfter / nextShares : existing.avg_cost;

          const transaction: PortfolioTransaction = {
            id: uid(),
            ticker: upper,
            side: "sell",
            shares: sellShares,
            price,
            executed_at: normalizedTransactionDate,
            realized_gain_loss: realized,
          };

          return {
            ...p,
            realized_gain_loss: currentRealized + realized,
            transaction_history: [...p.transaction_history, transaction],
            positions:
              nextShares <= 1e-9
                ? p.positions.filter((pos) => pos.ticker !== upper)
                : p.positions.map((pos) =>
                    pos.ticker === upper ? { ...pos, shares: nextShares, avg_cost: nextAvgCost } : pos
                  ),
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
    placeholderData: (previousData) => previousData,
  });

  // Merge enriched data with latest store metadata
  const positions = useMemo<EnrichedPosition[]>(() => {
    const enriched = enrichedQuery.data ?? [];
    if (!activePortfolio) return enriched;

    const storeByTicker = new Map(
      activePortfolio.positions.map((p) => [p.ticker, p] as const)
    );

    // Keep only positions that still exist in the store.
    return enriched
      .filter((e) => storeByTicker.has(e.ticker))
      .map((e) => {
        const storePos = storeByTicker.get(e.ticker);
        if (!storePos) return e;
      return {
        ...e,
        shares: storePos.shares,
        avg_cost: storePos.avg_cost,
        added_at: storePos.added_at,
        notes: storePos.notes,
      };
      });
  }, [enrichedQuery.data, activePortfolio]);

  // ── Summary ──

  const summary = useMemo(() => {
    const base = computeSummary(positions);
    const realized = activePortfolio?.realized_gain_loss ?? 0;
    return {
      ...base,
      realized_gain_loss: realized,
      unrealized_gain_loss: base.total_gain_loss,
      total_return_gain_loss: realized + base.total_gain_loss,
    };
  }, [activePortfolio?.realized_gain_loss, positions]);

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
    async (csv: string): Promise<PortfolioImportResult> => {
      const rows = parseCSVRows(csv);
      if (rows.length < 2) {
        return {
          success: false,
          mode: "unknown-format",
          importedCount: 0,
          skippedInvalidRows: 0,
          skippedUnknownTickers: [],
          replacedPortfolio: false,
        };
      }

      const headers = rows[0].map((h) => h.toLowerCase());

      const validateKnownTickers = async (
        tickers: string[]
      ): Promise<{ known: Set<string>; unknown: string[] }> => {
        const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
        const profiles = await Promise.all(unique.map((t) => fetchStockProfile(t)));
        const known = new Set<string>();
        const unknown: string[] = [];

        unique.forEach((ticker, idx) => {
          if (profiles[idx]) known.add(ticker);
          else unknown.push(ticker);
        });

        return { known, unknown };
      };

      // Format A (legacy app CSV): Ticker,Shares,Avg Cost,Added At,Notes
      const tickerIdx = headers.indexOf("ticker");
      const sharesIdx = headers.indexOf("shares");
      const avgCostIdx = headers.indexOf("avg cost");

      if (tickerIdx >= 0 && sharesIdx >= 0 && avgCostIdx >= 0) {
        const parsed: Array<{ ticker: string; shares: number; avg_cost: number }> = [];
        let skippedInvalidRows = 0;

        for (const cols of rows.slice(1)) {
          const ticker = cols[tickerIdx]?.trim().toUpperCase();
          const shares = parseFloat(cols[sharesIdx] ?? "0");
          const avg_cost = parseFloat(cols[avgCostIdx] ?? "0");
          if (ticker && shares > 0 && avg_cost > 0) {
            parsed.push({ ticker, shares, avg_cost });
          } else {
            skippedInvalidRows += 1;
          }
        }

        const { known, unknown } = await validateKnownTickers(parsed.map((p) => p.ticker));
        const validRows = parsed.filter((p) => known.has(p.ticker));

        updateStore((s) => ({
          ...s,
          portfolios: s.portfolios.map((p) => {
            if (p.id !== activePortfolioId) return p;

            const merged = new Map(
              p.positions.map((pos) => [
                pos.ticker,
                { shares: pos.shares, totalCost: pos.shares * pos.avg_cost, notes: pos.notes },
              ])
            );

            for (const row of validRows) {
              const current = merged.get(row.ticker) ?? { shares: 0, totalCost: 0, notes: "" };
              const totalShares = current.shares + row.shares;
              const totalCost = current.totalCost + row.shares * row.avg_cost;
              merged.set(row.ticker, {
                shares: totalShares,
                totalCost,
                notes: current.notes,
              });
            }

            const positions: PortfolioPosition[] = Array.from(merged.entries())
              .map(([ticker, value]) => ({
                ticker,
                shares: value.shares,
                avg_cost: value.shares > 0 ? value.totalCost / value.shares : 0,
                added_at: new Date().toISOString(),
                notes: value.notes,
              }))
              .filter((pos) => pos.shares > 0 && pos.avg_cost > 0);

            return { ...p, positions };
          }),
        }));

        return {
          success: validRows.length > 0,
          mode: "legacy",
          importedCount: validRows.length,
          skippedInvalidRows,
          skippedUnknownTickers: unknown,
          replacedPortfolio: false,
        };
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
        let realizedGainLoss = activePortfolio?.realized_gain_loss ?? 0;

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

        const importedTransactions: PortfolioTransaction[] = [];

        for (const cols of txRows) {
          const action = (cols[actionIdx] ?? "").trim().toLowerCase();
          const ticker = (cols[brokerTickerIdx] ?? "").trim().toUpperCase();
          const shares = parseFloat(cols[brokerSharesIdx] ?? "0");
          const price = parseFloat(cols[brokerPriceIdx] ?? "0");
          const txDateRaw = timeIdx >= 0 ? (cols[timeIdx] ?? "") : "";
          const parsedTxDate = txDateRaw ? new Date(txDateRaw) : new Date();
          const executedAt = Number.isNaN(parsedTxDate.getTime())
            ? new Date().toISOString()
            : parsedTxDate.toISOString();

          if (!ticker || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
            continue;
          }

          const current = running.get(ticker) ?? { shares: 0, totalCost: 0 };

          if (action.includes("buy")) {
            current.totalCost += shares * price;
            current.shares += shares;
            running.set(ticker, current);
            importedTransactions.push({
              id: uid(),
              ticker,
              side: "buy",
              shares,
              price,
              executed_at: executedAt,
              realized_gain_loss: 0,
            });
            continue;
          }

          if (action.includes("sell")) {
            // Reduce position using moving-average cost basis.
            if (current.shares <= 0) continue;
            const sellShares = Math.min(shares, current.shares);
            const avgCost = current.shares > 0 ? current.totalCost / current.shares : 0;
            const realized = (price - avgCost) * sellShares;
            realizedGainLoss += realized;
            current.shares -= sellShares;
            current.totalCost -= sellShares * avgCost;

            importedTransactions.push({
              id: uid(),
              ticker,
              side: "sell",
              shares: sellShares,
              price,
              executed_at: executedAt,
              realized_gain_loss: realized,
            });

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

        const { known, unknown } = await validateKnownTickers(
          importedPositions.map((p) => p.ticker)
        );

        const filteredPositions = importedPositions.filter((p) => known.has(p.ticker));

        updateStore((s) => ({
          ...s,
          portfolios: s.portfolios.map((p) =>
            p.id === activePortfolioId
              ? {
                  ...p,
                  positions: filteredPositions,
                  realized_gain_loss: realizedGainLoss,
                  transaction_history: importedTransactions,
                }
              : p
          ),
        }));

        return {
          success: filteredPositions.length > 0,
          mode: "broker",
          importedCount: filteredPositions.length,
          skippedInvalidRows: 0,
          skippedUnknownTickers: unknown,
          replacedPortfolio: true,
        };
      }

      return {
        success: false,
        mode: "unknown-format",
        importedCount: 0,
        skippedInvalidRows: 0,
        skippedUnknownTickers: [],
        replacedPortfolio: false,
      };
    },
    [activePortfolioId, updateStore]
  );

  return {
    // Enriched positions
    positions,
    summary,
    isLoading:
      isAuthLoading ||
      storeQuery.isLoading ||
      (enrichedQuery.isLoading && positions.length === 0 && activeTickers.length > 0),
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
    applyTransaction,
    transactionHistory: activePortfolio?.transaction_history ?? [],
    hasPosition,

    // Import/Export
    exportToCSV,
    importFromCSV,
  };
}
