"use client";

import Link from "next/link";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { ROUTES } from "@/lib/constants";
import { formatPercent } from "@/lib/utils";
import type { WatchlistEntry } from "@/types/watchlist";

interface HeatmapViewProps {
  entries: WatchlistEntry[];
  performanceData: Record<string, number>;
}

function getHeatBgStyle(change: number): { backgroundColor: string } {
  const abs = Math.abs(change);
  const cap = 0.05;
  const normalized = Math.min(abs / cap, 1);
  const alpha = 0.08 + normalized * 0.32;

  if (change >= 0) {
    return { backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(3)})` };
  }

  return { backgroundColor: `rgba(244, 63, 94, ${alpha.toFixed(3)})` };
}

export function HeatmapView({ entries, performanceData }: HeatmapViewProps) {
  if (entries.length === 0) return null;

  const enriched = entries
    .map((entry) => {
      const dayChange =
        entry.quote?.day_change_percent ??
        performanceData[entry.ticker] ??
        0;
      return {
        entry,
        dayChange,
      };
    });

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-mist">Daily Change (%)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 auto-rows-[84px]">
        {enriched.map(({ entry, dayChange }) => {
          const isPositive = dayChange >= 0;

        return (
          <Link
            key={entry.ticker}
            href={ROUTES.SYMBOL(entry.ticker)}
            className="rounded-lg border border-wolf-border/35 p-3 hover:border-wolf-border/70 transition-colors"
            style={getHeatBgStyle(dayChange)}
          >
            <div className="flex items-center gap-2 mb-2">
              <TickerLogo
                ticker={entry.ticker}
                src={entry.profile?.logo_url}
                className="w-6 h-6"
                imageClassName="rounded-[4px]"
                fallbackClassName="rounded-[4px] text-[8px]"
              />
              <p className="font-bold text-sm text-snow-peak font-mono leading-none">
                {entry.ticker}
              </p>
            </div>
            <p
              className={`text-base font-mono font-semibold ${
                isPositive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isPositive ? "+" : ""}
              {formatPercent(dayChange, 2)}
            </p>
          </Link>
        );
        })}
      </div>
    </div>
  );
}
