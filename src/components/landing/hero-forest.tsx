"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Search, ArrowRight, Radio, FileText, BarChart3 } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { KoFiSupport } from "@/components/ui/kofi-support";
import { TeaserDialog } from "@/components/landing/teaser-dialog";
import { ROUTES } from "@/lib/constants";
import { pinTotalReturn, priceSeries } from "@/components/landing/market-series";

// cmdk only matters once the palette opens, and it renders nothing while
// closed, so the chunk loads after hydration instead of with the page.
const CommandPalette = dynamic(
  () => import("@/components/search/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

/**
 * The header scenes being tried. Switching is this one line: HERO_SCENE.
 * - gradient: an abstract wave, full-bleed.
 * - hoplites: the illustration, framed (see FRAMED).
 * - forest: the original header, full-bleed.
 */
const HERO_SCENES = {
  // Full-bleed. The picture is the wave on a canvas widened by a quarter
  // (its own edges continued), so covering the viewport shows more of the
  // wave: further away without a frame. A phone shows a narrow slice of it:
  // aim that at the warm side.
  gradient: { src: "/logo/huntr_header_gradient_wide.webp", framed: false, position: "object-[18%_50%] md:object-center" },
  hoplites: { src: "/logo/huntr_header_hoplites_teal.webp", framed: true, position: "object-center" },
  forest: { src: "/logo/huntr_header.webp", framed: false, position: "object-center" },
} as const;
const HERO_SCENE: keyof typeof HERO_SCENES = "gradient";

/** Longest the entrance waits for the scene to decode before it plays anyway. */
const ENTRANCE_MAX_WAIT_MS = 1500;
const scene = HERO_SCENES[HERO_SCENE];

/**
 * A framed scene still fills a portrait screen. On a wide landscape one the
 * whole 16:9 picture shows, smaller than the viewport and centred in it, its
 * edges fading into the page, so it reads from further away.
 */
const FRAMED =
  "md:landscape:aspect-[2000/1131] md:landscape:h-auto md:landscape:w-[min(84vw,140svh)] md:landscape:[mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_55%,transparent_100%)]";

/** The scene's lower edge: opaque down to 58%, then an eased fade out. */
const SCENE_FADE =
  "linear-gradient(to bottom, black 0%, black 58%, rgba(0,0,0,0.93) 66%, rgba(0,0,0,0.78) 74%, rgba(0,0,0,0.55) 82%, rgba(0,0,0,0.3) 90%, rgba(0,0,0,0.1) 96%, transparent 100%)";

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

/**
 * Six months of sessions per name, with each name's own drift and volatility
 * (NVDA swings, WMT barely moves), from the realistic generator the
 * portfolio chart also uses, each pinned to where it ends.
 */
const SESSIONS = 126;
const tape = (seed: number, annualReturn: number, annualVol: number, sixMonths: number) =>
  pinTotalReturn(priceSeries(seed, SESSIONS, annualReturn, annualVol), sixMonths);

const snippets: StockSnippet[] = [
  { ticker: "AAPL", category: "Technology", logoUrl: "https://cdn.tickerlogos.com/apple.com", points: tape(101, 0.24, 0.26, 0.064) },
  { ticker: "MSFT", category: "Software", logoUrl: "https://cdn.tickerlogos.com/microsoft.com", points: tape(202, 0.28, 0.22, 0.112) },
  { ticker: "NVDA", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/nvidia.com", points: tape(303, 0.6, 0.48, 0.248) },
  { ticker: "AMZN", category: "E-commerce", logoUrl: "https://cdn.tickerlogos.com/amazon.com", points: tape(404, 0.22, 0.32, 0.091) },
  { ticker: "GOOGL", category: "Communication", logoUrl: "https://cdn.tickerlogos.com/abc.xyz", points: tape(505, 0.26, 0.29, 0.143) },
  { ticker: "LLY", category: "Healthcare", logoUrl: "https://cdn.tickerlogos.com/lilly.com", points: tape(606, 0.34, 0.3, 0.186) },
  { ticker: "WMT", category: "Retail", logoUrl: "https://i5.walmartimages.com/dfw/63fd9f59-14e2/9d304ce6-96de-4331-b8ec-c5191226d378/v1/spark-icon.svg", points: tape(707, 0.2, 0.17, 0.072) },
  { ticker: "AVGO", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/broadcom.com", points: tape(808, 0.4, 0.38, 0.214) },
  { ticker: "TSLA", category: "Automotive", logoUrl: "https://cdn.tickerlogos.com/tesla.com", points: tape(909, -0.3, 0.58, -0.127) },
  { ticker: "JPM", category: "Financials", logoUrl: "https://cdn.tickerlogos.com/jpmorganchase.com", points: tape(111, 0.18, 0.21, 0.089) },
];

/**
 * Straight-segment polyline, normalised to fill the box. One vertex per
 * session: the jagged closes are what make it read as a price.
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

/**
 * Compact card in the hero ticker tape — a signup entry point. The line
 * takes the series' own direction: orange when it ends higher, red when it
 * ends lower.
 */
function TickerChip({ item }: { item: StockSnippet }) {
  const gradientId = item.ticker.replace(/[^a-zA-Z0-9_-]/g, "-");
  const up = item.points[item.points.length - 1] >= item.points[0];
  const [from, to] = up ? ["#FF8C42", "#FFBF69"] : ["#FF4242", "#FF8C42"];

  return (
    <Link
      href={ROUTES.SIGNUP}
      aria-label={`Sign up to track ${item.ticker}`}
      className="pointer-events-auto mx-1.5 flex w-[220px] shrink-0 items-center gap-3 rounded-xl border border-wolf-border/50 bg-wolf-black/70 px-3 py-2.5 backdrop-blur-md transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-sunset-orange/50 hover:bg-wolf-surface/80"
    >
      <TickerLogo
        ticker={item.ticker}
        src={item.logoUrl}
        className="h-8 w-8"
        imageClassName="rounded-md"
        fallbackClassName="rounded-md text-[8px]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-snow-peak">{item.ticker}</p>
        <p className="truncate font-mono text-[10px] leading-tight text-mist">{item.category}</p>
      </div>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-16 shrink-0 self-center" fill="none" aria-hidden>
        <defs>
          <linearGradient id={`chip-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} stopOpacity="0.45" />
            <stop offset="100%" stopColor={to} stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={toLinePath(item.points)} stroke={`url(#chip-${gradientId})`} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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

  // Start the entrance once the page can give it every frame: React has
  // hydrated (this effect runs), the scene picture is decoded, and two frames
  // have gone by so its layers are painted. See the note in globals.css.
  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute("data-hero-ready")) return;
    let cancelled = false;

    const img = sectionRef.current?.querySelector<HTMLImageElement>("[data-hero-scene] img");
    const decoded = img
      ? img.complete
        ? img.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }).then(() => img.decode().catch(() => undefined))
      : Promise.resolve();
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, ENTRANCE_MAX_WAIT_MS));

    void Promise.race([decoded, timeout]).then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) root.setAttribute("data-hero-ready", "");
        })
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
        {/* Scene, with everything that tints it. Its lower part fades to
            transparent rather than to black, so the page's backdrop, which
            starts under the hero, shows through and the light carries on
            down the page instead of stopping at a black band. */}
        <div className="absolute inset-0" style={{ maskImage: SCENE_FADE, WebkitMaskImage: SCENE_FADE }}>
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ scale: sceneScale, y: sceneY }}
          >
            {/* Settles on arrival from slightly close, under the copy's
                entrance (transform only: see the note in globals.css). */}
            <div data-hero-scene className={`hero-scene-enter relative h-full w-full ${scene.framed ? FRAMED : ""}`}>
              <Image
                src={scene.src}
                alt=""
                aria-hidden
                fill
                priority
                sizes={scene.framed ? "(min-width: 768px) 84vw, 100vw" : "100vw"}
                className={`pointer-events-none select-none object-cover ${scene.position}`}
              />
            </div>
          </motion.div>

          {/* Fine grain over the scene: it keeps a soft gradient from banding
              and from looking flat, and the backdrop below shares it. */}
          <div className="huntr-grain pointer-events-none absolute inset-0 opacity-70 mix-blend-soft-light" />

          {/* The arrival: the scene starts dark and the light comes up as
              this lifts. A layer fading out, not a filter on the picture,
              so it stays smooth while the page hydrates. */}
          <div aria-hidden className="hero-veil pointer-events-none absolute inset-0 bg-wolf-black" />

          {/* Contrast scrim — keeps the copy readable over the misty clearing */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(11,20,22,0.72)_0%,rgba(11,20,22,0.45)_38%,rgba(11,20,22,0.25)_65%)]" />

          {/* Depth — the further in, the darker it gets under the canopy */}
          <motion.div
            className="pointer-events-none absolute inset-0 bg-wolf-black"
            style={{ opacity: depthOpacity }}
          />
        </div>

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

        {/* Copy */}
        <motion.div
          className="relative z-10 flex flex-1 items-center justify-center px-4 pt-14 pb-40 sm:px-6"
          style={{ y: copyY, opacity: copyOpacity, pointerEvents: copyPointer }}
        >
        {/* CSS entrances, not framer: the headline is the page's LCP and must
            not wait for hydration to become visible. It only rises — a fade
            from zero would keep it out of the LCP until the fade began — and
            the copy under it carries the fade. */}
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-snow-peak drop-shadow-[0_2px_24px_rgba(11,20,22,0.85)] sm:text-6xl lg:text-7xl">
            <span className="hero-headline-enter" style={{ "--d": "150ms" } as CSSProperties}>
              Stop Searching
            </span>
            <br />
            <span className="hero-headline-enter" style={{ "--d": "300ms" } as CSSProperties}>
              Start{" "}
              <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent">
                Hunting
              </span>
            </span>
          </h1>

          <p style={{ "--d": "500ms" } as CSSProperties} className="hero-rise mt-5 max-w-xl text-base leading-relaxed text-mist drop-shadow-[0_1px_12px_rgba(11,20,22,0.9)]">
            <b className="text-lg font-extrabold tracking-tight text-snow-peak">HUNTR</b>{" "}
            simplifies fundamental analysis for the modern value investor.
          </p>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            style={{ "--d": "620ms" } as CSSProperties}
            className="hero-rise mt-8 flex w-full max-w-xl cursor-pointer items-center gap-2 rounded-xl border border-wolf-border/60 bg-wolf-black/55 p-2 shadow-xl shadow-wolf-black/40 backdrop-blur-md transition-colors hover:border-sunset-orange/50"
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
            ].map(({ icon: Icon, label }, index) => (
              <div
                key={label}
                style={{ "--d": `${740 + index * 70}ms` } as CSSProperties}
                className="hero-rise inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-wolf-black/40 px-2.5 py-1.5 backdrop-blur-sm"
              >
                <Icon className="h-3.5 w-3.5 text-sunset-orange/70" />
                <span className="font-mono text-[10px] text-snow-peak/75">{label}</span>
              </div>
            ))}
          </div>

          <div style={{ "--d": "940ms" } as CSSProperties} className="hero-rise mt-5 flex justify-center">
            <TeaserDialog />
          </div>

          {/* Mobile only — desktop gets this in the nav next to "Start Free"
              instead, where the trust badges have less room to spare. */}
          <div style={{ "--d": "1000ms" } as CSSProperties} className="hero-rise mt-3 flex justify-center sm:hidden">
            <KoFiSupport text="Support Huntr on Ko-fi" />
          </div>

            {/* Without JS nothing sets data-hero-ready: play the entrance anyway. */}
            <noscript>
              <style>{`.hero-scene-enter,.hero-veil,.hero-headline-enter,.hero-rise,.hero-drop,.hero-slide-in{animation-play-state:running!important}`}</style>
            </noscript>

            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} redirectTo={ROUTES.SIGNUP} />
          </div>
        </motion.div>

        {/* Ticker tape — the gaps stay click-through, the chips themselves don't.
            The vertical padding leaves room for a chip lifted on hover, which
            overflow-hidden would otherwise clip. */}
        <motion.div
          className="group pointer-events-none absolute inset-x-0 bottom-6 z-10 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_88%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_12%,black_88%,transparent_100%)]"
          style={{ opacity: copyOpacity, visibility: tapeVisibility }}
        >
          {/* Paused on hover so a moving chip is still a clickable target. */}
          <div style={{ "--d": "1050ms" } as CSSProperties} className="hero-rise">
          <div className="flex w-max animate-huntr-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[...snippets, ...snippets].map((item, i) => (
              <TickerChip key={`${item.ticker}-${i}`} item={item} />
            ))}
          </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
