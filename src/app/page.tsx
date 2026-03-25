import { HeroParallax } from "@/components/landing/HeroParallax";
import { Features } from "@/components/landing/features";
import { Preview } from "@/components/landing/preview";
import { DCFShowcase } from "@/components/landing/dcf-showcase";
import { EarningsShowcase } from "@/components/landing/earnings-showcase";
import { PortfoliosShowcase } from "@/components/landing/portfolios-showcase";
import { Transparency } from "@/components/landing/transparency";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { LandingSideMenu } from "@/components/landing/side-menu";
import { KoFiSupport } from "@/components/ui/kofi-support";

export default function Home() {
  return (
    <div className="min-h-screen bg-wolf-black flex flex-col">
      <LandingSideMenu />

      <div className="fixed bottom-4 right-4 z-50">
        <KoFiSupport text="Support Huntr on Ko-fi" />
      </div>

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
        <div id="hero" className="scroll-mt-24">
          <HeroParallax />
        </div>
        <div id="features" className="scroll-mt-24">
          <Features />
        </div>
        <div id="radar" className="scroll-mt-24">
          <Preview />
        </div>
        <div id="dcf" className="scroll-mt-24">
          <DCFShowcase />
        </div>
        <div id="earnings" className="scroll-mt-24">
          <EarningsShowcase />
        </div>
        <div id="portfolios" className="scroll-mt-24">
          <PortfoliosShowcase />
        </div>
        <div id="transparency" className="scroll-mt-24">
          <Transparency />
        </div>
        <div id="cta" className="scroll-mt-24">
          <CTA />
        </div>
      </main>

      <Footer />
    </div>
  );
}
