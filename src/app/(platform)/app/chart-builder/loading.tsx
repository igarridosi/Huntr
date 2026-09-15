import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the header and the two-column workspace so the page does not shift when it lands. */
export default function ChartBuilderLoading() {
  return (
    <div className="w-full space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="order-2 h-64 w-full rounded-2xl lg:order-1" />
        <Skeleton className="order-1 aspect-[16/9] w-full rounded-2xl lg:order-2" />
      </div>
    </div>
  );
}
