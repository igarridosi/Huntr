"use client";

import { Compass } from "lucide-react";
import { chromeOpacity, useIntroProgress } from "@/hooks/use-intro-progress";

/**
 * Top bar. Sits over the hero rather than above it, so when it clears out for
 * the intro sequence the forest shows through instead of a gap.
 */
export function LandingNav() {
  const progress = useIntroProgress();
  const opacity = chromeOpacity(progress);
  const hidden = opacity < 0.02;

  // Opacity is scrubbed straight from scroll, so no CSS transition: one would
  // lag the scrub, and visibility flips discretely regardless of it.
  return (
    <nav
      className="sticky top-0 z-40 border-b border-wolf-border/30 bg-wolf-black/80 backdrop-blur-md px-4 py-3 sm:px-6"
      style={{
        opacity,
        visibility: hidden ? "hidden" : "visible",
      }}
      aria-hidden={hidden}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-tight text-snow-peak">
          HUNTR
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="/app"
            aria-label="Explore as Guest"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-snow-peak border border-wolf-border/60 hover:border-sunset-orange/50 hover:text-sunset-orange bg-wolf-black/40 hover:bg-sunset-orange/5 px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-colors"
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            {/* Shorter wording on small screens so the label survives the squeeze */}
            <span className="whitespace-nowrap sm:hidden">Guest Mode</span>
            <span className="hidden whitespace-nowrap sm:inline">Explore as Guest</span>
          </a>
          {/* On narrow phones the brand plus three actions leaves no gap at all.
              Login is the one to drop: it is still reachable from the sign-up
              screen, while guest access and sign-up are the entry points that
              matter here. */}
          <a
            href="/login"
            className="hidden text-sm text-mist transition-colors hover:text-snow-peak min-[400px]:inline"
          >
            Login
          </a>
          <a
            href="/signup"
            className="text-sm font-semibold text-wolf-black bg-sunset-orange hover:bg-sunset-orange/90 px-4 py-1.5 rounded-lg transition-colors"
          >
            Start Free
          </a>
        </div>
      </div>
    </nav>
  );
}
