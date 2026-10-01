"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ScrollSnake } from "./scroll-snake";

interface JourneyStepProps {
  index: number;
  eyebrow: string;
  id: string;
  children: ReactNode;
}

/**
 * One numbered stop along the journey. Its eyebrow is what the rail marks:
 * Journey reads where it sits and the snake draws the stop on its curve,
 * level with it. The eyebrow lines up with the showcase's own column.
 */
export function JourneyStep({ index, eyebrow, id, children }: JourneyStepProps) {
  return (
    <div id={id} className="relative scroll-mt-24 pt-10 first:pt-0">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <p
          data-journey-stop
          className="mx-auto mb-2 max-w-6xl px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange"
        >
          {String(index).padStart(2, "0")} — {eyebrow}
        </p>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Height of an element's centre within an ancestor, from the offset chain:
 * unlike getBoundingClientRect it ignores transforms, so an eyebrow still
 * sliding in on its entrance is measured where it will settle.
 */
function centreWithin(el: HTMLElement, ancestor: HTMLElement) {
  let y = el.offsetHeight / 2;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

/**
 * Scroll-threaded wrapper: a snake rail runs down the left gutter and fills
 * as the reader advances through the product showcases.
 */
export function Journey({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stops, setStops] = useState<number[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () =>
      setStops(
        [...container.querySelectorAll<HTMLElement>("[data-journey-stop]")].map((el) => centreWithin(el, container))
      );
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    return () => observer?.disconnect();
  }, []);

  return (
    <section ref={containerRef} className="relative">
      {/* Snake rail — left gutter, only where there is room for it */}
      <div className="pointer-events-none absolute inset-y-0 left-[max(1rem,calc((100%-72rem)/2-3rem))] hidden w-16 xl:block">
        <ScrollSnake targetRef={containerRef} waves={7} stops={stops} className="h-full w-full overflow-visible" />
      </div>

      <div className="xl:pl-16">{children}</div>
    </section>
  );
}
