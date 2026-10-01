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
import { LandingBackdrop } from "@/components/landing/backdrop";

export default function Home() {
  return (
    // isolate: the backdrop sits at a negative z-index, which
    // without a stacking context here would paint under this background.
    // overflow-x-clip: nothing may widen the page; clip, unlike hidden, does
    // not make this a scroll container, so the sticky hero still sticks.
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip bg-wolf-black">
      {/* One backdrop from the end of the hero to the end of the footer: the
          header's light, continued as a single surface (LandingBackdrop). */}
      <LandingBackdrop />
      <LandingSideMenu />

      {/* Ko-fi now lives inline: next to "Start Free" on desktop (LandingNav)
          and centered under the trust badges on mobile (HeroForest), instead
          of floating fixed over the page. */}
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
