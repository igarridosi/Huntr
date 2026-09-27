"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Tooltip } from "@/components/ui/tooltip";
import { FILTER_BY_ID, formatFilterValue, type FilterSpec } from "@/lib/screener/filters";
import type { FilterId, ScreenerRow, SortKey, SortState } from "@/types/screener";

/** With no filters on, the columns a value or growth investor looks at first. */
const DEFAULT_COLUMNS: FilterId[] = ["forward_pe", "pe_ratio", "revenue_growth", "operating_margin", "dividend_yield", "quality_overall"];

/**
 * The columns: the filters on the screen, in the order they were added (or
 * the defaults), and the one the list is sorted by when it is not among
 * them, so the order of the rows is always explained by a column.
 */
export function columnsFor(activeIds: FilterId[], sortField?: string): FilterSpec[] {
  const ids = (activeIds.length ? activeIds : DEFAULT_COLUMNS).filter((id) => id !== "market_cap");
  const cols = ids.map((id) => FILTER_BY_ID.get(id)).filter((f): f is FilterSpec => !!f);
  if (sortField && !["ticker", "price", "market_cap", "sector"].includes(sortField) && !cols.some((c) => c.field === sortField)) {
    const extra = [...FILTER_BY_ID.values()].find((f) => f.field === sortField);
    if (extra) cols.push(extra);
  }
  return cols;
}

function Cell({ spec, value }: { spec: FilterSpec; value: number | null }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-mist/35">-</span>;
  }
  // Colour only says direction where direction is the point (growth,
  // returns against a high); levels stay neutral rather than judged.
  const tone = spec.format === "signed_percent" ? (value > 0 ? "text-bullish" : value < 0 ? "text-bearish" : "text-snow-peak") : "text-snow-peak";
  return <span className={tone}>{formatFilterValue(spec.format, value)}</span>;
}

function SortHeader({ label, sortKey, sort, onSort, align = "right", tooltip, className }: { label: string; sortKey: SortKey; sort: SortState; onSort: (k: SortKey) => void; align?: "left" | "right"; tooltip?: string; className?: string }) {
  const on = sort.key === sortKey;
  const button = (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold transition-colors",
        align === "right" && "flex-row-reverse",
        on ? "text-sunset-orange" : "text-mist hover:text-snow-peak"
      )}
    >
      {label}
      {on ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <span className="w-3" />}
    </button>
  );
  return (
    <th aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-3 font-normal", align === "right" ? "text-right" : "text-left", className)}>
      {tooltip ? (
        <Tooltip content={tooltip} side="top">
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
    </th>
  );
}

export function ResultsTable({
  rows,
  columns,
  sort,
  onSort,
  page,
  pageSize,
  total,
  onPage,
}: {
  rows: ScreenerRow[];
  columns: FilterSpec[];
  sort: SortState;
  onSort: (k: SortKey) => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div>
      <div className="scroll-quiet overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 font-mono text-[13px] tabular-nums">
          <thead className="font-sans">
            <tr className="[&>th]:border-b [&>th]:border-wolf-border/40">
              {/* The company stays in view while the figures scroll sideways on a phone. */}
              <SortHeader label="Company" sortKey="ticker" sort={sort} onSort={onSort} align="left" className="sticky left-0 z-10 bg-wolf-surface" />
              <SortHeader label="Price" sortKey="price" sort={sort} onSort={onSort} />
              <SortHeader label="Mkt cap" sortKey="market_cap" sort={sort} onSort={onSort} />
              {columns.map((c) => (
                <SortHeader key={c.id} label={c.column} sortKey={c.field} sort={sort} onSort={onSort} tooltip={c.description} />
              ))}
              <SortHeader label="Sector" sortKey="sector" sort={sort} onSort={onSort} align="left" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker} className="group transition-colors duration-150 hover:bg-snow-peak/[0.035] [&>td]:border-b [&>td]:border-wolf-border/15">
                <td className="sticky left-0 z-10 bg-wolf-surface px-3 py-2.5 transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,var(--color-wolf-surface)_94%,var(--color-snow-peak))]">
                  <Link href={ROUTES.SYMBOL(row.ticker)} className="flex min-w-0 items-center gap-2.5 font-sans">
                    <TickerLogo ticker={row.ticker} src={row.logo_url} className="h-8 w-8 shrink-0" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[10px]" />
                    <span className="min-w-0">
                      <span className="block font-mono text-[13px] font-semibold text-snow-peak transition-colors group-hover:text-sunset-orange">{row.ticker}</span>
                      <span className="block max-w-[180px] truncate text-[11.5px] text-mist">{row.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right text-snow-peak">${row.price.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-snow-peak">{row.market_cap > 0 ? formatFilterValue("money", row.market_cap) : "-"}</td>
                {columns.map((c) => (
                  <td key={c.id} className={cn("px-3 py-2.5 text-right", sort.key === c.field && "bg-sunset-orange/[0.035]")}>
                    <Cell spec={c} value={row[c.field] as number | null} />
                  </td>
                ))}
                <td className="max-w-[160px] truncate px-3 py-2.5 font-sans text-[12px] text-mist">{row.sector}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="text-xs tabular-nums text-mist">
          {first}-{last} of {total}
        </span>
        {pages > 1 ? (
          <div className="flex items-center gap-1">
            <PageButton label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </PageButton>
            {pageNumbers(page, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="w-6 text-center text-xs text-mist/60">
                  ...
                </span>
              ) : (
                <PageButton key={p} label={`Page ${p}`} current={p === page} onClick={() => onPage(p)}>
                  <span className="font-mono text-xs tabular-nums">{p}</span>
                </PageButton>
              )
            )}
            <PageButton label="Next page" disabled={page === pages} onClick={() => onPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </PageButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageNumbers(page: number, pages: number): Array<number | null> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | null> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push(null);
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pages - 1) out.push(null);
  out.push(pages);
  return out;
}

function PageButton({ label, disabled, current, onClick, children }: { label: string; disabled?: boolean; current?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-30 motion-reduce:active:scale-100",
        current ? "bg-sunset-orange/15 text-sunset-orange" : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak"
      )}
    >
      {children}
    </button>
  );
}
