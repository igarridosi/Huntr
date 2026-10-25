"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useStockProfile } from "@/hooks/use-stock-data";
import { cn } from "@/lib/utils";
import type { WatchlistList } from "@/types/watchlist";

/**
 * The second step of adding a company: which lists it goes on. The list
 * being looked at is ticked already, a list can be made on the spot, and
 * Save puts the company on every ticked list at once.
 */
export function AddToListsDialog({
  ticker,
  lists,
  activeId,
  onSave,
  onClose,
}: {
  ticker: string;
  lists: readonly WatchlistList[];
  activeId: string;
  onSave: (listIds: string[], newListName: string | null) => void;
  onClose: () => void;
}) {
  const { data: profile } = useStockProfile(ticker);
  const has = (list: WatchlistList) => list.items.some((i) => i.ticker === ticker);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const active = lists.find((l) => l.id === activeId);
    return new Set(active && !has(active) ? [active.id] : []);
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const newList = creating && newName.trim() ? newName.trim() : null;
  const count = selected.size + (newList ? 1 : 0);
  const save = () => {
    if (count === 0) return;
    onSave([...selected], newList);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0" aria-label={`Add ${ticker} to a watchlist`}>
        <div className="flex items-center gap-3 border-b border-wolf-border/40 p-5">
          <TickerLogo ticker={ticker} src={profile?.logo_url} className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-snow-peak">
              Add <span className="font-mono">{ticker}</span>
            </p>
            <p className="truncate text-xs text-mist">{profile?.name ?? "Choose the lists it goes on"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-mist">Watchlists</p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="Watchlists">
            {lists.map((list) => {
              const already = has(list);
              const checked = already || selected.has(list.id);
              return (
                <li key={list.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={already}
                    onClick={() => toggle(list.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ring-1 ring-inset",
                      "transition-[background-color,box-shadow,color] duration-150 ease-out",
                      already
                        ? "cursor-default bg-snow-peak/[0.02] text-mist ring-wolf-border/30"
                        : checked
                          ? "bg-sunset-orange/10 text-snow-peak ring-sunset-orange/40"
                          : "bg-snow-peak/[0.02] text-snow-peak/90 ring-wolf-border/50 hover:bg-snow-peak/[0.05]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                        already
                          ? "bg-snow-peak/[0.08] text-mist ring-wolf-border/50"
                          : checked
                            ? "bg-sunset-orange text-wolf-black ring-sunset-orange"
                            : "ring-wolf-border"
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-mist/70">
                      {already ? "already here" : list.items.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {creating ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="New list name, e.g. Compounders on sale"
                aria-label="New list name"
                maxLength={60}
                className="h-10 text-sm"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                aria-label="Cancel the new list"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-wolf-border/60 px-3 py-2.5 text-sm text-mist transition-colors duration-150 hover:border-sunset-orange/40 hover:text-snow-peak"
            >
              <Plus className="h-4 w-4" />
              Create a new list
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-wolf-border/40 px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={count === 0}>
            {count > 1 ? `Save to ${count} lists` : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
