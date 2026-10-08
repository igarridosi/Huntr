import { Skeleton } from "@/components/ui/skeleton";
import { StockHeaderSkeleton } from "@/components/stock/stock-header";
import { QualityScorecardSkeleton } from "@/components/stock/quality-scorecard";
import { PriceGhost } from "@/components/stock/price-ghost";

/**
 * Loading state for /symbol/[ticker] while the server fetches the company.
 *
 * It mirrors the page as it now is (the same header, tab bar and first row,
 * at the same sizes), so moving to another stock goes from this to the real
 * page without anything jumping. The previous version kept the old layout
 * (other padding, other blocks), and the page visibly rebuilt itself on
 * every new ticker.
 */
export default function TickerLoading() {
  return (
    <div className="w-full space-y-5" aria-busy="true">
      <StockHeaderSkeleton marketIndices={undefined} marketIndicesLoading />

      <div className="flex items-center gap-1 border-b border-wolf-border/30 pb-3 pt-1">
        {[72, 76, 70, 72, 70].map((w, i) => (
          <Skeleton key={i} shape="line" className="mx-3 h-3.5" style={{ width: w }} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="rounded-xl border border-wolf-border/50 bg-wolf-surface p-3 sm:p-4 xl:col-span-8">
          <Skeleton shape="line" className="h-3.5 w-16" />
          <Skeleton shape="line" className="mt-2 h-[30px] w-32" />
          <Skeleton shape="line" className="mt-2 h-3 w-48" />
          <Skeleton className="mt-3 h-8 w-64 rounded-xl" />
          <div className="mt-4 h-56 sm:h-64 xl:h-[22rem]">
            <PriceGhost />
          </div>
        </div>
        <div className="xl:col-span-4">
          <QualityScorecardSkeleton />
        </div>
      </div>
    </div>
  );
}
