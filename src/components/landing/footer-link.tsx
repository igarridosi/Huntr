"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { glideTo } from "@/components/landing/glide";

/**
 * A footer link that answers the pointer. On hover an orange underline draws
 * in from the left and an arrow slides in; on press the link sinks a little
 * and warms to gold.
 *
 * Where it goes decides the arrow and the move:
 * - a section of the landing ("/#features"): ↑, and a glide back up to it,
 *   the same one the side menu makes, instead of the jump a hash link does;
 * - the app: →, and the transition screen takes over (AppTransition);
 * - another site: ↗, in a new tab.
 */
export function FooterLink({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  const hash = !external && href.startsWith("/#") ? href.slice(1) : null;
  const Arrow = external ? ArrowUpRight : hash ? ArrowUp : ArrowRight;

  const className =
    "group relative inline-flex w-fit items-center gap-1 text-mist outline-none transition-[color,transform] duration-200 ease-out hover:text-sunset-orange focus-visible:text-sunset-orange active:scale-[0.96] active:text-golden-hour motion-reduce:transition-none";
  // ↑ rises into place, → and ↗ slide in from the left.
  const arrowMotion = hash
    ? "translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0"
    : "-translate-x-1 group-hover:translate-x-0 group-focus-visible:translate-x-0";

  const content = (
    <>
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-sunset-orange transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
        />
      </span>
      <Arrow
        aria-hidden
        className={`h-3 w-3 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none ${arrowMotion}`}
      />
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hash || window.location.pathname !== "/") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (glideTo(hash)) event.preventDefault();
  };

  return (
    <Link href={href} onClick={onClick} className={className}>
      {content}
    </Link>
  );
}
