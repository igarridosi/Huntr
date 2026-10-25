"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, enterDelay } from "@/lib/utils";
import type { WatchlistList } from "@/types/watchlist";

/** The reader's lists: pick one, rename or delete it, or start another. */
export function ListTabs({
  lists,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  lists: readonly WatchlistList[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const rename = (id: string) => {
    if (editName.trim()) onRename(id, editName.trim());
    setEditing(null);
  };
  const create = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  };

  return (
    <>
      <div className="scroll-quiet flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Watchlists">
        {lists.map((list, i) => {
          const active = list.id === activeId;
          return (
            <div key={list.id} className="insight-enter group flex shrink-0 items-center" style={enterDelay(Math.min(i * 25, 150))}>
              {editing === list.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(list.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    aria-label="List name"
                    className="h-8 w-36 text-xs"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => rename(list.id)} aria-label="Save list name">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(list.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ring-1 ring-inset",
                    "transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
                    active
                      ? "bg-sunset-orange/12 text-sunset-orange ring-sunset-orange/30"
                      : "bg-snow-peak/[0.03] text-mist ring-wolf-border/40 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
                  )}
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", active && "bg-sunset-orange")}
                    style={active ? undefined : { backgroundColor: list.color }}
                  />
                  {list.name}
                  <span className="font-mono text-[10px] tabular-nums text-mist/60">{list.items.length}</span>
                </button>
              )}
              {list.id !== "default" && editing !== list.id ? (
                <span className="ml-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(list.id);
                      setEditName(list.name);
                    }}
                    aria-label={`Rename ${list.name}`}
                    className="rounded p-1 text-mist hover:text-snow-peak"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${list.name}" and its ${list.items.length} companies?`)) onDelete(list.id);
                    }}
                    aria-label={`Delete ${list.name}`}
                    className="rounded p-1 text-mist hover:text-bearish"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-wolf-border/50 px-3 py-1.5 text-xs text-mist transition-colors duration-150 hover:border-sunset-orange/40 hover:text-snow-peak"
        >
          <Plus className="h-3 w-3" /> New list
        </button>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md p-5">
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-snow-peak">New watchlist</h3>
              <p className="mt-0.5 text-xs text-mist">A theme, a strategy, or just the ones to look at next.</p>
            </div>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="e.g. Compounders on sale"
              aria-label="List name"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={create} disabled={!newName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
