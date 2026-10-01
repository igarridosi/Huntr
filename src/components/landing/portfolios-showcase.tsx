import {
  BriefcaseBusiness,
  TrendingUp,
  PieChart,
  BarChart3,
  Layers,
  Target,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { dailyReturns, pinTotalReturn, toPrices } from "@/components/landing/market-series";

/** Headline figures the curve has to agree with. */
const PORTFOLIO_TOTAL_RETURN = 59.5;
const BENCHMARK_TOTAL_RETURN = 54.8;
/** Slightly aggressive book — moves more than the market in both directions. */
const PORTFOLIO_BETA = 1.18;

/**
 * Three years of sessions. The market follows the realistic generator
 * (compounding, volatility in clusters, fat tails); the portfolio takes the
 * market's moves through its beta plus its own noise, so the two dip and
 * rally together and drift apart only slowly, as real curves do. Both are
 * then pinned, in log space, to the returns in the legend.
 */
function buildPerformancePair(sessions = 756) {
  const market = dailyReturns(20260815, sessions, 0.15, 0.17);
  const own = dailyReturns(41, sessions, 0, 0.1);
  const portfolio = market.map((r, i) => PORTFOLIO_BETA * r + own[i]);

  const asPercent = (prices: number[]) => prices.map((p) => (p / prices[0] - 1) * 100);
  return {
    portfolioTrend: asPercent(pinTotalReturn(toPrices(portfolio), PORTFOLIO_TOTAL_RETURN / 100)),
    benchmarkTrend: asPercent(pinTotalReturn(toPrices(market), BENCHMARK_TOTAL_RETURN / 100)),
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

/** The palette of the header illustration, largest weight first. */
const sectorRows = [
  { label: "Consumer Defensive", pct: 50.7, color: "#FF8C42" },
  { label: "Technology", pct: 27.0, color: "#FFBF69" },
  { label: "Communication Services", pct: 17.7, color: "#47707A" },
  { label: "Financial Services", pct: 4.6, color: "#8C9DA1" },
] as const;

/**
 * The figures agree with each other and with the legend: market value over
 * cost basis is the +59.5% the curve ends on, and the sector weights are the
 * holdings' (ASML and ADBE make Technology's 27%).
 */
const MARKET_VALUE = 191_970;
const COST_BASIS = MARKET_VALUE / (1 + PORTFOLIO_TOTAL_RETURN / 100);
const TOTAL_RETURN = MARKET_VALUE - COST_BASIS;
const TODAY = 1_362;

const usdK = (value: number, sign = false) =>
  `${sign && value >= 0 ? "+" : ""}$${(value / 1000).toFixed(2)}K`;

const stats = [
  { label: "Market Value", value: usdK(MARKET_VALUE), note: "4 sectors · 5 positions", tone: "text-snow-peak" },
  { label: "Total Return", value: usdK(TOTAL_RETURN, true), note: `+${PORTFOLIO_TOTAL_RETURN}%`, tone: "text-bullish" },
  { label: "Today", value: usdK(TODAY, true), note: `+${((TODAY / MARKET_VALUE) * 100).toFixed(2)}%`, tone: "text-bullish" },
  { label: "Cost Basis", value: usdK(COST_BASIS), note: "average cost", tone: "text-golden-hour" },
] as const;

/** Percent labels for the dashed gridlines, from the shared domain. */
function gridLabel(y: number) {
  const value = trendDomain.min + ((PLOT_TOP + PLOT_HEIGHT - y) / PLOT_HEIGHT) * (trendDomain.max - trendDomain.min);
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
}

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

/** Plain polyline against a shared domain: one vertex per session. */
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
    <section className="relative mx-auto max-w-6xl px-6 py-16">
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

      <div className="huntr-grain mb-5 rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-snow-peak">Portfolio Evolution</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Since inception</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-sunset-orange/30 bg-sunset-orange/10 px-2 py-1 font-mono text-[11px] text-sunset-orange">
              <span className="h-1.5 w-1.5 rounded-full bg-sunset-orange" />
              Portfolio +{PORTFOLIO_TOTAL_RETURN}%
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-wolf-border/45 bg-wolf-black/30 px-2 py-1 font-mono text-[11px] text-mist">
              <span className="h-1.5 w-1.5 rounded-full bg-[#9CB0C8]" />
              S&P 500 +{BENCHMARK_TOTAL_RETURN}%
            </span>
          </div>
        </div>

        <div className="relative rounded-xl border border-wolf-border/45 bg-wolf-black/30 p-3 pl-12">
          {/* Gridline values, outside the stretched SVG so the text keeps its shape */}
          {[30, 90, 150, 210].map((y) => (
            <span
              key={y}
              aria-hidden
              className="absolute left-2 -translate-y-1/2 font-mono text-[9px] text-mist/70"
              style={{ top: `calc(0.75rem + (100% - 1.5rem) * ${y / 240})` }}
            >
              {gridLabel(y)}
            </span>
          ))}
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
              strokeWidth="1.25"
              strokeOpacity="0.85"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={seriesToPath(portfolioTrend)}
              stroke="#FF8C42"
              strokeWidth="1.6"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-mist">{item.label}</p>
              <p className={`mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl ${item.tone}`}>{item.value}</p>
              <p className="mt-0.5 font-mono text-[10px] text-mist/80">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="huntr-grain rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-snow-peak">Sector Allocation</p>
          <div className="mb-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {sectorRows.map((row) => (
              <div key={row.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
            ))}
          </div>

          <ul className="divide-y divide-wolf-border/40">
            {sectorRows.map((row) => (
              <li key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-mist">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-snow-peak">{row.pct.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-wolf-border/35">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="huntr-grain rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-snow-peak">Top Holdings</p>
          <ul className="space-y-2">
            {holdings.map((h) => (
              <li key={h.ticker} className="relative overflow-hidden rounded-lg border border-wolf-border/35 bg-wolf-black/30 px-3 py-2">
                {/* The position's weight, as a wash behind the row */}
                <div aria-hidden className="absolute inset-y-0 left-0 bg-sunset-orange/10" style={{ width: h.pct }} />
                <div className="relative flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-mono text-sm text-snow-peak">
                    <TickerLogo ticker={h.ticker} src={logoMap[h.ticker]} className="h-6 w-6" imageClassName="rounded-md" fallbackClassName="rounded-md text-[9px]" />
                    {h.ticker}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-mist">{h.pct}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {/* What it is for, as one strip rather than five more cards */}
      {/* Hairlines: the 1px gaps show the border colour behind the cells. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-wolf-border/50 bg-wolf-border/40 sm:grid-cols-2 lg:grid-cols-5">
        {highlights.map((item) => (
          <article key={item.title} className="bg-wolf-black p-5 sm:last:col-span-2 lg:last:col-span-1">
            <item.icon className="h-4 w-4 text-sunset-orange" />
            <h3 className="mt-3 text-sm font-semibold text-snow-peak">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-mist">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
