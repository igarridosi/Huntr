"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Hero section — "The Wolf of Value Street" landing.
 * Full-viewport height, centered, atmospheric.
 */
export function Hero() {
  const fadeInUp = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.25 as const },
    transition: { duration: 0.6, ease: "easeOut" as const },
  };

  return (
    <section className="relative min-h-[92vh] overflow-hidden px-6 pt-16 pb-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(22,34,37,0.72)_0%,rgba(11,20,22,1)_70%)]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <motion.div
          {...fadeInUp}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-wolf-border/60 bg-wolf-surface/60 px-4 py-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-sunset-orange animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-mist">
              The Wolf of Value Street
            </span>
          </div>

          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight text-snow-peak sm:text-6xl lg:text-7xl">
            Institutional-Grade
            <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent"> Stock Analysis</span>
            <br />
            for Tactical Investors
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-mist sm:text-lg">
            Señales premium, financials reales, radar de oportunidades y flujos de análisis
            diseñados para pasar de idea a decisión con precisión.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href={ROUTES.SIGNUP}>
              <Button size="lg" className="min-w-[200px] text-base font-bold shadow-lg shadow-sunset-orange/20">
                Start Free
              </Button>
            </Link>
            <Link href={ROUTES.LOGIN}>
              <Button variant="outline" size="lg" className="min-w-[200px] text-base">
                Explore Platform
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 34, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
          className="relative mx-auto mt-14 max-w-5xl"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-sunset-orange/20 blur-3xl" />

          <div className="[transform:perspective(1400px)_rotateX(15deg)] [transform-origin:center_top]">
            <MockDashboardPreview />
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-wolf-black to-transparent" />
    </section>
  );
}

function MockDashboardPreview() {
  return (
    <div className="rounded-2xl border border-wolf-border/60 bg-wolf-surface/70 p-4 shadow-2xl shadow-wolf-black/60 backdrop-blur-sm">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8 rounded-xl border border-wolf-border/50 bg-wolf-black/35 p-3">
          <div className="flex items-center justify-between border-b border-wolf-border/40 pb-2">
            <p className="text-sm font-semibold text-snow-peak">Insights Grid</p>
            <span className="rounded-md border border-sunset-orange/30 bg-sunset-orange/10 px-2 py-0.5 text-[10px] font-mono text-sunset-orange">12 / 447 ideas</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-wolf-border/40 bg-wolf-surface/65 p-2">
                <div className="h-2 w-10 rounded bg-wolf-border/80" />
                <div className="mt-2 h-2 w-16 rounded bg-wolf-border/60" />
                <div className="mt-3 h-4 w-12 rounded bg-sunset-orange/30" />
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 rounded-xl border border-wolf-border/50 bg-wolf-black/35 p-3">
          <div className="flex items-center justify-between border-b border-wolf-border/40 pb-2">
            <p className="text-sm font-semibold text-snow-peak">Opportunity Radar</p>
            <span className="rounded-md border border-wolf-border/50 px-2 py-0.5 text-[10px] font-mono text-mist">Pro</span>
          </div>
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-wolf-border/40 bg-wolf-surface/60 px-2.5 py-2">
                <div className="space-y-1">
                  <div className="h-2 w-12 rounded bg-wolf-border/80" />
                  <div className="h-2 w-20 rounded bg-wolf-border/60" />
                </div>
                <div className="h-3 w-12 rounded bg-sunset-orange/35" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
