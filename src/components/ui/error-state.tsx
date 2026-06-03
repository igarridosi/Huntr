"use client";

import { AlertTriangle, RefreshCw, WifiOff, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorVariant = "default" | "network" | "server" | "empty";

const icons = {
  default: AlertTriangle,
  network: WifiOff,
  server:  ServerCrash,
  empty:   AlertTriangle,
};

interface ErrorStateProps {
  /** Short headline shown in bold */
  title?: string;
  /** Optional longer explanation below the title */
  message?: string;
  /** Callback wired to the retry button — omit to hide the button */
  onRetry?: () => void;
  /** Visual preset (controls icon + color accent) */
  variant?: ErrorVariant;
  /** Whether the retry is currently in progress */
  retrying?: boolean;
  /** Extra wrapper className for sizing / positioning */
  className?: string;
  /** Compact single-line inline variant (e.g. inside a card header) */
  inline?: boolean;
}

/**
 * Unified error state component.
 *
 * @example — full section error
 * <ErrorState
 *   title="Could not load quotes"
 *   message="Check your connection and try again."
 *   onRetry={refetch}
 * />
 *
 * @example — inline inside a card
 * <ErrorState inline title="Failed to refresh" onRetry={refetch} />
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  variant = "default",
  retrying = false,
  className,
  inline = false,
}: ErrorStateProps) {
  const Icon = icons[variant];

  if (inline) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 text-sm text-golden-hour",
          className
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{title}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="ml-1 text-xs text-sunset-orange underline-offset-2 hover:underline disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-wolf-border/50 bg-wolf-surface px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bearish/10 text-bearish">
        <Icon className="h-6 w-6" />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-snow-peak">{title}</p>
        {message && (
          <p className="max-w-xs text-xs leading-relaxed text-mist">{message}</p>
        )}
      </div>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="gap-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
