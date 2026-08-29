"use client";

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Search,
  Loader2,
  X,
  Download,
  Upload,
  PieChart,
  BarChart3,
  ArrowUpDown,
  AlertTriangle,
  BellRing,
  SearchAlert,
  Shield,
  DollarSign,
  Activity,
  Target,
  Star,
  Info,
  MoreVertical,
  PlusCircle,
  MinusCircle,
  ExternalLink,
  History,
  LayoutList,
  List,
  Lock,
  UserPlus,
  LogIn,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackToast, type FeedbackToastVariant } from "@/components/ui/feedback-toast";
import { DipFinderPanel } from "@/components/dip-finder/dip-finder-panel";
import { RiskMetricsPanel } from "@/components/portfolio/risk-metrics-panel";
import { CorrelationHeatmap } from "@/components/portfolio/correlation-heatmap";
import { WhatIfSimulator } from "@/components/portfolio/what-if-simulator";
import { RebalanceAdvisor } from "@/components/portfolio/rebalance-advisor";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useBatchDailyHistory, useBatchPeriodPerformance, useSearch } from "@/hooks/use-stock-data";
import { formatCurrency, formatPercent, cn, enterDelay } from "@/lib/utils";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useSupabase } from "@/providers/supabase-provider";
import { ROUTES } from "@/lib/constants";
import type {
  EnrichedPosition,
  PortfolioImportResult,
  PortfolioSummary,
  PortfolioTransaction,
} from "@/types/portfolio";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

type SortKey =
  | "ticker"
  | "market_value"
  | "weight"
  | "gain_loss"
  | "gain_loss_percent"
  | "day_gain_loss"
  | "day_gain_loss_percent"
  | "price"
  | "avg_cost"
  | "shares";

type SortDir = "asc" | "desc";

type ViewMode = "table" | "cards";
type PerformanceRange = "1W" | "1M" | "YTD" | "1Y" | "ALL";

// Declared once rather than inline: the segmented control measures its own
// options, and handing it a fresh array every render makes it re-measure for
// nothing.
const RANGE_ITEMS = [
  { key: "1W" as const, label: "1W" },
  { key: "1M" as const, label: "1M" },
  { key: "YTD" as const, label: "YTD" },
  { key: "1Y" as const, label: "1Y" },
  { key: "ALL" as const, label: "ALL" },
];
type ContentView = "positions" | "transactions" | "watchlist" | "dipfinder";
type QuickFilter =
  | "all"
  | "winners"
  | "losers"
  | "big-losers"   // down > 10%
  | "big-winners"  // up > 25%
  | "today-up"
  | "today-down";
const SCOUT_INBOX_READ_KEY = "huntr_portfolio_watchlist_scout_inbox_read_v1";

function normalizeDividendYield(raw: number | null | undefined): number {
  if (!Number.isFinite(raw) || raw === null || raw === undefined || raw <= 0) return 0;
  return raw > 1 ? raw / 100 : raw;
}

// ═══════════════════════════════════════════════════════
// HELPER: color classes for gain/loss
// ═══════════════════════════════════════════════════════

function glColor(value: number) {
  if (value > 0) return "text-bullish";
  if (value < 0) return "text-bearish";
  return "text-mist";
}

function glBg(value: number) {
  if (value > 0) return "bg-bullish/10 text-bullish";
  if (value < 0) return "bg-bearish/10 text-bearish";
  return "bg-wolf-surface text-mist";
}

// ═══════════════════════════════════════════════════════
// ADD POSITION PANEL
// ═══════════════════════════════════════════════════════

