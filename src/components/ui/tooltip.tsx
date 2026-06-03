"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/* ─── Provider ──────────────────────────────────────────────────────────── */

/**
 * Wrap your app (or layout) with this once to enable all tooltips.
 * Already added to src/providers — no need to add it per-component.
 */
const TooltipProvider = TooltipPrimitive.Provider;

/* ─── Primitives (re-exported for advanced usage) ───────────────────────── */

const TooltipRoot    = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/* ─── Styled content ────────────────────────────────────────────────────── */

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Base
        "z-50 max-w-[220px] rounded-lg px-3 py-1.5",
        // Typography
        "text-xs font-medium leading-snug text-snow-peak",
        // Background & border
        "bg-wolf-surface border border-wolf-border/60 shadow-lg shadow-black/30",
        // Enter animation
        "animate-in fade-in-0 zoom-in-95",
        // Exit animation
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        // Side slide animations
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=top]:slide-in-from-bottom-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/* ─── Convenience wrapper ────────────────────────────────────────────────── */

interface TooltipProps {
  /** The trigger element */
  children: React.ReactNode;
  /** Tooltip text or JSX content */
  content: React.ReactNode;
  /** Preferred side (default: top) */
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  /** Delay before showing in ms (default: 300) */
  delayDuration?: number;
  /** Extra className on the content bubble */
  contentClassName?: string;
}

/**
 * Drop-in tooltip for any element. Accessible: works with keyboard focus.
 *
 * @example
 * <Tooltip content="View full history">
 *   <Button variant="ghost" size="icon-sm"><History /></Button>
 * </Tooltip>
 *
 * @example — multi-line
 * <Tooltip content={<><strong>Alpha Vantage</strong><br/>Last updated 2h ago</>} side="bottom">
 *   <InfoIcon />
 * </Tooltip>
 */
export function Tooltip({
  children,
  content,
  side = "top",
  delayDuration = 300,
  contentClassName,
}: TooltipProps) {
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}

export {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
};
