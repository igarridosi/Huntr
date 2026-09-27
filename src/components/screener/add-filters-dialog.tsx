"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { FILTER_GROUPS, FILTERS } from "@/lib/screener/filters";
import type { FilterId } from "@/types/screener";

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");

/**
 * Every filter the screener has, grouped the way an investor thinks about
 * a company, with a search across names and descriptions. Ticking a filter
 * adds its control and its column; nothing narrows until a value is set.
 * The share beside each is how much of the universe has the figure, so a
 * thin filter is visible before it empties the table.
 */
export function AddFiltersDialog({
  active,
  coverage,
  onToggle,
}: {
  active: ReadonlySet<FilterId>;
  coverage: (id: FilterId) => number;
  onToggle: (id: FilterId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    const matches = FILTERS.filter((f) => {
      const hay = ` ${fold(`${f.label} ${f.column} ${f.description} ${f.group}`)}`;
      return words.every((w) => hay.includes(` ${w}`) || hay.includes(w));
    });
    return FILTER_GROUPS.map((g) => ({ group: g, filters: matches.filter((f) => f.group === g) })).filter((g) => g.filters.length > 0);
  }, [query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sunset-orange px-3.5 text-[13px] font-semibold text-wolf-black shadow-sm shadow-sunset-orange/20 transition-[background-color,transform] duration-150 ease-out hover:bg-sunset-orange/90 active:scale-[0.97] motion-reduce:active:scale-100"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Add filters
      </button>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] max-w-3xl flex-col overflow-hidden rounded-2xl p-0" onClose={() => setQuery("")}>
        <div className="shrink-0 space-y-3 border-b border-wolf-border/40 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-snow-peak">Add filters</h2>
              <p className="mt-0.5 text-xs text-mist">
                {FILTERS.length} filters for value and growth investors. {active.size > 0 ? `${active.size} on the screen.` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-snow-peak/[0.06] hover:text-snow-peak"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-xl bg-wolf-black/40 px-3 ring-1 ring-inset ring-wolf-border/60 focus-within:ring-sunset-orange/50">
            <Search className="h-4 w-4 shrink-0 text-mist" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filters: margin, P/E, dividend…"
              aria-label="Search filters"
              className="min-w-0 flex-1 bg-transparent text-sm text-snow-peak outline-none placeholder:text-mist/60"
            />
          </label>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-mist">No filter matches &ldquo;{query}&rdquo;.</p>
          ) : null}
          {groups.map(({ group, filters }) => (
            <section key={group}>
              <h3 className="mb-2 text-[13px] font-semibold text-snow-peak">{group}</h3>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {filters.map((f) => {
                  const on = active.has(f.id);
                  const share = coverage(f.id);
                  return (
                    <Tooltip key={f.id} content={f.description} side="top">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => onToggle(f.id)}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color,color] duration-150",
                          on ? "bg-sunset-orange/[0.08] text-snow-peak" : "text-mist hover:bg-snow-peak/[0.05] hover:text-snow-peak"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition-colors",
                            on ? "bg-sunset-orange text-wolf-black ring-sunset-orange" : "ring-wolf-border"
                          )}
                        >
                          {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{f.label}</span>
                        <span
                          className={cn("shrink-0 font-mono text-[10.5px] tabular-nums", share < 0.6 ? "text-golden-hour/80" : "text-mist/50")}
                          title={`${Math.round(share * 100)}% of the universe has this figure`}
                        >
                          {Math.round(share * 100)}%
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-wolf-border/40 px-5 py-3">
          <p className="text-[11px] text-mist">The percentage is how much of the universe has the figure.</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-9 rounded-xl bg-snow-peak/[0.08] px-4 text-[13px] font-semibold text-snow-peak ring-1 ring-inset ring-wolf-border/60 transition-[background-color,transform] duration-150 hover:bg-snow-peak/[0.12] active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
