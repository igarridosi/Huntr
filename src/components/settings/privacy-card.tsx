"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { EyeOff } from "lucide-react";
import { SettingRow, SettingsSection, Toggle } from "./settings-section";
import { setTrackingOptOut } from "@/app/actions/account";
import { TRACKING_COOKIE } from "@/lib/settings/preferences";

const OPT_OUT_EVENT = "huntr:tracking-change";

/** The opt-out cookie is deliberately readable here: it is the reader's own choice. */
function readOptOut(): boolean {
  return document.cookie.split("; ").some((c) => c === `${TRACKING_COOKIE}=1`);
}

function subscribeToOptOut(onChange: () => void) {
  window.addEventListener(OPT_OUT_EVENT, onChange);
  return () => window.removeEventListener(OPT_OUT_EVENT, onChange);
}

export function PrivacyCard() {
  // The cookie is the state; the switch reads it rather than shadowing it.
  const optOut = useSyncExternalStore<boolean>(subscribeToOptOut, readOptOut, () => false);
  const [busy, setBusy] = useState(false);

  const change = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      await setTrackingOptOut(next);
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(OPT_OUT_EVENT));
    }
  }, []);

  return (
    <SettingsSection icon={EyeOff} title="Privacy" description="What Huntr records about how the product is used.">
      <SettingRow
        label="Don't count my usage"
        hint="Page views and product events stop being recorded in this browser. Nothing else changes."
      >
        <Toggle checked={optOut} onChange={change} label="Opt out of usage measurement" />
      </SettingRow>

      <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">What is recorded</p>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-mist">
          <li>· The page opened, and the company it was about.</li>
          <li>· A handful of product events: a valuation shown or withheld, an export, a saved chart.</li>
          <li>· A random id in a cookie, so two pages count as one visit.</li>
        </ul>
        <p className="mt-2.5 text-xs leading-relaxed text-mist/80">
          Not recorded: your IP address, your browser, where you came from, or anything you type. Query strings are cut
          off the path before it is stored.
        </p>
        {busy ? <p className="mt-2 text-[11px] text-mist/60">Saving…</p> : null}
      </div>
    </SettingsSection>
  );
}
