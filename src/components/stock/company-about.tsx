"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockProfile } from "@/types/stock";

/**
 * The company in words, beside its price chart: what it does, clamped to a
 * few lines with the rest one click away, then the facts a reader looks up
 * (sector, industry, exchange, website) as a short list.
 *
 * It closes the page, full width: the text on the left, the facts in a
 * column on the right on wide screens.
 */
export function CompanyAbout({
  profile,
  className,
  style,
}: {
  profile: StockProfile;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const website = profile.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const facts = [
    { label: "Sector", value: profile.sector },
    { label: "Industry", value: profile.industry },
    { label: "Exchange", value: profile.exchange },
  ].filter((fact) => fact.value);

  return (
    <section
      aria-label={`About ${profile.name}`}
      style={style}
      className={cn(
        "grid grid-cols-1 gap-x-10 rounded-xl border border-wolf-border/50 bg-wolf-surface p-5 lg:grid-cols-[minmax(0,1fr)_20rem]",
        className
      )}
    >
      <div className="min-w-0">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-snow-peak">About {profile.name}</h2>

      {profile.description ? (
        <div className="mb-5 mt-3 lg:mb-0">
          <p className={cn("max-w-[90ch] text-[13px] leading-[1.7] text-mist", !open && "line-clamp-4")}>{profile.description}</p>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="mt-1.5 text-[12px] font-medium text-sunset-orange transition-colors hover:text-golden-hour focus-visible:outline-none focus-visible:underline"
          >
            {open ? "Show less" : "Read more"}
          </button>
        </div>
      ) : (
        <p className="mb-5 mt-3 text-[13px] text-mist/80 lg:mb-0">No company description on record.</p>
      )}
      </div>

      <dl className="grid h-fit grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-wolf-border/30 pt-4 text-[12.5px] lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-mist/80">{fact.label}</dt>
            <dd className="truncate text-right text-snow-peak/90">{fact.value}</dd>
          </div>
        ))}
        {website ? (
          <div className="contents">
            <dt className="text-mist/80">Website</dt>
            <dd className="truncate text-right">
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-sunset-orange transition-colors hover:text-golden-hour"
              >
                {website}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