function AddPositionPanel({
  onAdd,
  onClose,
}: {
  onAdd: (ticker: string, shares: number, avgCost: number, purchaseDate: string) => void;
  onClose: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(true);

  const { data: results = [], isLoading } = useSearch(searchQuery, 6);

  const handleSelect = useCallback((t: string) => {
    setTicker(t);
    setSearchQuery(t);
    setShowSearch(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(shares);
    const c = parseFloat(avgCost);
    if (!ticker || isNaN(s) || s <= 0 || isNaN(c) || c <= 0) return;
    onAdd(ticker, s, c, purchaseDate);
    setTicker("");
    setShares("");
    setAvgCost("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setSearchQuery("");
    setShowSearch(true);
  };

  return (
    <Card className="border-sunset-orange/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-snow-peak flex items-center gap-2">
            <Plus className="w-4 h-4 text-sunset-orange" /> Add Position
          </p>
          <button onClick={onClose} className="text-mist hover:text-snow-peak transition-colors" type="button" aria-label="Close add position panel">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Ticker search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mist" />
            <input
              type="text"
              placeholder="Search ticker (e.g. AAPL)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value.toUpperCase());
                setShowSearch(true);
                setTicker("");
              }}
              onFocus={() => setShowSearch(true)}
              className={cn(
                "w-full h-9 pl-9 pr-4 rounded-lg text-sm font-mono",
                "bg-snow-peak/[0.06] ring-1 ring-inset ring-wolf-border/50",
                "text-snow-peak placeholder:text-mist/60",
                "focus:outline-none focus:ring-1 focus:ring-sunset-orange/50 focus:border-sunset-orange/40",
                "transition-all"
              )}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mist animate-spin" />
            )}
            {showSearch && results.length > 0 && !ticker && (
              <div className="scroll-quiet absolute z-50 mt-1 max-h-48 w-full overflow-hidden overflow-y-auto rounded-lg bg-wolf-surface shadow-xl ring-1 ring-inset ring-wolf-border/50">
                {results.map((r) => (
                  <button
                    key={r.ticker}
                    type="button"
                    onClick={() => handleSelect(r.ticker)}
                    className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-sunset-orange/10 transition-colors"
                  >
                    <TickerLogo ticker={r.ticker} className="w-5 h-5 rounded" />
                    <span className="text-xs font-mono font-semibold text-snow-peak">{r.ticker}</span>
                    <span className="text-[11px] text-mist truncate flex-1">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-mist mb-1 block">Shares</label>
              <Input
                type="number"
                step="any"
                min="0.001"
                placeholder="100"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-mist mb-1 block">Avg Cost ($)</label>
              <Input
                type="number"
                step="any"
                min="0.01"
                placeholder="150.00"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-mist mb-1 block">Purchase Date</label>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-9 text-xs"
            disabled={!ticker || !shares || !avgCost}
          >
            Add to Portfolio
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
// EDIT POSITION DIALOG
// ═══════════════════════════════════════════════════════

function EditPositionDialog({
  position,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: {
  position: EnrichedPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (ticker: string, shares: number, avgCost: number, notes: string, purchaseDate: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!position) return;
    setShares(position.shares.toString());
    setAvgCost(position.avg_cost.toString());
    setNotes(position.notes ?? "");
    const parsed = new Date(position.added_at);
    setPurchaseDate(Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10));
  }, [position]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position || isSaving) return;

    const parsedShares = parseFloat(shares);
    const parsedAvgCost = parseFloat(avgCost);

    if (!Number.isFinite(parsedShares) || !Number.isFinite(parsedAvgCost)) return;

    if (parsedShares <= 0) {
      onRemove(position.ticker);
      onOpenChange(false);
      return;
    }

    if (parsedAvgCost <= 0) return;

    setIsSaving(true);
    // onSave is synchronous (localStorage), but wrapping keeps the UX consistent
    try {
      onSave(position.ticker, parsedShares, parsedAvgCost, notes.trim(), purchaseDate);
    } finally {
      setIsSaving(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-wolf-border/40">
          <DialogTitle className="text-base">Edit Position</DialogTitle>
          <DialogDescription className="text-xs">
            Update shares, cost basis and notes like a portfolio lot editor.
          </DialogDescription>
        </DialogHeader>

        {position && (
          <form onSubmit={handleSave} className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <TickerLogo
                ticker={position.ticker}
                src={position.profile?.logo_url}
                className="w-8 h-8"
                imageClassName="rounded-md"
                fallbackClassName="rounded-md text-[9px]"
              />
              <div>
                <p className="text-sm font-semibold text-snow-peak font-mono">{position.ticker}</p>
                <p className="text-[11px] text-mist truncate max-w-[220px]">{position.profile?.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-mist mb-1 block">Shares</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-mist mb-1 block">Avg Cost ($)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-mist mb-1 block">Purchase Date</label>
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-mist mb-1 block">Notes (optional)</label>
              <Input
                type="text"
                placeholder="e.g. Long-term compounder"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="rounded-md ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-wide text-mist mb-1">Preview</p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="text-mist">Market Value</p>
                  <p className="font-mono text-snow-peak">
                    {formatCurrency((parseFloat(shares) || 0) * (position.quote?.price ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-mist">Cost Basis</p>
                  <p className="font-mono text-snow-peak">
                    {formatCurrency((parseFloat(shares) || 0) * (parseFloat(avgCost) || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-mist">Unrealized</p>
                  <p className="font-mono text-snow-peak">
                    {formatCurrency(
                      ((parseFloat(shares) || 0) * (position.quote?.price ?? 0)) -
                        ((parseFloat(shares) || 0) * (parseFloat(avgCost) || 0))
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="text-bearish hover:text-bearish"
                onClick={() => {
                  onRemove(position.ticker);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Position
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="gap-2">
                  {isSaving && <Spinner size="sm" color="white" />}
                  {isSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════
// IMPORT CSV DIALOG
// ═══════════════════════════════════════════════════════

function ImportCsvDialog({
  open,
  onOpenChange,
  onImportFile,
  onNotify,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportFile: (file: File) => Promise<PortfolioImportResult>;
  onNotify: (payload: {
    title: string;
    message?: string;
    variant: FeedbackToastVariant;
  }) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        onNotify({
          title: "Import failed",
          message: "Please upload a .csv file.",
          variant: "error",
        });
        onOpenChange(false);
        return;
      }
      setIsImporting(true);
      try {
        const result = await onImportFile(file);

        if (result.mode === "unknown-format") {
          onNotify({
            title: "Unsupported CSV structure",
            message: "Use Huntr export format or Trading 212 transaction export.",
            variant: "error",
          });
          return;
        }

        if (result.importedCount === 0) {
          const suffix = result.skippedUnknownTickers.length
            ? ` Unknown tickers: ${result.skippedUnknownTickers.join(", ")}.`
            : "";
          onNotify({
            title: "No positions imported",
            message: `No valid rows were found.${suffix}`,
            variant: "warning",
          });
          return;
        }

        const skippedUnknownMessage = result.skippedUnknownTickers.length
          ? ` Not found in Huntr: ${result.skippedUnknownTickers.join(", ")}.`
          : "";

        onNotify({
          title: "CSV imported correctly",
          message: `${result.importedCount} positions imported.${skippedUnknownMessage}`,
          variant: result.skippedUnknownTickers.length ? "warning" : "success",
        });
      } catch {
        onNotify({
          title: "Import failed",
          message: "Please verify the CSV format and try again.",
          variant: "error",
        });
      } finally {
        setIsImporting(false);
        onOpenChange(false);
      }
    },
    [onImportFile, onNotify, onOpenChange]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setIsDragActive(false);
          setIsImporting(false);
        }
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-wolf-border/40">
          <DialogTitle className="text-base">Import Portfolio CSV</DialogTitle>
          <DialogDescription className="text-xs">
            Drag and drop your file or select it manually.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4">
          <Input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            aria-label="Select CSV file to import"
            title="Select CSV file to import"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleFile(file);
              e.target.value = "";
            }}
          />

          <div
            className={cn(
              "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              isDragActive
                ? "border-sunset-orange bg-sunset-orange/10"
                : "border-wolf-border/60 bg-snow-peak/[0.03]"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              await handleFile(file);
            }}
          >
            <Upload className="w-7 h-7 text-sunset-orange mx-auto mb-3" />
            <p className="text-sm font-semibold text-snow-peak">Drop your CSV here</p>
            <p className="text-xs text-mist mt-1">or click to browse files</p>
            <Button
              type="button"
              variant="ghost"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Select CSV
            </Button>
          </div>

          <div className="rounded-lg ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.04] p-4 space-y-2">
            <p className="text-xs font-semibold text-snow-peak">Supported CSV structures</p>
            <p className="text-[11px] text-mist">
              1. Huntr export format: <span className="font-mono">Ticker,Shares,Avg Cost,Added At,Notes</span>
            </p>
            <p className="text-[11px] text-mist">
              2. Broker transactions format: 
            </p>
            <p className="text-[11px] text-mist">
              Action,Time,ISIN,Ticker,Name,ID,No. of shares,Price / share
            </p>
            <p className="font-mono text-[11px] text-mist">
              Buy,2024-03-05 14:20:00,US67066G1040,NVDA,NVIDIA Corporation,TXN-0008,10,822.10
              Sell,2024-03-10 11:05:00,NL0010273215,ASML,ASML Holding N.V.,TXN-0009,2,910.00
              Buy,2024-03-15 15:45:00,US88160R1014,TSLA,Tesla Inc.,TXN-0010,25,175.30
            </p>
            <p className="text-[11px] text-sunset-orange">
              Trading 212 users: no changes needed, your exported CSV is already compatible.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════
// PORTFOLIO EVOLUTION CHART
// ═══════════════════════════════════════════════════════

function PortfolioEvolutionChart({
  positions,
  transactionHistory,
}: {
  positions: EnrichedPosition[];
  transactionHistory: PortfolioTransaction[];
}) {
  const [range, setRange] = useState<PerformanceRange>("1M");
  const [compareBenchmark, setCompareBenchmark] = useState(true);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Long enough to read as a sweep, short enough never to delay reading the
  // line. Recharts' own default of 1500ms feels like waiting for the chart.
  const chartAnimationDuration = prefersReducedMotion ? 0 : 520;
  const c = useChartColors();

  const tickers = useMemo(
    () =>
      Array.from(
        new Set([
          ...positions.map((p) => p.ticker.toUpperCase()),
          ...transactionHistory.map((tx) => tx.ticker.toUpperCase()),
        ])
      ),
    [positions, transactionHistory]
  );
  const benchmarkTicker = "SPY";

  const { data: historyByTicker = {}, isLoading } = useBatchDailyHistory(
    [...tickers, benchmarkTicker],
    range,
    tickers.length > 0
  );

  const chartData = useMemo(() => {
    if (tickers.length === 0) return [];

    const toIsoDate = (rawDate: string) => {
      const parsed = new Date(rawDate);
      return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
    };

    const baseEvents = transactionHistory.length > 0
      ? transactionHistory
      : positions.map((p) => ({
          id: `fallback-${p.ticker}`,
          ticker: p.ticker,
          side: "buy" as const,
          shares: p.shares,
          price: p.avg_cost,
          executed_at: p.added_at,
          realized_gain_loss: 0,
        }));

    // Repair incomplete histories (common on migrated/localStorage portfolios)
    // so reconstructed shares match current live positions in all environments.
    const netSharesByTicker = new Map<string, number>();
    for (const tx of baseEvents) {
      const ticker = tx.ticker.toUpperCase();
      const current = netSharesByTicker.get(ticker) ?? 0;
      const delta = tx.side === "buy" ? tx.shares : -tx.shares;
      netSharesByTicker.set(ticker, current + delta);
    }

    const syntheticAdjustments = positions
      .map((position) => {
        const ticker = position.ticker.toUpperCase();
        const net = netSharesByTicker.get(ticker) ?? 0;
        const diff = position.shares - net;

        if (Math.abs(diff) <= 1e-9) return null;

        return {
          id: `synthetic-adjust-${ticker}`,
          ticker,
          side: diff > 0 ? ("buy" as const) : ("sell" as const),
          shares: Math.abs(diff),
          price: position.avg_cost,
          executed_at: toIsoDate(position.added_at) ? position.added_at : new Date().toISOString(),
          realized_gain_loss: 0,
        };
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

    const txEvents = [...baseEvents, ...syntheticAdjustments]
      .map((tx) => {
        return {
          ...tx,
          isoDate: toIsoDate(tx.executed_at),
        };
      })
      .filter((tx) => tx.isoDate.length > 0)
      .sort((a, b) => {
        const byDate = a.isoDate.localeCompare(b.isoDate);
        if (byDate !== 0) return byDate;
        if (a.side === b.side) return 0;
        return a.side === "buy" ? -1 : 1;
      });

    const dates = new Set<string>();
    const closesByTicker = new Map<string, Map<string, number>>();

    for (const ticker of tickers) {
      const rows = historyByTicker[ticker] ?? [];
      if (rows.length < 2) continue;

      const closeMap = new Map<string, number>();
      rows.forEach((row) => {
        if (Number.isFinite(row.close) && row.close > 0) {
          closeMap.set(row.date, row.close);
          dates.add(row.date);
        }
      });

      if (closeMap.size > 1) {
        closesByTicker.set(ticker, closeMap);
      }
    }

    const tickersWithHistory = new Set(closesByTicker.keys());

    const benchmarkRows = historyByTicker[benchmarkTicker] ?? [];
    const benchmarkCloseMap = new Map<string, number>();
    benchmarkRows.forEach((row) => {
      if (Number.isFinite(row.close) && row.close > 0) {
        benchmarkCloseMap.set(row.date, row.close);
        dates.add(row.date);
      }
    });

    const orderedDates = Array.from(dates).sort((a, b) => a.localeCompare(b));
    if (orderedDates.length < 2) return [];

    const allStartDate = (() => {
      if (range !== "ALL") return null;

      const positionDates = positions
        .map((p) => toIsoDate(p.added_at))
        .filter((d): d is string => d.length > 0);

      const dates = [...txEvents.map((tx) => tx.isoDate), ...positionDates].sort((a, b) => a.localeCompare(b));

      return dates[0] ?? null;
    })();

    const filteredDates = allStartDate
      ? orderedDates.filter((d) => d >= allStartDate)
      : orderedDates;

    const effectiveDates = filteredDates.length >= 2 ? filteredDates : orderedDates;

    if (effectiveDates.length < 2) return [];

    const lastCloseByTicker = new Map<string, number>();
    const liveSharesByTicker = new Map<string, number>();
    let txCursor = 0;
    let lastBenchmarkClose = 0;
    const dailySnapshots: Array<{
      isoDate: string;
      holdingsValue: number;
      flowValue: number;
      benchmarkClose: number;
    }> = [];

    for (const isoDate of effectiveDates) {
      let flowValue = 0;

      while (txCursor < txEvents.length && txEvents[txCursor].isoDate <= isoDate) {
        const tx = txEvents[txCursor];
        const ticker = tx.ticker.toUpperCase();

        // Ignore events for symbols without price history in this window.
        if (!tickersWithHistory.has(ticker)) {
          txCursor += 1;
          continue;
        }

        const currentShares = liveSharesByTicker.get(ticker) ?? 0;

        if (tx.side === "buy") {
          liveSharesByTicker.set(ticker, currentShares + tx.shares);
          flowValue += tx.shares * tx.price;
        } else {
          const sellShares = Math.min(tx.shares, currentShares);
          if (sellShares > 0) {
            const nextShares = currentShares - sellShares;
            if (nextShares <= 1e-9) {
              liveSharesByTicker.delete(ticker);
            } else {
              liveSharesByTicker.set(ticker, nextShares);
            }
            flowValue -= sellShares * tx.price;
          }
        }

        txCursor += 1;
      }

      let holdingsValue = 0;

      for (const ticker of tickers) {
        const closeMap = closesByTicker.get(ticker);
        if (!closeMap) continue;

        const close = closeMap.get(isoDate);
        if (typeof close === "number") {
          lastCloseByTicker.set(ticker, close);
        }

        const effectiveClose = lastCloseByTicker.get(ticker);
        if (typeof effectiveClose === "number") {
          holdingsValue += (liveSharesByTicker.get(ticker) ?? 0) * effectiveClose;
        }
      }

      const benchmarkClose = benchmarkCloseMap.get(isoDate);
      if (typeof benchmarkClose === "number") {
        lastBenchmarkClose = benchmarkClose;
      }

      dailySnapshots.push({
        isoDate,
        holdingsValue,
        flowValue,
        benchmarkClose: lastBenchmarkClose,
      });
    }

    if (dailySnapshots.length < 2) return [];

    let started = false;
    let previousValue = 0;
    let cumulative = 1;
    const points: Array<{ isoDate: string; portfolioPct: number; benchmarkClose: number }> = [];

    for (const snapshot of dailySnapshots) {
      if (!started) {
        if (snapshot.holdingsValue > 0) {
          started = true;
          previousValue = snapshot.holdingsValue;
          points.push({
            isoDate: snapshot.isoDate,
            portfolioPct: 0,
            benchmarkClose: snapshot.benchmarkClose,
          });
        }
        continue;
      }

      if (previousValue > 1e-9) {
        const rawDailyReturn =
          (snapshot.holdingsValue - previousValue - snapshot.flowValue) /
          previousValue;
        const dailyReturn = Number.isFinite(rawDailyReturn) ? rawDailyReturn : 0;
        cumulative *= 1 + dailyReturn;
      }

      previousValue = snapshot.holdingsValue;

      points.push({
        isoDate: snapshot.isoDate,
        portfolioPct: (cumulative - 1) * 100,
        benchmarkClose: snapshot.benchmarkClose,
      });
    }

    if (points.length < 2) return [];

    const initialBenchmarkValue = points.find((p) => p.benchmarkClose > 0)?.benchmarkClose ?? 0;

    return points.map((point) => {
      const parsed = new Date(`${point.isoDate}T00:00:00Z`);
      const benchmarkPct = initialBenchmarkValue > 0
        ? ((point.benchmarkClose / initialBenchmarkValue) - 1) * 100
        : 0;

      return {
        isoDate: point.isoDate,
        tooltipDate: parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        portfolioPct: point.portfolioPct,
        benchmarkPct,
      };
    });
  }, [benchmarkTicker, historyByTicker, positions, range, tickers, transactionHistory]);

  const periodReturns = useMemo(() => {
    if (chartData.length === 0) {
      return { portfolio: 0, benchmark: 0 };
    }

    const last = chartData[chartData.length - 1];
    return {
      portfolio: Number.isFinite(last.portfolioPct) ? last.portfolioPct : 0,
      benchmark: Number.isFinite(last.benchmarkPct) ? last.benchmarkPct : 0,
    };
  }, [chartData]);

  const yAxisConfig = useMemo(() => {
    const values = chartData.flatMap((row) =>
      compareBenchmark ? [row.portfolioPct, row.benchmarkPct] : [row.portfolioPct]
    );

    if (values.length === 0) {
      return { domain: [-1, 1] as [number, number], ticks: [-1, 0, 1] };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 0.5);
    const paddedMin = min - span * 0.14;
    const paddedMax = max + span * 0.14;
    const rawStep = Math.max((paddedMax - paddedMin) / 4, 0.25);

    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const niceBase = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = niceBase * magnitude;

    const start = Math.floor(paddedMin / step) * step;
    const end = Math.ceil(paddedMax / step) * step;

    const ticks: number[] = [];
    for (let current = start; current <= end + step * 0.1; current += step) {
      ticks.push(Number(current.toFixed(4)));
    }

    return {
      domain: [start, end] as [number, number],
      ticks,
    };
  }, [chartData, compareBenchmark]);

  const formatPct = useCallback((value: number) => {
    const precision = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    const rounded = Number(value.toFixed(precision));
    return `${rounded}%`;
  }, []);

  const formatXAxis = useCallback((isoDate: string) => {
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    const month = parsed.toLocaleDateString("en-US", { month: "short" });
    const year = parsed.toLocaleDateString("en-US", { year: "2-digit" });
    return `${month} '${year}`;
  }, []);

  const renderTooltip = useCallback(
    ({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ dataKey?: string; value?: number }>; label?: string | number }) => {
      if (!active || !payload || payload.length === 0) return null;

      const portfolio = Number(payload.find((p) => p.dataKey === "portfolioPct")?.value ?? 0);
      const benchmark = Number(payload.find((p) => p.dataKey === "benchmarkPct")?.value ?? 0);
      const tooltipDate = (payload[0] as { payload?: { tooltipDate?: string } })?.payload?.tooltipDate ?? String(label ?? "");

      return (
        <div className="min-w-[152px] rounded-md ring-1 ring-inset ring-wolf-border/60 bg-wolf-black/95 px-2.5 py-2 shadow-lg">
          <p className="text-[10px] text-mist mb-1">{tooltipDate}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-snow-peak/90">
                <span className="h-2 w-2 rounded-full bg-sunset-orange" /> Portfolio
              </span>
                <span className="font-mono text-sunset-orange">{portfolio >= 0 ? "+" : ""}{formatPct(portfolio)}</span>
            </div>
            {compareBenchmark && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-snow-peak/90">
                    <span className="h-2 w-2 rounded-full bg-slate-400" /> S&P 500
                </span>
                  <span className="font-mono text-slate-300">{benchmark >= 0 ? "+" : ""}{formatPct(benchmark)}</span>
              </div>
            )}
          </div>
        </div>
      );
    },
    [compareBenchmark, formatPct]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-3">
          <CardTitle className="text-sm flex items-center gap-2 lg:justify-self-start">
            <TrendingUp className="w-4 h-4 text-sunset-orange" /> Portfolio Evolution
          </CardTitle>

          <div className="flex items-center justify-center gap-2 lg:justify-self-center">
            <div className="rounded-md ring-1 ring-inset ring-wolf-border/50 bg-snow-peak/[0.05] px-2.5 py-1">
              <p className="text-[10px] text-mist leading-none">Portfolio</p>
              <p className={cn("text-xs font-mono font-semibold mt-1", periodReturns.portfolio >= 0 ? "text-sunset-orange" : "text-bearish")}>
                {periodReturns.portfolio >= 0 ? "+" : ""}{formatPct(periodReturns.portfolio)}
              </p>
            </div>
            <div className="rounded-md ring-1 ring-inset ring-wolf-border/50 bg-snow-peak/[0.05] px-2.5 py-1">
              <p className="text-[10px] text-mist leading-none">S&P 500</p>
              <p className={cn("text-xs font-mono font-semibold mt-1", periodReturns.benchmark >= 0 ? "text-slate-300" : "text-bearish")}>
                {periodReturns.benchmark >= 0 ? "+" : ""}{formatPct(periodReturns.benchmark)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:justify-self-end">
            <SegmentedTabs
              items={RANGE_ITEMS}
              value={range}
              onChange={setRange}
              ariaLabel="Performance range"
              size="sm"
            />
            <button
              type="button"
              onClick={() => setCompareBenchmark((v) => !v)}
              aria-pressed={compareBenchmark}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] ring-1 ring-inset",
                "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
                "active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
                compareBenchmark
                  ? "bg-sunset-orange/12 text-sunset-orange ring-sunset-orange/40"
                  : "text-mist ring-wolf-border/40 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
              )}
            >
              Benchmark (S&P 500)
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-64 w-full rounded-md ring-1 ring-inset ring-wolf-border/30 bg-snow-peak/[0.03] flex items-center justify-center text-sm text-mist">
            No historical data available for this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            {/* Keyed on the range alone. Changing the window replaces the whole
                series, and letting Recharts tween one path into another with a
                different point count makes the line writhe rather than redraw -
                so the chart is rebuilt and sweeps in cleanly instead. The
                benchmark toggle is deliberately not part of the key: adding a
                second line should not make the first one redraw. */}
            <AreaChart
              key={range}
              data={chartData}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF8C42" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#FF8C42" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="isoDate"
                axisLine={false}
                tickLine={false}
                minTickGap={68}
                tickMargin={8}
                tick={{ fill: c.tick, fontSize: 11 }}
                tickFormatter={formatXAxis}
              />
              <YAxis
                orientation="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }}
                domain={yAxisConfig.domain}
                ticks={yAxisConfig.ticks}
                tickFormatter={(v: number) => formatPct(v)}
              />
              <Tooltip
                cursor={{ stroke: c.tick, strokeWidth: 1, strokeDasharray: "4 4" }}
                content={renderTooltip}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { tooltipDate?: string } | undefined;
                  return row?.tooltipDate ?? "";
                }}
              />
              <Area
                type="linear"
                dataKey="portfolioPct"
                stroke="#FF8C42"
                strokeWidth={2.9}
                fill="url(#portfolioArea)"
                dot={false}
                activeDot={{ r: 3.5, stroke: "#FF8C42", strokeWidth: 2, fill: c.dotStroke }}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={chartAnimationDuration}
                animationEasing="ease-out"
              />
              {compareBenchmark && (
                <Area
                  type="linear"
                  dataKey="benchmarkPct"
                  stroke="#7A8FA8"
                  strokeWidth={2.7}
                  fill="transparent"
                  dot={false}
                  activeDot={{ r: 3, stroke: "#7A8FA8", strokeWidth: 2, fill: c.dotStroke }}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={chartAnimationDuration}
                  // The comparison trails the portfolio by a beat so the two
                  // read as separate lines rather than one thick stroke.
                  animationBegin={prefersReducedMotion ? 0 : 110}
                  animationEasing="ease-out"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
// ROW QUICK ACTIONS + TRANSACTION DIALOG
// ═══════════════════════════════════════════════════════

function RowQuickActions({
  position,
  onAddTransaction,
  onDelete,
}: {
  position: EnrichedPosition;
  onAddTransaction: (position: EnrichedPosition) => void;
  onDelete: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Fixed coordinates taken from the trigger. The menu is roughly 150px
    // tall, so near the bottom of the window it opens upwards instead of
    // running off the edge.
    const MENU_HEIGHT = 150;
    const openUpwards = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setAnchor({
      top: openUpwards ? rect.top - MENU_HEIGHT - 6 : rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  const toggle = () => {
    // Measured on the click that opens it: an effect that sets state on mount
    // costs an extra render pass, and the position is knowable the moment the
    // trigger is pressed.
    if (!open) place();
    setOpen((previous) => !previous);
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // The row scrolls with the table and the page; a menu pinned to the
    // viewport has to follow its trigger or it detaches from the row it
    // belongs to.
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const itemClass = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px]",
    "transition-[background-color,color,transform] duration-150 ease-out",
    "active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        // No `title`: the native tooltip rendered on top of the open menu and
        // covered the first item. The accessible name still carries the label.
        aria-label={`Actions for ${position.ticker}`}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg",
          "text-mist ring-1 ring-inset ring-transparent",
          "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
          "hover:bg-snow-peak/[0.06] hover:text-snow-peak hover:ring-wolf-border/50",
          "active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-sunset-orange/60",
          open && "bg-snow-peak/[0.08] text-snow-peak ring-wolf-border/60"
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* Portalled to the body. Inside the table this menu was a child of a
          container with `overflow-x-auto`, which clipped it - the source of the
          "sometimes it works, sometimes it doesn't" behaviour. */}
      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: anchor.top, right: anchor.right }}
              className={cn(
                "popover-materialize fixed z-[80] w-56 origin-top-right rounded-xl p-1.5",
                "bg-wolf-surface/95 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl"
              )}
            >
              <button
                type="button"
                role="menuitem"
                className={cn(itemClass, "text-snow-peak hover:bg-snow-peak/[0.06]")}
                onClick={() => {
                  setOpen(false);
                  onAddTransaction(position);
                }}
              >
                <PlusCircle className="h-4 w-4 shrink-0 text-sunset-orange" />
                Add transaction
              </button>
              <Link
                href={`/symbol/${position.ticker}`}
                role="menuitem"
                className={cn(itemClass, "text-snow-peak hover:bg-snow-peak/[0.06]")}
                onClick={() => setOpen(false)}
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-mist" />
                View details
              </Link>
              <button
                type="button"
                role="menuitem"
                className={cn(itemClass, "text-bearish hover:bg-bearish/10")}
                onClick={() => {
                  setOpen(false);
                  onDelete(position.ticker);
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Delete position
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function AddTransactionDialog({
  open,
  position,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  position: EnrichedPosition | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (ticker: string, side: "buy" | "sell", shares: number, price: number, transactionDate: string) => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!position) return;
    setShares("");
    setPrice((position.quote?.price ?? position.avg_cost).toString());
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setSide("buy");
  }, [position]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-wolf-border/40">
          <DialogTitle className="text-base">Add Transaction</DialogTitle>
          <DialogDescription className="text-xs">
            Register a buy or sell directly from the position row.
          </DialogDescription>
        </DialogHeader>
        {position && (
          <form
            className="p-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const parsedShares = parseFloat(shares);
              const parsedPrice = parseFloat(price);
              if (!Number.isFinite(parsedShares) || parsedShares <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                return;
              }
              onSubmit(position.ticker, side, parsedShares, parsedPrice, transactionDate);
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2">
              <TickerLogo ticker={position.ticker} src={position.profile?.logo_url} className="w-7 h-7" />
              <p className="text-sm font-semibold text-snow-peak font-mono">{position.ticker}</p>
            </div>

            <div className="flex rounded-md ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.04] p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={cn(
                  "px-3 py-1 text-xs rounded-sm",
                  side === "buy" ? "bg-bullish/15 text-bullish" : "text-mist"
                )}
              >
                <PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Buy
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={cn(
                  "px-3 py-1 text-xs rounded-sm",
                  side === "sell" ? "bg-bearish/15 text-bearish" : "text-mist"
                )}
              >
                <MinusCircle className="w-3.5 h-3.5 inline mr-1" /> Sell
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-mist mb-1 block">Shares</label>
                <Input value={shares} onChange={(e) => setShares(e.target.value)} type="number" step="any" min="0.0001" className="h-9 text-xs font-mono" />
              </div>
              <div>
                <label className="text-[11px] text-mist mb-1 block">Price</label>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="any" min="0.01" className="h-9 text-xs font-mono" />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-mist mb-1 block">Purchase Date</label>
              <Input
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save Transaction</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TxViewMode = "large" | "compact";

function TransactionActivityFeed({
  transactions,
  positions,
  isLoading,
}: {
  transactions: PortfolioTransaction[];
  positions: EnrichedPosition[];
  isLoading: boolean;
}) {
  const [viewMode, setViewMode] = useState<TxViewMode>("large");

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
      ),
    [transactions]
  );

  const positionMap = useMemo(
    () => new Map(positions.map((position) => [position.ticker.toUpperCase(), position])),
    [positions]
  );

  const txWeightById = useMemo(() => {
    const asc = [...transactions].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    );

    const qtyByTicker = new Map<string, number>();
    const priceByTicker = new Map<string, number>();
    const result = new Map<string, { before: number; after: number }>();

    const getTotalValue = () => {
      let total = 0;
      qtyByTicker.forEach((qty, ticker) => {
        const price = priceByTicker.get(ticker) ?? 0;
        if (qty > 0 && price > 0) total += qty * price;
      });
      return total;
    };

    for (const tx of asc) {
      const ticker = tx.ticker.toUpperCase();
      const prevQty = qtyByTicker.get(ticker) ?? 0;
      const prevPrice = priceByTicker.get(ticker) ?? tx.price;

      const beforeTotal = getTotalValue();
      const beforeValue = Math.max(0, prevQty) * Math.max(0, prevPrice);
      const beforeWeight = beforeTotal > 0 ? beforeValue / beforeTotal : 0;

      const nextQty = tx.side === "buy" ? prevQty + tx.shares : Math.max(0, prevQty - tx.shares);
      qtyByTicker.set(ticker, nextQty);
      priceByTicker.set(ticker, tx.price);

      const afterTotal = getTotalValue();
      const afterValue = Math.max(0, nextQty) * Math.max(0, tx.price);
      const afterWeight = afterTotal > 0 ? afterValue / afterTotal : 0;

      result.set(tx.id, {
        before: Math.max(0, beforeWeight),
        after: Math.max(0, afterWeight),
      });
    }

    return result;
  }, [transactions]);

  const formatDate = (iso: string): string => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── View toggle ── */}
      {sortedTransactions.length > 0 && (
        <div className="flex justify-end">
          <div className="flex rounded-md ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.04] p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode("large")}
              title="Detailed view"
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[11px] transition-colors",
                viewMode === "large"
                  ? "bg-sunset-orange/20 text-sunset-orange"
                  : "text-mist hover:text-snow-peak"
              )}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Detailed</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("compact")}
              title="Compact view"
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[11px] transition-colors",
                viewMode === "compact"
                  ? "bg-sunset-orange/20 text-sunset-orange"
                  : "text-mist hover:text-snow-peak"
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compact</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Transaction list ── */}
      <div className={cn("space-y-2", viewMode === "compact" && "space-y-1")}>
        {sortedTransactions.length === 0 ? (
          <div className="rounded-lg ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.03] p-6 text-center text-sm text-mist">
            No transactions recorded yet.
          </div>
        ) : (
          sortedTransactions.map((tx) => {
            const sideLabel = tx.side === "buy" ? "Bought" : "Sold";
            const sideColor = tx.side === "buy" ? "text-bullish" : "text-bearish";
            const position = positionMap.get(tx.ticker.toUpperCase()) ?? null;

            const currentWeight = position?.weight ?? 0;
            const txWeights = txWeightById.get(tx.id);
            const beforeWeight = txWeights?.before ?? 0;
            const afterWeight = txWeights?.after ?? currentWeight;

            const realizedDenominator = tx.shares * tx.price - tx.realized_gain_loss;
            const sellGainPct = realizedDenominator > 0 ? tx.realized_gain_loss / realizedDenominator : 0;

            const operationPnL = tx.realized_gain_loss;
            const operationPct = sellGainPct;
            const pnlColor = operationPnL >= 0 ? "text-bullish" : "text-bearish";

            /* ── Large card (original) ── */
            if (viewMode === "large") {
              return (
                <div
                  key={tx.id}
                  className="rounded-xl bg-snow-peak/[0.03] p-2 ring-1 ring-inset ring-wolf-border/50"
                >
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_210px]">
                    <div className="rounded-xl bg-snow-peak/[0.03] px-5 py-4">
                      <div className={cn("text-[28px] leading-tight font-bold tracking-tight", sideColor)}>
                        <span className="text-[26px]">{sideLabel}</span>
                        <span className="mx-2 inline-flex align-middle">
                          <TickerLogo ticker={tx.ticker} className="h-5 w-5" imageClassName="rounded-full" fallbackClassName="rounded-full text-[8px]" />
                        </span>
                        <span className="text-snow-peak">{tx.ticker}</span>
                        <span className="text-snow-peak/90"> @ {formatCurrency(tx.price)}</span>
                      </div>
                      {tx.side === "sell" ? (
                        <p className={cn("mt-1 text-xl font-bold", pnlColor)}>
                          {operationPnL >= 0 ? "+" : ""}
                          {formatPercent(operationPct, 2)} {operationPnL >= 0 ? "gain" : "loss"}
                        </p>
                      ) : null}
                      <p className="mt-3 inline-flex items-center rounded-full bg-snow-peak/[0.06] px-3 py-1 text-xs text-mist">
                        {tx.side === "buy" ? <PlusCircle className="mr-1.5 h-3 w-3" /> : <MinusCircle className="mr-1.5 h-3 w-3" />}
                        {tx.side === "buy" ? "position up" : "position down"} by {formatPercent(Math.abs(afterWeight - beforeWeight), 2)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-snow-peak/[0.035] px-4 py-3 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 text-mist/80 text-xs mb-2">
                        <History className="h-4 w-4" />
                        <span>{formatDate(tx.executed_at)}</span>
                      </div>
                      <p className="font-mono text-xl font-bold text-snow-peak">
                        {(beforeWeight * 100).toFixed(2)}
                        <span className="mx-1 text-mist">→</span>
                        {(afterWeight * 100).toFixed(2)}%
                      </p>
                      <p className="text-sm text-mist">of total portfolio</p>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── Compact row ── */
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-lg ring-1 ring-inset ring-wolf-border/35 bg-snow-peak/[0.03] px-3 py-2 hover:bg-snow-peak/[0.05] transition-colors"
              >
                {/* Side badge */}
                <span
                  className={cn(
                    "shrink-0 min-w-[38px] text-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                    tx.side === "buy"
                      ? "bg-bullish/15 text-bullish"
                      : "bg-bearish/15 text-bearish"
                  )}
                >
                  {tx.side === "buy" ? "BUY" : "SELL"}
                </span>

                {/* Logo + ticker */}
                <div className="flex items-center gap-1.5 min-w-[70px]">
                  <TickerLogo ticker={tx.ticker} className="h-4 w-4 shrink-0" imageClassName="rounded-full" fallbackClassName="rounded-full text-[7px]" />
                  <span className="text-xs font-mono font-semibold text-snow-peak">{tx.ticker}</span>
                </div>

                {/* Shares × price */}
                <span className="text-xs font-mono text-mist whitespace-nowrap">
                  {tx.shares} × {formatCurrency(tx.price)}
                </span>

                {/* Sell gain/loss badge */}
                {tx.side === "sell" ? (
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded",
                      operationPnL >= 0
                        ? "bg-bullish/10 text-bullish"
                        : "bg-bearish/10 text-bearish"
                    )}
                  >
                    {operationPnL >= 0 ? "+" : ""}{formatPercent(operationPct, 2)}
                  </span>
                ) : null}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Weight before → after */}
                <span className="shrink-0 text-[10px] font-mono text-mist/60 whitespace-nowrap hidden sm:block">
                  {(beforeWeight * 100).toFixed(2)}
                  <span className="mx-0.5 text-mist/40">→</span>
                  {(afterWeight * 100).toFixed(2)}%
                </span>

                {/* Date */}
                <span className="shrink-0 text-[10px] text-mist/50 whitespace-nowrap min-w-[80px] text-right">
                  {formatDate(tx.executed_at)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUMMARY KPI ROW
// ═══════════════════════════════════════════════════════

function SummaryKPIs({ summary, isLoading }: { summary: PortfolioSummary; isLoading: boolean }) {
  const kpis = [
    {
      label: "Market Value",
      value: formatCurrency(summary.total_market_value, { compact: true }),
      icon: DollarSign,
      color: "text-sunset-orange",
      glow: "bg-sunset-orange",
    },
    {
      label: "Total Return",
      value: `${summary.total_return_gain_loss >= 0 ? "+" : ""}${formatCurrency(summary.total_return_gain_loss, { compact: true })}`,
      sub: formatPercent(summary.total_gain_loss_percent),
      icon: summary.total_return_gain_loss >= 0 ? TrendingUp : TrendingDown,
      color: summary.total_return_gain_loss >= 0 ? "text-bullish" : "text-bearish",
      glow: summary.total_return_gain_loss >= 0 ? "bg-bullish" : "bg-bearish",
    },
    {
      label: "Today",
      value: `${summary.total_day_gain_loss >= 0 ? "+" : ""}${formatCurrency(summary.total_day_gain_loss, { compact: true })}`,
      sub: formatPercent(summary.total_day_gain_loss_percent),
      icon: Activity,
      color: summary.total_day_gain_loss >= 0 ? "text-bullish" : "text-bearish",
      glow: summary.total_day_gain_loss >= 0 ? "bg-bullish" : "bg-bearish",
    },
    {
      label: "Cost Basis",
      value: formatCurrency(summary.total_cost_basis, { compact: true }),
      icon: Target,
      color: "text-golden-hour",
      glow: "bg-golden-hour",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {kpis.map((kpi, kpiIndex) => (
        <Card
          key={kpi.label}
          className="insight-enter overflow-hidden"
          style={enterDelay(kpiIndex * 40)}
        >
          <CardContent className="relative p-4">
            {/* Every tile carried the same orange bloom in its corner, which
                made four different figures look like four of the same thing.
                The tile now borrows the metric's own colour, so the row reads
                as green when the book is up and red when it is down before a
                single number is parsed. */}
            <div
              className={cn(
                "pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl",
                kpi.glow,
                "opacity-[0.12]"
              )}
            />
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.035]">
                    <kpi.icon className={cn("w-3.5 h-3.5", kpi.color)} />
                  </span>
                  <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                    {kpi.label}
                  </p>
                </div>
                {/* Tabular figures so the four tiles stay aligned as prices
                    tick, and tighter tracking because at this size the default
                    spacing reads as gaps between digits. */}
                <p
                  className={cn(
                    "font-mono text-xl font-semibold tabular-nums tracking-[-0.02em]",
                    kpi.color
                  )}
                >
                  {kpi.value}
                </p>
                {kpi.sub && (
                  <p className={cn("mt-1 font-mono text-xs tabular-nums", kpi.color)}>
                    {kpi.sub}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SECTOR & ALLOCATION BREAKDOWN
// ═══════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// Sector palette — engineered for max contrast in dark mode.
// Each colour sits ~30° apart in the HSL wheel so adjacent donut
// slices are always visually distinct.
//
// Includes ALL alias variants that Yahoo Finance / Alpha Vantage /
// Supabase profiles may return (e.g. "Information Technology" vs
// "Technology", "Financials" vs "Financial Services", etc.) so that
// no sector ever falls through to the neutral grey.
// ─────────────────────────────────────────────────────────
const SECTOR_COLORS: Record<string, { dotClass: string; hex: string }> = {
  // ── Energy (0° red) ──────────────────────────────────────
  Energy:                      { dotClass: "bg-red-500",     hex: "#EF4444" },

  // ── Consumer Cyclical / Discretionary (38° amber) ────────
  "Consumer Cyclical":         { dotClass: "bg-amber-500",   hex: "#F59E0B" },
  "Consumer Discretionary":    { dotClass: "bg-amber-500",   hex: "#F59E0B" },

  // ── Utilities (48° yellow) ───────────────────────────────
  Utilities:                   { dotClass: "bg-yellow-400",  hex: "#FACC15" },

  // ── Basic Materials (83° lime) ───────────────────────────
  "Basic Materials":           { dotClass: "bg-lime-500",    hex: "#84CC16" },
  Materials:                   { dotClass: "bg-lime-500",    hex: "#84CC16" },

  // ── Consumer Defensive / Staples (142° green) ────────────
  "Consumer Defensive":        { dotClass: "bg-green-500",   hex: "#22C55E" },
  "Consumer Staples":          { dotClass: "bg-green-500",   hex: "#22C55E" },

  // ── Real Estate (173° teal) ──────────────────────────────
  "Real Estate":               { dotClass: "bg-teal-500",    hex: "#14B8A6" },

  // ── Financial Services / Financials (189° cyan) ──────────
  "Financial Services":        { dotClass: "bg-cyan-500",    hex: "#06B6D4" },
  Financials:                  { dotClass: "bg-cyan-500",    hex: "#06B6D4" },
  Finance:                     { dotClass: "bg-cyan-500",    hex: "#06B6D4" },

  // ── Technology / Information Technology (217° blue) ──────
  Technology:                  { dotClass: "bg-blue-500",    hex: "#3B82F6" },
  "Information Technology":    { dotClass: "bg-blue-500",    hex: "#3B82F6" },

  // ── Industrials (239° indigo) ────────────────────────────
  Industrials:                 { dotClass: "bg-indigo-500",  hex: "#6366F1" },
  Industrial:                  { dotClass: "bg-indigo-500",  hex: "#6366F1" },

  // ── Communication Services (271° purple) ─────────────────
  "Communication Services":    { dotClass: "bg-purple-500",  hex: "#A855F7" },
  "Telecommunications":        { dotClass: "bg-purple-500",  hex: "#A855F7" },
  "Telecom":                   { dotClass: "bg-purple-500",  hex: "#A855F7" },

  // ── Healthcare / Health Care (330° pink) ─────────────────
  Healthcare:                  { dotClass: "bg-pink-500",    hex: "#EC4899" },
  "Health Care":               { dotClass: "bg-pink-500",    hex: "#EC4899" },
  "Health Sciences":           { dotClass: "bg-pink-500",    hex: "#EC4899" },

  // ── Neutral fallback ─────────────────────────────────────
  Unknown:                     { dotClass: "bg-slate-500",   hex: "#64748B" },
  Other:                       { dotClass: "bg-slate-500",   hex: "#64748B" },
};

function getSectorColorClass(sector: string) {
  return SECTOR_COLORS[sector]?.dotClass ?? "bg-wolf-border";
}

function getSectorColorHex(sector: string) {
  return SECTOR_COLORS[sector]?.hex ?? "#334155";
}

function AllocationBreakdown({
  positions,
  summary,
  isLoading,
}: {
  positions: EnrichedPosition[];
  summary: PortfolioSummary;
  isLoading: boolean;
}) {
  const [perfMode, setPerfMode] = useState<"today" | "all">("today");

  const sectors = useMemo(() => {
    return Object.entries(summary.sector_allocation)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, weight]) => ({ sector, weight }));
  }, [summary.sector_allocation]);

  const sectorPerformance = useMemo(() => {
    const map = new Map<string, { market: number; cost: number; day: number; gain: number }>();
    for (const pos of positions) {
      const sector = pos.profile?.sector || "Unknown";
      const current = map.get(sector) ?? { market: 0, cost: 0, day: 0, gain: 0 };
      current.market += pos.market_value;
      current.cost += pos.cost_basis;
      current.day += pos.day_gain_loss;
      current.gain += pos.gain_loss;
      map.set(sector, current);
    }

    return Object.fromEntries(
      Array.from(map.entries()).map(([sector, agg]) => {
        const previous = agg.market - agg.day;
        const todayPct = previous > 0 ? agg.day / previous : 0;
        const allPct = agg.cost > 0 ? agg.gain / agg.cost : 0;
        return [sector, { todayPct, allPct }];
      })
    );
  }, [positions]);

  const donutData = useMemo(() => {
    return sectors.map((entry) => ({
      ...entry,
      fill: getSectorColorHex(entry.sector),
    }));
  }, [sectors]);

  const centerPerf = perfMode === "today" ? summary.total_day_gain_loss_percent : summary.total_gain_loss_percent;

  const topHoldings = useMemo(() => {
    return [...positions]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }, [positions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sector Allocation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChart className="w-4 h-4 text-sunset-orange" /> Sector Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))
          ) : sectors.length === 0 ? (
            <p className="text-xs text-mist/70">No positions</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-center mt-4">
                <div className="relative mx-auto h-52 w-52">
                  <div className="h-full w-full rounded-full bg-snow-peak/[0.025]">
                    <RechartsPieChart width={208} height={208}>
                      <Pie
                        data={donutData}
                        dataKey="weight"
                        nameKey="sector"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={98}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={2}
                        stroke="rgba(11, 20, 22, 0.76)"
                        strokeWidth={2}
                        isAnimationActive={true}
                      >
                        {donutData.map((slice, index) => (
                          <Cell key={`sector-cell-${index}`} fill={slice.fill} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </div>

                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <p
                      className={cn(
                        "text-[24px] leading-none font-mono font-bold",
                        centerPerf >= 0 ? "text-bullish" : "text-bearish"
                      )}
                    >
                      {centerPerf >= 0 ? "+" : ""}
                      {formatPercent(centerPerf, 2)}
                    </p>
                    <div className="relative">
                      <select
                        value={perfMode}
                        onChange={(e) => setPerfMode(e.target.value as "today" | "all")}
                        className="appearance-none rounded-md ring-1 ring-inset ring-wolf-border/50 bg-wolf-black/80 px-2.5 py-1 pr-7 text-sm text-snow-peak"
                      >
                        <option value="today">Today</option>
                        <option value="all">All Time</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {sectors.map(({ sector, weight }) => {
                    const perf = sectorPerformance[sector];
                    const pct = perfMode === "today" ? perf?.todayPct ?? 0 : perf?.allPct ?? 0;
                    return (
                      <div key={sector} className="flex items-center justify-between rounded-md ring-1 ring-inset ring-wolf-border/30 bg-snow-peak/[0.025] px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2.5 h-2.5 rounded-sm", getSectorColorClass(sector))} />
                          <p className="text-xs text-snow-peak">{sector}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono text-sunset-orange">{(weight * 100).toFixed(1)}%</p>
                          <p className={cn("text-[10px] font-mono", pct >= 0 ? "text-bullish" : "text-bearish")}>
                            {pct >= 0 ? "+" : ""}
                            {formatPercent(pct, 2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Top Holdings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sunset-orange" /> Top Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 mt-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))
          ) : topHoldings.length === 0 ? (
            <p className="text-xs text-mist/70">No positions</p>
          ) : (
            topHoldings.map((pos) => (
              <div key={pos.ticker} className="flex items-center gap-3 rounded-lg ring-1 ring-inset ring-wolf-border/30 bg-snow-peak/[0.02] px-2.5 py-2">
                <TickerLogo
                  ticker={pos.ticker}
                  src={pos.profile?.logo_url}
                  className="w-7 h-7"
                  imageClassName="rounded-md"
                  fallbackClassName="rounded-md text-[8px]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-snow-peak">{pos.ticker}</p>
                  <p className="text-[10px] text-mist truncate">{pos.profile?.name}</p>
                </div>
                {/* Weight bar */}
                <div className="w-28 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-wolf-border/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sunset-orange to-golden-hour transition-all"
                      style={{ width: `${pos.weight * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-mist w-10 text-right">
                    {(pos.weight * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PORTFOLIO METRICS PANEL
// ═══════════════════════════════════════════════════════

function PortfolioMetrics({
  summary,
  positions,
  isLoading,
}: {
  summary: PortfolioSummary;
  positions: EnrichedPosition[];
  isLoading: boolean;
}) {
  const concentrationRisk = summary.top_holding_weight > 0.25 ? "High" : summary.top_holding_weight > 0.15 ? "Moderate" : "Low";
  const concentrationColor = concentrationRisk === "High" ? "text-bearish" : concentrationRisk === "Moderate" ? "text-golden-hour" : "text-bullish";

  const annualDividendIncome = useMemo(() => {
    return positions.reduce((sum, p) => {
      if (!p.quote || !p.quote.dividend_yield) return sum;
      return sum + p.market_value * normalizeDividendYield(p.quote.dividend_yield);
    }, 0);
  }, [positions]);

  const topHolding = useMemo(() => {
    return [...positions].sort((a, b) => b.weight - a.weight)[0] ?? null;
  }, [positions]);

  const topSector = useMemo(() => {
    const entries = Object.entries(summary.sector_allocation);
    if (entries.length === 0) return null;
    const [name, weight] = entries.sort(([, a], [, b]) => b - a)[0];
    return { name, weight };
  }, [summary.sector_allocation]);

  const metrics = [
    { label: "Weighted P/E", value: summary.weighted_pe > 0 ? summary.weighted_pe.toFixed(1) + "x" : "—", icon: BarChart3 },
    { label: "Weighted Beta", value: summary.weighted_beta > 0 ? summary.weighted_beta.toFixed(2) : "—", icon: Activity },
    { label: "Div Yield (Wgt)", value: summary.weighted_dividend_yield > 0 ? formatPercent(summary.weighted_dividend_yield, 2) : "—", icon: DollarSign },
    { label: "Est Annual Income", value: annualDividendIncome > 0 ? formatCurrency(annualDividendIncome, { compact: true }) : "—", icon: TrendingUp },
    { label: "Concentration Risk", value: concentrationRisk, icon: concentrationRisk === "Low" ? Shield : AlertTriangle, color: concentrationColor, riskTooltip: true },
    { label: "Positions", value: summary.position_count.toString(), icon: Target },
    { label: "Realized P&L", value: formatCurrency(summary.realized_gain_loss, { compact: true }), icon: DollarSign, color: glColor(summary.realized_gain_loss) },
    { label: "Unrealized P&L", value: formatCurrency(summary.unrealized_gain_loss, { compact: true }), icon: Activity, color: glColor(summary.unrealized_gain_loss) },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="w-4 h-4 text-sunset-orange" /> Portfolio Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg ring-1 ring-inset ring-wolf-border/35 bg-snow-peak/[0.02] px-3 py-2.5">
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <m.icon className="w-3.5 h-3.5 text-mist/75" />
                    <p className="text-[10px] uppercase tracking-wide text-mist">{m.label}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className={cn("text-base font-semibold font-mono", m.color ?? "text-snow-peak")}>
                      {m.value}
                    </p>
                    {"riskTooltip" in m && m.riskTooltip && concentrationRisk !== "Low" && (
                      <div className="relative group/risk">
                        <Info className="w-3 h-3 text-mist/60 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-wolf-black ring-1 ring-inset ring-wolf-border/50 shadow-xl opacity-0 pointer-events-none group-hover/risk:opacity-100 group-hover/risk:pointer-events-auto transition-opacity z-50">
                          <p className="text-[11px] text-mist leading-relaxed">
                            {topHolding?.ticker ?? "Top position"} represents <span className="text-snow-peak font-medium">{((topHolding?.weight ?? 0) * 100).toFixed(1)}%</span> of your portfolio. {topSector?.name ?? "Top sector"} is <span className="text-snow-peak font-medium">{((topSector?.weight ?? 0) * 100).toFixed(1)}%</span> of allocation.
                          </p>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-wolf-border/50" />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
// POSITION TABLE
// ═══════════════════════════════════════════════════════

function PositionTable({
  positions,
  isLoading,
  onAddTransaction,
  onRemove,
  groupBySector,
  sortKey,
  sortDir,
  onSort,
}: {
  positions: EnrichedPosition[];
  isLoading: boolean;
  onAddTransaction: (position: EnrichedPosition) => void;
  onRemove: (ticker: string) => void;
  groupBySector: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const columns: { key: SortKey; label: string; headerClass?: string }[] = [
    { key: "ticker", label: "Ticker", headerClass: "text-left" },
    { key: "shares", label: "Shares", headerClass: "text-right" },
    { key: "avg_cost", label: "Avg Cost", headerClass: "text-right" },
    { key: "price", label: "Price", headerClass: "text-right" },
    { key: "market_value", label: "Mkt Value", headerClass: "text-right" },
    { key: "weight", label: "Weight", headerClass: "text-right" },
    { key: "gain_loss", label: "Gain/Loss", headerClass: "text-right" },
    { key: "gain_loss_percent", label: "Return %", headerClass: "text-right" },
    { key: "day_gain_loss_percent", label: "Day %", headerClass: "text-right" },
  ];

  const grouped = useMemo(() => {
    if (!groupBySector) return null;
    const map = new Map<string, EnrichedPosition[]>();
    positions.forEach((pos) => {
      const key = pos.profile?.sector || "Unknown";
      const current = map.get(key) ?? [];
      current.push(pos);
      map.set(key, current);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const totalA = a[1].reduce((sum, p) => sum + p.market_value, 0);
      const totalB = b[1].reduce((sum, p) => sum + p.market_value, 0);
      return totalB - totalA;
    });
  }, [groupBySector, positions]);

  const renderRow = (pos: EnrichedPosition, rowIndex: number) => (
    <tr
      key={pos.ticker}
      // Rows arrive in reading order, capped so a long book never leaves its
      // tail waiting. Filtering and sorting change the set under the same
      // keys, so React reuses the rows and the cascade only plays when rows
      // genuinely appear - re-sorting stays instant, which is the point.
      style={enterDelay(Math.min(rowIndex * 18, 180))}
      className={cn(
        "insight-enter group border-b border-wolf-border/20",
        "transition-colors duration-150 ease-out hover:bg-snow-peak/[0.03]"
      )}
    >
      <td className="py-2.5 px-2">
        <Link href={`/symbol/${pos.ticker}`} className="flex items-center gap-2 min-w-0">
          <TickerLogo
            ticker={pos.ticker}
            src={pos.profile?.logo_url}
            className="w-6 h-6 shrink-0"
            imageClassName="rounded-md"
            fallbackClassName="rounded-md text-[8px]"
          />
          <div className="min-w-0">
            <p className="font-semibold text-snow-peak font-mono">{pos.ticker}</p>
            <p className="text-[10px] text-mist truncate max-w-[120px]">{pos.profile?.name}</p>
          </div>
        </Link>
      </td>
      <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{pos.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
      <td className="py-2.5 px-2 text-right font-mono text-mist">{formatCurrency(pos.avg_cost)}</td>
      <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{formatCurrency(pos.quote?.price ?? 0)}</td>
      <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{formatCurrency(pos.market_value, { compact: pos.market_value >= 1_000_000 })}</td>
      <td className="py-2.5 px-2 text-right">
        <Badge variant="secondary" className="text-[10px] font-mono">{(pos.weight * 100).toFixed(1)}%</Badge>
      </td>
      <td className={cn("py-2.5 px-2 text-right font-mono", glColor(pos.gain_loss))}>
        {pos.gain_loss >= 0 ? "+" : ""}{formatCurrency(pos.gain_loss, { compact: Math.abs(pos.gain_loss) >= 1_000_000 })}
      </td>
      <td className="py-2.5 px-2 text-right">
        <span className={cn("text-[11px] font-mono px-1.5 py-0.5 rounded", glBg(pos.gain_loss_percent))}>
          {pos.gain_loss_percent >= 0 ? "+" : ""}{(pos.gain_loss_percent * 100).toFixed(2)}%
        </span>
      </td>
      <td className="py-2.5 px-2 text-right">
        <span className={cn("text-[11px] font-mono px-1.5 py-0.5 rounded", glBg(pos.day_gain_loss_percent))}>
          {pos.day_gain_loss_percent >= 0 ? "+" : ""}{(pos.day_gain_loss_percent * 100).toFixed(2)}%
        </span>
      </td>
      <td className="py-2.5 px-2 text-center">
        {/* Revealed on hover, but `focus-within` keeps it visible while the
            menu is open or the trigger is focused - it used to fade out from
            under an open menu the moment the pointer left the row. */}
        <div className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <RowQuickActions
            position={pos}
            onAddTransaction={onAddTransaction}
            onDelete={onRemove}
          />
        </div>
      </td>
    </tr>
  );

  return (
    <div className="scroll-quiet min-h-[260px] overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-wolf-border/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "py-2 px-2 font-medium text-mist/80 cursor-pointer hover:text-snow-peak transition-colors whitespace-nowrap",
                  col.headerClass
                )}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    <ArrowUpDown className="w-3 h-3 text-sunset-orange" />
                  )}
                </span>
              </th>
            ))}
            <th className="py-2 px-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-wolf-border/20">
                {Array.from({ length: columns.length + 1 }).map((__, j) => (
                  <td key={j} className="py-2.5 px-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : positions.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="py-24 text-center text-mist/70">
                No positions yet. Add your first position above.
              </td>
            </tr>
          ) : groupBySector && grouped ? (
            grouped.flatMap(([sector, rows]) => [
              <tr key={`sector-${sector}`} className="border-b border-t-2 border-wolf-border/40 bg-snow-peak/[0.04]">
                <td colSpan={columns.length + 1} className="px-3 py-2.5 text-[11px] font-bold text-sunset-orange uppercase tracking-wider">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sunset-orange/70" />
                    {sector}
                    <span className="text-mist font-normal">({rows.length})</span>
                  </span>
                </td>
              </tr>,
              ...rows.map((pos, rowIndex) => renderRow(pos, rowIndex)),
            ])
          ) : (
            positions.map((pos, rowIndex) => renderRow(pos, rowIndex))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// POSITION CARDS (mobile-friendly view)
// ═══════════════════════════════════════════════════════

function PositionCards({
  positions,
  isLoading,
  onEdit,
  onRemove,
}: {
  positions: EnrichedPosition[];
  isLoading: boolean;
  onEdit: (position: EnrichedPosition) => void;
  onRemove: (ticker: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-mist/70 text-sm">No positions yet. Add your first position above.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {positions.map((pos, cardIndex) => (
        <Card
          key={pos.ticker}
          // Same cascade as the table, a touch slower per card because there
          // are fewer of them and each carries more to read.
          style={enterDelay(Math.min(cardIndex * 30, 210))}
          className="insight-enter group relative overflow-hidden"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <Link href={`/symbol/${pos.ticker}`} className="flex items-center gap-2.5">
                <TickerLogo
                  ticker={pos.ticker}
                  src={pos.profile?.logo_url}
                  className="w-9 h-9"
                  imageClassName="rounded-lg"
                  fallbackClassName="rounded-lg text-[10px]"
                />
                <div>
                  <p className="text-sm font-bold text-snow-peak font-mono">{pos.ticker}</p>
                  <p className="text-[11px] text-mist truncate max-w-[140px]">{pos.profile?.name}</p>
                </div>
              </Link>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => onEdit(pos)}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-mist hover:text-snow-peak transition-all"
                  aria-label={`Edit ${pos.ticker}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(pos.ticker)}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-mist hover:text-bearish transition-all"
                  aria-label={`Remove ${pos.ticker}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] text-mist uppercase tracking-wide">Market Value</p>
                <p className="text-base font-bold font-mono text-snow-peak">
                  {formatCurrency(pos.market_value, { compact: pos.market_value >= 1_000_000 })}
                </p>
              </div>
              <div className="text-right">
                <span className={cn("text-xs font-mono px-2 py-0.5 rounded-md", glBg(pos.gain_loss_percent))}>
                  {pos.gain_loss_percent >= 0 ? "+" : ""}{(pos.gain_loss_percent * 100).toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-wolf-border/30">
              <div>
                <p className="text-[10px] text-mist">Shares</p>
                <p className="text-xs font-mono text-snow-peak">{pos.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] text-mist">Avg Cost</p>
                <p className="text-xs font-mono text-snow-peak">{formatCurrency(pos.avg_cost)}</p>
              </div>
              <div>
                <p className="text-[10px] text-mist">Weight</p>
                <p className="text-xs font-mono text-snow-peak">{(pos.weight * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-wolf-border/20 flex items-center justify-between">
              <p className="text-[10px] text-mist">Day P&L</p>
              <p className={cn("text-xs font-mono", glColor(pos.day_gain_loss))}>
                {pos.day_gain_loss >= 0 ? "+" : ""}{formatCurrency(pos.day_gain_loss)} ({pos.day_gain_loss_percent >= 0 ? "+" : ""}{(pos.day_gain_loss_percent * 100).toFixed(2)}%)
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WatchlistScoutView({
  entries,
  isLoading,
  perf1D,
  perf1W,
  perf1M,
  perfYTD,
  onOpenTargetDialog,
  onOpenAlertsDialog,
  activeAlertsByTicker,
}: {
  entries: Array<{
    ticker: string;
    profile: { name?: string; logo_url?: string | null } | null;
    quote: { price?: number; day_change_percent?: number; pe_ratio?: number } | null;
    target_price: number | null;
    effective_target_price: number | null;
    effective_target_type: "above" | "below" | null;
    tags: string[];
  }>;
  isLoading: boolean;
  perf1D: Record<string, number>;
  perf1W: Record<string, number>;
  perf1M: Record<string, number>;
  perfYTD: Record<string, number>;
  onOpenTargetDialog: (ticker: string, currentPrice: number, targetPrice: number | null) => void;
  onOpenAlertsDialog: (ticker: string, currentPrice: number) => void;
  activeAlertsByTicker: Record<string, number>;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.03] p-6 text-center text-sm text-mist">
        No watchlist candidates outside your current portfolio.
      </div>
    );
  }

  return (
    <div className="scroll-quiet overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-wolf-border/30">
            <th className="px-2 py-2 text-left font-medium text-mist">Company</th>
            <th className="px-2 py-2 text-left font-medium text-mist">Price</th>
            <th className="px-2 py-2 text-right font-medium text-mist">1D</th>
            <th className="px-2 py-2 text-right font-medium text-mist">1W</th>
            <th className="px-2 py-2 text-right font-medium text-mist">1M</th>
            <th className="px-2 py-2 text-right font-medium text-mist">YTD</th>
            <th className="px-2 py-2 text-right font-medium text-mist">P/E</th>
            <th className="px-2 py-2 text-right font-medium text-mist">Price Target</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const p1d = perf1D[entry.ticker] ?? 0;
            const p1w = perf1W[entry.ticker] ?? 0;
            const p1m = perf1M[entry.ticker] ?? 0;
            const pytd = perfYTD[entry.ticker] ?? 0;
            const pe = entry.quote?.pe_ratio;
            const targetPrice = entry.effective_target_price;
            const alertCount = activeAlertsByTicker[entry.ticker] ?? 0;
            const hasMultipleAlerts = alertCount > 1;
            const targetType = entry.effective_target_type;
            const distancePercent =
              targetPrice != null && (entry.quote?.price ?? 0) > 0
                ? (targetPrice - (entry.quote?.price ?? 0)) / (entry.quote?.price ?? 1)
                : null;

            return (
              <tr key={entry.ticker} className="border-b border-wolf-border/20 hover:bg-wolf-surface/40 transition-colors">
                <td className="px-2 py-2.5">
                  <Link href={`/symbol/${entry.ticker}`} className="flex items-center gap-2.5 min-w-0">
                    <TickerLogo
                      ticker={entry.ticker}
                      src={entry.profile?.logo_url ?? undefined}
                      className="w-8 h-8"
                      imageClassName="rounded-[7px]"
                      fallbackClassName="rounded-[7px] text-[9px]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-snow-peak font-mono">{entry.ticker}</p>
                      <p className="text-[11px] text-mist truncate max-w-[230px]">{entry.profile?.name ?? entry.ticker}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-2 py-2.5 text-left font-mono text-snow-peak whitespace-nowrap">
                  {entry.quote?.price != null ? formatCurrency(entry.quote.price) : "-"}
                </td>
                <td className={cn("px-2 py-2.5 text-right font-mono", p1d >= 0 ? "text-bullish" : "text-bearish")}>{p1d >= 0 ? "+" : ""}{formatPercent(p1d, 2)}</td>
                <td className={cn("px-2 py-2.5 text-right font-mono", p1w >= 0 ? "text-bullish" : "text-bearish")}>{p1w >= 0 ? "+" : ""}{formatPercent(p1w, 2)}</td>
                <td className={cn("px-2 py-2.5 text-right font-mono", p1m >= 0 ? "text-bullish" : "text-bearish")}>{p1m >= 0 ? "+" : ""}{formatPercent(p1m, 2)}</td>
                <td className={cn("px-2 py-2.5 text-right font-mono", pytd >= 0 ? "text-bullish" : "text-bearish")}>{pytd >= 0 ? "+" : ""}{formatPercent(pytd, 2)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-snow-peak">{pe && pe > 0 ? `${pe.toFixed(1)}x` : "—"}</td>
                <td className="px-2 py-2.5">
                  {hasMultipleAlerts ? (
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-[10px] border-sunset-orange/35 text-sunset-orange hover:text-sunset-orange"
                        onClick={() => onOpenAlertsDialog(entry.ticker, entry.quote?.price ?? 0)}
                        disabled={(entry.quote?.price ?? 0) <= 0}
                      >
                        {alertCount} alerts
                      </Button>
                    </div>
                  ) : targetPrice != null ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onOpenTargetDialog(entry.ticker, entry.quote?.price ?? 0, targetPrice)}
                        className="inline-flex items-center gap-1 text-mist hover:text-snow-peak cursor-pointer"
                        disabled={(entry.quote?.price ?? 0) <= 0}
                      >
                      {targetType === "above" ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                      ) : targetType === "below" ? (
                        <TrendingDown className="h-3 w-3 text-bearish" />
                      ) : null}
                      <span className="font-mono">{formatCurrency(targetPrice, { decimals: 2 })}</span>
                      {targetType ? (
                        <span className="text-[10px] uppercase tracking-wide text-mist/80">{targetType}</span>
                      ) : null}
                      {distancePercent != null ? (
                        <span className="font-mono text-[11px] text-mist/85">
                          ({distancePercent >= 0 ? "+" : ""}{formatPercent(distancePercent, 1)})
                        </span>
                      ) : null}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-[10px] text-mist/80 hover:text-snow-peak"
                        onClick={() => onOpenTargetDialog(entry.ticker, entry.quote?.price ?? 0, entry.target_price)}
                        disabled={(entry.quote?.price ?? 0) <= 0}
                      >
                        Set
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PORTFOLIO SELECTOR
// ═══════════════════════════════════════════════════════

function PortfolioSelector({
  portfolios,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  portfolios: { id: string; name: string; positions: { ticker: string }[] }[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0];

  return (
    <div ref={dropRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium",
          "bg-wolf-surface ring-1 ring-inset ring-wolf-border/40 text-snow-peak",
          "hover:border-sunset-orange/40 transition-colors"
        )}
      >
        <BriefcaseBusiness className="w-4 h-4 text-sunset-orange" />
        <span className="max-w-[160px] truncate">{active?.name ?? "My Portfolio"}</span>
        <Badge variant="secondary" className="text-[10px] font-mono">{active?.positions.length ?? 0}</Badge>
        <ChevronDown className={cn("w-3.5 h-3.5 text-mist transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 origin-top-right z-50 mt-1 w-72 rounded-lg ring-1 ring-inset ring-wolf-border/50 bg-wolf-surface shadow-xl overflow-hidden">
          <div className="scroll-quiet max-h-48 overflow-y-auto">
            {portfolios.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                  p.id === activeId ? "bg-sunset-orange/10" : "hover:bg-snow-peak/[0.04]"
                )}
              >
                {renamingId === p.id ? (
                  <form
                    className="flex-1 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renameValue.trim()) onRename(p.id, renameValue.trim());
                      setRenamingId(null);
                    }}
                  >
                    <input
                      className="flex-1 text-xs bg-snow-peak/[0.06] ring-1 ring-inset ring-wolf-border/50 rounded px-2 py-1 text-snow-peak focus:outline-none"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      aria-label="Rename portfolio"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => { onSelect(p.id); setOpen(false); }}
                  >
                    <p className="text-xs font-semibold text-snow-peak">{p.name}</p>
                    <p className="text-[10px] text-mist">{p.positions.length} positions</p>
                  </button>
                )}
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    className="text-mist/60 hover:text-snow-peak transition-colors"
                    onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name); }}
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  {p.id !== "default" && (
                    <button
                      type="button"
                      className="text-mist/60 hover:text-bearish transition-colors"
                      onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Create New */}
          <div className="border-t border-wolf-border/30 p-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) {
                  onCreate(newName.trim());
                  setNewName("");
                  setOpen(false);
                }
              }}
            >
              <input
                type="text"
                placeholder="New portfolio name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 text-xs bg-snow-peak/[0.06] ring-1 ring-inset ring-wolf-border/50 rounded-md px-2 py-1.5 text-snow-peak placeholder:text-mist/50 focus:outline-none focus:border-sunset-orange/40"
              />
              <Button type="submit" size="sm" className="h-7 text-[11px] px-2" disabled={!newName.trim()}>
                <Plus className="w-3 h-3" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADVANCED ANALYTICS SECTION
// ───────────────────────────────────────────────────────
// Wraps the 4 new analytics cards in a tabbed shell so the
// page stays scannable. The tabs avoid stacking 4 heavy
// charts vertically (which would push the positions table
// out of the fold on most screens).
// ═══════════════════════════════════════════════════════

type AnalyticsTab = "risk" | "correlation" | "whatif" | "rebalance";

/**
 * One analytics panel, kept in the tree whether or not it is the one showing.
 *
 * `hidden` rather than a conditional render: the panel keeps its state and its
 * warmed queries, so coming back is instant instead of a rebuild. Charts
 * inside measure themselves through a ResizeObserver, which fires again when
 * the panel returns to the layout, so they pick their size back up on their
 * own. The fade is short and opacity-only - the content is already laid out,
 * and this only has to say "something replaced what was here".
 */
/**
 * What each check-up view is for, in plain language.
 *
 * `question` is what the view answers; `reading` is how to interpret it,
 * including which direction is good - a number with no sense of "higher is
 * better" is not information a beginner can act on.
 */
const ANALYTICS_GUIDE: Record<AnalyticsTab, { question: string; reading: string }> = {
  risk: {
    question: "How rough has the ride been, and was the return worth it?",
    reading:
      "Volatility is how much the value swings month to month. Max drawdown is the deepest fall from a peak - the worst stretch you would have had to sit through. Sharpe puts the two together: it asks how much return you were paid per unit of that discomfort, so higher is better.",
  },
  correlation: {
    question: "Do your holdings move as one, or independently?",
    reading:
      "Each square scores how closely two positions move together, from +1 (in lockstep) to -1 (opposite). Owning ten names that all score near +1 is closer to one large bet than to a diversified portfolio - the cooler the grid, the more genuinely spread your risk is.",
  },
  whatif: {
    question: "What would a trade do to this portfolio before you place it?",
    reading:
      "Draft a buy or a sell and see the result on your position sizes and sector mix. Nothing here touches the real portfolio - it is a sketchpad for checking whether a trade concentrates you further or actually balances things out.",
  },
  rebalance: {
    question: "Where has the portfolio drifted from what you intended?",
    reading:
      "Winners quietly grow into a larger share of the portfolio than you chose, and losers shrink. This compares where each position sits now against its target weight and lists the trades that would close the gap.",
  },
};

function AnalyticsPanel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div hidden={!active} className={active ? "insight-enter" : undefined}>
      {children}
    </div>
  );
}

function AdvancedAnalyticsSection({
  positions,
  summary,
  transactionHistory,
  isLoading,
}: {
  positions: EnrichedPosition[];
  summary: PortfolioSummary;
  transactionHistory: PortfolioTransaction[];
  isLoading: boolean;
}) {
  const [tab, setTab] = useState<AnalyticsTab>("risk");

  // Every one of these panels holds work the user did: draft trades in
  // What-If, target weights in Rebalance, a chosen window in Correlation.
  // Unmounting on each switch threw all of it away, so glancing at another
  // tab and coming back meant starting over - and it paid for the panel's
  // whole first render again on the way back. Panels are kept alive once
  // visited and hidden with CSS instead, so a switch is a repaint rather than
  // a rebuild. Nothing is mounted before it is first asked for, so the initial
  // load still only pays for one.
  const [visited, setVisited] = useState<ReadonlySet<AnalyticsTab>>(
    () => new Set<AnalyticsTab>(["risk"])
  );

  // Switching tabs used to yank the page upwards. The panels are very
  // different heights, so moving from a tall one to a short one shrank the
  // whole document; the browser then clamped the scroll position to the new,
  // shorter page and the view slid up on its own. Nothing was scrolling - the
  // ground was moving.
  //
  // So the content box never shrinks below the tallest panel seen: the
  // document keeps its length across a switch and the scroll position has no
  // reason to move. It buys stability with some empty space under the shorter
  // panels, which is the better trade for a control the user clicks between
  // repeatedly while reading.
  const contentRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState(0);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const sync = () => {
      const height = node.offsetHeight;
      setReservedHeight((previous) => (height > previous ? height : previous));
    };

    sync();
    // Panels grow as their data arrives, so one measurement at switch time is
    // not enough to know how tall this card really gets.
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab]);

  // Recorded on the switch itself rather than in an effect watching `tab`:
  // the two always change together, so an effect only adds a second render.
  const selectTab = (next: AnalyticsTab) => {
    setTab(next);
    setVisited((previous) => {
      if (previous.has(next)) return previous;
      const updated = new Set(previous);
      updated.add(next);
      return updated;
    });
  };

  const tabs = [
    { key: "risk" as const, label: "Risk & Return", icon: <Shield className="h-3 w-3" /> },
    { key: "correlation" as const, label: "Correlation", icon: <BarChart3 className="h-3 w-3" /> },
    { key: "whatif" as const, label: "What-If", icon: <Activity className="h-3 w-3" /> },
    { key: "rebalance" as const, label: "Rebalance", icon: <ArrowUpDown className="h-3 w-3" /> },
  ];

  const guide = ANALYTICS_GUIDE[tab];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-sunset-orange" />
              Portfolio Check-Up
            </CardTitle>
            <p className="mt-0.5 text-[11px] text-mist/80">
              Four ways to see whether this portfolio is built the way you think it is.
            </p>
          </div>
          <SegmentedTabs
            items={tabs}
            value={tab}
            onChange={selectTab}
            ariaLabel="Portfolio check-up view"
            size="sm"
          />
        </div>

        {/* The tab labels are the industry's words, and they stay - renaming
            them would leave an experienced user hunting for the view they
            know. What was missing is the sentence underneath: what question
            this view answers, and how to read the answer. That is the part a
            first-time investor cannot infer from the word "Correlation". */}
        <div className="mt-3 rounded-lg bg-snow-peak/[0.025] px-3 py-2.5 ring-1 ring-inset ring-wolf-border/35">
          <p className="text-xs font-medium text-snow-peak">{guide.question}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist/85">{guide.reading}</p>
        </div>
      </CardHeader>
      <CardContent
        ref={contentRef}
        className="pt-2"
        style={reservedHeight > 0 ? { minHeight: reservedHeight } : undefined}
      >
        {visited.has("risk") ? (
          <AnalyticsPanel active={tab === "risk"}>
            <RiskMetricsPanel
              positions={positions}
              transactionHistory={transactionHistory}
              isLoading={isLoading}
            />
          </AnalyticsPanel>
        ) : null}
        {visited.has("correlation") ? (
          <AnalyticsPanel active={tab === "correlation"}>
            <CorrelationHeatmap positions={positions} />
          </AnalyticsPanel>
        ) : null}
        {visited.has("whatif") ? (
          <AnalyticsPanel active={tab === "whatif"}>
            <WhatIfSimulator positions={positions} summary={summary} />
          </AnalyticsPanel>
        ) : null}
        {visited.has("rebalance") ? (
          <AnalyticsPanel active={tab === "rebalance"}>
            <RebalanceAdvisor
              positions={positions}
              totalMarketValue={summary.total_market_value}
            />
          </AnalyticsPanel>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
// QUICK FILTER CHIP
// ═══════════════════════════════════════════════════════

function QuickFilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "bullish" | "bearish";
}) {
  const inactiveToneClass =
    tone === "bullish"
      ? "text-bullish/80 ring-bullish/25 hover:bg-bullish/10"
      : tone === "bearish"
        ? "text-bearish/80 ring-bearish/25 hover:bg-bearish/10"
        : "text-mist ring-wolf-border/40 hover:text-snow-peak hover:bg-snow-peak/[0.06]";

  const activeToneClass =
    tone === "bullish"
      ? "bg-bullish/15 text-bullish ring-bullish/40"
      : tone === "bearish"
        ? "bg-bearish/15 text-bearish ring-bearish/40"
        : "bg-sunset-orange/15 text-sunset-orange ring-sunset-orange/40";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0 && !active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset",
        // Filtering is the most-repeated action on this page, so the chip
        // acknowledges the press itself rather than waiting for the table
        // below to finish re-sorting.
        "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
        "active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
        active ? activeToneClass : inactiveToneClass,
        count === 0 && !active && "cursor-not-allowed opacity-40"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "px-1 py-px rounded-sm text-[10px] font-mono",
          active ? "bg-snow-peak/[0.03]" : "bg-snow-peak/[0.04] text-mist"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// LOCKED STATE (guests)
// ═══════════════════════════════════════════════════════

function PortfolioLockedState() {
  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <BriefcaseBusiness className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Portfolio Tracker</h1>
          <p className="text-xs text-mist mt-0.5">
            Track positions, P&L, allocation and risk metrics
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sunset-orange/10 text-sunset-orange">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <p className="text-base font-semibold text-snow-peak">
              Create a free account to track your portfolio
            </p>
            <p className="text-xs leading-relaxed text-mist">
              Portfolio tracking is only available to registered users — sign up free to
              add positions, track P&amp;L, and monitor risk metrics.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link href={ROUTES.SIGNUP}>
              <Button className="gap-1.5 w-full sm:w-auto">
                <UserPlus className="w-3.5 h-3.5" />
                Create free account
              </Button>
            </Link>
            <Link href={ROUTES.LOGIN}>
              <Button variant="ghost" className="gap-1.5 w-full sm:w-auto">
                <LogIn className="w-3.5 h-3.5" />
                I already have an account
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function PortfoliosPage() {
  const { user, isLoading: isAuthLoading } = useSupabase();
  const portfolio = usePortfolio();
  const {
    data: watchlistData = [],
    isLoading: watchlistLoading,
    alerts,
    addAlert,
    removeAlert,
    updateAlert,
    setTargetPrice,
    lists,
    activeListId,
    setActiveList,
  } = useWatchlist();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<EnrichedPosition | null>(null);
  const [transactionPosition, setTransactionPosition] = useState<EnrichedPosition | null>(null);
  const [contentView, setContentView] = useState<ContentView>("positions");
  const [toast, setToast] = useState<{
    title: string;
    message?: string;
    variant: FeedbackToastVariant;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [groupBySector, setGroupBySector] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("market_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isScoutInboxOpen, setIsScoutInboxOpen] = useState(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [isAlertsDialogOpen, setIsAlertsDialogOpen] = useState(false);
  const [alertTicker, setAlertTicker] = useState<string>("");
  const [alertType, setAlertType] = useState<"above" | "below">("below");
  const [alertPrice, setAlertPrice] = useState<string>("");
  const [alertsDialogTicker, setAlertsDialogTicker] = useState("");
  const [alertsDialogCurrentPrice, setAlertsDialogCurrentPrice] = useState(0);
  const [alertDrafts, setAlertDrafts] = useState<Array<{ id: string | null; type: "above" | "below"; price: string }>>([]);
  const [dismissedScoutInboxIds, setDismissedScoutInboxIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(SCOUT_INBOX_READ_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const effectiveViewMode: ViewMode = isMobileViewport ? "cards" : viewMode;

  // Quick filter + sorting logic
  // The filter pass runs first so the visible row count chip is accurate.
  const filteredPositions = useMemo(() => {
    const all = portfolio.positions;
    switch (quickFilter) {
      case "winners":
        return all.filter((p) => p.gain_loss_percent > 0);
      case "losers":
        return all.filter((p) => p.gain_loss_percent < 0);
      case "big-winners":
        return all.filter((p) => p.gain_loss_percent > 0.25);
      case "big-losers":
        return all.filter((p) => p.gain_loss_percent < -0.10);
      case "today-up":
        return all.filter((p) => p.day_gain_loss_percent > 0);
      case "today-down":
        return all.filter((p) => p.day_gain_loss_percent < 0);
      case "all":
      default:
        return all;
    }
  }, [portfolio.positions, quickFilter]);

  const sortedPositions = useMemo(() => {
    const arr = [...filteredPositions];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const valA = sortKey === "ticker" ? a.ticker : sortKey === "price" ? (a.quote?.price ?? 0) : (a as unknown as Record<string, number>)[sortKey];
      const valB = sortKey === "ticker" ? b.ticker : sortKey === "price" ? (b.quote?.price ?? 0) : (b as unknown as Record<string, number>)[sortKey];
      if (typeof valA === "string" && typeof valB === "string") return valA.localeCompare(valB) * dir;
      return ((valA as number) - (valB as number)) * dir;
    });
    return arr;
  }, [filteredPositions, sortKey, sortDir]);

  // Precompute per-filter counts so the chips show "(5)" inline
  const filterCounts = useMemo(() => {
    const all = portfolio.positions;
    return {
      all: all.length,
      winners: all.filter((p) => p.gain_loss_percent > 0).length,
      losers: all.filter((p) => p.gain_loss_percent < 0).length,
      bigWinners: all.filter((p) => p.gain_loss_percent > 0.25).length,
      bigLosers: all.filter((p) => p.gain_loss_percent < -0.10).length,
      todayUp: all.filter((p) => p.day_gain_loss_percent > 0).length,
      todayDown: all.filter((p) => p.day_gain_loss_percent < 0).length,
    };
  }, [portfolio.positions]);

  const portfolioTickers = useMemo(() => {
    return new Set(portfolio.positions.map((p) => p.ticker.toUpperCase()));
  }, [portfolio.positions]);

  const activeAlertsByTicker = useMemo(() => {
    return alerts.reduce<Record<string, number>>((acc, alert) => {
      if (!alert.active) return acc;
      acc[alert.ticker] = (acc[alert.ticker] ?? 0) + 1;
      return acc;
    }, {});
  }, [alerts]);

  const alertsByTicker = useMemo(() => {
    return alerts.reduce<Record<string, { id: string; price: number; type: "above" | "below" }[]>>((acc, alert) => {
      if (!alert.active) return acc;
      if (!acc[alert.ticker]) acc[alert.ticker] = [];
      acc[alert.ticker].push({ id: alert.id, price: alert.price, type: alert.type });
      return acc;
    }, {});
  }, [alerts]);

  const primaryAlertByTicker = useMemo(() => {
    return alerts.reduce<Record<string, { price: number; type: "above" | "below" }>>((acc, alert) => {
      if (!alert.active) return acc;
      acc[alert.ticker] = { price: alert.price, type: alert.type };
      return acc;
    }, {});
  }, [alerts]);

  const watchlistCandidates = useMemo(() => {
    return watchlistData
      .filter((item) => !portfolioTickers.has(item.ticker.toUpperCase()))
      .map((item) => ({
        ticker: item.ticker,
        profile: item.profile,
        quote: item.quote,
        target_price: item.target_price,
        effective_target_price: item.target_price ?? primaryAlertByTicker[item.ticker]?.price ?? null,
        effective_target_type:
          item.target_price != null
            ? item.quote?.price != null
              ? item.target_price >= item.quote.price
                ? "above"
                : "below"
              : null
            : (primaryAlertByTicker[item.ticker]?.type ?? null),
        tags: item.tags ?? [],
      }))
      .sort((a, b) => (b.quote?.day_change_percent ?? 0) - (a.quote?.day_change_percent ?? 0));
  }, [watchlistData, portfolioTickers, primaryAlertByTicker]);

  const watchlistTickers = useMemo(
    () => watchlistCandidates.map((entry) => entry.ticker),
    [watchlistCandidates]
  );

  const { data: scoutPerf1D = {} } = useBatchPeriodPerformance(
    watchlistTickers,
    "1D",
    contentView === "watchlist" && watchlistTickers.length > 0
  );
  const { data: scoutPerf1W = {} } = useBatchPeriodPerformance(
    watchlistTickers,
    "1W",
    contentView === "watchlist" && watchlistTickers.length > 0
  );
  const { data: scoutPerf1M = {} } = useBatchPeriodPerformance(
    watchlistTickers,
    "1M",
    contentView === "watchlist" && watchlistTickers.length > 0
  );
  const { data: scoutPerfYTD = {} } = useBatchPeriodPerformance(
    watchlistTickers,
    "YTD",
    contentView === "watchlist" && watchlistTickers.length > 0
  );

  const scoutInbox = useMemo(() => {
    const byTicker = new Map(watchlistCandidates.map((entry) => [entry.ticker, entry]));

    const alertNotifications = alerts
      .filter((alert) => alert.active)
      .map((alert) => {
        const entry = byTicker.get(alert.ticker);
        const price = entry?.quote?.price;
        if (price == null) return null;

        const triggered = alert.type === "below" ? price <= alert.price : price >= alert.price;
        if (!triggered) return null;

        return {
          id: `alert-${alert.id}`,
          ticker: alert.ticker,
          text:
            alert.type === "below"
              ? `${alert.ticker} reached alert below ${alert.price.toFixed(2)}`
              : `${alert.ticker} reached alert above ${alert.price.toFixed(2)}`,
        };
      })
      .filter((item): item is { id: string; ticker: string; text: string } => item !== null);

    const targetNotifications = watchlistCandidates
      .map((entry) => {
        if (entry.target_price == null || entry.quote?.price == null) return null;
        if (entry.quote.price > entry.target_price) return null;
        return {
          id: `target-${entry.ticker}`,
          ticker: entry.ticker,
          text: `${entry.ticker} reached target ${entry.target_price.toFixed(2)}`,
        };
      })
      .filter((item): item is { id: string; ticker: string; text: string } => item !== null);

    return [...alertNotifications, ...targetNotifications];
  }, [alerts, watchlistCandidates]);

  useEffect(() => {
    if (watchlistLoading) return;
    setDismissedScoutInboxIds((prev) => {
      const next = prev.filter((id) => scoutInbox.some((item) => item.id === id));
      // Return the exact same reference when nothing changed — prevents re-render loop
      // caused by scoutInbox getting a new array reference on each render cycle.
      return next.length === prev.length ? prev : next;
    });
  }, [watchlistLoading, scoutInbox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCOUT_INBOX_READ_KEY, JSON.stringify(dismissedScoutInboxIds));
  }, [dismissedScoutInboxIds]);

  const visibleScoutInbox = useMemo(
    () => scoutInbox.filter((item) => !dismissedScoutInboxIds.includes(item.id)),
    [dismissedScoutInboxIds, scoutInbox]
  );

  const openAlertDialog = useCallback(
    (ticker: string, currentPrice: number, targetPrice: number | null) => {
      setAlertTicker(ticker);
      setAlertType("below");
      const base = targetPrice ?? currentPrice * 0.95;
      setAlertPrice(base > 0 ? base.toFixed(2) : "");
      setIsAlertDialogOpen(true);
    },
    []
  );

  const openAlertsDialog = useCallback(
    (ticker: string, currentPrice: number) => {
      setAlertsDialogTicker(ticker);
      setAlertsDialogCurrentPrice(currentPrice);
      const currentAlerts = alertsByTicker[ticker] ?? [];
      const initial = currentAlerts.map((item) => ({
        id: item.id,
        type: item.type,
        price: item.price.toFixed(2),
      }));
      setAlertDrafts(initial);
      setIsAlertsDialogOpen(true);
    },
    [alertsByTicker]
  );

  const parsedAlertPrice = Number(alertPrice);
  const isValidAlertPrice = Number.isFinite(parsedAlertPrice) && parsedAlertPrice > 0;

  const saveTargetFromDialog = useCallback(() => {
    if (!isValidAlertPrice || !alertTicker) return;
    setTargetPrice(alertTicker, parsedAlertPrice);
    setIsAlertDialogOpen(false);
  }, [alertTicker, isValidAlertPrice, parsedAlertPrice, setTargetPrice]);

  const saveAlertFromDialog = useCallback(() => {
    if (!isValidAlertPrice || !alertTicker) return;
    addAlert({
      ticker: alertTicker,
      type: alertType,
      price: parsedAlertPrice,
      active: true,
    });
    setIsAlertDialogOpen(false);
  }, [addAlert, alertTicker, alertType, isValidAlertPrice, parsedAlertPrice]);

  const hasInvalidAlertDraft = useMemo(
    () => alertDrafts.some((draft) => !Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0),
    [alertDrafts]
  );

  const saveAlertsDialog = useCallback(() => {
    if (!alertsDialogTicker || hasInvalidAlertDraft) return;

    const existing = alertsByTicker[alertsDialogTicker] ?? [];
    const draftById = new Map(alertDrafts.filter((draft) => draft.id).map((draft) => [draft.id as string, draft]));

    for (const existingAlert of existing) {
      const draft = draftById.get(existingAlert.id);
      if (!draft) {
        removeAlert(existingAlert.id);
        continue;
      }
      const nextPrice = Number(draft.price);
      if (nextPrice !== existingAlert.price || draft.type !== existingAlert.type) {
        updateAlert(existingAlert.id, {
          price: nextPrice,
          type: draft.type,
        });
      }
    }

    for (const draft of alertDrafts) {
      if (draft.id) continue;
      addAlert({
        ticker: alertsDialogTicker,
        type: draft.type,
        price: Number(draft.price),
        active: true,
      });
    }

    setIsAlertsDialogOpen(false);
  }, [addAlert, alertDrafts, alertsByTicker, alertsDialogTicker, hasInvalidAlertDraft, removeAlert, updateAlert]);

  const dipFinderItems = useMemo(() => {
    return portfolio.positions
      .filter((pos) => (pos.quote?.price ?? 0) > 0)
      .map((pos) => ({
        ticker: pos.ticker,
        name: pos.profile?.name,
        sector: pos.profile?.sector,
        price: pos.quote?.price ?? 0,
      }));
  }, [portfolio.positions]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const handleExport = useCallback(() => {
    const csv = portfolio.exportToCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${portfolio.activePortfolio?.name ?? "portfolio"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [portfolio]);

  const handleImportFile = useCallback(
    async (file: File) => {
      const csv = await file.text();
      return portfolio.importFromCSV(csv);
    },
    [portfolio]
  );

  const pushToast = useCallback(
    (payload: { title: string; message?: string; variant: FeedbackToastVariant }) => {
      setToast(payload);
    },
    []
  );

  if (!isAuthLoading && !user) {
    return <PortfolioLockedState />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
            <BriefcaseBusiness className="w-5 h-5 text-sunset-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-snow-peak">Portfolio Tracker</h1>
            <p className="text-xs text-mist mt-0.5">
              Track positions, P&L, allocation and risk metrics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <PortfolioSelector
            portfolios={portfolio.portfolios}
            activeId={portfolio.activePortfolioId}
            onSelect={portfolio.setActivePortfolio}
            onCreate={portfolio.createPortfolio}
            onRename={portfolio.renamePortfolio}
            onDelete={portfolio.deletePortfolio}
          />
        </div>
      </div>

      {/* ── KPI Summary ── */}
      {/* The page builds top to bottom on arrival. The steps are small and the
          whole cascade is over inside a third of a second - long enough to
          read as an order of importance, short enough that nobody waits on
          it. Each section owns its delay so the sequence survives one of them
          being hidden. */}
      <div className="insight-enter" style={enterDelay(0)}>
        <PortfolioEvolutionChart
          positions={portfolio.positions}
          transactionHistory={portfolio.transactionHistory}
        />
      </div>

      <div className="insight-enter" style={enterDelay(50)}>
        <SummaryKPIs summary={portfolio.summary} isLoading={portfolio.isLoading} />
      </div>

      {/* ── Allocation & Top Holdings ── */}
      <div className="insight-enter" style={enterDelay(100)}>
        <AllocationBreakdown
          positions={portfolio.positions}
          summary={portfolio.summary}
          isLoading={portfolio.isLoading}
        />
      </div>

      {/* ── Portfolio Metrics ── */}
      <div className="insight-enter" style={enterDelay(150)}>
        <PortfolioMetrics
          summary={portfolio.summary}
          positions={portfolio.positions}
          isLoading={portfolio.isLoading}
        />
      </div>

      {/* ── Positions ── */}
      <Card className="insight-enter" style={enterDelay(200)}>
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-wolf-border/30 px-3 sm:px-4 py-3">
            <p className="text-sm font-semibold text-snow-peak">
              {contentView === "transactions"
                ? `Transactions (${portfolio.transactionHistory.length})`
                : contentView === "watchlist"
                  ? `Watchlist Scout (${watchlistCandidates.length})`
                  : contentView === "dipfinder"
                    ? `Dip Finder (${dipFinderItems.length})`
                  : `Positions (${portfolio.positions.length})`}
            </p>
            <div className="scroll-quiet flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
              {contentView === "transactions" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setContentView("positions")}
                  className="text-xs gap-1.5 text-sunset-orange"
                >
                  <History className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Transactions</span>
                </Button>
              ) : contentView === "watchlist" ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setContentView("positions")}
                    className="text-xs gap-1.5 text-sunset-orange"
                  >
                    <Star className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Watchlist View</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsScoutInboxOpen((prev) => !prev)}
                    className={cn("text-xs gap-1.5", isScoutInboxOpen && "text-sunset-orange")}
                  >
                    <BellRing className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Inbox</span>
                    {visibleScoutInbox.length > 0 ? (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] font-mono">
                        {visibleScoutInbox.length}
                      </Badge>
                    ) : null}
                  </Button>

                  {lists.length > 1 ? (
                    <div className="relative">
                      <select
                        value={activeListId}
                        onChange={(e) => setActiveList(e.target.value)}
                        className="appearance-none h-8 min-w-[150px] rounded-md ring-1 ring-inset ring-wolf-border/45 bg-snow-peak/[0.045] pl-2 pr-7 text-xs text-snow-peak"
                        aria-label="Select watchlist"
                      >
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" />
                    </div>
                  ) : null}
                </>
              ) : contentView === "dipfinder" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setContentView("positions")}
                  className="text-xs gap-1.5 text-sunset-orange"
                >
                  <SearchAlert className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dip Finder</span>
                </Button>
              ) : (
                <>
                  {/* 1. Table/Cards */}
                  <div className="flex bg-snow-peak/[0.04] rounded-md ring-1 ring-inset ring-wolf-border/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setContentView("positions");
                        setViewMode("table");
                      }}
                      disabled={isMobileViewport}
                      className={cn(
                        "px-2 py-1 text-[11px] rounded-sm transition-colors",
                        effectiveViewMode === "table"
                          ? "bg-sunset-orange/20 text-sunset-orange"
                          : "text-mist hover:text-snow-peak",
                        isMobileViewport && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContentView("positions");
                        setViewMode("cards");
                      }}
                      className={cn(
                        "px-2 py-1 text-[11px] rounded-sm transition-colors",
                        effectiveViewMode === "cards"
                          ? "bg-sunset-orange/20 text-sunset-orange"
                          : "text-mist hover:text-snow-peak"
                      )}
                    >
                      Cards
                    </button>
                  </div>

                  {/* 2. Group by Sector */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGroupBySector((v) => !v)}
                    className={cn("text-xs gap-1.5", groupBySector && "text-sunset-orange")}
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Group by Sector</span>
                  </Button>

                  {/* 3. Transactions */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setContentView("transactions")}
                    className="text-xs gap-1.5"
                  >
                    <History className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Transactions</span>
                  </Button>

                  {/* 4. Watchlist View */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setContentView("watchlist")}
                    className="text-xs gap-1.5"
                  >
                    <Star className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Watchlist View</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setContentView("dipfinder")}
                    className="text-xs gap-1.5 border-sunset-orange/40 bg-sunset-orange/10 text-sunset-orange hover:text-sunset-orange"
                  >
                    <SearchAlert className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dip Finder</span>
                  </Button>

                  {/* 5. Import */}
                  <Button variant="ghost" size="sm" onClick={() => setIsImportDialogOpen(true)} className="text-xs gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Import</span>
                  </Button>

                  {/* 6. Export */}
                  <Button variant="ghost" size="sm" onClick={handleExport} className="text-xs gap-1.5">
                    <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export</span>
                  </Button>

                  <Button size="sm" onClick={() => setShowAddPanel(!showAddPanel)} className="text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Position</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {contentView === "positions" && showAddPanel && (
            <div className="px-4 py-3 border-b border-wolf-border/30">
              <AddPositionPanel
                onAdd={(ticker, shares, avgCost, purchaseDate) => {
                  portfolio.addPosition(ticker, shares, avgCost, purchaseDate);
                  setShowAddPanel(false);
                }}
                onClose={() => setShowAddPanel(false)}
              />
            </div>
          )}

          {/* ── Quick filter chips (positions view only) ── */}
          {contentView === "positions" && portfolio.positions.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap border-b border-wolf-border/30 px-3 sm:px-4 py-2">
              <span className="text-[10px] uppercase tracking-wide text-mist mr-1">
                Filter:
              </span>
              <QuickFilterChip
                active={quickFilter === "all"}
                onClick={() => setQuickFilter("all")}
                label="All"
                count={filterCounts.all}
              />
              <QuickFilterChip
                active={quickFilter === "winners"}
                onClick={() => setQuickFilter("winners")}
                label="Winners"
                count={filterCounts.winners}
                tone="bullish"
              />
              <QuickFilterChip
                active={quickFilter === "losers"}
                onClick={() => setQuickFilter("losers")}
                label="Losers"
                count={filterCounts.losers}
                tone="bearish"
              />
              <QuickFilterChip
                active={quickFilter === "big-winners"}
                onClick={() => setQuickFilter("big-winners")}
                label="Up >25%"
                count={filterCounts.bigWinners}
                tone="bullish"
              />
              <QuickFilterChip
                active={quickFilter === "big-losers"}
                onClick={() => setQuickFilter("big-losers")}
                label="Down >10%"
                count={filterCounts.bigLosers}
                tone="bearish"
              />
              <span className="text-mist/40 mx-1">|</span>
              <QuickFilterChip
                active={quickFilter === "today-up"}
                onClick={() => setQuickFilter("today-up")}
                label="Today ↑"
                count={filterCounts.todayUp}
                tone="bullish"
              />
              <QuickFilterChip
                active={quickFilter === "today-down"}
                onClick={() => setQuickFilter("today-down")}
                label="Today ↓"
                count={filterCounts.todayDown}
                tone="bearish"
              />
              {quickFilter !== "all" ? (
                <span className="ml-auto text-[10px] text-mist font-mono">
                  Showing {filteredPositions.length} of {portfolio.positions.length}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="p-4">
            {contentView === "transactions" ? (
              <TransactionActivityFeed
                transactions={portfolio.transactionHistory}
                positions={portfolio.positions}
                isLoading={portfolio.isLoading}
              />
            ) : contentView === "watchlist" ? (
              <div className="space-y-4">
                {isScoutInboxOpen ? (
                  <div className="rounded-xl border border-sunset-orange/35 bg-gradient-to-br from-sunset-orange/18 via-sunset-orange/8 to-wolf-black/15 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-sunset-orange">
                        <BellRing className="h-3.5 w-3.5" />
                        Price Inbox ({visibleScoutInbox.length})
                      </div>
                      {visibleScoutInbox.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px] border-sunset-orange/40 bg-snow-peak/[0.03] text-sunset-orange hover:text-sunset-orange"
                          onClick={() =>
                            setDismissedScoutInboxIds((prev) => [
                              ...new Set([...prev, ...visibleScoutInbox.map((item) => item.id)]),
                            ])
                          }
                        >
                          Mark all as read
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      {visibleScoutInbox.length > 0 ? (
                        visibleScoutInbox.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded-md border border-sunset-orange/25 bg-snow-peak/[0.03] px-2.5 py-2">
                            <div className="flex items-center gap-2.5">
                              <TickerLogo
                                ticker={item.ticker}
                                className="w-5 h-5"
                                imageClassName="rounded-md"
                                fallbackClassName="rounded-md text-[8px]"
                              />
                              <p className="text-[11px] text-snow-peak leading-relaxed">{item.text}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-mist/80">No triggered alerts yet. Configure a bell alert or target to start receiving notifications.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                <WatchlistScoutView
                  entries={watchlistCandidates}
                  isLoading={watchlistLoading}
                  perf1D={scoutPerf1D}
                  perf1W={scoutPerf1W}
                  perf1M={scoutPerf1M}
                  perfYTD={scoutPerfYTD}
                  onOpenTargetDialog={openAlertDialog}
                  onOpenAlertsDialog={openAlertsDialog}
                  activeAlertsByTicker={activeAlertsByTicker}
                />
              </div>
            ) : contentView === "dipfinder" ? (
              <DipFinderPanel
                title="Dip Finder"
                subtitle="Find buy opportunities from sharp pullbacks across your portfolio"
                items={dipFinderItems}
              />
            ) : (
              <>
                {effectiveViewMode === "table" ? (
                  <PositionTable
                    positions={sortedPositions}
                    isLoading={portfolio.isLoading}
                    onAddTransaction={setTransactionPosition}
                    onRemove={portfolio.removePosition}
                    groupBySector={groupBySector}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                ) : (
                  <PositionCards
                    positions={sortedPositions}
                    isLoading={portfolio.isLoading}
                    onEdit={setEditingPosition}
                    onRemove={portfolio.removePosition}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Advanced Analytics ── */}
      {portfolio.positions.length > 0 ? (
        <div className="insight-enter" style={enterDelay(250)}>
          <AdvancedAnalyticsSection
            positions={portfolio.positions}
            summary={portfolio.summary}
            transactionHistory={portfolio.transactionHistory}
            isLoading={portfolio.isLoading}
          />
        </div>
      ) : null}

      <EditPositionDialog
        open={!!editingPosition}
        position={editingPosition}
        onOpenChange={(open) => {
          if (!open) setEditingPosition(null);
        }}
        onSave={(ticker, shares, avgCost, notes, purchaseDate) => {
          portfolio.updatePosition(ticker, {
            shares,
            avg_cost: avgCost,
            notes,
            added_at: purchaseDate,
          });
        }}
        onRemove={portfolio.removePosition}
      />

      <ImportCsvDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportFile={handleImportFile}
        onNotify={pushToast}
      />

      <AddTransactionDialog
        open={!!transactionPosition}
        position={transactionPosition}
        onOpenChange={(open) => {
          if (!open) setTransactionPosition(null);
        }}
        onSubmit={(ticker, side, shares, price, transactionDate) => {
          portfolio.applyTransaction(ticker, side, shares, price, transactionDate);
          pushToast({
            title: "Transaction added",
            message: `${side.toUpperCase()} ${shares} ${ticker} @ ${formatCurrency(price)} registered successfully.`,
            variant: "success",
          });
        }}
      />

      <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
        <DialogContent className="max-w-md p-4">
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">Price Alert / Target</h3>
              <p className="text-xs text-mist mt-0.5">{alertTicker} notification and target settings</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-mist">Direction</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={alertType === "below" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAlertType("below")}
                >
                  Below
                </Button>
                <Button
                  type="button"
                  variant={alertType === "above" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAlertType("above")}
                >
                  Above
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-mist">Price</label>
              <Input
                value={alertPrice}
                onChange={(event) => setAlertPrice(event.target.value)}
                placeholder="e.g. 800"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  alerts
                    .filter((a) => a.ticker === alertTicker && a.active)
                    .forEach((a) => removeAlert(a.id));
                  setTargetPrice(alertTicker, null);
                  setIsAlertDialogOpen(false);
                }}
              >
                Clear
              </Button>
              <Button type="button" variant="outline" onClick={saveTargetFromDialog} disabled={!isValidAlertPrice}>
                Save Target
              </Button>
              <Button type="button" onClick={saveAlertFromDialog} disabled={!isValidAlertPrice}>
                Add Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAlertsDialogOpen} onOpenChange={setIsAlertsDialogOpen}>
        <DialogContent className="max-w-lg p-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">Alerts ({alertsDialogTicker})</h3>
              <p className="text-xs text-mist mt-0.5">Edit or remove each alert individually</p>
            </div>

            <div className="scroll-quiet max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {alertDrafts.length > 0 ? (
                alertDrafts.map((draft, idx) => (
                  <div key={draft.id ?? `new-${idx}`} className="rounded-lg ring-1 ring-inset ring-wolf-border/40 bg-snow-peak/[0.035] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={draft.type === "below" ? "default" : "ghost"}
                          className="h-7 px-2 text-[10px]"
                          onClick={() =>
                            setAlertDrafts((prev) =>
                              prev.map((item, itemIdx) =>
                                itemIdx === idx ? { ...item, type: "below" } : item
                              )
                            )
                          }
                        >
                          Below
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={draft.type === "above" ? "default" : "ghost"}
                          className="h-7 px-2 text-[10px]"
                          onClick={() =>
                            setAlertDrafts((prev) =>
                              prev.map((item, itemIdx) =>
                                itemIdx === idx ? { ...item, type: "above" } : item
                              )
                            )
                          }
                        >
                          Above
                        </Button>
                      </div>

                      <Input
                        value={draft.price}
                        onChange={(event) =>
                          setAlertDrafts((prev) =>
                            prev.map((item, itemIdx) =>
                              itemIdx === idx ? { ...item, price: event.target.value } : item
                            )
                          )
                        }
                        className="h-8 text-xs font-mono"
                        placeholder="Price"
                        inputMode="decimal"
                      />

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-[10px] text-bearish hover:text-bearish"
                        onClick={() => setAlertDrafts((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-mist/80">No active alerts for this ticker.</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setAlertDrafts((prev) => [
                    ...prev,
                    {
                      id: null,
                      type: "below",
                      price: (alertsDialogCurrentPrice > 0 ? alertsDialogCurrentPrice * 0.95 : 0).toFixed(2),
                    },
                  ])
                }
              >
                Add alert
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsAlertsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveAlertsDialog} disabled={hasInvalidAlertDraft}>
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FeedbackToast
        open={!!toast}
        title={toast?.title ?? ""}
        message={toast?.message}
        variant={toast?.variant ?? "success"}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
