import { Clock3, HeartHandshake, Rocket, Wrench, ShieldCheck } from "lucide-react";
import { KoFiSupport } from "@/components/ui/kofi-support";

const notes = [
  {
    icon: Clock3,
    title: "Why some pages may load slower",
    body:
      "We currently rely on free market-data APIs for parts of stock search and earnings history. Because of provider limits and response variability, some requests can take longer than expected.",
  },
  {
    icon: Wrench,
    title: "Constant improvement mode",
    body:
      "HUNTR is under active development every week. We continuously optimize caching, data mapping, and UI flows to deliver a faster and more reliable product release after release.",
  },
  {
    icon: HeartHandshake,
    title: "How community support is used",
    body:
      "Every donation goes directly into infrastructure and product quality: paid APIs, performance upgrades, and new features that improve reliability across the whole platform.",
  },
  {
    icon: Rocket,
    title: "Built by one junior developer",
    body:
      "This platform is designed and built end-to-end by a single junior developer with one mission: make high-quality stock research accessible to people who cannot afford expensive terminals.",
  },
] as const;

/**
 * A letter rather than a feature grid: the statement and the ask on the
 * left, the four notes as a numbered list on the right.
 */
export function Transparency() {
  return (
    <section id="support" className="relative mx-auto max-w-6xl px-6 py-20">
      <div className="huntr-grain relative overflow-hidden rounded-3xl border border-wolf-border/50 bg-wolf-surface/40">
        {/* Warm light from the corner the ask sits in */}
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-sunset-orange/15 blur-[100px]" />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col p-6 sm:p-10">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sunset-orange/30 bg-sunset-orange/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-sunset-orange">
              <ShieldCheck className="h-3.5 w-3.5" />
              Product Transparency
            </div>

            <h2 className="mt-5 text-3xl font-bold leading-[1.1] tracking-tight text-snow-peak sm:text-[2.75rem]">
              Built in public.
              <br />
              <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent">
                Improved every week.
              </span>
            </h2>

            <p className="mt-5 text-sm leading-relaxed text-mist sm:text-base">
              We are sorry if you experience delays while searching stocks or loading earnings data. Our current stack
              uses free APIs in order to keep HUNTR accessible for everyone. As the project grows, we will keep
              reinvesting into premium data and faster infrastructure.
            </p>

            <div className="mt-auto pt-8">
              <p className="text-xs leading-relaxed text-mist/80 sm:text-sm">
                If this product helps your workflow and you have the flexibility to contribute, your support will
                directly accelerate performance, data quality, and feature delivery for the whole community.
              </p>
              <div className="mt-4">
                <KoFiSupport text="Support Huntr on Ko-fi" />
              </div>
            </div>
          </div>

          <ol className="divide-y divide-wolf-border/40 border-t border-wolf-border/40 bg-wolf-black/30 lg:border-l lg:border-t-0">
            {notes.map((note, i) => (
              <li key={note.title} className="flex gap-4 p-6 sm:px-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sunset-orange/25 bg-sunset-orange/10 text-sunset-orange">
                    <note.icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-[10px] text-mist/60">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-snow-peak sm:text-base">{note.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-mist sm:text-sm">{note.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
