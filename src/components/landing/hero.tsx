"use client";

import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Hero section — "The Wolf of Value Street" landing.
 * Full-viewport height, centered, atmospheric.
 */
export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Atmospheric glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sunset-orange/[0.06] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[20%] right-[10%] w-[300px] h-[300px] rounded-full bg-golden-hour/[0.04] blur-[100px]"
      />

      {/* Content */}
      <div className="relative z-10 max-w-3xl text-center space-y-8">
        {/* Brand Mark */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-wolf-border/60 bg-wolf-surface/60 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-sunset-orange animate-pulse" />
          <span className="text-xs text-mist font-medium tracking-wider uppercase">
            Financial Intelligence Platform
          </span>
        </div>

        {/* Title */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
          <span className="text-snow-peak">Hunt for </span>
          <span className="bg-gradient-to-r from-sunset-orange to-golden-hour bg-clip-text text-transparent">
            Value
          </span>
          <br />
          <span className="text-snow-peak">with Precision</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-mist max-w-xl mx-auto leading-relaxed">
          Análisis financiero táctico para inversores exigentes.
          Métricas clave, gráficos detallados y watchlists inteligentes —
          todo en una interfaz que respira elegancia.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link href={ROUTES.SIGNUP}>
            <Button size="lg" className="min-w-[180px] text-base font-bold shadow-lg shadow-sunset-orange/20">
              Start Hunting
            </Button>
          </Link>
          <Link href={ROUTES.LOGIN}>
            <Button variant="outline" size="lg" className="min-w-[180px] text-base">
              Sign In
            </Button>
          </Link>
        </div>

        {/* Trust line */}
        <p className="text-xs text-mist/60 pt-2">
          13 tickers · 10 años de financials · Gratis durante la beta
        </p>
      </div>

      {/* Decorative bottom fade */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-wolf-black to-transparent"
      />
    </section>
  );
}
