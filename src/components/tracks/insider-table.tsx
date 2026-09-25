"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { labelOf, type InsiderRow } from "@/lib/insiders/activity";
import { cn, formatCompactNumber, formatCurrency, formatNumber } from "@/lib/utils";

type Filter = "market" | "all" | "routine";

const FILTERS = [
  { key: "market" as const, label: "Open market" },
  { key: "routine" as const, label: "Routine" },
  { key: "all" as const, label: "All" },
];

const filingUrl = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/`;

/**
 * Every line, newest first, each with the filing it came from. The open
 * market is the default view: it is where decisions show up, and the
 * routine lines are one tap away rather than mixed in.
 */
export function InsiderTable({ rows, cik }: { rows: InsiderRow[]; cik: string }) {
  const [filter, setFilter] = useState<Filter>("market");
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const isMarket = (r: InsiderRow) => r.kind === "buy" || r.kind === "sell";
    const list = filter === "all" ? rows : rows.filter((r) => (filter === "market" ? isMarket(r) : !isMarket(r)));
    return list.slice(0, 200);
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <SegmentedTabs items={FILTERS} value={filter} onChange={setFilter} ariaLabel="Which transactions" size="sm" />

      {shown.length === 0 ? (
        <p className="rounded-xl border border-wolf-border/40 bg-wolf-black/20 px-4 py-8 text-center text-xs text-mist">
          {filter === "market" ? "No open-market trades in the filings read." : "Nothing in this view."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-wolf-border/40">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-wolf-black/30 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-mist/70">
              <tr>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Insider</th>
                <th className="px-3 py-2.5 font-medium">Transaction</th>
                <th className="px-3 py-2.5 text-right font-medium">Shares</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-3 py-2.5 text-right font-medium">Holds after</th>
                <th className="px-3 py-2.5 font-medium">Filing</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const id = `${r.accession}-${i}`;
                const expanded = open === id;
                const sign = r.acquired ? "+" : "−";
                const tone = r.kind === "buy" ? "text-bullish" : r.kind === "sell" ? "text-bearish" : "text-mist";
                return (
                  <Fragment key={id}>
                    <tr
                      onClick={() => setOpen(expanded ? null : id)}
                      className="cursor-pointer border-t border-wolf-border/30 transition-colors hover:bg-snow-peak/[0.03]"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-mist">{r.date}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-snow-peak">{r.owner}</p>
                        <p className="text-[11px] text-mist">{r.role}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className={cn("font-medium", tone)}>{labelOf(r.kind)}</p>
                        <p className="mt-0.5 flex flex-wrap gap-1">
                          {r.plan ? <span className="rounded bg-golden-hour/10 px-1.5 py-0.5 font-mono text-[10px] text-golden-hour">10b5-1 plan</span> : null}
                          {!r.direct ? <span className="rounded bg-snow-peak/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-mist">{r.nature ?? "indirect"}</span> : null}
                          {r.amended ? <span className="rounded bg-snow-peak/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-mist">amended</span> : null}
                          <span className="font-mono text-[10px] text-mist/50">code {r.code}</span>
                        </p>
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums", tone)}>{sign}{formatNumber(r.shares)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-snow-peak">
                        {r.price !== null ? formatCurrency(r.price) : <span className="text-mist/50">—</span>}
                        {r.priceFootnoted ? <sup className="ml-0.5 text-golden-hour" title="Weighted average; see the filing's footnote">†</sup> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-snow-peak">
                        {r.value !== null ? formatCurrency(r.value, { compact: true, decimals: 1 }) : <span className="text-mist/50">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-mist">
                        {r.sharesAfter !== null ? formatCompactNumber(r.sharesAfter) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <a
                          href={filingUrl(cik, r.accession)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-mist transition-colors hover:text-sunset-orange"
                        >
                          {r.accession}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                        {r.footnotes.length > 0 ? (
                          <ChevronDown className={cn("ml-1 inline h-3 w-3 text-mist/60 transition-transform", expanded && "rotate-180")} aria-hidden />
                        ) : null}
                      </td>
                    </tr>
                    {expanded && r.footnotes.length > 0 ? (
                      <tr className="bg-wolf-black/20">
                        <td colSpan={8} className="px-3 pb-3 pt-1">
                          <ul className="space-y-1 text-[11px] leading-relaxed text-mist">
                            {r.footnotes.map((n, k) => <li key={k}>· {n}</li>)}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
