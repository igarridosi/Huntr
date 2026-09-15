"use client";

import { useCallback, useEffect, useState } from "react";
import { animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";

type Tab = "series" | "design";

interface MobileSheetProps {
  series: React.ReactNode;
  design: React.ReactNode;
}

/** How far the collapsed sheet peeks above the bottom edge. */
const PEEK = 92;
/** Share of the viewport the open sheet covers. */
const OPEN_SHARE = 0.72;

/** Apple's momentum projection: where a flick would come to rest. */
function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/**
 * The series and design panels on a phone: a sheet that sits at the bottom
 * and is dragged open. The drag tracks the finger 1:1; on release the
 * sheet goes where the momentum was taking it, not where the finger let
 * go, and settles with a spring that carries the release velocity. A
 * little bounce is allowed here only because a gesture preceded it.
 */
export function MobileSheet({ series, design }: MobileSheetProps) {
  const [tab, setTab] = useState<Tab>("series");
  const [open, setOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const y = useMotionValue(0);
  const [openOffset, setOpenOffset] = useState(0);

  const measure = useCallback(() => {
    const next = -(Math.round(window.innerHeight * OPEN_SHARE) - PEEK);
    setOpenOffset(next);
    return next;
  }, []);

  useEffect(() => {
    const onResize = () => y.set(open ? measure() : 0);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, y, measure]);

  const settle = (to: "open" | "closed", velocity = 0) => {
    const target = to === "open" ? measure() : 0;
    setOpen(to === "open");
    if (reducedMotion) {
      y.set(target);
      return;
    }
    animate(y, target, { type: "spring", bounce: 0.15, duration: 0.4, velocity });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const openPos = openOffset;
    const projected = y.get() + project(info.velocity.y);
    // Velocity sign decides when the flick is clear; otherwise the nearest
    // rest point from the projected landing.
    if (Math.abs(info.velocity.y) > 400) settle(info.velocity.y < 0 ? "open" : "closed", info.velocity.y);
    else settle(Math.abs(projected - openPos) < Math.abs(projected) ? "open" : "closed", info.velocity.y);
  };

  return (
    <motion.section
      aria-label="Chart settings"
      className="fixed inset-x-0 z-40 flex flex-col rounded-t-2xl bg-wolf-surface/95 shadow-[0_-12px_40px_rgba(0,0,0,.45)] ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl"
      style={{ y, height: `calc(${Math.round(OPEN_SHARE * 100)}dvh)`, top: `calc(100dvh - ${PEEK}px)` }}
      drag="y"
      dragConstraints={{ top: openOffset, bottom: 0 }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col items-center gap-2 px-4 pb-2 pt-2">
        {/* onTap rather than onClick: framer only reports a tap when the
            pointer stayed within the drag threshold, so a drag on the grip
            never doubles as a toggle. */}
        <motion.button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Collapse settings" : "Expand settings"}
          onTap={() => settle(open ? "closed" : "open")}
          className="flex h-5 w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60 rounded"
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-mist/40" />
        </motion.button>
        <SegmentedTabs<Tab>
          items={[
            { key: "series", label: "Series" },
            { key: "design", label: "Design" },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            if (!open) settle("open");
          }}
          ariaLabel="Settings panel"
          size="sm"
          className="w-full"
        />
      </div>
      <div className={cn("scroll-quiet min-h-0 flex-1 overflow-y-auto px-3 pb-6", !open && "pointer-events-none")}>
        {tab === "series" ? series : design}
      </div>
    </motion.section>
  );
}

export default MobileSheet;
