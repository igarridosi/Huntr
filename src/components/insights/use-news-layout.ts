"use client";

import { useStoredChoice } from "@/components/insights/use-stored-choice";

/**
 * How the reader wants "What's moving the market": normal cards, compact
 * ones, or the section hidden. Kept in this browser (see useStoredChoice).
 */
export type NewsLayout = "normal" | "compact" | "hidden";

const LAYOUTS: readonly NewsLayout[] = ["normal", "compact", "hidden"];

export function useNewsLayout(): [NewsLayout, (layout: NewsLayout) => void] {
  return useStoredChoice("huntr:news-layout", LAYOUTS, "normal");
}
