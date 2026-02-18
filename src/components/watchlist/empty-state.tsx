"use client";

import { Crosshair, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onSearchClick?: () => void;
}

export function EmptyState({ onSearchClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      {/* Icon */}
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-sunset-orange/10 border border-sunset-orange/15 mb-6">
        <Crosshair className="w-8 h-8 text-sunset-orange/70" />
      </div>

      {/* Text */}
      <h2 className="text-xl font-bold text-snow-peak mb-2">
        Start Hunting
      </h2>
      <p className="text-sm text-mist max-w-sm mb-8 leading-relaxed">
        Your watchlist is empty. Search for tickers using{" "}
        <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-sunset-orange bg-sunset-orange/10 rounded border border-sunset-orange/20">
          ⌘K
        </kbd>{" "}
        and start tracking the stocks that matter to you.
      </p>

      {/* CTA */}
      <Button onClick={onSearchClick} className="gap-2">
        <Search className="w-4 h-4" />
        Search Tickers
      </Button>
    </div>
  );
}
