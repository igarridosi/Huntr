"use client";

import { cn } from "@/lib/utils";

interface DataHuntingLoaderProps {
  ticker?: string;
  className?: string;
  compact?: boolean;
}

export function DataHuntingLoader({
  ticker,
  className,
  compact = false,
}: DataHuntingLoaderProps) {
  const symbol = ticker?.toUpperCase() || "TICKER";

  return (
    <div
      className={cn(
        "rounded-xl border border-wolf-border/50 bg-wolf-surface px-6 py-8",
        className
      )}
    >
      <div className={cn("grid gap-6", compact ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1.2fr_auto]") }>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-snow-peak">
            We are Hunting all the data for {symbol}
          </p>
          <p className="text-sm text-mist">
            Crunching statements, validating signals and preparing your charts...
          </p>
        </div>

        <div className="flex items-end gap-2 justify-start md:justify-end">
          {[18, 34, 26, 48, 32, 56, 42, 62].map((h, i) => (
            <div
              key={`${h}-${i}`}
              className="w-3 rounded-sm bg-sunset-orange/80 animate-pulse"
              style={{
                height: `${h}px`,
                animationDelay: `${i * 120}ms`,
                animationDuration: "1200ms",
              }}
            />
          ))}
        </div>
      </div>

      {!compact && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border border-wolf-border/40 bg-wolf-black/30 animate-pulse"
              style={{ animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
