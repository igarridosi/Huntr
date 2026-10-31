"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during the server render and the hydrating render, true after.
 *
 * For a component whose data can already be in the shared query cache when
 * React reaches it (another part of the page asked for the same query and
 * it resolved first): rendering that data straight away would differ from
 * the server's empty render and fail hydration. Waiting one render costs
 * nothing visible.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
