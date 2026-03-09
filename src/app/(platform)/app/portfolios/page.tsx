"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  Shield,
  DollarSign,
  Activity,
  Target,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSearch } from "@/hooks/use-stock-data";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { EnrichedPosition, PortfolioSummary } from "@/types/portfolio";

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
  onAdd: (ticker: string, shares: number, avgCost: number) => void;
  onClose: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
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
    onAdd(ticker, s, c);
    setTicker("");
    setShares("");
    setAvgCost("");
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
                "bg-wolf-black/60 border border-wolf-border/50",
                "text-snow-peak placeholder:text-mist/60",
                "focus:outline-none focus:ring-1 focus:ring-sunset-orange/50 focus:border-sunset-orange/40",
                "transition-all"
              )}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mist animate-spin" />
            )}
            {showSearch && results.length > 0 && !ticker && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-wolf-border/50 bg-wolf-surface shadow-xl overflow-hidden max-h-48 overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-3">
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
  onSave: (ticker: string, shares: number, avgCost: number, notes: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!position) return;
    setShares(position.shares.toString());
    setAvgCost(position.avg_cost.toString());
    setNotes(position.notes ?? "");
  }, [position]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position) return;

    const parsedShares = parseFloat(shares);
    const parsedAvgCost = parseFloat(avgCost);

    if (!Number.isFinite(parsedShares) || !Number.isFinite(parsedAvgCost)) return;

    if (parsedShares <= 0) {
      onRemove(position.ticker);
      onOpenChange(false);
      return;
    }

    if (parsedAvgCost <= 0) return;

    onSave(position.ticker, parsedShares, parsedAvgCost, notes.trim());
    onOpenChange(false);
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

            <div className="grid grid-cols-2 gap-3">
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

            <div className="rounded-md border border-wolf-border/40 bg-wolf-black/40 p-3">
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
                <Button type="submit">Save Changes</Button>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportFile: (file: File) => Promise<void>;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setStatus("Please upload a .csv file.");
        return;
      }
      setIsImporting(true);
      setStatus(null);
      try {
        await onImportFile(file);
        setStatus(`Imported ${file.name} successfully.`);
      } catch {
        setStatus("Could not import this file. Please verify CSV format.");
      } finally {
        setIsImporting(false);
      }
    },
    [onImportFile]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setIsDragActive(false);
          setIsImporting(false);
          setStatus(null);
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
                : "border-wolf-border/60 bg-wolf-black/30"
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

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-snow-peak">Supported CSV structures</p>
            <p className="text-[11px] text-mist">
              1. Huntr export format: <span className="font-mono">Ticker,Shares,Avg Cost,Added At,Notes</span>
            </p>
            <p className="text-[11px] text-mist">
              2. Broker transactions format: <span className="font-mono">Action,Time,ISIN,Ticker,Name,ID,No. of shares,Price / share,...</span>
            </p>
            <p className="text-[11px] text-sunset-orange">
              Trading 212 users: no changes needed, your exported CSV is already compatible.
            </p>
          </div>

          {status && (
            <p className="text-xs text-mist">{status}</p>
          )}

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
// SUMMARY KPI ROW
// ═══════════════════════════════════════════════════════

