import {
  BriefcaseBusiness,
  TrendingUp,
  PieChart,
  BarChart3,
  Layers,
  Target,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";

/** Headline figures the curve has to agree with. */
const PORTFOLIO_TOTAL_RETURN = 59.5;
const BENCHMARK_TOTAL_RETURN = 54.8;
/** Slightly aggressive book — moves more than the market in both directions. */
const PORTFOLIO_BETA = 1.18;

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
 * Tilts a walk by a straight line so it lands exactly on a target without
 * flattening the path in between — a Brownian bridge. Lets the curve stay a
 * genuine random walk while still ending on the number in the legend.
 */
function pinEndpoint(values: number[], target: number) {
  const last = values.length - 1;
  const drift = values[last];
  return values.map((value, i) => value - (drift * i) / last + (target * i) / last);
}

/**
 * A portfolio does not wander independently of the market: it inherits most of
 * the market's moves through its beta and adds its own idiosyncratic noise.
 * Two unrelated walks is what made the old pair read as invented — real curves
 * dip and rally together, and diverge only gradually.
 */
function buildPerformancePair(count = 132) {
  const random = mulberry32(20260815);
  const gaussian = () =>
    random() + random() + random() + random() + random() + random() - 3;

  const market: number[] = [0];
  const portfolio: number[] = [0];

  for (let i = 1; i < count; i += 1) {
    const marketShock = gaussian() * 1.15;
    const idiosyncratic = gaussian() * 0.7;

    market.push(market[i - 1] + marketShock);
    portfolio.push(portfolio[i - 1] + PORTFOLIO_BETA * marketShock + idiosyncratic);
  }

  return {
    portfolioTrend: pinEndpoint(portfolio, PORTFOLIO_TOTAL_RETURN),
    benchmarkTrend: pinEndpoint(market, BENCHMARK_TOTAL_RETURN),
  };
}

const { portfolioTrend, benchmarkTrend } = buildPerformancePair();

/** Shared scale — normalising each series alone would draw +54.8% as tall as
 *  +59.5% and make the comparison meaningless. */
const trendDomain = {
  min: Math.min(...portfolioTrend, ...benchmarkTrend),
  max: Math.max(...portfolioTrend, ...benchmarkTrend),
};

const holdings = [
  { ticker: "COST", pct: "50.7%" },
  { ticker: "SPOT", pct: "17.7%" },
  { ticker: "ASML", pct: "14.6%" },
  { ticker: "ADBE", pct: "12.4%" },
  { ticker: "JPM", pct: "4.6%" },
] as const;

const highlights = [
  { icon: TrendingUp, title: "Performance vs Benchmark", text: "Compare your curve against the market to understand real alpha." },
  { icon: PieChart, title: "Allocation Intelligence", text: "Instant sector and position concentration clarity." },
  { icon: BarChart3, title: "Top Holdings View", text: "Know what drives portfolio risk and returns at a glance." },
  { icon: Layers, title: "Clean Position Management", text: "Simple flows for adding, editing, and organizing positions." },
  { icon: Target, title: "Decision-First UX", text: "Built for quick daily reviews and disciplined portfolio tracking." },
] as const;

const sectorRows = [
  { label: "Consumer Defensive", pct: 50.7, color: "#4DC990" },
  { label: "Technology", pct: 27.0, color: "#3b82f6" },
  { label: "Communication Services", pct: 17.7, color: "#8b5cf6" },
  { label: "Financial Services", pct: 4.6, color: "#06b6d4" },
] as const;

const logoMap: Record<string, string> = {
  COST: "https://cdn.tickerlogos.com/costco.com",
  SPOT: "https://cdn.tickerlogos.com/spotify.com",
  ASML: "https://cdn.tickerlogos.com/asml.com",
  ADBE: "https://cdn.tickerlogos.com/adobe.com",
  JPM: "https://cdn.tickerlogos.com/jpmorganchase.com",
};

/** Plot area, matching the axis at y=210 and the top gridline at y=30. */
const PLOT_TOP = 10;
const PLOT_HEIGHT = 200;
const PLOT_WIDTH = 1000;
const AXIS_Y = PLOT_TOP + PLOT_HEIGHT;

/**
 * Plain polyline against a shared domain. At this point density the segments
 * already read as a curve, and the previous quadratic smoothing pinned each
 * control point to the *previous* y, which stair-stepped the line rather than
 * softening it.
 */
function seriesToPath(values: number[]): string {
  if (values.length < 2) return "";
  const range = Math.max(trendDomain.max - trendDomain.min, 1e-6);

  return values
    .map((value, idx) => {
      const x = (idx / (values.length - 1)) * PLOT_WIDTH;
      const y = PLOT_TOP + PLOT_HEIGHT - ((value - trendDomain.min) / range) * PLOT_HEIGHT;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function PortfoliosShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sunset-orange/30 bg-sunset-orange/12 text-sunset-orange">
          <BriefcaseBusiness className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            Portfolio Tracker, Built for Clarity
          </h2>
          <p className="mt-1 text-sm text-mist sm:text-base">
            A clean and intuitive workspace to track positions, compare performance, and monitor portfolio risk.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 mb-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-snow-peak">Portfolio Evolution</p>
          <div className="flex items-center gap-2">
            <span className="rounded border border-wolf-border/45 bg-wolf-black/25 px-2 py-1 text-[10px] text-sunset-orange">Portfolio +59.5%</span>
            <span className="rounded border border-wolf-border/45 bg-wolf-black/25 px-2 py-1 text-[10px] text-mist">S&P 500 +54.8%</span>
          </div>
        </div>

        <div className="rounded-xl border border-wolf-border/45 bg-wolf-black/20 p-3">
          <svg viewBox="0 0 1000 240" className="h-65 w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FF8C42" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="210" x2="1000" y2="210" stroke="#2A3B40" strokeWidth="1" />
            <line x1="0" y1="150" x2="1000" y2="150" stroke="#23363B" strokeWidth="0.8" strokeDasharray="4 4" />
            <line x1="0" y1="90" x2="1000" y2="90" stroke="#23363B" strokeWidth="0.8" strokeDasharray="4 4" />
            <line x1="0" y1="30" x2="1000" y2="30" stroke="#23363B" strokeWidth="0.8" strokeDasharray="4 4" />

            {/* non-scaling-stroke: the viewBox is stretched by preserveAspectRatio
                "none", which would otherwise thin the line wherever it runs
                steeply and thicken it on the flats. */}
            <path
              d={`${seriesToPath(portfolioTrend)} L${PLOT_WIDTH} ${AXIS_Y} L0 ${AXIS_Y} Z`}
              fill="url(#portfolio-fill)"
            />
            <path
              d={seriesToPath(benchmarkTrend)}
              stroke="#9CB0C8"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={seriesToPath(portfolioTrend)}
              stroke="#FF8C42"
              strokeWidth="2.25"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
          {[
            ["Market Value", "$191.97K", "text-sunset-orange"],
            ["Total Return", "+$87.87K", "text-[#4DC990]"],
            ["Today", "+$1.36", "text-[#4DC990]"],
            ["Cost Basis", "$114K", "text-golden-hour"],
          ].map((item) => (
            <div key={item[0]} className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
              <p className="text-[10px] uppercase tracking-wide text-mist">{item[0]}</p>
              <p className={`mt-1 text-2xl font-bold font-mono ${item[2]}`}>{item[1]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr] mb-5">
        <article className="rounded-xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <p className="text-sm font-semibold text-snow-peak mb-3">Sector Allocation</p>
          <div className="h-3 rounded-full bg-wolf-border/35 overflow-hidden flex mb-4">
            {sectorRows.map((row) => (
              <div key={row.label} className="h-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
            ))}
          </div>

          <div className="space-y-2">
            {sectorRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-wolf-border/35 bg-wolf-black/20 p-2.5">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-mist">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </span>
                  <span className="font-semibold text-snow-peak">{row.pct.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-wolf-border/35 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <p className="text-sm font-semibold text-snow-peak mb-3">Top Holdings</p>
          <div className="space-y-2">
            {holdings.map((h) => (
              <div key={h.ticker} className="flex items-center justify-between rounded-lg border border-wolf-border/35 bg-wolf-black/25 px-3 py-2">
                <span className="inline-flex items-center gap-2 font-mono text-sm text-snow-peak">
                  <TickerLogo ticker={h.ticker} src={logoMap[h.ticker]} className="h-6 w-6" imageClassName="rounded-md" fallbackClassName="rounded-md text-[9px]" />
                  {h.ticker}
                </span>
                <span className="text-xs text-mist">{h.pct}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {highlights.map((item) => (
          <article
            key={item.title}
            className="rounded-xl border border-wolf-border/50 bg-wolf-surface/45 p-5"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sunset-orange/12 text-sunset-orange">
              <item.icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-base font-semibold text-snow-peak">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
