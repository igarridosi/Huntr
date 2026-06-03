import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder that mimics content shape while loading.
 *
 * @param shape
 *   - `rect`    — default rounded rectangle (cards, blocks)
 *   - `line`    — thin text line (varied widths via className)
 *   - `circle`  — logo / avatar
 *   - `badge`   — small pill (tags, labels)
 *
 * @example
 * <Skeleton shape="circle" className="h-10 w-10" />
 * <Skeleton shape="line"   className="h-3 w-32" />
 * <Skeleton shape="line"   className="h-3 w-20" />
 * <Skeleton shape="badge"  className="h-5 w-14" />
 * <Skeleton              className="h-32 w-full" />
 */
function Skeleton({
  className,
  shape = "rect",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  shape?: "rect" | "line" | "circle" | "badge";
}) {
  return (
    <div
      className={cn(
        "animate-pulse bg-wolf-border/50",
        shape === "rect"   && "rounded-lg",
        shape === "line"   && "rounded",
        shape === "circle" && "rounded-full",
        shape === "badge"  && "rounded-full",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
