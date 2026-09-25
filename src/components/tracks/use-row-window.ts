"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/** Rows fully in view before a list scrolls. */
export const VISIBLE_ROWS = 8;
/** How much of the next row shows under the fade: the cue that there is more. */
const PEEK_PX = 36;
/** A collapsed row before one has been measured. */
const FALLBACK_ROW_PX = 61;

/**
 * Sizes a scrolling list to exactly `VISIBLE_ROWS` rows, measured from the
 * rows themselves rather than assumed: a guessed row height is wrong the
 * moment a badge wraps or the reader zooms. Only the collapsed part of each
 * row (its button) is measured, so opening a row's details does not resize
 * the window around it.
 *
 * Writes the height straight to the element: it is layout, not state, and
 * a state round-trip would render twice for nothing.
 */
export function useRowWindow(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
  /**
   * Hold the window at eight rows whatever the list holds. A list that sits
   * beside a chart must not change height when its filter does: the columns
   * share a row, so the chart would resize with every tap.
   */
  fixed = false
) {
  const head = useRef(0);
  const gapPx = useRef(4);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rows = Array.from(el.querySelectorAll<HTMLElement>(":scope > ul > li"));
      const list = el.querySelector<HTMLElement>(":scope > ul");
      if (list) gapPx.current = parseFloat(getComputedStyle(list).rowGap) || 0;
      const heads = rows.slice(0, VISIBLE_ROWS).map((li) => (li.firstElementChild as HTMLElement | null)?.offsetHeight ?? li.offsetHeight);
      // The tallest collapsed row seen so far, and it only grows: a filter
      // whose rows are a pixel shorter, or that has none, keeps the window
      // it had instead of nudging everything around it.
      if (heads.length > 0) head.current = Math.max(head.current, ...heads);
      const row = head.current || FALLBACK_ROW_PX;
      const eight = row * VISIBLE_ROWS + gapPx.current * VISIBLE_ROWS + PEEK_PX;

      if (fixed) {
        el.style.height = `${Math.round(eight)}px`;
        el.style.maxHeight = "";
      } else if (rows.length <= VISIBLE_ROWS) {
        el.style.maxHeight = "";
      } else {
        el.style.maxHeight = `${Math.round(eight)}px`;
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The caller names what changes the rows; the ref itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** The fade at the bottom edge of a list that scrolls. */
export const EDGE_FADE = {
  maskImage: `linear-gradient(to bottom, black calc(100% - ${PEEK_PX}px), transparent)`,
  WebkitMaskImage: `linear-gradient(to bottom, black calc(100% - ${PEEK_PX}px), transparent)`,
} as const;
