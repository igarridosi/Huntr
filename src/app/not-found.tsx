import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calculator, LayoutDashboard, LineChart, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

/** Where a lost reader is most likely headed — the product's main trails. */
const TRAILS = [
  { href: ROUTES.APP, label: "Dashboard", Icon: LayoutDashboard },
  { href: ROUTES.APP_DCF_CALCULATOR, label: "DCF Calculator", Icon: Calculator },
  { href: ROUTES.APP_CHART_BUILDER, label: "Chart Builder", Icon: LineChart },
  { href: ROUTES.APP_SCREENER, label: "Screener", Icon: ScanSearch },
] as const;

/**
 * Custom 404. Same frame as the auth screens — the forest far back, one
 * translucent panel in front — so a dead link feels like part of the
 * product rather than a fall out of it.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-wolf-black px-4 py-12">
      {/* Backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <Image
          src="/logo/huntr_header.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-110 object-cover object-center opacity-25 blur-[6px]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(11,20,22,0.82)_0%,rgba(11,20,22,0.95)_55%,var(--color-wolf-black)_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sunset-orange/[0.07] blur-[120px]" />
      </div>

      <Link
        href={ROUTES.HOME}
        className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-mist transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <main className="relative w-full max-w-[28rem]">
        <div className="mb-8 text-center">
          <Link
            href={ROUTES.HOME}
            className="text-xl font-extrabold tracking-tight text-snow-peak transition-opacity hover:opacity-80"
          >
            HUNTR
          </Link>
        </div>

        <div className="rounded-2xl border border-wolf-border/60 bg-wolf-surface/50 p-7 shadow-2xl shadow-wolf-black/60 backdrop-blur-xl sm:p-8">
          <p className="mb-4 inline-flex items-center gap-2 rounded-md bg-sunset-orange/10 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-sunset-orange ring-1 ring-inset ring-sunset-orange/25">
            <span className="h-1.5 w-1.5 rounded-full bg-sunset-orange" />
            404 · Not found
          </p>

          <h1 className="text-[1.35rem] font-bold tracking-tight text-snow-peak">
            Trail gone cold
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-mist">
            The page you&apos;re hunting for doesn&apos;t exist or has been moved.
            Even the best trackers lose the scent sometimes.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href={ROUTES.APP} className="sm:flex-1">
              <Button className="w-full">Go to Dashboard</Button>
            </Link>
            <Link href={ROUTES.HOME} className="sm:flex-1">
              <Button variant="outline" className="w-full">
                Back to Home
              </Button>
            </Link>
          </div>

          <div className="mt-7 border-t border-wolf-border/50 pt-5">
            <p className="mb-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-mist/70">
              Pick up the trail
            </p>
            <ul className="grid grid-cols-2 gap-1.5">
              {TRAILS.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-mist transition-colors hover:bg-snow-peak/[0.05] hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-sunset-orange/80" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[11px] text-mist/60">
          Looking for a ticker? Try{" "}
          <Link href="/symbol/AAPL" className="text-mist underline-offset-2 hover:text-snow-peak hover:underline">
            /symbol/AAPL
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
