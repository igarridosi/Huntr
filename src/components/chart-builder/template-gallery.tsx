"use client";

import { TEMPLATES, type ChartTemplate, type TemplateId } from "@/lib/chart-builder";
import { cn } from "@/lib/utils";

interface TemplateGalleryProps {
  onPick: (template: ChartTemplate) => void;
  /** `strip`: chips in a row; `list`: one per line for a side panel; default: the full grid. */
  variant?: "grid" | "strip" | "list";
  /** @deprecated use `variant="strip"` */
  compact?: boolean;
  activeId?: TemplateId | null;
  /** Greys the list out when there is nothing to reshape yet. */
  disabled?: boolean;
}

/** Static thumbnails: instant, and honest about being a shape, not data. */
const THUMBS: Record<TemplateId, React.ReactNode> = {
  "revenue-race": (
    <svg viewBox="0 0 64 36" aria-hidden>
      <g fill="#FF8C42">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={30 - i * 4} width="8" height={6 + i * 4} />)}</g>
      <g fill="#4DA3FF">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={24 - i * 5} width="8" height={6 + i} />)}</g>
      <g fill="#FFBF69">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={20 - i * 5.5} width="8" height={4} />)}</g>
    </svg>
  ),
  "price-indexed": (
    <svg viewBox="0 0 64 36" fill="none" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M4 26c10-4 14-18 26-14s14 12 30 4" stroke="#FF8C42" />
      <path d="M4 31c14 0 18-24 30-20s14 16 26 10" stroke="#34D399" />
    </svg>
  ),
  "fcf-vs-price": (
    <svg viewBox="0 0 64 36" aria-hidden>
      <g fill="#FF8C42">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={32 - i * 6} width="8" height={4 + i * 6} />)}</g>
      <path d="M4 20c10-12 20 6 30-2s14-14 26-8" fill="none" stroke="#F2F4F3" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  margins: (
    <svg viewBox="0 0 64 36" fill="none" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M4 10h56" stroke="#FF8C42" />
      <path d="M4 20c14-2 28-4 56-6" stroke="#4DA3FF" />
      <path d="M4 30c14-2 28-6 56-10" stroke="#7C8CF8" />
    </svg>
  ),
  "capital-returns": (
    <svg viewBox="0 0 64 36" aria-hidden>
      <g fill="#FFBF69">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={28 - i} width="8" height={6 + i} />)}</g>
      <g fill="#FF8C42">{[4, 16, 28, 40, 52].map((x, i) => <rect key={x} x={x} y={20 - i * 4} width="8" height={8 + i * 3} />)}</g>
      <path d="M4 14c14-2 28-6 56-10" fill="none" stroke="#F2F4F3" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  valuation: (
    <svg viewBox="0 0 64 36" aria-hidden>
      <path d="M4 30c10-16 20-2 30-12s14 6 26 2V34H4z" fill="#FF8C42" fillOpacity=".3" />
      <path d="M4 30c10-16 20-2 30-12s14 6 26 2" fill="none" stroke="#FF8C42" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 12c14 6 28 2 56 8" fill="none" stroke="#4DA3FF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  custom: (
    <svg viewBox="0 0 64 36" aria-hidden>
      <g fill="#FF8C42">{[4, 20, 36, 52].map((x, i) => <rect key={x} x={x} y={26 - i * 5} width="6" height={8 + i * 5} />)}</g>
      <g fill="#4DA3FF">{[11, 27, 43, 59].map((x, i) => <rect key={x} x={x} y={30 - i * 3} width="5" height={4 + i * 3} />)}</g>
      <path d="M4 22c12-10 24 2 36-6s12-4 20-8" fill="none" stroke="#F2F4F3" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
};

export function TemplateGallery({ onPick, variant, compact = false, activeId = null, disabled = false }: TemplateGalleryProps) {
  const mode = variant ?? (compact ? "strip" : "grid");

  if (mode === "list") {
    return (
      <section aria-label="Templates" className="rounded-2xl bg-wolf-surface p-3.5 ring-1 ring-inset ring-wolf-border/60">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/85">Templates</h2>
          <span className="text-[10px] text-mist">reshapes the current chart</span>
        </div>
        <ul className="flex flex-col gap-1">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={activeId === t.id}
                disabled={disabled}
                onClick={() => onPick(t)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-150",
                  "hover:bg-wolf-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60 disabled:opacity-40",
                  activeId === t.id && "bg-sunset-orange/5 ring-1 ring-inset ring-sunset-orange/40"
                )}
              >
                <span className="block h-7 w-12 shrink-0 rounded-md bg-wolf-black/60 p-1 ring-1 ring-inset ring-wolf-border/40">{THUMBS[t.id]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-snow-peak">{t.name}</span>
                  <span className="block truncate text-[11px] text-mist">{t.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (mode === "strip") {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={activeId === t.id}
            onClick={() => onPick(t)}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-wolf-border bg-wolf-surface py-1.5 pl-1.5 pr-3 text-xs text-mist/85 transition-colors duration-150",
              "hover:border-wolf-border/80 hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
              activeId === t.id && "border-sunset-orange/55 bg-sunset-orange/5 text-snow-peak"
            )}
          >
            <span className="block h-6 w-10 rounded-md bg-wolf-black/50 p-0.5">{THUMBS[t.id]}</span>
            {t.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center sm:py-12">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-snow-peak">Start from a template</h2>
        <p className="mt-1 text-sm text-mist">Pick a shape, then swap the tickers and metrics for your own.</p>
      </div>
      <ul className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t)}
              className={cn(
                "group flex h-full w-full flex-col gap-3 rounded-2xl bg-wolf-surface p-4 text-left ring-1 ring-inset ring-wolf-border/60 transition-[transform,box-shadow] duration-200 ease-out",
                "hover:-translate-y-0.5 hover:ring-sunset-orange/50 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              )}
            >
              <span className="block aspect-[16/9] w-full rounded-xl bg-wolf-black/60 p-3 ring-1 ring-inset ring-wolf-border/40">{THUMBS[t.id]}</span>
              <span className="block">
                <span className="block text-sm font-semibold text-snow-peak">{t.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist">{t.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
