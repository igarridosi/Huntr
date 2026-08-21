"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SegmentedTabsProps<T extends string> {
  items: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Segmented control with a single indicator that travels between options.
 *
 * Swapping a background from one option to another reads as two unrelated
 * events; one shape moving between them reads as a single movement, and tells
 * you where you came from. The travel is a CSS transition rather than a spring
 * because this is click-driven, not gesture-driven — transitions already
 * re-target from their current computed value, so tapping a third option
 * mid-flight continues from wherever the indicator is.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false });
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;

    setIndicator((prev) =>
      Math.abs(prev.x - active.offsetLeft) < 0.5 &&
      Math.abs(prev.width - active.offsetWidth) < 0.5 &&
      prev.ready
        ? prev
        : { x: active.offsetLeft, width: active.offsetWidth, ready: true }
    );
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, value, items]);

  // The first placement must not animate — otherwise the indicator grows from
  // zero width on load, which is motion that means nothing. Transitions switch
  // on one frame after it has been positioned, so only real moves travel.
  useEffect(() => {
    if (!indicator.ready || animated) return;
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [indicator.ready, animated]);

  useEffect(() => {
    // Fonts landing after first paint change the tab widths under the
    // indicator, so re-measure rather than trusting the first reading.
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && listRef.current) observer.observe(listRef.current);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-xl border border-wolf-border/40 bg-wolf-black/40 p-1",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1 left-0 rounded-lg bg-sunset-orange/12 ring-1 ring-inset ring-sunset-orange/25",
          animated &&
            "transition-[transform,width] duration-[350ms] ease-settle motion-reduce:transition-none",
          indicator.ready ? "opacity-100" : "opacity-0"
        )}
        style={{
          transform: `translate3d(${indicator.x}px, 0, 0)`,
          width: `${indicator.width}px`,
        }}
      />

      {items.map((item) => {
        const isActive = item.key === value;

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative z-10 min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium",
              // Feedback lands on pointer-down, not on navigation.
              "transition-[color,transform] duration-150 ease-out active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
              "sm:min-h-8",
              isActive ? "text-sunset-orange" : "text-mist hover:text-snow-peak"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
