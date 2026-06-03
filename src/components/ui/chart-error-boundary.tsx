"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";

interface State {
  hasError: boolean;
}

/**
 * Error boundary that catches rendering crashes inside Recharts components
 * and shows a minimal fallback instead of crashing the whole page.
 *
 * @example
 * <ChartErrorBoundary>
 *   <EarningsMetricChart ... />
 * </ChartErrorBoundary>
 */
export class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ChartErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-wolf-border/40 bg-wolf-black/30 py-6 text-center">
          <BarChart3 className="h-5 w-5 text-mist/50" />
          <p className="text-xs text-mist/70">
            {this.props.label ?? "Chart"} could not be rendered
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="text-[11px] text-sunset-orange hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
