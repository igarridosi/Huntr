"use client";

/**
 * AddTickerDialog
 *
 * Self-contained trigger + modal for adding a stock that isn't in Huntr's database.
 *
 * UX flow:
 *   input → (lookup) → preview card → (confirm) → success
 *
 * The user only needs to type the ticker symbol — all metadata (name, sector,
 * exchange, logo, website) is fetched automatically from Yahoo Finance.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
  Globe,
  ArrowLeft,
  BarChart2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { lookupTickerPreview, addTickerToDatabase } from "@/app/actions/add-ticker";
import type { StockProfile } from "@/types/stock";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn } from "@/lib/utils";

type Step = "input" | "preview" | "success";

export function AddTickerDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [symbol, setSymbol] = useState("");
  const [profile, setProfile] = useState<StockProfile | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && step === "input") {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open, step]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    setStep("input");
    setSymbol("");
    setProfile(null);
    setError(null);
    setLookupLoading(false);
    setAddLoading(false);
  }, []);

  const handleOpen = () => { reset(); setOpen(true); };
  const handleClose = () => { setOpen(false); reset(); };

  // ── Step 1: look up ticker ──────────────────────────────────────────────────

  const handleLookup = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || lookupLoading) return;

    setLookupLoading(true);
    setError(null);

    try {
      const result = await lookupTickerPreview(sym);

      if (result.alreadyExists) {
        setError(`${sym} is already in the Huntr database.`);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.profile) {
        setProfile(result.profile);
        setStep("preview");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Step 2: confirm add ────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!profile || addLoading) return;
    setAddLoading(true);
    setError(null);

    try {
      const result = await addTickerToDatabase(profile.ticker);
      if (result.success) {
        // Flush the React Query search cache so the ticker appears immediately
        // in the command palette without waiting for the 15-second stale window.
        await queryClient.invalidateQueries({ queryKey: ["search"] });
        setStep("success");
      } else {
        setError(result.error ?? "Failed to add ticker.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAddLoading(false);
    }
  };

  // ── Trigger button (always rendered) ───────────────────────────────────────

  const triggerButton = (
    <button
      type="button"
      onClick={handleOpen}
      title="Add ticker to Huntr"
      aria-label="Add ticker to Huntr"
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200",
        "border border-wolf-border/50 cursor-pointer",
        open
          ? "bg-sunset-orange/10 border-sunset-orange/40 text-sunset-orange"
          : "bg-wolf-surface/50 text-mist hover:text-snow-peak hover:bg-wolf-surface hover:border-wolf-border"
      )}
    >
      <Plus className="w-4 h-4 shrink-0" />
      <span className="hidden sm:inline">Add ticker</span>
    </button>
  );

  // ── Portal modal — rendered into document.body to escape the topbar's
  // backdrop-filter stacking context (which would otherwise clip fixed children)
  const modal = open ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-wolf-black/70 backdrop-blur-md animate-in fade-in-0 duration-150"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative z-[101] w-full max-w-md rounded-xl bg-wolf-surface border border-wolf-border/70 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-wolf-border/40">
            <div>
              <h2 className="text-base font-semibold text-snow-peak leading-tight">
                Add Ticker to Huntr
              </h2>
              <p className="text-xs text-mist mt-0.5">
                Enter any valid stock symbol — data loads automatically
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="mt-0.5 p-1.5 rounded-md text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6">

            {/* ── Step: input ── */}
            {step === "input" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="ticker-input"
                    className="block text-xs font-medium text-mist uppercase tracking-wider"
                  >
                    Ticker Symbol
                  </label>
                  <input
                    ref={inputRef}
                    id="ticker-input"
                    type="text"
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-^]/g, ""));
                      setError(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
                    placeholder="e.g. NVDA, TSM, ASML, 9984.T…"
                    maxLength={12}
                    spellCheck={false}
                    autoComplete="off"
                    className={cn(
                      "w-full px-4 py-3 rounded-lg text-base font-mono font-semibold",
                      "bg-wolf-black/50 border text-snow-peak placeholder:text-mist/35 placeholder:font-sans placeholder:font-normal placeholder:text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-sunset-orange/50 focus:border-sunset-orange/50",
                      "transition-colors",
                      error ? "border-bearish/60" : "border-wolf-border/60"
                    )}
                  />
                  {error ? (
                    <div className="flex items-center gap-2 text-xs text-bearish">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-mist/60">
                      Works with NYSE, NASDAQ, international exchanges (e.g. 9984.T for SoftBank)
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={!symbol.trim() || lookupLoading}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold",
                    "bg-sunset-orange text-white transition-all duration-200",
                    "hover:bg-sunset-orange/90 active:scale-[0.98]",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  )}
                >
                  {lookupLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Looking up…
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Look up
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ── Step: preview ── */}
            {step === "preview" && profile && (
              <div className="space-y-4">
                {/* Company card */}
                <div className="rounded-lg border border-wolf-border/50 bg-wolf-black/30 p-4 space-y-3">
                  {/* Logo + name row */}
                  <div className="flex items-center gap-3">
                    <TickerLogo
                      ticker={profile.ticker}
                      src={profile.logo_url}
                      className="h-12 w-12 shrink-0"
                      imageClassName="rounded-lg"
                      fallbackClassName="rounded-lg text-sm font-bold"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-snow-peak text-base leading-none">
                          {profile.ticker}
                        </span>
                        {profile.exchange && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-wolf-border/40 text-mist">
                            {profile.exchange}
                          </span>
                        )}
                        {profile.currency && profile.currency !== "USD" && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-wolf-border/30 text-mist/70">
                            {profile.currency}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-snow-peak/80 mt-1 truncate">{profile.name}</p>
                    </div>
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-1 border-t border-wolf-border/30">
                    {profile.sector && (
                      <div className="flex items-center gap-1.5 text-mist min-w-0">
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-sunset-orange/60" />
                        <span className="truncate">{profile.sector}</span>
                      </div>
                    )}
                    {profile.industry && (
                      <div className="flex items-center gap-1.5 text-mist min-w-0">
                        <BarChart2 className="w-3.5 h-3.5 shrink-0 text-sunset-orange/60" />
                        <span className="truncate">{profile.industry}</span>
                      </div>
                    )}
                    {profile.country && (
                      <div className="flex items-center gap-1.5 text-mist min-w-0">
                        <Globe className="w-3.5 h-3.5 shrink-0 text-sunset-orange/60" />
                        <span className="truncate">{profile.country}</span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-mist/60 text-center">
                  All financial data, charts and earnings will load automatically on first visit
                </p>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-bearish">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Action row */}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setStep("input"); setError(null); }}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-mist border border-wolf-border/50 hover:text-snow-peak hover:bg-wolf-black/30 transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={addLoading}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold",
                      "bg-sunset-orange text-white transition-all duration-200",
                      "hover:bg-sunset-orange/90 active:scale-[0.98]",
                      "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    )}
                  >
                    {addLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Adding…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add to Huntr
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step: success ── */}
            {step === "success" && profile && (
              <div className="text-center space-y-4 py-2">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-bullish/10 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-bullish" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-snow-peak">
                    {profile.ticker} added successfully!
                  </p>
                  <p className="text-sm text-mist">
                    {profile.name} is now available in Huntr.
                    <br />
                    All data will load on first visit.
                  </p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => { reset(); }}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-wolf-border/50 text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-all"
                  >
                    Add another
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-sunset-orange/10 text-sunset-orange border border-sunset-orange/30 hover:bg-sunset-orange/20 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
  ) : null;

  return (
    <>
      {triggerButton}
      {typeof window !== "undefined" && modal
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
