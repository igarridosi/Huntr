"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Footprints, MessageSquareText, UserRoundSearch } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { InsidersPanel } from "@/components/tracks/insiders-panel";
import { TranscriptsPanel } from "@/components/tracks/transcripts-panel";

type Tab = "insiders" | "transcripts";

const TABS = [
  { key: "insiders" as const, label: "Insiders", icon: <UserRoundSearch className="h-3.5 w-3.5" /> },
  { key: "transcripts" as const, label: "Transcripts", icon: <MessageSquareText className="h-3.5 w-3.5" /> },
];

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;

/**
 * Tracks: what a company's management does and says, from its own filings.
 * The tab and the company live in the URL, so a ticker page or a shared
 * link can open straight onto one company's insider record.
 */
function Tracks() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab: Tab = params.get("tab") === "transcripts" ? "transcripts" : "insiders";
  const raw = (params.get("ticker") ?? "").toUpperCase();
  const ticker = TICKER_RE.test(raw) ? raw : "";

  const go = useCallback(
    (next: { tab?: Tab; ticker?: string }) => {
      const q = new URLSearchParams(params.toString());
      if (next.tab) q.set("tab", next.tab);
      if (next.ticker !== undefined) {
        if (next.ticker) q.set("ticker", next.ticker);
        else q.delete("ticker");
      }
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sunset-orange/15 bg-sunset-orange/10">
            <Footprints className="h-5 w-5 text-sunset-orange" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-snow-peak">Tracks</h1>
            <p className="mt-0.5 text-xs text-mist">What management does and says, from its own filings.</p>
          </div>
        </div>
        <SegmentedTabs items={TABS} value={tab} onChange={(t) => go({ tab: t })} ariaLabel="Tracks section" />
      </header>

      {tab === "insiders" ? <InsidersPanel ticker={ticker} onTicker={(t) => go({ ticker: t })} /> : <TranscriptsPanel />}
    </div>
  );
}

export default function TracksPage() {
  return (
    <Suspense fallback={null}>
      <Tracks />
    </Suspense>
  );
}
