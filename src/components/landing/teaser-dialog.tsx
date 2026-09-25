"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import { track } from "@/lib/analytics/track";

const SRC = "/screenshots/09254K.mp4";

/**
 * The teaser, behind one button.
 *
 * The file is large, so nothing about it is fetched until someone asks:
 * the <video> is not in the tree at all until the dialog opens, and the
 * poster frame is the page's own art rather than a second download.
 *
 * The surface arrives as a material — blur and scale together — and
 * leaves the way it came. Escape and the backdrop both close it, and
 * the page behind it stops scrolling while it is open.
 *
 * It renders into <body> through a portal, not in place: the hero sits
 * inside a transformed element (the parallax), and a transform makes
 * itself the containing block for `position: fixed` — in place, the
 * overlay would be pinned to the hero and sized to it instead of
 * covering the viewport.
 */
export function TeaserDialog() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back where it came from, not to the top of the document.
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => {
          setOpen(true);
          track("teaser_open");
        }}
        className="group inline-flex items-center gap-2.5 rounded-full border border-sunset-orange/30 bg-wolf-black/50 py-2 pl-2 pr-4 backdrop-blur-md transition-[transform,border-color,background-color] duration-200 hover:border-sunset-orange/60 hover:bg-wolf-black/70 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange focus-visible:ring-offset-2 focus-visible:ring-offset-wolf-black"
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-sunset-orange text-wolf-black">
          {/* The halo pulses only where motion is welcome. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-sunset-orange/40 motion-safe:animate-ping"
            style={{ animationDuration: "2.4s" }}
          />
          <Play className="relative h-3.5 w-3.5 fill-current" />
        </span>
        <span className="text-sm font-semibold text-snow-peak">See the hunt in 28 seconds</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Huntr teaser"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-wolf-black/85 p-4 backdrop-blur-sm animate-huntr-veil sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-wolf-border/60 bg-wolf-black shadow-2xl shadow-wolf-black/80 animate-huntr-sheet"
          >
            <video
              className="block h-auto w-full"
              src={SRC}
              autoPlay
              controls
              playsInline
              // Muted, because a browser will refuse to autoplay anything else.
              muted
              preload="auto"
            />
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close the teaser"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-wolf-border/60 bg-wolf-black/70 text-mist backdrop-blur-md transition-[transform,color] duration-150 hover:text-snow-peak active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          </div>,
            document.body
          )
        : null}
    </>
  );
}
