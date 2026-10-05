"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { chromeOpacity, useIntroProgress } from "@/hooks/use-intro-progress";
import { KoFiSupport } from "@/components/ui/kofi-support";

/**
 * Top bar. Sits over the hero rather than above it, so when it clears out for
 * the intro sequence the forest shows through instead of a gap. Its links are
 * next/link: a client navigation keeps the page alive into the app, so the
 * transition screen (AppTransition) can cover the step instead of a reload.
 */
export function LandingNav() {
  const progress = useIntroProgress();
  const opacity = chromeOpacity(progress);
  const hidden = opacity < 0.02;

  // Opacity is scrubbed straight from scroll, so no CSS transition: one would
  // lag the scrub, and visibility flips discretely regardless of it.
  return (
    // The bar's surface lives on the inner element with the entrance, so
    // nothing of it shows (not even an empty band) before it arrives.
    <nav
      className="sticky top-0 z-40"
      style={{
        opacity,
        visibility: hidden ? "hidden" : "visible",
      }}
      aria-hidden={hidden}
    >
      <div
        style={{ "--d": "950ms" } as React.CSSProperties}
        className="hero-drop border-b border-wolf-border/30 bg-wolf-black/80 px-4 py-3 backdrop-blur-md sm:px-6"
      >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-tight text-snow-peak">
          HUNTR
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={ROUTES.APP}
            aria-label="Explore as Guest"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-snow-peak border border-wolf-border/60 hover:border-sunset-orange/50 hover:text-sunset-orange bg-wolf-black/40 hover:bg-sunset-orange/5 px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-colors"
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            {/* Shorter wording on small screens so the label survives the squeeze */}
            <span className="whitespace-nowrap sm:hidden">Guest Mode</span>
            <span className="hidden whitespace-nowrap sm:inline">Explore as Guest</span>
          </Link>
          {/* On narrow phones the brand plus three actions leaves no gap at all.
              Login is the one to drop: it is still reachable from the sign-up
              screen, while guest access and sign-up are the entry points that
              matter here. */}
          <Link
            href={ROUTES.LOGIN}
            className="hidden text-sm text-mist transition-colors hover:text-snow-peak min-[400px]:inline"
          >
            Login
          </Link>
          <Link
            href={ROUTES.SIGNUP}
            className="text-sm font-semibold text-wolf-black bg-sunset-orange hover:bg-sunset-orange/90 px-4 py-1.5 rounded-lg transition-colors"
          >
            Start Free
          </Link>
          {/* Desktop only — the mobile placement is under the hero's trust
              badges instead, where there's room for it without crowding nav. */}
          <div className="hidden sm:block">
            <KoFiSupport text="Support Huntr on Ko-fi" />
          </div>
        </div>
      </div>
      </div>
    </nav>
  );
}
