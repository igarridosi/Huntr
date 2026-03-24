import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumVeilProps {
  children: ReactNode;
  className?: string;
  badgeLabel?: string;
}

/**
 * Premium veil wrapper.
 * It intentionally blocks selection/copy interactions and overlays blurred lock state.
 */
export function PremiumVeil({
  children,
  className,
  badgeLabel = "Premium Preview",
}: PremiumVeilProps) {
  return (
    <div
      className={cn("premium-veiled relative overflow-hidden rounded-xl", className)}
      data-premium-locked="true"
    >
      <div aria-hidden className="premium-veiled-content select-none">
        {children}
      </div>

      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-wolf-black/45 via-transparent to-wolf-black/55 backdrop-blur-[5px]"
      />

      <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-sunset-orange/35 bg-sunset-orange/15 px-2 py-1 text-[10px] font-semibold text-sunset-orange">
        <Lock className="h-3 w-3" />
        {badgeLabel}
      </div>
    </div>
  );
}
