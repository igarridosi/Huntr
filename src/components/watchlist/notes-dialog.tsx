"use client";

import { useEffect, useState } from "react";
import { Plus, Target, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_COLORS } from "@/types/watchlist";

interface NotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  notes: string;
  tags: string[];
  targetPrice: number | null;
  availableTags: string[];
  onSaveNotes: (notes: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onSetTargetPrice: (price: number | null) => void;
}

export function NotesDialog({
  open,
  onOpenChange,
  ticker,
  notes: initialNotes,
  tags,
  targetPrice,
  availableTags,
  onSaveNotes,
  onAddTag,
  onRemoveTag,
  onSetTargetPrice,
}: NotesDialogProps) {
  const [notesValue, setNotesValue] = useState(initialNotes);
  const [targetValue, setTargetValue] = useState(targetPrice?.toString() ?? "");

  useEffect(() => {
    setNotesValue(initialNotes);
    setTargetValue(targetPrice?.toString() ?? "");
  }, [initialNotes, targetPrice, ticker]);

  const handleSave = () => {
    onSaveNotes(notesValue);
    const parsed = Number.parseFloat(targetValue);
    onSetTargetPrice(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    onOpenChange(false);
  };

  const suggestedTags = availableTags.filter((tag) => !tags.includes(tag)).slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-snow-peak">{ticker} Notes</h3>
            <p className="text-xs text-mist mt-0.5">Track thesis, tags and target price</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-mist inline-flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> Target Price
            </label>
            <Input
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g. 420"
              inputMode="decimal"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-mist">Notes</label>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              className="w-full min-h-28 rounded-lg border border-wolf-border/50 bg-wolf-black/40 px-3 py-2 text-sm text-snow-peak outline-none focus:border-sunset-orange/40"
              placeholder="Investment thesis, risks, catalysts..."
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-mist">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium ${
                    TAG_COLORS[tag] ?? "bg-wolf-surface text-mist border-wolf-border"
                  }`}
                >
                  {tag}
                  <X className="h-3 w-3" />
                </button>
              ))}
              {tags.length === 0 ? <span className="text-[11px] text-mist/70">No tags yet</span> : null}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {suggestedTags.map((tag) => (
                <Button key={tag} type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => onAddTag(tag)}>
                  <Plus className="h-3 w-3" /> {tag}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
