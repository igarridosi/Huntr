"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Repeat2,
  TrendingUp,
  Lock,
} from "lucide-react";

function SignalLine() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-wolf-border/35 bg-wolf-black/25 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-sunset-orange/70" />
        <span className="h-2 w-16 rounded bg-wolf-border/80" />
      </div>
      <span className="h-2 w-10 rounded bg-wolf-border/60" />
    </div>
  );
}

function RadarCard({
  title,
  icon,
}: {
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-wolf-surface/50 p-3.5 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-mist">{title}</h3>
        {icon}
      </div>

      <div
        className="premium-veiled relative overflow-hidden rounded-xl border border-wolf-border/40 bg-wolf-black/20 p-2.5"
        data-premium-locked="true"
      >
        <div className="premium-veiled-content select-none space-y-1.5" aria-hidden>
          {Array.from({ length: 4 }).map((_, idx) => (
            <SignalLine key={`${title}-${idx}`} />
          ))}
        </div>

        <div className="absolute inset-0 bg-gradient-to-br from-wolf-black/45 via-transparent to-wolf-black/55 backdrop-blur-[5px]" aria-hidden />
        <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-sunset-orange/35 bg-sunset-orange/15 px-2 py-1 text-[10px] font-semibold text-sunset-orange">
          <Lock className="h-3 w-3" />
          Premium Locked
        </div>
      </div>
    </article>
  );
}

export function Preview() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-8 -z-10 h-[520px] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(255,140,66,0.13)_0%,transparent_70%)] blur-[120px]"
      />

      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak">Opportunity Radar</h2>
          <p className="mt-2 text-base text-mist">
            Exclusive radar clusters designed to surface high-conviction opportunities before broad market attention.
          </p>
        </div>
        <span className="rounded border border-white/10 bg-wolf-surface/50 px-2.5 py-1 text-[10px] font-mono text-sunset-orange backdrop-blur-md">
          PRO FEED
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <RadarCard title="Top Gainers" icon={<ArrowUpRight className="h-4 w-4 text-bullish" />} />
        <RadarCard title="Top Losers" icon={<ArrowDownRight className="h-4 w-4 text-bearish" />} />
        <RadarCard title="Income Leaders" icon={<DollarSign className="h-4 w-4 text-golden-hour" />} />
        <RadarCard title="Unusual Volume" icon={<AlertTriangle className="h-4 w-4 text-sunset-orange" />} />
        <RadarCard title="Buyback Leaders" icon={<Repeat2 className="h-4 w-4 text-bullish" />} />
        <RadarCard title="Breaking 52W High" icon={<TrendingUp className="h-4 w-4 text-sunset-orange" />} />
      </div>

      <p className="mt-4 text-center text-xs text-mist/55">
        Landing preview intentionally uses conceptual visuals only. No real premium values are exposed.
      </p>
    </section>
  );
}
