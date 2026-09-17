"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackToastVariant = "success" | "warning" | "error";

interface FeedbackToastProps {
  open: boolean;
  title: string;
  message?: string;
  variant?: FeedbackToastVariant;
  onClose: () => void;
  durationMs?: number;
}

const variantStyles: Record<FeedbackToastVariant, { icon: typeof CheckCircle2; iconClass: string }> = {
  success: { icon: CheckCircle2, iconClass: "text-bullish" },
  warning: { icon: AlertCircle, iconClass: "text-golden-hour" },
  error: { icon: XCircle, iconClass: "text-bearish" },
};

/** How long the leave animation runs before the node is dropped. */
const LEAVE_MS = 220;

/**
 * A notice that arrives at the top centre as a piece of material — it
 * blurs and scales into place from just above the edge, and leaves the
 * way it came. Translucent over whatever is behind it, so it reads as a
 * layer over the page rather than a box on it. Closes itself after a
 * moment, or on the ×.
 */
export function FeedbackToast({ open, title, message, variant = "success", onClose, durationMs = 4500 }: FeedbackToastProps) {
  // Stays mounted through its exit so the leave animation can play: the
  // phase follows `open` during render, and "leave" becomes "gone" once
  // the animation has had its time.
  const [phase, setPhase] = useState<"enter" | "leave" | "gone">(open ? "enter" : "gone");
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(open ? "enter" : "leave");
  }

  useEffect(() => {
    if (phase !== "leave") return;
    const t = window.setTimeout(() => setPhase("gone"), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, onClose, durationMs]);

  if (phase === "gone") return null;

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4 sm:top-5" role="status" aria-live="polite">
      <div
        className={cn(
          "huntr-toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3",
          phase === "leave" && "huntr-toast-leave"
        )}
      >
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug tracking-[-0.005em] text-snow-peak">{title}</p>
          {message && <p className="mt-0.5 text-xs leading-snug text-mist">{message}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 rounded-md p-1 text-mist transition-colors duration-150 hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
          aria-label="Close notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
