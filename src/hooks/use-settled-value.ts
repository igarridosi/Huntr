"use client";

import { useEffect, useState } from "react";

/**
 * The value a rapidly changing input settles on, once it stops changing.
 *
 * Some surfaces have to follow a value live - a slider's own thumb, a figure
 * the user is watching count up. Others are far too expensive to recompute at
 * that rate, and running them anyway is what makes the live surfaces stutter.
 * This gives the expensive ones a copy that only lands after the value has
 * been still for `delay`, so a 420ms tween costs them one render instead of
 * twenty-five.
 *
 * The delay wants to be a little longer than a frame gap and short enough to
 * feel immediate: anything from about 100ms to 150ms reads as instant while
 * still collapsing a whole animation into a single update.
 */
export function useSettledValue<T>(value: T, delay = 130): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
