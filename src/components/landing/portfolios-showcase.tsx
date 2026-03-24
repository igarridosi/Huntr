import {
  BriefcaseBusiness,
  Plus,
  Pencil,
  PieChart,
  Download,
  Upload,
  Activity,
} from "lucide-react";

const highlights = [
  {
    icon: Plus,
    title: "Fast Position Entry",
    text: "Add positions in seconds with ticker search, shares, average cost, and purchase date.",
  },
  {
    icon: Pencil,
    title: "Position Editing",
    text: "Adjust lots and notes quickly to keep your portfolio state accurate and actionable.",
  },
  {
    icon: PieChart,
    title: "Allocation Snapshot",
    text: "Understand concentration and exposure with clean visual summaries and intuitive layouts.",
  },
  {
    icon: Activity,
    title: "Performance Context",
    text: "Track gains, losses, and trend context without spreadsheet friction.",
  },
  {
    icon: Upload,
    title: "Import Ready",
    text: "Bring data from your broker formats and start tracking immediately.",
  },
  {
    icon: Download,
    title: "Export Friendly",
    text: "Download and move your data whenever needed with practical workflow support.",
  },
] as const;

export function PortfoliosShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sunset-orange/30 bg-sunset-orange/12 text-sunset-orange">
          <BriefcaseBusiness className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            Portfolio Tracker That Feels Effortless
          </h2>
          <p className="mt-1 text-sm text-mist sm:text-base">
            Built for speed and clarity so you can manage holdings without spreadsheet overload.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
