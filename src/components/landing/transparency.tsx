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

export function Transparency() {
  return (
    <section id="support" className="relative mx-auto max-w-6xl px-6 py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_20%,rgba(77,201,144,0.1),transparent_38%),radial-gradient(circle_at_78%_80%,rgba(255,140,66,0.12),transparent_45%)]" />

      <div className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-6 sm:p-8 backdrop-blur-md">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-wolf-black/35 px-3 py-1 text-[11px] uppercase tracking-wider text-mist">
            <ShieldCheck className="h-3.5 w-3.5 text-[#4DC990]" />
            Product Transparency
          </div>

          <h2 className="mt-4 text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            Built in public. Improved every week.
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-mist sm:text-base">
            We are sorry if you experience delays while searching stocks or loading earnings data.
            Our current stack uses free APIs in order to keep HUNTR accessible for everyone. As the project grows,
            we will keep reinvesting into premium data and faster infrastructure.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {notes.map((note) => (
            <article
              key={note.title}
              className="rounded-xl border border-wolf-border/45 bg-wolf-black/30 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sunset-orange/12 text-sunset-orange">
                  <note.icon className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold text-snow-peak">{note.title}</h3>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-mist sm:text-sm">{note.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-6 text-xs text-mist/75 sm:text-sm">
          If this product helps your workflow and you have the flexibility to contribute, your support will directly
          accelerate performance, data quality, and feature delivery for the whole community.
        </p>

        <div className="mt-4">
          <KoFiSupport text="Support Huntr on Ko-fi" />
        </div>
      </div>
    </section>
  );
}
