"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWatchlist } from "@/hooks/use-watchlist";

interface AddToWatchlistProps {
  ticker: string;
  variant?: "default" | "compact";
}

export function AddToWatchlist({
  ticker,
  variant = "default",
}: AddToWatchlistProps) {
  const { toggleTicker, isInWatchlist, isAdding, isRemoving } = useWatchlist();
  const inList = isInWatchlist(ticker);

  if (variant === "compact") {
    return (
      <Button
        variant={inList ? "secondary" : "default"}
        size="icon-sm"
        onClick={() => toggleTicker(ticker)}
        disabled={isAdding || isRemoving}
        aria-label={
          inList
            ? `Remove ${ticker} from watchlist`
            : `Add ${ticker} to watchlist`
        }
      >
        <Plus
          className={`w-4 h-4 transition-transform ${inList ? "rotate-45" : ""}`}
        />
      </Button>
    );
  }

  return (
    <Button
      variant={inList ? "secondary" : "default"}
      size="sm"
      onClick={() => toggleTicker(ticker)}
      disabled={isAdding || isRemoving}
      className="gap-1.5"
    >
      <Plus
        className={`w-3.5 h-3.5 transition-transform ${inList ? "rotate-45" : ""}`}
      />
      {inList ? "Remove" : "Watch"}
    </Button>
  );
}
