import { HeroParallax } from "@/components/landing/HeroParallax";
import { Features } from "@/components/landing/features";
import { Preview } from "@/components/landing/preview";
import { DCFShowcase } from "@/components/landing/dcf-showcase";
import { EarningsShowcase } from "@/components/landing/earnings-showcase";
import { PortfoliosShowcase } from "@/components/landing/portfolios-showcase";
import { Transparency } from "@/components/landing/transparency";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-wolf-black flex flex-col">
      {/* Sticky nav bar */}
      <nav className="sticky top-0 z-40 border-b border-wolf-border/30 bg-wolf-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight text-snow-peak">
            HUNTR
          </span>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="text-sm text-mist hover:text-snow-peak transition-colors"
            >
              Login
            </a>
            <a
              href="/signup"
              className="text-sm font-semibold text-wolf-black bg-sunset-orange hover:bg-sunset-orange/90 px-4 py-1.5 rounded-lg transition-colors"
            >
              Start Free
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <HeroParallax />
        <Features />
        <Preview />
        <DCFShowcase />
        <EarningsShowcase />
        <PortfoliosShowcase />
        <Transparency />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
