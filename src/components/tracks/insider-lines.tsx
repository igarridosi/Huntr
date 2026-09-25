"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { labelOf, type InsiderRow } from "@/lib/insiders/activity";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { EDGE_FADE, useRowWindow, VISIBLE_ROWS } from "./use-row-window";

type Filter = "market" | "routine" | "all";

const FILTERS = [
  { key: "market" as const, label: "Open market" },
  { key: "routine" as const, label: "Routine" },
  { key: "all" as const, label: "All" },
];

const filingUrl = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/`;

const isMarket = (r: InsiderRow) => r.kind === "buy" || r.kind === "sell";

/**
 * Every line from the filings, as a list built for a third of the screen:
 * who and when on the left, the shares and their value on the right, the
 * kind of trade and its qualifiers under them. Eight rows, then the list
 * scrolls; the filing and its footnotes open under the row that owns them.
 */
export function InsiderLines({ rows, cik }: { rows: InsiderRow[]; cik: string }) {
  const [filter, setFilter] = useState<Filter>("market");
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => (filter === "market" ? isMarket(r) : !isMarket(r)))),
    [rows, filter]
  );
  const scrolls = shown.length > VISIBLE_ROWS;
  const scroller = useRef<HTMLDivElement | null>(null);
  useRowWindow(scroller, [shown], true);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SegmentedTabs items={FILTERS} value={filter} onChange={(f) => { setFilter(f); setOpen(null); }} ariaLabel="Which transactions" size="sm" />

      {/* One window for every filter, so switching does not move the page. */}
      {shown.length === 0 ? (
        <div ref={scroller} className="flex items-center justify-center rounded-xl bg-wolf-black/25">
          <p className="px-4 text-center text-xs text-mist">
            {filter === "market" ? "No open-market trades in the filings read." : "Nothing in this view."}
          </p>
        </div>
      ) : (
        <div
          ref={scroller}
          className="-mx-1 overflow-y-auto overscroll-contain px-1"
          // The list fades into the panel where it continues, rather than
          // ending on a hard line: the fade is the cue that there is more.
          style={scrolls ? EDGE_FADE : undefined}
        >
          {/* The bottom padding lets the last row scroll clear of the fade. */}
          <ul className={cn("flex flex-col gap-1", scrolls && "pb-9")}>
            {shown.map((r, i) => {
              const id = `${r.accession}-${r.date}-${i}`;
              const expanded = open === id;
              const tone = r.kind === "buy" ? "text-bullish" : r.kind === "sell" ? "text-bearish" : "text-mist";
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : id)}
                    aria-expanded={expanded}
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto] gap-x-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,transform] duration-150",
                      "hover:bg-snow-peak/[0.04] active:scale-[0.99] motion-reduce:active:scale-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange",
                      expanded && "bg-snow-peak/[0.04]"
                    )}
                  >
                    {/* Two lines: who and how much, then when, what kind and what it was worth. */}
                    <span className="min-w-0 truncate text-[13px]">
                      <span className="font-medium text-snow-peak">{r.owner}</span>
                      <span className="ml-1.5 text-[11px] text-mist">{r.role}</span>
                    </span>
                    <span className={cn("text-right font-mono text-[13px] tabular-nums", tone)}>
                      {r.acquired ? "+" : "−"}
                      {formatNumber(r.shares)}
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-mist">{r.date}</span>
                      <span className={cn("truncate text-[11px] font-medium", tone)}>{labelOf(r.kind)}</span>
                      {r.plan ? <span className="shrink-0 rounded-md bg-golden-hour/10 px-1.5 py-px font-mono text-[10px] text-golden-hour">10b5-1</span> : null}
                      {r.amended ? <span className="shrink-0 rounded-md bg-snow-peak/[0.06] px-1.5 py-px font-mono text-[10px] text-mist">amended</span> : null}
                    </span>
                    <span className="mt-1 flex items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums text-mist">
                      {r.value !== null ? formatCurrency(r.value, { compact: true, decimals: 1 }) : "no price"}
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 text-mist/50 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
                        aria-hidden
                      />
                    </span>
                  </button>

                  {/* The disclosure grows from its row rather than appearing below it. */}
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                      expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="mx-3 mb-2 mt-1 space-y-2 rounded-xl bg-wolf-black/30 p-3">
                        {r.footnotes.length > 0 ? (
                          <ul className="space-y-1.5 text-[11px] leading-relaxed text-mist">
                            {r.footnotes.map((n, k) => <li key={k}>{n}</li>)}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-mist/70">No footnotes on this line.</p>
                        )}
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px] tabular-nums">
                          <dt className="text-mist/70">Price</dt>
                          <dd className="text-right text-snow-peak">
                            {r.price !== null ? formatCurrency(r.price) : "not filed"}
                            {r.priceFootnoted ? <span className="ml-1 text-golden-hour">weighted avg.</span> : null}
                          </dd>
                          {r.fills > 1 ? (
                            <>
                              <dt className="text-mist/70">Executed in</dt>
                              <dd className="text-right text-snow-peak">{r.fills} fills</dd>
                            </>
                          ) : null}
                          <dt className="text-mist/70">Holds after</dt>
                          <dd className="text-right text-snow-peak">{r.sharesAfter !== null ? formatNumber(r.sharesAfter) : "not filed"}</dd>
                          <dt className="text-mist/70">Held</dt>
                          <dd className="truncate text-right text-snow-peak">{r.direct ? "directly" : r.nature ?? "indirectly"}</dd>
                          <dt className="text-mist/70">Code</dt>
                          <dd className="text-right text-snow-peak">{r.code}{r.plan ? ", Rule 10b5-1 plan" : ""}</dd>
                        </dl>
                        <div className="flex justify-end pt-1 font-mono text-[10px] text-mist/70">
                          <a
                            href={filingUrl(cik, r.accession)}
                            target="_blank"
                            rel="noopener noreferrer"
                            tabIndex={expanded ? 0 : -1}
                            className="inline-flex items-center gap-1 text-mist transition-colors hover:text-sunset-orange"
                          >
                            {r.accession}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="font-mono text-[10px] text-mist/60">
        {shown.length} line{shown.length === 1 ? "" : "s"}
        {scrolls ? `, ${VISIBLE_ROWS} in view` : ""}
      </p>
    </div>
  );
}
