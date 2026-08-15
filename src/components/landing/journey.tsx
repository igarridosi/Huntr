"use client";

import { useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ScrollSnake } from "./scroll-snake";

interface JourneyStepProps {
  index: number;
  eyebrow: string;
  id: string;
  children: ReactNode;
}

/**
 * One numbered stop along the journey. The marker sits on the snake rail;
 * the showcase content keeps its own full-width layout to its right.
 */
export function JourneyStep({ index, eyebrow, id, children }: JourneyStepProps) {
  return (
    <div id={id} className="relative scroll-mt-24 pt-10 first:pt-0">
      {/* Rail marker — aligned with the snake on xl screens */}
      <div className="absolute left-0 top-10 hidden xl:flex xl:w-16 xl:justify-center">
        <span className="relative flex h-3 w-3 items-center justify-center">
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-sunset-orange/25" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sunset-orange" />
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <p className="mb-2 px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange xl:px-0">
          {String(index).padStart(2, "0")} — {eyebrow}
        </p>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Scroll-threaded wrapper: a snake rail runs down the left gutter and fills
 * as the reader advances through the product showcases.
 */
export function Journey({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <section ref={containerRef} className="relative">
      {/* Snake rail — left gutter, only where there is room for it */}
      <div className="pointer-events-none absolute inset-y-0 left-[max(1rem,calc((100%-72rem)/2-3rem))] hidden w-16 xl:block">
        <ScrollSnake targetRef={containerRef} waves={7} className="h-full w-full overflow-visible" />
      </div>

      <div className="xl:pl-16">{children}</div>
    </section>
  );
}
