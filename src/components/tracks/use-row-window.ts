"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Rows fully in view before a list scrolls. */
export const VISIBLE_ROWS = 8;
/** How much of the next row shows under the fade: the cue that there is more. */
const PEEK_PX = 36;

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
export function useRowWindow(ref: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rows = Array.from(el.querySelectorAll<HTMLElement>(":scope > ul > li"));
      if (rows.length <= VISIBLE_ROWS) {
        el.style.maxHeight = "";
        return;
      }
      const list = el.querySelector<HTMLElement>(":scope > ul");
      const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
      const heads = rows.slice(0, VISIBLE_ROWS).map((li) => (li.firstElementChild as HTMLElement | null)?.offsetHeight ?? li.offsetHeight);
      const height = heads.reduce((s, h) => s + h, 0) + gap * VISIBLE_ROWS + PEEK_PX;
      el.style.maxHeight = `${Math.round(height)}px`;
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
