import { CalendarClock, FileClock, Sparkles, LoaderCircle } from "lucide-react";

const cards = [
  {
    title: "Earnings Calendar",
    text: "Track upcoming results, expected EPS, and reporting cadence to prepare your next move before announcements.",
    icon: CalendarClock,
  },
  {
    title: "Quarterly Context",
    text: "Review historical beats/misses with clean context so you can compare the current setup against prior cycles.",
    icon: FileClock,
  },
  {
    title: "Signal Prioritization",
    text: "Separate noise from meaningful events using workflow-friendly cards focused on decision relevance.",
    icon: Sparkles,
  },
] as const;

export function EarningsShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            Earnings Intelligence
          </h2>
          <p className="mt-2 text-sm text-mist sm:text-base">
            Designed to reduce guesswork around earnings season and focus your attention on high-impact signals.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-surface/40 px-2 py-1 text-[10px] font-mono text-mist">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          Live Pipeline
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="rounded-xl border border-wolf-border/50 bg-wolf-surface/45 p-5"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sunset-orange/12 text-sunset-orange">
              <card.icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-base font-semibold text-snow-peak">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">{card.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
