"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/track";

/** /symbol/QCOM and /symbol/QCOM/financials are both about QCOM. */
function tickerOf(path: string): string | null {
  const match = /^\/symbol\/([^/]+)/.exec(path);
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/**
 * Records a page view on every route change, once per path. Mounted in
 * the root layout, so it covers the marketing pages and the platform
 * alike; the Server Action behind it drops anything it should not keep.
 */
export function PageViews() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    track("page_view", { path: pathname, ticker: tickerOf(pathname) });
  }, [pathname]);

  return null;
}
