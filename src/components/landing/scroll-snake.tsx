"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Screen line the filled tip is pinned to, as a fraction of the viewport. */
const ANCHOR_RATIO = 0.5;

/**
 * Builds a smooth serpentine path running top-to-bottom in raw pixel space.
 * Coordinates are 1:1 with the rendered box, so the stroke never distorts.
 */
function buildWavePath(width: number, height: number, waves: number) {
  const centerX = width / 2;
  const amplitude = Math.min(width * 0.3, 18);
  const segment = height / waves;

  let d = `M ${centerX.toFixed(2)} 0`;

  for (let i = 0; i < waves; i += 1) {
    const yStart = i * segment;
    const yEnd = yStart + segment;
    const bulgeX = centerX + (i % 2 === 0 ? amplitude : -amplitude);

    d +=
      ` C ${bulgeX.toFixed(2)} ${(yStart + segment * 0.3).toFixed(2)},` +
      ` ${bulgeX.toFixed(2)} ${(yEnd - segment * 0.3).toFixed(2)},` +
      ` ${centerX.toFixed(2)} ${yEnd.toFixed(2)}`;
  }

  return d;
}

interface ScrollSnakeProps {
  /** Section whose scroll travel drives the fill. */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Number of half-waves along the full height. */
  waves?: number;
  className?: string;
}

/**
 * Vertical thread that fills progressively as the target section scrolls past.
 * The track stays dim; the progress stroke uses the Huntr sunset → golden
 * gradient and carries a glowing head that rides the path.
 */
export function ScrollSnake({ targetRef, waves = 7, className }: ScrollSnakeProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const reducedMotion = useRef<MediaQueryList | null>(null);

  const [box, setBox] = useState({ width: 0, height: 0 });
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(0);
  const [head, setHead] = useState<{ x: number; y: number } | null>(null);

  /**
   * Reads layout for both the drawing box and the scroll progress in one pass.
   * Measured synchronously rather than relying on ResizeObserver alone, which
   * only delivers callbacks while the page is actively painting.
   */
  const measure = useCallback(() => {
    const svg = svgRef.current;
    const target = targetRef.current;
    if (!svg || !target) return;

    const svgRect = svg.getBoundingClientRect();
    setBox((prev) =>
      Math.abs(prev.width - svgRect.width) < 0.5 &&
      Math.abs(prev.height - svgRect.height) < 0.5
        ? prev
        : { width: svgRect.width, height: svgRect.height }
    );

    // Readers who opt out of motion get the thread already drawn.
    reducedMotion.current ??= window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.current.matches) {
      setProgress(1);
      return;
    }

    const rect = target.getBoundingClientRect();
    const viewport = window.innerHeight;

    // Progress is measured against a fixed line on screen, so the filled tip
    // stays pinned there instead of drifting: dividing by anything other than
    // the section's own height makes the head travel at a different rate than
    // the page and slide off the bottom by the end.
    const anchor = viewport * ANCHOR_RATIO;
    if (rect.height <= 0) return;

    const raw = (anchor - rect.top) / rect.height;
    setProgress(Math.min(Math.max(raw, 0), 1));
  }, [targetRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    // Runs after every ref in the tree is attached — the layout effect above
    // fires before the parent section's ref exists, so this is the first pass
    // that can actually read the target.
    measure();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (observer && svgRef.current) observer.observe(svgRef.current);
    if (observer && targetRef.current) observer.observe(targetRef.current);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [measure, targetRef]);

  // Path geometry changes with the box, so re-measure its length.
  useLayoutEffect(() => {
    if (!pathRef.current || box.height === 0) return;
    setLength(pathRef.current.getTotalLength());
  }, [box]);

  // Keep the glowing head pinned to the filled tip.
  useEffect(() => {
    if (!pathRef.current || length === 0) return;
    const point = pathRef.current.getPointAtLength(length * progress);
    setHead({ x: point.x, y: point.y });
  }, [progress, length]);

  const ready = box.width > 0 && box.height > 0;
  const d = ready ? buildWavePath(box.width, box.height, waves) : "";

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className={className}
      viewBox={ready ? `0 0 ${box.width} ${box.height}` : undefined}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      <defs>
        <linearGradient id="snake-progress" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF8C42" />
          <stop offset="100%" stopColor="#FFBF69" />
        </linearGradient>
        <filter id="snake-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {ready && (
        <>
          {/* Dim track */}
          <path
            ref={pathRef}
            d={d}
            stroke="#2A3B40"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* Filled progress */}
          {length > 0 && (
            <path
              d={d}
              stroke="url(#snake-progress)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={length}
              strokeDashoffset={length * (1 - progress)}
            />
          )}

          {/* Glowing head — rides the tip all the way to the end of the thread */}
          {head && progress > 0 && (
            <circle cx={head.x} cy={head.y} r="4" fill="#FFBF69" filter="url(#snake-glow)" />
          )}
        </>
      )}
    </svg>
  );
}
