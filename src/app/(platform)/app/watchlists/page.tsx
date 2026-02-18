"use client";

import { useCallback } from "react";
import { Star, Plus } from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import {
  WatchlistTable,
  WatchlistTableSkeleton,
} from "@/components/watchlist/watchlist-table";
import { EmptyState } from "@/components/watchlist/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function WatchlistsPage() {
  const {
    data: entries,
    isLoading,
    removeTicker,
    isRemoving,
  } = useWatchlist();

  const handleSearchClick = useCallback(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      })
    );
  }, []);

  const isEmpty = !isLoading && (!entries || entries.length === 0);

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
            <Star className="w-5 h-5 text-sunset-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-snow-peak">
              Watchlists
            </h1>
            <p className="text-xs text-mist mt-0.5">
              Your tracked stocks in one place
            </p>
          </div>
        </div>

        {!isEmpty && (
          <Badge variant="secondary" className="font-mono">
            {entries?.length ?? 0} stocks
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            My Watchlist
          </CardTitle>
          {!isEmpty && (
            <button
              type="button"
              onClick={handleSearchClick}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-sunset-orange bg-sunset-orange/10 hover:bg-sunset-orange/15 border border-sunset-orange/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {isLoading ? (
            <WatchlistTableSkeleton />
          ) : isEmpty ? (
            <EmptyState onSearchClick={handleSearchClick} />
          ) : (
            <WatchlistTable
              entries={entries!}
              onRemove={removeTicker}
              isRemoving={isRemoving}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
