"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The step from the landing into the app, as a screen of its own rather than
 * a cut: the wolf comes into focus out of the dark while the app loads, then
 * the screen dissolves into the app (the way a portal's splash does).
 *
 * It listens for clicks on links that leave the landing for the app or the
 * auth pages — any link, so the hero, the nav, the tour and the footer all
 * get it without wiring each one — and lets the link navigate as usual. Only
 * a plain left click starts it: a new tab, a modified click or a hash link on
 * the landing itself is left alone. It stays at least MIN_VISIBLE_MS, long
 * enough to be seen rather than flashed (the app usually loads in well under
 * a second behind it), and gives up after GIVE_UP_MS if the navigation never
 * lands. Its progress bar fills over that same minimum.
 */

const DESTINATIONS = ["/app", "/symbol", "/login", "/signup"];
const MIN_VISIBLE_MS = 2500;
const FADE_OUT_MS = 520;
const GIVE_UP_MS = 10_000;

type Phase = "idle" | "in" | "out";

function leavesLandingForApp(event: MouseEvent, pathname: string): boolean {
  if (pathname !== "/") return false;
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return DESTINATIONS.some((d) => url.pathname === d || url.pathname.startsWith(`${d}/`));
}

/** The mark from icon.svg: the wolf in snow, the slash in orange. */
function WolfMark({ className }: { className?: string }) {
  return (
    <svg viewBox="50 -28.5 478 478" aria-hidden className={className}>
      <path
        fill="#F2F4F3"
        fillRule="evenodd"
        d="M317.8 39.0 300.2 62.2 299.0 66.0 301.0 69.8 301.0 72.0 303.0 75.8 306.0 85.0 308.2 87.5 330.0 87.8 331.8 86.0 331.8 83.8 330.8 82.0 329.8 74.8 325.8 61.0 325.8 57.8 319.8 40.0ZM498.5 113.5 496.0 112.0 490.8 112.0 489.0 113.0 481.8 113.0 480.0 114.0 472.8 114.0 471.0 115.0 450.8 116.0 449.0 117.0 442.8 117.0 441.0 118.0 428.8 118.0 427.0 119.0 417.8 119.0 416.0 120.0 402.8 120.0 398.5 116.2 379.2 103.8 376.5 101.2 367.0 96.0 354.8 96.0 353.0 97.0 326.8 97.0 325.0 98.0 311.8 98.0 310.0 99.0 300.8 99.0 298.8 97.0 297.8 92.8 293.8 84.0 291.8 76.8 287.8 68.0 287.8 65.8 280.8 49.0 276.8 36.8 274.8 32.8 273.8 32.0 272.2 32.2 254.2 53.2 239.0 78.8 231.0 97.8 227.0 109.8 225.0 120.0 223.0 124.8 221.8 135.5 194.2 152.2 167.2 172.2 144.5 191.8 142.0 195.0 131.8 204.5 124.2 213.2 124.2 215.8 139.0 214.8 140.8 213.8 145.0 213.8 146.8 212.8 161.5 212.8 162.2 214.0 128.8 246.5 109.2 271.2 95.2 292.2 75.2 329.2 74.0 334.0 69.0 344.8 63.2 360.5 78.0 345.2 81.5 340.5 116.5 305.5 142.2 283.0 186.2 250.0 225.2 226.0 261.8 206.8 263.0 206.8 281.8 197.8 291.8 193.8 294.0 193.8 297.2 192.0 297.8 193.5 294.2 197.2 284.0 213.8 276.0 234.8 276.0 237.0 274.0 242.8 274.0 246.0 273.0 247.8 273.0 253.0 272.0 254.8 272.0 262.0 271.0 263.8 271.0 273.0 272.0 274.2 273.5 274.0 282.2 266.0 298.2 254.0 321.2 240.0 337.8 231.8 339.0 231.8 341.8 229.8 348.0 227.8 353.8 224.8 359.0 223.8 370.8 218.8 373.0 218.8 377.8 216.8 387.0 214.8 393.5 211.5 400.5 205.5 400.8 202.8 399.0 200.5 392.5 195.2 381.2 183.8 372.0 175.5 372.8 173.8 389.0 168.8 392.8 166.8 403.0 163.8 417.8 157.8 420.0 157.8 443.8 148.8 446.0 148.8 449.8 146.8 452.0 146.8 455.8 144.8 469.0 140.8 475.0 137.8 475.5 136.2 472.0 132.5 468.8 127.0 468.8 123.0 469.5 122.0 470.2 122.0 475.2 127.5 484.8 132.8 493.0 132.8 497.5 130.5 499.8 128.0 499.8 119.8 498.8 118.0ZM333.5 133.8 335.0 132.8 340.0 131.8 358.8 123.8 365.0 123.8 383.8 132.8 387.5 133.8 388.2 135.0 384.0 137.0 379.8 137.0 365.0 143.0 358.8 143.0 342.0 136.0 334.2 135.0ZM269.8 62.2 271.0 63.8 271.0 67.0 274.0 72.8 275.0 77.0 277.0 80.8 281.0 93.0 284.0 98.8 288.0 111.0 286.5 112.8 277.2 118.2 268.8 125.5 259.2 137.2 254.0 146.8 253.8 148.5 252.5 149.2 251.8 148.5 250.8 140.8 249.8 139.0 249.8 110.8 251.8 104.0 251.8 98.8 252.8 97.0 252.8 93.8 261.8 74.0 261.8 72.8 266.0 65.2 268.0 63.0Z"
      />
      <path
        fill="#FF8C42"
        fillRule="evenodd"
        d="M522.5 136.5 519.8 136.0 502.0 143.0 482.8 149.0 479.0 151.0 465.8 155.0 448.0 162.0 445.8 162.0 428.0 169.0 425.8 169.0 422.0 171.0 416.8 172.0 397.8 179.0 397.2 180.5 399.0 183.0 420.8 203.2 421.0 205.0 420.0 207.0 392.2 233.2 367.5 254.8 339.2 281.2 325.5 291.8 312.5 299.8 290.0 309.0 287.8 309.0 279.0 312.0 273.8 312.0 272.0 313.0 266.8 313.0 265.0 314.0 249.8 314.0 246.8 315.0 245.2 313.8 247.2 311.0 250.5 309.5 257.2 304.0 263.5 300.5 268.5 296.5 267.8 295.0 262.8 295.0 261.0 294.0 235.8 294.0 234.0 295.0 224.8 295.0 223.0 296.0 216.8 296.0 215.0 297.0 203.8 298.0 202.0 299.0 188.8 301.0 162.8 309.0 134.2 322.2 120.2 330.2 99.2 345.2 87.5 354.8 72.8 369.5 69.2 374.2 56.5 388.0 56.5 389.0 58.5 388.5 65.2 383.0 78.2 375.0 104.8 361.8 130.8 352.8 138.0 351.8 148.8 348.8 153.0 348.8 154.8 347.8 160.0 347.8 161.8 346.8 194.0 346.8 195.8 347.8 207.0 348.8 208.8 349.8 212.0 349.8 218.8 351.8 223.0 351.8 224.8 352.8 228.0 352.8 234.8 354.8 241.0 354.8 242.8 355.8 253.0 355.8 254.8 356.8 266.0 356.8 267.8 355.8 279.0 355.8 280.8 354.8 289.0 354.8 290.8 353.8 294.0 353.8 299.8 351.8 303.0 351.8 310.8 348.8 313.0 348.8 328.0 342.8 338.5 337.5 360.5 321.5 452.2 236.0 455.0 235.8 459.5 239.0 480.2 259.5 482.8 260.2 483.8 259.0 488.8 244.0 488.8 241.8 493.8 228.0 493.8 225.8 497.8 216.0 497.8 213.8 502.8 200.0 502.8 197.8 521.8 142.0Z"
      />
    </svg>
  );
}

export function AppTransition() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const startedAt = useRef(0);
  const fromPath = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const finish = (delay: number) => {
    clearTimers();
    timers.current.push(
      window.setTimeout(() => {
        setPhase("out");
        timers.current.push(window.setTimeout(() => setPhase("idle"), FADE_OUT_MS));
      }, delay)
    );
  };

  // Start on a click that leaves the landing for the app. Capture phase, so
  // it runs before the link's own handler, which then navigates as usual.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!leavesLandingForApp(event, window.location.pathname)) return;
      startedAt.current = performance.now();
      fromPath.current = window.location.pathname;
      setPhase("in");
      finish(GIVE_UP_MS); // in case the navigation never lands
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
    // finish only touches refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End once the route has changed, after the minimum on screen.
  useEffect(() => {
    if (phase !== "in" || fromPath.current === null || pathname === fromPath.current) return;
    fromPath.current = null;
    const shown = performance.now() - startedAt.current;
    finish(Math.max(0, MIN_VISIBLE_MS - shown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, phase]);

  // Coming back to the landing with the screen still up (the browser's back
  // during the wait): drop it at once.
  useEffect(() => {
    if (pathname === "/" && phase === "out") setPhase("idle");
  }, [pathname, phase]);

  if (phase === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-wolf-black transition-opacity ease-out motion-reduce:transition-none ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{
        transitionDuration: phase === "out" ? `${FADE_OUT_MS}ms` : "0ms",
        animation: phase === "in" ? "huntr-veil 220ms cubic-bezier(0.32, 0.72, 0, 1)" : undefined,
      }}
    >
      <span className="sr-only">Loading HUNTR</span>

      {/* The landing's light, faint, so the screen belongs to the same night */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 0% 100%, rgba(255,140,66,0.16), rgba(255,140,66,0) 70%), radial-gradient(ellipse 60% 50% at 100% 0%, rgba(44,98,115,0.28), rgba(44,98,115,0) 70%)",
        }}
      />

      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* Glow behind the mark, pulsing in intensity while the app loads */}
        <div aria-hidden className="huntr-splash-glow absolute inset-0 rounded-full bg-sunset-orange/25 blur-2xl" />
        <div className="huntr-splash-mark relative">
          <WolfMark className="h-36 w-36" />
        </div>
      </div>

      {/* Progress: fills over the minimum time on screen */}
      <div aria-hidden className="relative mt-8 h-0.5 w-44 overflow-hidden rounded-full bg-wolf-border/70">
        <div
          className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-sunset-orange to-golden-hour"
          style={{ animation: `huntr-splash-progress ${MIN_VISIBLE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both` }}
        />
      </div>

      {/* The wordmark as the landing's nav sets it */}
      <p
        aria-hidden
        className="absolute bottom-10 text-xl font-extrabold tracking-tight text-snow-peak"
        style={{ animation: "huntr-veil 900ms ease-out both" }}
      >
        HUNTR
      </p>
    </div>
  );
}
