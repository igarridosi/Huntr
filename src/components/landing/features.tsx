import {
  Radar,
  Activity,
  Search,
  CalendarClock,
  CandlestickChart,
  RefreshCcw,
} from "lucide-react";

const features = [
  {
    icon: Radar,
    title: "Opportunity Radar Pro",
    description:
      "Top Gainers, Top Losers, Unusual Volume, Buyback Leaders, Breaking 52-Week High, and Income Leaders in one decision-ready panel.",
  },
  {
    icon: Activity,
    title: "Signals by Time Window",
    description:
      "Analyze momentum and risk across 1D, 1W, 1M, and YTD windows to spot opportunities before consensus.",
  },
  {
    icon: Search,
    title: "Command Palette + Fast Search",
    description:
      "Cmd/Ctrl + K to jump to any ticker instantly with logos, prefetch, and persistent recent searches.",
  },
  {
    icon: CandlestickChart,
    title: "Deep Symbol Analysis",
    description:
      "Actionable symbol view with price action, next earnings, global indices, and decision-ready KPI blocks.",
  },
  {
    icon: CalendarClock,
    title: "Earnings + Financial Statements",
    description:
      "Structured Income Statement, Balance Sheet, and Cash Flow views with metrics for valuation, quality, and dividend tracking.",
  },
  {
    icon: RefreshCcw,
    title: "Constant Product Improvement",
    description:
      "We continuously improve speed, data quality, and UX to deliver a stronger product every release.",
  },
];

/**
 * Features grid — 6 cards highlighting platform capabilities.
 */
export function Features() {
  return (
    <section className="relative px-6 py-24 max-w-6xl mx-auto">
      {/* Section header */}
      <div className="text-center space-y-3 mb-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-snow-peak tracking-tight">
          What You Can Do with HUNTR
        </h2>
        <p className="text-mist text-base sm:text-lg max-w-lg mx-auto">
          From discovery to deep financial analysis, everything is designed to help you move from idea to decision faster.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-xl border border-wolf-border/50 bg-wolf-surface/50 p-6 space-y-4 transition-all duration-300 hover:border-sunset-orange/40 hover:bg-wolf-surface"
          >
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sunset-orange/10 text-sunset-orange group-hover:bg-sunset-orange/20 transition-colors">
              <f.icon className="w-5 h-5" />
            </div>

            {/* Text */}
            <h3 className="text-base font-semibold text-snow-peak">
              {f.title}
            </h3>
            <p className="text-sm text-mist leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
