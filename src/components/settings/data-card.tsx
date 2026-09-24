"use client";

import { useEffect, useState } from "react";
import { Download, Database } from "lucide-react";
import { SettingRow, SettingsSection } from "./settings-section";
import { Button } from "@/components/ui/button";
import { accountDataCounts, exportAccountData } from "@/app/actions/account";

/** The tables as a person would name them. */
const LABELS: Record<string, string> = {
  user_watchlist_state: "Watchlists",
  user_portfolio_state: "Portfolios",
  user_dcf_scenarios: "Saved valuations",
  user_charts: "Saved charts",
};

export function DataCard({ signedIn }: { signedIn: boolean }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    accountDataCounts()
      .then((c) => {
        if (live) setCounts(c);
      })
      .catch(() => {
        if (live) setCounts({});
      });
    return () => {
      live = false;
    };
  }, [signedIn]);

  const download = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await exportAccountData();
      if (error || !data) {
        setStatus(error ?? "Could not build the export.");
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `huntr-account-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Downloaded.");
    } finally {
      setBusy(false);
    }
  };

  const rows = Object.entries(LABELS);

  return (
    <SettingsSection icon={Database} title="Your data" description="What this account holds, and how to take it with you.">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {rows.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-snow-peak">
              {counts ? counts[key] ?? 0 : "—"}
            </p>
          </div>
        ))}
      </div>

      <SettingRow label="Export everything" hint="One JSON file with the rows exactly as stored — watchlists, portfolios, valuations, charts.">
        <Button variant="outline" size="sm" className="gap-2" onClick={download} disabled={busy || !signedIn}>
          <Download className="h-3.5 w-3.5" />
          {busy ? "Building…" : "Download JSON"}
        </Button>
      </SettingRow>

      {status ? (
        <p className="text-xs text-mist" role="status">
          {status}
        </p>
      ) : null}
    </SettingsSection>
  );
}
