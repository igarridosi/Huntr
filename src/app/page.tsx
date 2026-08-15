import { HeroForest } from "@/components/landing/hero-forest";
import { Features } from "@/components/landing/features";
import { Preview } from "@/components/landing/preview";
import { DCFShowcase } from "@/components/landing/dcf-showcase";
import { EarningsShowcase } from "@/components/landing/earnings-showcase";
import { PortfoliosShowcase } from "@/components/landing/portfolios-showcase";
import { Transparency } from "@/components/landing/transparency";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { LandingSideMenu } from "@/components/landing/side-menu";
import { Journey, JourneyStep } from "@/components/landing/journey";
import { LandingNav } from "@/components/landing/landing-nav";
import { KoFiSupport } from "@/components/ui/kofi-support";

export default function Home() {
  return (
    <div className="min-h-screen bg-wolf-black flex flex-col">
      <LandingSideMenu />

      <div className="fixed bottom-4 right-4 z-50">
        <KoFiSupport text="Support Huntr on Ko-fi" />
      </div>

      <LandingNav />

      <main className="flex-1">
        {/* Pulled under the nav so the scene is full-bleed — when the nav fades
            for the intro it reveals forest rather than an empty strip. */}
        <div id="hero" className="-mt-[3.75rem]">
          <HeroForest />
        </div>

        <div id="features" className="scroll-mt-24">
          <Features />
        </div>

        {/* Product tour — threaded by the scroll-filled rail */}
        <Journey>
          <JourneyStep index={1} eyebrow="Discover" id="radar">
            <Preview />
          </JourneyStep>
          <JourneyStep index={2} eyebrow="Value" id="dcf">
            <DCFShowcase />
          </JourneyStep>
          <JourneyStep index={3} eyebrow="Anticipate" id="earnings">
            <EarningsShowcase />
          </JourneyStep>
          <JourneyStep index={4} eyebrow="Manage" id="portfolios">
            <PortfoliosShowcase />
          </JourneyStep>
        </Journey>

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
