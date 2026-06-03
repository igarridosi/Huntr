import { cn } from "@/lib/utils";

const sizeMap = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[3px]",
  xl: "h-10 w-10 border-[3px]",
};

interface SpinnerProps {
  size?: keyof typeof sizeMap;
  className?: string;
  /** Override the spinner track color (default: current accent orange) */
  color?: "orange" | "mist" | "white";
}

const colorMap = {
  orange: "border-sunset-orange/20 border-t-sunset-orange",
  mist:   "border-wolf-border     border-t-mist",
  white:  "border-snow-peak/20    border-t-snow-peak",
};

/**
 * Unified spinner — replaces every `<Loader2 className="animate-spin" />` usage.
 * Use `size` for scale, `color` for context (loading vs muted vs light).
 *
 * @example
 * <Spinner />                       // md, orange
 * <Spinner size="sm" color="mist" /> // inside inputs / buttons
 * <Spinner size="xl" />              // full-page blocking
 */
export function Spinner({ size = "md", color = "orange", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full",
        sizeMap[size],
        colorMap[color],
        className
      )}
    />
  );
}
