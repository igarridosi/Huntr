"use client";

import { recordEvent } from "@/app/actions/analytics";
import type { AnalyticsEvent } from "./events";

interface TrackOptions {
  path?: string | null;
  ticker?: string | null;
  props?: Record<string, unknown> | null;
}

/**
 * Fire and forget. The caller never waits for analytics and never sees
 * it fail: a rejected beacon is swallowed here so no click handler has
 * to think about measurement.
 */
export function track(event: AnalyticsEvent, options: TrackOptions = {}): void {
  void recordEvent({ event, ...options }).catch(() => {});
}
