"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Search, ArrowRight, Radio, FileText, BarChart3 } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { KoFiSupport } from "@/components/ui/kofi-support";
import { CommandPalette } from "@/components/search/command-palette";
import { ROUTES } from "@/lib/constants";

/** Point in the intro where the wordmark starts surfacing. */
const WORD_START = 0.08;
const WORD_SCALE_FROM = 0.08;
const WORD_SCALE_TO = 11;

/**
 * With `line-height: 1` the line box still reserves descender space, so the
 * capitals sit below its centre — measured at 0.0686em for this face. Centring
 * the box would therefore leave the letters low, and scaling about the box
 * centre multiplies that error (~200px at the largest scale). Shifting by the
 * offset and pinning the transform origin to it keeps the glyphs centred at
 * every scale.
 */
const INK_OFFSET_EM = 0.0686;
const INK_ORIGIN_Y = `${(0.5 + INK_OFFSET_EM) * 100}%`;

type StockSnippet = {
  ticker: string;
  category: string;
  logoUrl: string;
  points: number[];
};

/** Deterministic PRNG — keeps the generated series identical on server and client. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random walk with drift — the standard model for a closing-price series.
 *
 * Each step is an independent draw rather than a continuation of the previous
 * one. Carrying momentum forward is what turns a sparkline into a smooth drawn
 * arc: at 26% persistence only 38% of steps reverse direction, against ~44%
 * here and ~50% for a driftless walk. The shortfall from 50% is the drift,
 * which is what makes a trending name look like it trends.
 */
function buildSeries(seed: number, drift: number, volatility: number, count = 44) {
  const random = mulberry32(seed);
  // Irwin–Hall: six uniforms sum to an approximately standard normal, so large
  // moves stay rare instead of the flat spread a single uniform would give.
  const gaussian = () =>
    random() + random() + random() + random() + random() + random() - 3;

  const values: number[] = [];
  let value = 50;

  for (let i = 0; i < count; i += 1) {
    value += drift + gaussian() * volatility;
    values.push(value);
  }

  return values;
}

