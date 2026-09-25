"use client";

import { MessageSquareText } from "lucide-react";
import { MaterialPanel } from "@/components/ui/material-panel";

/**
 * Transcripts keep their place in Tracks, and say plainly why they are not
 * here yet: the free sources do not reach the quality the rest of the
 * product holds itself to.
 */
export function TranscriptsPanel() {
  return (
    <MaterialPanel className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sunset-orange/25 bg-sunset-orange/10">
          <MessageSquareText className="h-6 w-6 text-sunset-orange" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-snow-peak">Earnings call transcripts are not here yet</h2>
        <p className="max-w-lg text-sm leading-relaxed text-mist">
          What management says belongs next to what it does. The free transcript sources do not yet reach the coverage and
          accuracy the rest of Huntr holds itself to, so this waits for an official provider rather than showing text we
          cannot stand behind.
        </p>
    </MaterialPanel>
  );
}
