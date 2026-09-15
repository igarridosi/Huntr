"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SavedChart } from "@/hooks/use-saved-charts";

interface SavedChartsMenuProps {
  charts: SavedChart[];
  isLoading: boolean;
  isSignedIn: boolean;
  currentId: string | null;
  onOpen: (chart: SavedChart) => void;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  /** Called when a guest opens the menu, to raise the auth gate. */
  onGate: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The user's saved charts. Rename happens in place; delete asks once,
 * inline, because it is the one action here that cannot be undone.
 */
export function SavedChartsMenu({ charts, isLoading, isSignedIn, currentId, onOpen, onRename, onDelete, onGate }: SavedChartsMenuProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!isSignedIn) {
      onGate();
      return;
    }
    setOpen((v) => !v);
    setEditing(null);
    setConfirming(null);
  };

  const commitRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name) await onRename(editing.id, name);
    setEditing(null);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
        My charts
        {charts.length > 0 && <span className="ml-1.5 rounded bg-mist/15 px-1 font-mono text-[10px] tabular-nums text-mist">{charts.length}</span>}
        <ChevronDown className="ml-1 h-3.5 w-3.5 text-mist" />
      </Button>

      {open && (
        <div
          role="menu"
          className="popover-materialize absolute right-0 z-50 mt-1.5 w-80 origin-top-right overflow-hidden rounded-xl bg-wolf-surface/95 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl"
        >
          <div className="scroll-quiet max-h-[22rem] overflow-y-auto py-1">
            {isLoading ? (
              <p className="px-3 py-3 text-xs text-mist">Loading saved charts…</p>
            ) : charts.length === 0 ? (
              <p className="px-3 py-3 text-xs text-mist">No saved charts yet. Build one and press Save.</p>
            ) : (
              charts.map((c) => {
                const isEditing = editing?.id === c.id;
                const isConfirming = confirming === c.id;
                return (
                  <div
                    key={c.id}
                    className={cn("group flex items-center gap-2 px-2 py-1.5", currentId === c.id && "bg-sunset-orange/5")}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        aria-label="Chart name"
                        className="h-8 min-w-0 flex-1 rounded-lg bg-wolf-black/60 px-2 text-sm text-snow-peak ring-1 ring-inset ring-sunset-orange/50 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onOpen(c);
                          setOpen(false);
                        }}
                        className="flex min-w-0 flex-1 flex-col rounded-lg px-1.5 py-1 text-left hover:bg-sunset-orange/10 focus-visible:outline-none focus-visible:bg-sunset-orange/10"
                      >
                        <span className="truncate text-sm font-medium text-snow-peak">{c.name}</span>
                        <span className="truncate text-[11px] text-mist">
                          {c.spec.series.length} series · {Array.from(new Set(c.spec.series.map((s) => s.ticker))).join(", ")} · {relativeTime(c.updatedAt)}
                        </span>
                      </button>
                    )}
                    <div className="flex shrink-0 items-center">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label="Save name" onClick={() => void commitRename()}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Cancel rename" onClick={() => setEditing(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : isConfirming ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-bearish hover:text-bearish"
                            onClick={async () => {
                              await onDelete(c.id);
                              setConfirming(null);
                            }}
                          >
                            Delete
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Keep chart" onClick={() => setConfirming(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setConfirming(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