function SummaryKPIs({ summary, isLoading }: { summary: PortfolioSummary; isLoading: boolean }) {
  const kpis = [
    {
      label: "Market Value",
      value: formatCurrency(summary.total_market_value, { compact: true }),
      icon: DollarSign,
      color: "text-sunset-orange",
    },
    {
      label: "Total Return",
      value: `${summary.total_gain_loss >= 0 ? "+" : ""}${formatCurrency(summary.total_gain_loss, { compact: true })}`,
      sub: formatPercent(summary.total_gain_loss_percent),
      icon: summary.total_gain_loss >= 0 ? TrendingUp : TrendingDown,
      color: summary.total_gain_loss >= 0 ? "text-bullish" : "text-bearish",
    },
    {
      label: "Today",
      value: `${summary.total_day_gain_loss >= 0 ? "+" : ""}${formatCurrency(summary.total_day_gain_loss, { compact: true })}`,
      sub: formatPercent(summary.total_day_gain_loss_percent),
      icon: Activity,
      color: summary.total_day_gain_loss >= 0 ? "text-bullish" : "text-bearish",
    },
    {
      label: "Cost Basis",
      value: formatCurrency(summary.total_cost_basis, { compact: true }),
      icon: Target,
      color: "text-golden-hour",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <kpi.icon className={cn("w-3.5 h-3.5", kpi.color)} />
                  <p className="text-[11px] text-mist">{kpi.label}</p>
                </div>
                <p className={cn("text-lg font-bold font-mono tracking-tight", kpi.color)}>
                  {kpi.value}
                </p>
                {kpi.sub && (
                  <p className={cn("text-xs font-mono mt-0.5", kpi.color)}>{kpi.sub}</p>
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

const SECTOR_COLORS: Record<string, string> = {
  Technology: "bg-blue-500",
  "Communication Services": "bg-violet-500",
  "Consumer Cyclical": "bg-amber-500",
  "Consumer Defensive": "bg-emerald-500",
  Healthcare: "bg-rose-500",
  Industrials: "bg-slate-400",
  "Financial Services": "bg-cyan-500",
  Energy: "bg-orange-500",
  "Basic Materials": "bg-lime-500",
  "Real Estate": "bg-teal-500",
  Utilities: "bg-indigo-400",
  Unknown: "bg-wolf-border",
};

function getSectorColor(sector: string) {
  return SECTOR_COLORS[sector] ?? "bg-wolf-border";
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
  const sectors = useMemo(() => {
    return Object.entries(summary.sector_allocation)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, weight]) => ({ sector, weight }));
  }, [summary.sector_allocation]);

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
        <CardContent className="space-y-2.5">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))
          ) : sectors.length === 0 ? (
            <p className="text-xs text-mist/70">No positions</p>
          ) : (
            <>
              {/* Visual allocation bar */}
              <div className="flex h-3 rounded-full overflow-hidden gap-[1px]">
                {sectors.map(({ sector, weight }) => (
                  <div
                    key={sector}
                    className={cn("h-full rounded-sm transition-all", getSectorColor(sector))}
                    style={{ width: `${Math.max(weight * 100, 1.5)}%` }}
                    title={`${sector}: ${(weight * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              {/* Item list */}
              <div className="space-y-1.5 mt-3">
                {sectors.map(({ sector, weight }) => (
                  <div key={sector} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-sm", getSectorColor(sector))} />
                      <p className="text-xs text-snow-peak">{sector}</p>
                    </div>
                    <p className="text-xs font-mono text-mist">{(weight * 100).toFixed(1)}%</p>
                  </div>
                ))}
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
        <CardContent className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))
          ) : topHoldings.length === 0 ? (
            <p className="text-xs text-mist/70">No positions</p>
          ) : (
            topHoldings.map((pos) => (
              <div key={pos.ticker} className="flex items-center gap-3">
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
                <div className="w-24 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-wolf-border/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sunset-orange transition-all"
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
      return sum + p.market_value * (p.quote.dividend_yield / 100);
    }, 0);
  }, [positions]);

  const metrics = [
    { label: "Weighted P/E", value: summary.weighted_pe > 0 ? summary.weighted_pe.toFixed(1) + "x" : "—", icon: BarChart3 },
    { label: "Weighted Beta", value: summary.weighted_beta > 0 ? summary.weighted_beta.toFixed(2) : "—", icon: Activity },
    { label: "Div Yield (Wgt)", value: summary.weighted_dividend_yield > 0 ? summary.weighted_dividend_yield.toFixed(2) + "%" : "—", icon: DollarSign },
    { label: "Est Annual Income", value: annualDividendIncome > 0 ? formatCurrency(annualDividendIncome, { compact: true }) : "—", icon: TrendingUp },
    { label: "Concentration Risk", value: concentrationRisk, icon: concentrationRisk === "Low" ? Shield : AlertTriangle, color: concentrationColor },
    { label: "Positions", value: summary.position_count.toString(), icon: Target },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="w-4 h-4 text-sunset-orange" /> Portfolio Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          {metrics.map((m) => (
            <div key={m.label}>
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <m.icon className="w-3 h-3 text-mist/70" />
                    <p className="text-[10px] uppercase tracking-wide text-mist">{m.label}</p>
                  </div>
                  <p className={cn("text-sm font-semibold font-mono", m.color ?? "text-snow-peak")}>
                    {m.value}
                  </p>
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
  onEdit,
  onRemove,
  sortKey,
  sortDir,
  onSort,
}: {
  positions: EnrichedPosition[];
  isLoading: boolean;
  onEdit: (position: EnrichedPosition) => void;
  onRemove: (ticker: string) => void;
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
    { key: "day_gain_loss", label: "Day P&L", headerClass: "text-right" },
  ];

  return (
    <div className="overflow-x-auto">
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
              <td colSpan={columns.length + 1} className="py-12 text-center text-mist/70">
                No positions yet. Add your first position above.
              </td>
            </tr>
          ) : (
            positions.map((pos) => (
              <tr
                key={pos.ticker}
                className="border-b border-wolf-border/20 hover:bg-wolf-surface/50 transition-colors group"
              >
                {/* Ticker */}
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
                {/* Shares */}
                <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{pos.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                {/* Avg Cost */}
                <td className="py-2.5 px-2 text-right font-mono text-mist">{formatCurrency(pos.avg_cost)}</td>
                {/* Price */}
                <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{formatCurrency(pos.quote?.price ?? 0)}</td>
                {/* Market Value */}
                <td className="py-2.5 px-2 text-right font-mono text-snow-peak">{formatCurrency(pos.market_value, { compact: pos.market_value >= 1_000_000 })}</td>
                {/* Weight */}
                <td className="py-2.5 px-2 text-right">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {(pos.weight * 100).toFixed(1)}%
                  </Badge>
                </td>
                {/* Gain/Loss */}
                <td className={cn("py-2.5 px-2 text-right font-mono", glColor(pos.gain_loss))}>
                  {pos.gain_loss >= 0 ? "+" : ""}{formatCurrency(pos.gain_loss, { compact: Math.abs(pos.gain_loss) >= 1_000_000 })}
                </td>
                {/* Return % */}
                <td className="py-2.5 px-2 text-right">
                  <span className={cn("text-[11px] font-mono px-1.5 py-0.5 rounded", glBg(pos.gain_loss_percent))}>
                    {pos.gain_loss_percent >= 0 ? "+" : ""}{(pos.gain_loss_percent * 100).toFixed(2)}%
                  </span>
                </td>
                {/* Day P&L */}
                <td className={cn("py-2.5 px-2 text-right font-mono", glColor(pos.day_gain_loss))}>
                  {pos.day_gain_loss >= 0 ? "+" : ""}{formatCurrency(pos.day_gain_loss, { compact: Math.abs(pos.day_gain_loss) >= 100_000 })}
                </td>
                {/* Actions */}
                <td className="py-2.5 px-2 text-center">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onEdit(pos)}
                      className="text-mist hover:text-snow-peak transition-all"
                      title={`Edit ${pos.ticker}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(pos.ticker)}
                      className="text-mist hover:text-bearish transition-all"
                      title={`Remove ${pos.ticker}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
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
      {positions.map((pos) => (
        <Card key={pos.ticker} className="group relative overflow-hidden">
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
                  className="opacity-0 group-hover:opacity-100 text-mist hover:text-snow-peak transition-all"
                  aria-label={`Edit ${pos.ticker}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(pos.ticker)}
                  className="opacity-0 group-hover:opacity-100 text-mist hover:text-bearish transition-all"
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
          "bg-wolf-surface border border-wolf-border/40 text-snow-peak",
          "hover:border-sunset-orange/40 transition-colors"
        )}
      >
        <BriefcaseBusiness className="w-4 h-4 text-sunset-orange" />
        <span className="max-w-[160px] truncate">{active?.name ?? "My Portfolio"}</span>
        <Badge variant="secondary" className="text-[10px] font-mono">{active?.positions.length ?? 0}</Badge>
        <ChevronDown className={cn("w-3.5 h-3.5 text-mist transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-wolf-border/50 bg-wolf-surface shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {portfolios.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                  p.id === activeId ? "bg-sunset-orange/10" : "hover:bg-wolf-black/40"
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
                      className="flex-1 text-xs bg-wolf-black/60 border border-wolf-border/50 rounded px-2 py-1 text-snow-peak focus:outline-none"
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
                className="flex-1 text-xs bg-wolf-black/60 border border-wolf-border/50 rounded-md px-2 py-1.5 text-snow-peak placeholder:text-mist/50 focus:outline-none focus:border-sunset-orange/40"
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function PortfoliosPage() {
  const portfolio = usePortfolio();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<EnrichedPosition | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("market_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sorting logic
  const sortedPositions = useMemo(() => {
    const arr = [...portfolio.positions];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const valA = sortKey === "ticker" ? a.ticker : sortKey === "price" ? (a.quote?.price ?? 0) : (a as unknown as Record<string, number>)[sortKey];
      const valB = sortKey === "ticker" ? b.ticker : sortKey === "price" ? (b.quote?.price ?? 0) : (b as unknown as Record<string, number>)[sortKey];
      if (typeof valA === "string" && typeof valB === "string") return valA.localeCompare(valB) * dir;
      return ((valA as number) - (valB as number)) * dir;
    });
    return arr;
  }, [portfolio.positions, sortKey, sortDir]);

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
      portfolio.importFromCSV(csv);
    },
    [portfolio]
  );

  return (
    <div className="space-y-6 w-full">
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
      <SummaryKPIs summary={portfolio.summary} isLoading={portfolio.isLoading} />

      {/* ── Allocation & Top Holdings ── */}
      <AllocationBreakdown
        positions={portfolio.positions}
        summary={portfolio.summary}
        isLoading={portfolio.isLoading}
      />

      {/* ── Portfolio Metrics ── */}
      <PortfolioMetrics
        summary={portfolio.summary}
        positions={portfolio.positions}
        isLoading={portfolio.isLoading}
      />

      {/* ── Positions ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wolf-border/30 px-4 py-3">
            <p className="text-sm font-semibold text-snow-peak">
              Positions ({portfolio.positions.length})
            </p>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex bg-wolf-black/40 rounded-md border border-wolf-border/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "px-2 py-1 text-[11px] rounded-sm transition-colors",
                    viewMode === "table" ? "bg-sunset-orange/20 text-sunset-orange" : "text-mist hover:text-snow-peak"
                  )}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "px-2 py-1 text-[11px] rounded-sm transition-colors",
                    viewMode === "cards" ? "bg-sunset-orange/20 text-sunset-orange" : "text-mist hover:text-snow-peak"
                  )}
                >
                  Cards
                </button>
              </div>

              {/* Import/Export */}
              <Button variant="ghost" size="sm" onClick={() => setIsImportDialogOpen(true)} className="text-xs gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Import
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExport} className="text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export
              </Button>

              {/* Add button */}
              <Button size="sm" onClick={() => setShowAddPanel(!showAddPanel)} className="text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Position
              </Button>
            </div>
          </div>

          {showAddPanel && (
            <div className="px-4 py-3 border-b border-wolf-border/30">
              <AddPositionPanel
                onAdd={(ticker, shares, avgCost) => {
                  portfolio.addPosition(ticker, shares, avgCost);
                  setShowAddPanel(false);
                }}
                onClose={() => setShowAddPanel(false)}
              />
            </div>
          )}

          <div className="p-4">
            {viewMode === "table" ? (
              <PositionTable
                positions={sortedPositions}
                isLoading={portfolio.isLoading}
                onEdit={setEditingPosition}
                onRemove={portfolio.removePosition}
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
          </div>
        </CardContent>
      </Card>

      <EditPositionDialog
        open={!!editingPosition}
        position={editingPosition}
        onOpenChange={(open) => {
          if (!open) setEditingPosition(null);
        }}
        onSave={(ticker, shares, avgCost, notes) => {
          portfolio.updatePosition(ticker, {
            shares,
            avg_cost: avgCost,
            notes,
          });
        }}
        onRemove={portfolio.removePosition}
      />

      <ImportCsvDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportFile={handleImportFile}
      />
    </div>
  );
}
