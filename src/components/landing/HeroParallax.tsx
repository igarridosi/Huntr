"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowRight, Radio, FileText, BarChart3 } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { CommandPalette } from "@/components/search/command-palette";
import { ROUTES } from "@/lib/constants";

type StockSnippet = {
  ticker: string;
  category: string;
  logoUrl: string;
  points: number[];
};

const snippets: StockSnippet[] = [
  { ticker: "AAPL", category: "Technology", logoUrl: "https://cdn.tickerlogos.com/apple.com", points: [52, 55, 48, 58, 54, 63, 60, 67, 62, 70] },
  { ticker: "MSFT", category: "Software", logoUrl: "https://cdn.tickerlogos.com/microsoft.com", points: [44, 47, 45, 49, 53, 50, 56, 59, 57, 61] },
  { ticker: "NVDA", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/nvidia.com", points: [50, 58, 55, 46, 52, 49, 58, 72, 68, 64] },
  { ticker: "AMZN", category: "E-commerce", logoUrl: "https://cdn.tickerlogos.com/amazon.com", points: [61, 56, 60, 67, 55, 61, 52, 57, 61, 64] },
  { ticker: "GOOGL", category: "Communication", logoUrl: "https://cdn.tickerlogos.com/abc.xyz", points: [58, 46, 51, 49, 63, 69, 61, 64, 68, 73] },
  { ticker: "LLY", category: "Healthcare", logoUrl: "https://cdn.tickerlogos.com/lilly.com", points: [50, 52, 48, 55, 53, 58, 56, 61, 59, 64] },
  { ticker: "WMT", category: "Retail", logoUrl: "https://i5.walmartimages.com/dfw/63fd9f59-14e2/9d304ce6-96de-4331-b8ec-c5191226d378/v1/spark-icon.svg", points: [45, 47, 46, 49, 51, 48, 53, 55, 52, 57] },
  { ticker: "AVGO", category: "Semiconductors", logoUrl: "https://cdn.tickerlogos.com/broadcom.com", points: [46, 48, 59, 56, 50, 48, 55, 60, 57, 64] },
  { ticker: "TSLA", category: "Automotive", logoUrl: "https://cdn.tickerlogos.com/tesla.com", points: [60, 62, 69, 61, 61, 54, 57, 50, 53, 47] },
  { ticker: "JPM", category: "Financials", logoUrl: "https://cdn.tickerlogos.com/jpmorganchase.com", points: [46, 49, 47, 52, 50, 54, 53, 57, 55, 59] },
];

function toCoordinates(points: number[], width = 100, height = 28) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);

  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return { x, y };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function toLinePath(points: number[], width = 100, height = 28) {
  const coords = toCoordinates(points, width, height);
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;

  let path = `M${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;

  for (let index = 1; index < coords.length - 1; index += 1) {
    const midpointX = (coords[index].x + coords[index + 1].x) / 2;
    const midpointY = (coords[index].y + coords[index + 1].y) / 2;
    path += ` Q${coords[index].x.toFixed(2)} ${coords[index].y.toFixed(2)} ${midpointX.toFixed(2)} ${midpointY.toFixed(2)}`;
  }

  const last = coords[coords.length - 1];
  path += ` T${last.x.toFixed(2)} ${last.y.toFixed(2)}`;

  return path;
}

function toAreaPath(points: number[], width = 100, height = 28) {
  const linePath = toLinePath(points, width, height);
  return `${linePath} L${width} ${height} L0 ${height} Z`;
}

function StockCard({ item }: { item: StockSnippet }) {
  const gradientId = item.ticker.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.0 }}
      transition={{ duration: 0.15 }}
      className="rounded-xl border border-wolf-border/60 bg-wolf-surface/90 px-4 py-3 shadow-lg shadow-wolf-black/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <TickerLogo
            ticker={item.ticker}
            src={item.logoUrl}
            className="h-12 w-12"
            imageClassName="rounded"
            fallbackClassName="rounded text-[8px]"
          />
          <div>
            <p className="text-md font-bold text-snow-peak">{item.ticker}</p>
            <p className="text-xs font-mono text-mist mt-0.5">{item.category}</p>
          </div>
        </div>
      </div>

      <svg
        viewBox="0 0 90 28"
        preserveAspectRatio="none"
        className="mt-3 h-16 w-full"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={`spark-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF8C42" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`spark-stroke-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FFB070" stopOpacity="1" />
          </linearGradient>
        </defs>
        <line x1="0" y1="27.5" x2="100" y2="27.5" stroke="#22353A" strokeWidth="0.6" />
        <path d={toAreaPath(item.points)} fill={`url(#spark-fill-${gradientId})`} />
        <path d={toLinePath(item.points)} stroke={`url(#spark-stroke-${gradientId})`} strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

export function HeroParallax() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <section className="relative overflow-hidden border-0 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 min-h-[calc(100svh-64px)] flex items-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(22,34,37,0.7)_0%,rgba(11,20,22,1)_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-grid-white/[0.02] [mask-image:radial-gradient(ellipse_at_center,transparent_18%,transparent_34%,black_76%)] [-webkit-mask-image:radial-gradient(ellipse_at_center,transparent_18%,transparent_34%,black_76%)]" />

      <div className="relative z-10 mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.03fr)_minmax(0,0.97fr)] lg:gap-12 xl:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto flex w-full max-w-2xl flex-col justify-center lg:mx-0"
        >
          <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-snow-peak sm:text-6xl lg:text-7xl">
            Stop Searching
            <br />
            Start <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent">Hunting</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-mist sm:text-md">
            <b className="text-lg font-extrabold tracking-tight text-snow-peak">HUNTR</b> simplifies fundamental analysis for the modern value investor.
          </p>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="mt-8 flex w-full max-w-xl cursor-pointer items-center gap-2 rounded-xl border border-wolf-border/60 bg-wolf-surface/75 p-2 backdrop-blur-sm transition-colors hover:border-sunset-orange/40"
          >
            <div className="flex flex-1 items-center gap-2 px-2">
              <Search className="h-4 w-4 text-mist" />
              <span className="text-sm text-mist/60">
                Search ticker, company or signal...
              </span>
            </div>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sunset-orange px-4 text-sm font-semibold text-wolf-black">
              Start
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          <div className="mt-5 max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mist/50">
              Trusted Data
            </p>
            <p className="mt-1 text-xs text-mist/45">
              Market data powered by
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-wolf-surface/25 px-2.5 py-1.5 opacity-30">
                <BarChart3 className="h-3.5 w-3.5 text-snow-peak" />
                <span className="text-[10px] font-mono text-snow-peak/80">Yahoo Finance</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-wolf-surface/25 px-2.5 py-1.5 opacity-30">
                <Radio className="h-3.5 w-3.5 text-snow-peak" />
                <span className="text-[10px] font-mono text-snow-peak/80">Real-time Data</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-wolf-surface/25 px-2.5 py-1.5 opacity-30">
                <FileText className="h-3.5 w-3.5 text-snow-peak" />
                <span className="text-[10px] font-mono text-snow-peak/80">SEC Filings</span>
              </div>
            </div>
          </div>

          <CommandPalette
            open={searchOpen}
            onOpenChange={setSearchOpen}
            redirectTo={ROUTES.SIGNUP}
          />
        </motion.div>

        <div className="relative mx-auto w-full max-w-[620px] border-0 [perspective:1400px] lg:mx-0">
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-sunset-orange/20 blur-3xl" />

          <div className="relative h-[300px] sm:h-[340px] lg:h-[380px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:display-none [scrollbar-width:none] [-ms-overflow-style:none] [mask-image:linear-gradient(to_bottom,transparent_0%,black_8%,black_92%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_8%,black_92%,transparent_100%)]">
            <motion.div className="space-y-4 pr-2 [transform:rotate(-1.5deg)_skewY(6deg)] [transform-origin:18%_18%] sm:pr-4 lg:pr-6">
              {snippets.map((item) => (
                <StockCard key={item.ticker} item={item} />
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
