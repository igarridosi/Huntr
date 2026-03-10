"use client";

import { useEffect } from "react";
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

const variantStyles: Record<
  FeedbackToastVariant,
  { icon: typeof CheckCircle2; iconClass: string; ringClass: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-bullish",
    ringClass: "border-bullish/30",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-golden-hour",
    ringClass: "border-golden-hour/30",
  },
  error: {
    icon: XCircle,
    iconClass: "text-bearish",
    ringClass: "border-bearish/30",
  },
};

export function FeedbackToast({
  open,
  title,
  message,
  variant = "success",
  onClose,
  durationMs = 4500,
}: FeedbackToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, onClose, durationMs]);

  if (!open) return null;

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div className="fixed top-4 right-4 z-[80] max-w-sm w-[calc(100vw-2rem)] animate-in fade-in-0 slide-in-from-top-2">
      <div
        className={cn(
          "rounded-xl border bg-wolf-surface/95 backdrop-blur px-4 py-3 shadow-2xl",
          style.ringClass
        )}
      >
        <div className="flex items-start gap-3">
          <Icon className={cn("w-4 h-4 mt-0.5", style.iconClass)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-snow-peak">{title}</p>
            {message && <p className="text-xs text-mist mt-0.5">{message}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-mist hover:text-snow-peak transition-colors"
            aria-label="Close notification"
            title="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
