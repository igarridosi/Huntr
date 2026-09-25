"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import { track } from "@/lib/analytics/track";

const VIDEO_ID = "JDOcCHxHlqU";
const WATCH_URL = `https://youtu.be/${VIDEO_ID}`;
/* youtube-nocookie, so nothing is written until the film is actually played. */
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

/**
 * The teaser, behind one button.
 *
 * The film is hosted on YouTube rather than shipped with the site: a 4K
 * file in the repository costs every clone and every deploy, and the
 * embed costs a visitor nothing until they ask for it — the iframe is
 * not in the tree at all until the dialog opens, so no request reaches
 * YouTube and no cookie is set on a page view.
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
        <span className="text-sm font-semibold text-snow-peak">See the hunt in 50 seconds</span>
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
            /*
             * As large as the screen allows, in both directions: the width is
             * capped by the viewport, by 1600px, and by the height left once
             * the bar under it is accounted for.
             *
             * Size is the only lever we have on quality. YouTube picks the
             * stream from the bandwidth and the player's rendered size — `vq`
             * is ignored and `setPlaybackQuality` is a deprecated no-op — so a
             * bigger frame is what makes it reach for 1440p instead of 1080p.
             */
            style={{ width: "min(94vw, 1600px, calc((100vh - 9rem) * 16 / 9))" }}
            className="relative overflow-hidden rounded-2xl border border-wolf-border/60 bg-wolf-black shadow-2xl shadow-wolf-black/80 animate-huntr-sheet"
          >
            <div className="aspect-video w-full bg-wolf-black">
              <iframe
                className="h-full w-full"
                src={EMBED_URL}
                title="Huntr — release teaser"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            {/* Our own bar, under the frame: the player owns its top-right
                corner and its bottom edge, so nothing of ours goes there. */}
            <div className="flex items-center justify-between gap-4 border-t border-wolf-border/50 px-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-mist/60">Release teaser · 50 seconds</span>
              <a
                href={WATCH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-mist underline-offset-2 transition-colors hover:text-snow-peak hover:underline"
              >
                watch on YouTube
              </a>
            </div>
          </div>

          {/* Clear of the player, which owns its own top-right corner. */}
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close the teaser"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-wolf-border/60 bg-wolf-black/70 text-mist backdrop-blur-md transition-[transform,color] duration-150 hover:text-snow-peak active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange sm:right-6 sm:top-6"
          >
            <X className="h-4 w-4" />
          </button>
          </div>,
            document.body
          )
        : null}
    </>
  );
}
