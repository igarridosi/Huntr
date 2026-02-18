import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

/**
 * Custom 404 — Wolf-themed Not Found page.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-wolf-black flex flex-col items-center justify-center px-6 text-center">
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-[400px] h-[400px] rounded-full bg-bearish/[0.06] blur-[100px]"
      />

      <div className="relative z-10 space-y-6 max-w-md">
        {/* Error code */}
        <p className="text-8xl font-extrabold font-mono text-wolf-border tracking-tighter">
          404
        </p>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-snow-peak">
          Trail Gone Cold
        </h1>

        {/* Description */}
        <p className="text-sm text-mist leading-relaxed">
          The page you&apos;re hunting for doesn&apos;t exist or has been moved.
          Even the best trackers lose the scent sometimes.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href={ROUTES.HOME}>
            <Button variant="outline" size="default">
              Back to Home
            </Button>
          </Link>
          <Link href={ROUTES.APP}>
            <Button size="default">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
