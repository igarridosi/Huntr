"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQueryClient } from "@tanstack/react-query";
import { Search, ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import { useSearch } from "@/hooks/use-stock-data";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { getStockProfile, getStockQuote } from "@/lib/mock-data";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K shortcut to toggle
  useKeyboardShortcut(
    { key: "k", metaKey: true },
    () => onOpenChange(!open),
    true
  );

  // Search results from hook
  const { data: results = [] } = useSearch(query, 8);

  // Reset query on close
  useEffect(() => {
    if (!open) {
      setQuery("");
    } else {
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Prefetch stock data on hover/keyboard navigation
  const prefetchTicker = useCallback(
    (ticker: string) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.STOCK_PROFILE(ticker),
        queryFn: () => getStockProfile(ticker),
        staleTime: STALE_TIMES.STATIC,
      });
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
        queryFn: () => getStockQuote(ticker),
        staleTime: STALE_TIMES.QUOTE,
      });
    },
    [queryClient]
  );

  // Navigate to stock detail
  const handleSelect = useCallback(
    (ticker: string) => {
      onOpenChange(false);
      router.push(ROUTES.SYMBOL(ticker));
    },
    [onOpenChange, router]
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-wolf-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette */}
      <div className="relative z-50 w-full max-w-xl mx-4">
        <Command
          className={cn(
            "rounded-xl bg-wolf-surface border border-wolf-border shadow-2xl overflow-hidden",
            "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-mist/60 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
          )}
          shouldFilter={false}
        >
          {/* Search Input */}
          <div className="flex items-center border-b border-wolf-border/50 px-4">
            <Search className="w-4 h-4 shrink-0 text-mist/60" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search tickers, companies..."
              className={cn(
                "flex-1 h-12 bg-transparent text-sm text-snow-peak",
                "placeholder:text-mist/50 outline-none border-none px-3",
                "font-medium"
              )}
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-mist/40 bg-wolf-black/30 rounded border border-wolf-border/30">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-mist/60">
              No stocks found. Try a different ticker.
            </Command.Empty>

            {results.length > 0 && (
              <Command.Group heading="Stocks">
                {results.map((entry) => (
                  <Command.Item
                    key={entry.ticker}
                    value={entry.ticker}
                    onSelect={() => handleSelect(entry.ticker)}
                    onMouseEnter={() => prefetchTicker(entry.ticker)}
                    onFocus={() => prefetchTicker(entry.ticker)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                      "text-snow-peak transition-colors duration-150",
                      "data-[selected=true]:bg-sunset-orange/10 data-[selected=true]:text-sunset-orange",
                      "hover:bg-wolf-black/30 aria-selected:bg-sunset-orange/10"
                    )}
                  >
                    {/* Ticker badge */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-wolf-black/50 border border-wolf-border/50 shrink-0">
                      <TrendingUp className="w-4 h-4 text-sunset-orange/70" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm font-mono">
                          {entry.ticker}
                        </span>
                        <span className="text-xs text-mist/50 px-1.5 py-0.5 bg-wolf-black/30 rounded">
                          {entry.sector}
                        </span>
                      </div>
                      <p className="text-xs text-mist truncate mt-0.5">
                        {entry.name}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-4 h-4 text-mist/30 shrink-0" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-wolf-border/30 text-[10px] text-mist/40 font-mono">
            <span>
              <kbd className="px-1 py-0.5 bg-wolf-black/30 rounded border border-wolf-border/30 mr-1">↑↓</kbd>
              navigate
              <kbd className="px-1 py-0.5 bg-wolf-black/30 rounded border border-wolf-border/30 mx-1">↵</kbd>
              select
            </span>
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