const snippets: StockSnippet[] = [
  { ticker: "AAPL", category: "Technology", logoUrl: "https://cdn.tickerlogos.com/apple.com", points: buildSeries(101, 0.26, 1.2) },
  { ticker: "MSFT", category: "Software", logoUrl: "https://cdn.tickerlogos.com/microsoft.com", points: buildSeries(202, 0.28, 1.0) },
  { ticker: "NVDA", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/nvidia.com", points: buildSeries(303, 0.44, 2.0) },
  { ticker: "AMZN", category: "E-commerce", logoUrl: "https://cdn.tickerlogos.com/amazon.com", points: buildSeries(404, 0.2, 1.4) },
  { ticker: "GOOGL", category: "Communication", logoUrl: "https://cdn.tickerlogos.com/abc.xyz", points: buildSeries(505, 0.24, 1.25) },
  { ticker: "LLY", category: "Healthcare", logoUrl: "https://cdn.tickerlogos.com/lilly.com", points: buildSeries(606, 0.31, 1.1) },
  { ticker: "WMT", category: "Retail", logoUrl: "https://i5.walmartimages.com/dfw/63fd9f59-14e2/9d304ce6-96de-4331-b8ec-c5191226d378/v1/spark-icon.svg", points: buildSeries(707, 0.19, 0.75) },
  { ticker: "AVGO", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/broadcom.com", points: buildSeries(808, 0.33, 1.6) },
  { ticker: "TSLA", category: "Automotive", logoUrl: "https://cdn.tickerlogos.com/tesla.com", points: buildSeries(909, -0.11, 2.2) },
  { ticker: "JPM", category: "Financials", logoUrl: "https://cdn.tickerlogos.com/jpmorganchase.com", points: buildSeries(111, 0.17, 0.9) },
];

/**
 * Straight-segment polyline, normalised to fill the box. At this point density
 * the segments already read as a curve, and skipping the spline keeps the peaks
 * where the data actually puts them.
 */
function toLinePath(points: number[], width = 100, height = 28) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1e-6);
  const padding = 2;
  const usable = height - padding * 2;

  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = padding + usable - ((p - min) / range) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Compact card in the hero ticker tape — a signup entry point. */
function TickerChip({ item }: { item: StockSnippet }) {
  const gradientId = item.ticker.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <Link
      href={ROUTES.SIGNUP}
      aria-label={`Sign up to track ${item.ticker}`}
      className="pointer-events-auto mx-2 flex w-[200px] shrink-0 items-center gap-3 rounded-xl border border-wolf-border/50 bg-wolf-surface/60 px-3 py-2.5 backdrop-blur-sm transition-colors hover:border-sunset-orange/50 hover:bg-wolf-surface/80"
    >
      <TickerLogo
        ticker={item.ticker}
        src={item.logoUrl}
        className="h-8 w-8"
        imageClassName="rounded"
        fallbackClassName="rounded text-[8px]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-snow-peak">{item.ticker}</p>
        <p className="truncate font-mono text-[10px] text-mist">{item.category}</p>
      </div>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-12 shrink-0" fill="none" aria-hidden>
        <defs>
          <linearGradient id={`chip-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FFBF69" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={toLinePath(item.points)} stroke={`url(#chip-${gradientId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/**
 * Full-bleed hero: the forest header image carries the whole viewport and
 * dissolves into the page background, so the scroll into the next section has
 * no visible seam. Scrolling pushes the scene forward and lifts the copy away,
 * so the reader feels like they are walking into the treeline.
 */
export function HeroForest() {
  const [searchOpen, setSearchOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  // Measured across the tall outer container: progress reaches 1 at exactly the
  // point the sticky scene unpins, so the sequence finishes as the hero leaves.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Dolly the scene forward while the copy lifts away and the canopy closes in.
  const sceneScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 1.45]);
  const sceneY = useTransform(scrollYProgress, [0, 1], reduceMotion ? ["0%", "0%"] : ["0%", "6%"]);
  const depthOpacity = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 0.8]);

  // The headline clears out early to hand the frame over to the wordmark.
  const copyY = useTransform(scrollYProgress, [0, 0.5], reduceMotion ? [0, 0] : [0, -130]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.32], reduceMotion ? [1, 1] : [1, 0]);
  const copyPointer = useTransform(copyOpacity, (value) => (value < 0.05 ? "none" : "auto"));
  // The chips opt back into pointer events, so `none` on their container would
  // not reach them — visibility does, and it inherits all the way down.
  const tapeVisibility = useTransform(copyOpacity, (value) =>
    value < 0.05 ? "hidden" : "visible"
  );

  // HUNTR surfaces out of the depth of field as the headline goes, then the
  // reader flies through it into the treeline.
  const wordOpacity = useTransform(
    scrollYProgress,
    [0.08, 0.4, 0.82, 1],
    reduceMotion ? [0, 0, 0, 0] : [0, 1, 1, 0]
  );
  // Exponential, not piecewise-linear. Approaching an object at constant speed
  // scales it geometrically, and keyframed segments would each hold a different
  // constant velocity — the jolt is at every segment boundary. This is smooth
  // across the whole range and needs no interior keyframes.
  const wordScale = useTransform(scrollYProgress, (progress) => {
    if (reduceMotion) return 1;
    const t = Math.min(Math.max((progress - WORD_START) / (1 - WORD_START), 0), 1);
    return WORD_SCALE_FROM * Math.pow(WORD_SCALE_TO / WORD_SCALE_FROM, t);
  });
  const wordBlur = useTransform(
    scrollYProgress,
    [0.08, 0.42, 0.8, 1],
    reduceMotion
      ? ["blur(0px)", "blur(0px)", "blur(0px)", "blur(0px)"]
      : ["blur(18px)", "blur(0px)", "blur(0px)", "blur(9px)"]
  );

  return (
    // The outer block is pure scroll runway. The scene inside pins to the top
    // and consumes it, so the first stretch of scrolling plays the sequence
    // instead of moving the page. motion-reduce collapses it to a plain hero.
    <section
      ref={sectionRef}
      className="relative h-[200svh] motion-reduce:h-svh"
    >
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden">
        {/* Scene */}
        <motion.div className="absolute inset-0" style={{ scale: sceneScale, y: sceneY }}>
          <Image
            src="/logo/huntr_header.png"
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="pointer-events-none select-none object-cover object-center"
          />
        </motion.div>

        {/* Contrast scrim — keeps the copy readable over the misty clearing */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(11,20,22,0.72)_0%,rgba(11,20,22,0.45)_38%,rgba(11,20,22,0.25)_65%)]" />

        {/* Depth — the further in, the darker it gets under the canopy */}
        <motion.div
          className="pointer-events-none absolute inset-0 bg-wolf-black"
          style={{ opacity: depthOpacity }}
        />

        {/* Wordmark rising out of the depth of field, behind the copy */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
          style={{ opacity: wordOpacity }}
        >
          <motion.span
            style={{
              scale: wordScale,
              filter: wordBlur,
              top: `-${INK_OFFSET_EM}em`,
              transformOrigin: `50% ${INK_ORIGIN_Y}`,
            }}
            className="relative select-none bg-gradient-to-b from-snow-peak via-snow-peak to-mist bg-clip-text text-[17vw] font-extrabold leading-none tracking-tighter text-transparent"
          >
            HUNTR
          </motion.span>
        </motion.div>

        {/* Seamless dissolve into the page background */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[38%]"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,20,22,0) 0%, rgba(11,20,22,0.55) 42%, rgba(11,20,22,0.88) 72%, var(--color-wolf-black) 100%)",
          }}
        />

        {/* Copy */}
        <motion.div
          className="relative z-10 flex flex-1 items-center justify-center px-4 pt-14 pb-40 sm:px-6"
          style={{ y: copyY, opacity: copyOpacity, pointerEvents: copyPointer }}
        >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex w-full max-w-2xl flex-col items-center text-center"
        >
          <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-snow-peak drop-shadow-[0_2px_24px_rgba(11,20,22,0.85)] sm:text-6xl lg:text-7xl">
            Stop Searching
            <br />
            Start{" "}
            <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent">
              Hunting
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-mist drop-shadow-[0_1px_12px_rgba(11,20,22,0.9)]">
            <b className="text-lg font-extrabold tracking-tight text-snow-peak">HUNTR</b>{" "}
            simplifies fundamental analysis for the modern value investor.
          </p>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="mt-8 flex w-full max-w-xl cursor-pointer items-center gap-2 rounded-xl border border-wolf-border/60 bg-wolf-black/55 p-2 shadow-xl shadow-wolf-black/40 backdrop-blur-md transition-colors hover:border-sunset-orange/50"
          >
            <div className="flex flex-1 items-center gap-2 px-2">
              <Search className="h-4 w-4 text-mist" />
              <span className="text-sm text-mist/70">Search ticker, company or signal...</span>
            </div>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sunset-orange px-4 text-sm font-semibold text-wolf-black">
              Start
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {[
              { icon: BarChart3, label: "Yahoo Finance" },
              { icon: Radio, label: "Real-time Data" },
              { icon: FileText, label: "SEC Filings" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-wolf-black/40 px-2.5 py-1.5 backdrop-blur-sm"
              >
                <Icon className="h-3.5 w-3.5 text-sunset-orange/70" />
                <span className="font-mono text-[10px] text-snow-peak/75">{label}</span>
              </div>
            ))}
          </div>

          {/* Mobile only — desktop gets this in the nav next to "Start Free"
              instead, where the trust badges have less room to spare. */}
          <div className="mt-3 flex justify-center sm:hidden">
            <KoFiSupport text="Support Huntr on Ko-fi" />
          </div>

            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} redirectTo={ROUTES.SIGNUP} />
          </motion.div>
        </motion.div>

        {/* Ticker tape — the gaps stay click-through, the chips themselves don't */}
        <motion.div
          className="group pointer-events-none absolute inset-x-0 bottom-8 z-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_88%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_88%,transparent_100%)]"
          style={{ opacity: copyOpacity, visibility: tapeVisibility }}
        >
          {/* Paused on hover so a moving chip is still a clickable target. */}
          <div className="flex w-max animate-huntr-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[...snippets, ...snippets].map((item, i) => (
              <TickerChip key={`${item.ticker}-${i}`} item={item} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
