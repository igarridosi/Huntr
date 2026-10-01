/**
 * The landing's scroll to a section: a slow, symmetric glide instead of the
 * jump a hash link makes. Shared by the side menu and the footer, so every
 * way of moving through the page moves the same way.
 */

/** Clearance below the sticky nav so the target heading is never tucked under it. */
const SCROLL_OFFSET = 88;
const MIN_DURATION = 900;
const MAX_DURATION = 1800;

/** Slow, symmetric ease so long jumps glide instead of snapping. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let frame = 0;
let listening = false;

function cancelGlide() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/** The reader taking over the scroll stops any glide in flight. */
function listenForTakeover() {
  if (listening) return;
  listening = true;
  window.addEventListener("wheel", cancelGlide, { passive: true });
  window.addEventListener("touchstart", cancelGlide, { passive: true });
}

/** Glides to `hash` ("#features"). Returns false when there is no such section. */
export function glideTo(hash: string): boolean {
  const section = document.querySelector(hash);
  if (!section) return false;
  listenForTakeover();

  const startY = window.scrollY;
  const targetY = Math.max(0, section.getBoundingClientRect().top + startY - SCROLL_OFFSET);
  const distance = targetY - startY;

  // Keep the address bar in sync without the jump a real hash change causes,
  // and without stacking a history entry per click.
  history.replaceState(null, "", hash);

  if (Math.abs(distance) < 1) return true;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, targetY);
    return true;
  }

  // Longer trips take longer, but stay inside a predictable band.
  const duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.abs(distance) * 0.55));
  const startTime = performance.now();
  cancelGlide();

  const step = (now: number) => {
    const elapsed = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(elapsed));
    frame = elapsed < 1 ? requestAnimationFrame(step) : 0;
  };
  frame = requestAnimationFrame(step);
  return true;
}
