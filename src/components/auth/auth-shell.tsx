import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ROUTES } from "@/lib/constants";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared frame for the auth screens. The forest sits far back — blurred and
 * dimmed to atmosphere rather than photography — so the form stays the only
 * thing competing for attention.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      {/* Backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <Image
          src="/logo/huntr_header.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-110 object-cover object-center opacity-25 blur-[6px]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(11,20,22,0.82)_0%,rgba(11,20,22,0.95)_55%,var(--color-wolf-black)_100%)]" />
      </div>

      {/* Escape hatch — never trap someone on a form */}
      <Link
        href={ROUTES.HOME}
        className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-mist transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <main className="relative w-full max-w-[26rem]">
        {/* Brand — the wordmark the rest of the product uses */}
        <div className="mb-8 text-center">
          <Link
            href={ROUTES.HOME}
            className="text-xl font-extrabold tracking-tight text-snow-peak transition-opacity hover:opacity-80"
          >
            HUNTR
          </Link>
        </div>

        <div className="rounded-2xl border border-wolf-border/60 bg-wolf-surface/50 p-7 shadow-2xl shadow-wolf-black/60 backdrop-blur-xl sm:p-8">
          <div className="mb-7 space-y-1.5">
            <h1 className="text-[1.35rem] font-bold tracking-tight text-snow-peak">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-mist">{subtitle}</p>
          </div>

          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-mist">{footer}</div>}
      </main>
    </div>
  );
}
