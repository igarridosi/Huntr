import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Bottom CTA band — final push to sign up.
 */
export function CTA() {
  return (
    <section className="relative px-6 py-24 overflow-hidden">
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-sunset-orange/[0.05] blur-[100px]"
      />

      <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-snow-peak tracking-tight">
          Start Free. Help It Grow.
        </h2>
        <p className="text-mist text-base sm:text-lg leading-relaxed">
          Use HUNTR today at no cost. If you can support the project, every contribution is reinvested into faster
          infrastructure, paid data providers, and higher-quality features for everyone.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link href={ROUTES.SIGNUP}>
            <Button size="lg" className="min-w-[200px] text-base font-bold shadow-lg shadow-sunset-orange/20">
              Start Free Beta
            </Button>
          </Link>
          <Link href="/#support">
            <Button variant="outline" size="lg" className="min-w-[200px] text-base">
              Support the Project
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
