import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for /symbol/[ticker] pages.
 * Shows skeleton for stock header + tabs + content area.
 */
export default function TickerLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Stock header skeleton */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
        {/* Quick stats */}
        <div className="flex items-center gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
          <div className="ml-auto">
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex items-center gap-4 border-b border-wolf-border/40 pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>

      {/* Content area skeleton (metrics bar + chart grid) */}
      <Skeleton className="h-36 rounded-xl" />
      <div className="flex justify-end">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
