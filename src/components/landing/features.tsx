import {
  Radar,
  Calculator,
  Search,
  CalendarClock,
  BriefcaseBusiness,
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
    icon: Calculator,
    title: "DCF + Monte Carlo Engine",
    description:
      "Run scenario-based valuation, probabilistic distributions, and sensitivity matrices to build stronger fair-value theses.",
  },
  {
    icon: Search,
    title: "Command Palette + Fast Search",
    description:
      "Cmd/Ctrl + K to jump to any ticker instantly with logos, prefetch, and persistent recent searches.",
  },
  {
    icon: CalendarClock,
    title: "Earnings Intelligence Workspace",
    description:
      "Navigate weekly earnings flow, pre/post-market buckets, estimate trends, and surprise history in one focused view.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Portfolio Tracker",
    description:
      "Track positions, P&L, sector allocation, and top holdings with a simple interface built for daily decision speed.",
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
        <p className="text-mist text-base sm:text-lg max-w-2xl mx-auto">
          The most important modules for modern stock research: opportunity discovery, valuation rigor, earnings context,
          and portfolio decision workflows.
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
