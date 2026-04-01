"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQueryClient } from "@tanstack/react-query";
import { Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import { useSearch } from "@/hooks/use-stock-data";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { fetchStockProfile, fetchStockQuote } from "@/app/actions/stock";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  redirectTo,
}: CommandPaletteProps) {
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
  const { data: results = [], isFetching } = useSearch(query, 20);

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
        queryFn: () => fetchStockProfile(ticker),
        staleTime: STALE_TIMES.STATIC,
      });
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
        queryFn: () => fetchStockQuote(ticker),
        staleTime: STALE_TIMES.QUOTE,
      });
    },
    [queryClient]
  );

  // Navigate to stock detail
  const handleSelect = useCallback(
    (ticker: string) => {
      onOpenChange(false);
      router.push(redirectTo ?? ROUTES.SYMBOL(ticker));
    },
    [onOpenChange, redirectTo, router]
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
            <Command.Empty className="py-6">
              <SearchEmptySkeleton isFetching={isFetching} query={query} />
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
                    {/* Ticker logo */}
                    <TickerLogo
                      ticker={entry.ticker}
                      src={entry.logo_url}
                      className="w-12 h-12"
                      imageClassName="rounded-[8px]"
                      fallbackClassName="rounded-[8px] text-sm"
                    />

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

function SearchEmptySkeleton({
  isFetching,
  query,
}: {
  isFetching: boolean;
  query: string;
}) {
  const hasQuery = query.trim().length > 0;

  if (!isFetching) {
    return (
      <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/20 px-4 py-5 text-center">
        <p className="text-sm text-mist/80">
          {hasQuery
            ? "We couldn't find that stock. Try another ticker symbol or name."
            : "Start typing to search for stocks."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/20 px-4 py-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-wolf-border/30 bg-wolf-black/25 px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1">
            <Skeleton className="h-3 w-28" />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-wolf-border/30 bg-wolf-black/25 px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-mist/70">
        Searching symbols...
      </p>

      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-sunset-orange/70 animate-pulse"
            style={{ animationDelay: `${index * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
