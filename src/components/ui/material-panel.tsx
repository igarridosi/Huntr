import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The product's surface: a translucent material over the page rather than
 * a flat card. Large surfaces read as thicker than the rows inside them, so
 * the blur and shadow live here and the rows stay flat. Under
 * `prefers-reduced-transparency` the blur drops and the fill goes solid.
 *
 * Radius scale, used everywhere this panel is: panel 2xl, rows and tiles
 * xl, chips md.
 */
export const MaterialPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { tone?: "default" | "danger" }>(
  function MaterialPanel({ className, tone = "default", ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl p-5 shadow-xl backdrop-blur-xl",
          "bg-wolf-surface supports-[backdrop-filter]:bg-wolf-surface/60",
          "[@media(prefers-reduced-transparency:reduce)]:bg-wolf-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
          tone === "danger"
            ? "shadow-bearish/[0.06] ring-1 ring-inset ring-bearish/30"
            : "shadow-wolf-black/40 ring-1 ring-inset ring-wolf-border/60",
          className
        )}
        {...props}
      />
    );
  }
);
