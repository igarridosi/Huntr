"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useWatchlist } from "@/hooks/use-watchlist";

interface AddToWatchlistProps {
  ticker: string;
  variant?: "default" | "compact";
}

export function AddToWatchlist({
  ticker,
  variant = "default",
}: AddToWatchlistProps) {
  const {
    lists,
    addTicker,
    removeTicker,
    isInWatchlist,
    isAdding,
    isRemoving,
  } = useWatchlist();

  const [open, setOpen] = useState(false);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);

  const listsWithMembership = useMemo(
    () =>
      lists.map((list) => ({
        id: list.id,
        name: list.name,
        isSelected: list.items.some((item) => item.ticker === ticker.toUpperCase()),
      })),
    [lists, ticker]
  );

  useEffect(() => {
    if (!open) return;
    setSelectedLists(
      listsWithMembership.filter((list) => list.isSelected).map((list) => list.id)
    );
  }, [open, listsWithMembership]);

  const toggleListSelection = (listId: string) => {
    setSelectedLists((prev) =>
      prev.includes(listId)
        ? prev.filter((id) => id !== listId)
        : [...prev, listId]
    );
  };

  const handleSave = () => {
    for (const list of listsWithMembership) {
      const shouldBeInList = selectedLists.includes(list.id);
      if (shouldBeInList && !list.isSelected) {
        addTicker(ticker, list.id);
      }
      if (!shouldBeInList && list.isSelected) {
        removeTicker(ticker, list.id);
      }
    }
    setOpen(false);
  };

  const inList = isInWatchlist(ticker);

  if (variant === "compact") {
    return (
      <>
        <Button
          variant={inList ? "secondary" : "default"}
          size="icon-sm"
          onClick={() => setOpen(true)}
          disabled={isAdding || isRemoving}
          aria-label={`Manage ${ticker} watchlists`}
        >
          <Plus
            className={`w-4 h-4 transition-transform ${inList ? "rotate-45" : ""}`}
          />
        </Button>

        <WatchlistPickerDialog
          open={open}
          onOpenChange={setOpen}
          ticker={ticker}
          lists={listsWithMembership}
          selectedLists={selectedLists}
          onToggleList={toggleListSelection}
          onSave={handleSave}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant={inList ? "secondary" : "default"}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isAdding || isRemoving}
        className="gap-1.5"
      >
        <Plus
          className={`w-3.5 h-3.5 transition-transform ${inList ? "rotate-45" : ""}`}
        />
        {inList ? "Manage" : "Watch"}
      </Button>

      <WatchlistPickerDialog
        open={open}
        onOpenChange={setOpen}
        ticker={ticker}
        lists={listsWithMembership}
        selectedLists={selectedLists}
        onToggleList={toggleListSelection}
        onSave={handleSave}
      />
    </>
  );
}

interface WatchlistPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  lists: Array<{ id: string; name: string; isSelected: boolean }>;
  selectedLists: string[];
  onToggleList: (listId: string) => void;
  onSave: () => void;
}

function WatchlistPickerDialog({
  open,
  onOpenChange,
  ticker,
  lists,
  selectedLists,
  onToggleList,
  onSave,
}: WatchlistPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-snow-peak">Add {ticker} to Watchlists</h3>
            <p className="text-xs text-mist mt-0.5">Select one or more lists</p>
          </div>

          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {lists.map((list) => {
              const checked = selectedLists.includes(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => onToggleList(list.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                    checked
                      ? "border-sunset-orange/40 bg-sunset-orange/10 text-sunset-orange"
                      : "border-wolf-border/50 bg-wolf-black/30 text-mist hover:text-snow-peak"
                  }`}
                >
                  <span>{list.name}</span>
                  {checked ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
