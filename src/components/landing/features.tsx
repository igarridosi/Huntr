import type { ReactNode } from "react";
import {
  Radar,
  Calculator,
  ChartColumnStacked,
  LineChart,
  CalendarClock,
  BriefcaseBusiness,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";

/*
 * Each card carries a small, static picture of what the module shows. They
 * are illustrations (aria-hidden), not data: the numbers only have to look
 * like the real screens.
 */

function RadarVisual() {
  const rows = [
    { signal: "Unusual Volume", ticker: "NVDA", value: "3.2× avg" },
    { signal: "Breaking 52W High", ticker: "COST", value: "+1.8%" },
    { signal: "Buyback Leaders", ticker: "AAPL", value: "3.4% yield" },
  ];
  return (
    <div aria-hidden className="space-y-2">
      {rows.map((row, i) => (
        <div
          key={row.signal}
          className="flex items-center justify-between gap-3 rounded-lg border border-wolf-border/40 bg-wolf-black/50 px-3 py-2"
          style={{ opacity: 1 - i * 0.18 }}
        >
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-mist">{row.signal}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-bold text-snow-peak">{row.ticker}</span>
            <span className="font-mono text-[11px] text-golden-hour">{row.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** A Monte Carlo distribution of fair values, with the price and the median. */
function DcfVisual() {
  const bars = [4, 7, 12, 19, 28, 38, 46, 50, 47, 40, 31, 22, 15, 9, 5, 3];
  return (
    <div aria-hidden className="relative h-20">
      <div className="flex h-full items-end gap-[3px]">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${i >= 6 && i <= 9 ? "bg-sunset-orange" : "bg-sunset-orange/35"}`}
            style={{ height: `${h * 2}%` }}
          />
        ))}
      </div>
      <div className="absolute inset-y-0 left-[30%] border-l border-dashed border-snow-peak/50" />
      <span className="absolute -top-1 left-[30%] ml-1.5 font-mono text-[9px] uppercase tracking-wider text-mist">price</span>
    </div>
  );
}

/** Quarterly revenue of two companies, side by side, as the builder draws it. */
function ChartBuilderVisual() {
  const quarters = [
    [62, 48],
    [66, 51],
    [70, 55],
    [74, 60],
    [79, 66],
    [85, 71],
  ];
  return (
    <div aria-hidden>
      <div className="flex h-20 items-end gap-2.5 border-b border-wolf-border/50 pb-px">
        {quarters.map(([a, b], i) => (
          <div key={i} className="flex h-full flex-1 items-end gap-[2px]">
            <div className="flex-1 rounded-t-sm bg-sunset-orange" style={{ height: `${a}%` }} />
            <div className="flex-1 rounded-t-sm bg-[#47707A]" style={{ height: `${b}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-mist">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sunset-orange" />MSFT</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#47707A]" />GOOGL</span>
        <span className="ml-auto">Revenue · quarterly</span>
      </div>
    </div>
  );
}

/** The head of a stock's page: the quote and the tabs under it. */
function SymbolVisual() {
  const tabs = ["Overview", "Financials", "Valuation", "Dividends", "Earnings"];
  return (
    <div aria-hidden className="rounded-lg border border-wolf-border/50 bg-wolf-black/50 p-3">
      <div className="flex items-center gap-2.5">
        <TickerLogo ticker="AAPL" src="https://cdn.tickerlogos.com/apple.com" className="h-7 w-7" imageClassName="rounded-md" fallbackClassName="rounded-md text-[8px]" />
        <div className="flex-1">
          <p className="text-xs font-bold leading-tight text-snow-peak">AAPL</p>
          <p className="text-[10px] leading-tight text-mist">Apple Inc.</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-bold text-snow-peak">$229.87</p>
          <p className="font-mono text-[10px] text-bullish">+1.24%</p>
        </div>
      </div>
      <div className="mt-3 flex gap-1 overflow-hidden">
        {tabs.map((t, i) => (
          <span
            key={t}
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] ${i === 0 ? "bg-sunset-orange/15 text-sunset-orange" : "text-mist"}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A week of reports: before the open and after the close. */
function EarningsVisual() {
  const days = [
    { day: "Mon", pre: 2, post: 3 },
    { day: "Tue", pre: 4, post: 2 },
    { day: "Wed", pre: 3, post: 5 },
    { day: "Thu", pre: 5, post: 4 },
    { day: "Fri", pre: 1, post: 1 },
  ];
  return (
    <div aria-hidden className="grid grid-cols-5 gap-1.5">
      {days.map((d) => (
        <div key={d.day} className="rounded-md border border-wolf-border/40 bg-wolf-black/50 px-1 py-1.5 text-center">
          <p className="font-mono text-[9px] uppercase text-mist">{d.day}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-[3px]">
            {Array.from({ length: d.pre }).map((_, i) => (
              <span key={`pre-${i}`} className="h-1.5 w-1.5 rounded-full bg-golden-hour" />
            ))}
            {Array.from({ length: d.post }).map((_, i) => (
              <span key={`post-${i}`} className="h-1.5 w-1.5 rounded-full bg-sunset-orange/60" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioVisual() {
  const slices = [
    { pct: 50.7, className: "bg-sunset-orange" },
    { pct: 27, className: "bg-golden-hour" },
    { pct: 17.7, className: "bg-[#47707A]" },
    { pct: 4.6, className: "bg-mist" },
  ];
  return (
    <div aria-hidden className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {slices.map((s) => (
          <div key={s.pct} className={s.className} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-bold text-snow-peak">$191.97K</span>
        <span className="font-mono text-xs text-bullish">+59.5%</span>
      </div>
    </div>
  );
}

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  visual?: ReactNode;
  /** Grid placement on md and up (6 columns). */
  span: string;
  /** Text beside the picture rather than above it, on lg and up. */
  wide?: boolean;
};

const features: Feature[] = [
  {
    icon: Radar,
    title: "Opportunity Radar",
    description:
      "Top Gainers, Top Losers, Unusual Volume, Buyback Leaders, Breaking 52-Week High, and Income Leaders in one decision-ready panel.",
    visual: <RadarVisual />,
    span: "md:col-span-6 lg:col-span-4",
    wide: true,
  },
  {
    icon: Calculator,
    title: "DCF Calculator",
    description:
      "Run scenario-based valuation, Monte Carlo distributions, and sensitivity matrices to build stronger fair-value theses.",
    visual: <DcfVisual />,
    span: "md:col-span-3 lg:col-span-2",
  },
  {
    icon: LineChart,
    title: "Stock Deep Dive",
    description:
      "Every ticker gets its own page: overview, financials, valuation, dividends, and earnings, one tab apart.",
    visual: <SymbolVisual />,
    span: "md:col-span-3 lg:col-span-2",
  },
  {
    icon: ChartColumnStacked,
    title: "Chart Builder",
    description:
      "Compose fundamental charts, compare companies side by side, and export them ready to share.",
    visual: <ChartBuilderVisual />,
    span: "md:col-span-3 lg:col-span-2",
  },
  {
    icon: CalendarClock,
    title: "Earnings",
    description:
      "Navigate weekly earnings flow, pre/post-market buckets, estimate trends, and surprise history in one focused view.",
    visual: <EarningsVisual />,
    span: "md:col-span-3 lg:col-span-2",
  },
  {
    icon: BriefcaseBusiness,
    title: "Portfolios",
    description:
      "Track positions, P&L, sector allocation, and top holdings with a simple interface built for daily decision speed.",
    visual: <PortfolioVisual />,
    span: "md:col-span-6 lg:col-span-4",
    wide: true,
  },
];

/**
 * Features — a bento of the platform's main sections. The radar leads and
 * the portfolios close, wider and with their picture beside the text; the
 * rest sit at one third.
 */
export function Features() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24">
      {/* Section header */}
      <div className="mb-12 grid gap-6 md:grid-cols-2 md:items-end">
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-sunset-orange">The toolkit</p>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            What You Can Do with HUNTR
          </h2>
        </div>
        <p className="max-w-xl text-base leading-relaxed text-mist md:justify-self-end">
          The most important modules for modern stock research: opportunity discovery, valuation rigor, earnings context,
          and portfolio decision workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {features.map((f, i) => (
          <article
            key={f.title}
            className={`huntr-grain group relative flex flex-col overflow-hidden rounded-2xl border border-wolf-border/50 bg-wolf-surface/40 p-6 transition-colors duration-300 hover:border-sunset-orange/40 hover:bg-wolf-surface/70 ${f.span} ${f.wide ? "lg:flex-row lg:items-center lg:gap-8" : ""}`}
          >
            {/* The orange of the header's armour, warming the card from a corner on hover */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sunset-orange/0 blur-3xl transition-colors duration-500 group-hover:bg-sunset-orange/15" />

            <div className={`relative ${f.wide ? "lg:w-1/2" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sunset-orange/25 bg-sunset-orange/10 text-sunset-orange transition-colors group-hover:bg-sunset-orange/20">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-[11px] text-mist/60">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-snow-peak">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{f.description}</p>
            </div>

            {f.visual && (
              <div className={`relative ${f.wide ? "mt-6 lg:mt-0 lg:w-1/2" : "mt-auto pt-6"}`}>{f.visual}</div>
            )}
          </article>
        ))}

        {/* Beside the portfolio card, closing the last row */}
        <article className="huntr-grain relative flex flex-col overflow-hidden rounded-2xl border border-wolf-border/50 bg-wolf-surface/40 p-6 md:col-span-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sunset-orange/25 bg-sunset-orange/10 text-sunset-orange">
              <RefreshCcw className="h-5 w-5" />
            </span>
            <span className="font-mono text-[11px] text-mist/60">07</span>
          </div>
          <h3 className="mt-5 text-lg font-semibold text-snow-peak">Constant Product Improvement</h3>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            We continuously improve speed, data quality, and UX to deliver a stronger product every release.
          </p>
        </article>
      </div>
    </section>
  );
}
