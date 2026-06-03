"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * TanStack Query Provider.
 * Creates a QueryClient per-component instance to avoid shared state
 * between requests in SSR.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Prevent refetching on window focus during development
            refetchOnWindowFocus: false,
            // Retry once on failure
            retry: 1,
            // Default stale time: 60 seconds
            staleTime: 60_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
