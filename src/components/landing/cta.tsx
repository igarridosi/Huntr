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
          Upgrade Your Research Stack
        </h2>
        <p className="text-mist text-base sm:text-lg leading-relaxed">
          Join HUNTR and analyze opportunities with premium signals,
          professional metrics, and execution-ready workflows.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link href={ROUTES.SIGNUP}>
            <Button size="lg" className="min-w-[200px] text-base font-bold shadow-lg shadow-sunset-orange/20">
              Start Free Beta
            </Button>
          </Link>
          <Link href={ROUTES.LOGIN}>
            <Button variant="outline" size="lg" className="min-w-[200px] text-base">
              Sign In to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
