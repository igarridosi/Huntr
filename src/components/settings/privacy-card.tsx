"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EyeOff } from "lucide-react";
import { SettingRow, SettingsSection, Toggle } from "./settings-section";
import { TRACKING_COOKIE, TRACKING_MAX_AGE } from "@/lib/settings/preferences";

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

  /*
   * Written here rather than through a Server Action. The cookie is not
   * httpOnly — it is the reader's own choice, not a secret — and a
   * Server Action would re-render the whole route on every flip, which
   * is what made the switch jump instead of slide. This way the switch
   * answers on the press, with nothing in between.
   */
  const change = useCallback((next: boolean) => {
    document.cookie = next
      ? `${TRACKING_COOKIE}=1; path=/; max-age=${TRACKING_MAX_AGE}; samesite=lax`
      : `${TRACKING_COOKIE}=; path=/; max-age=0; samesite=lax`;
    window.dispatchEvent(new Event(OPT_OUT_EVENT));
  }, []);

  return (
    <SettingsSection icon={EyeOff} title="Privacy" description="What Huntr records about how the product is used." className="relative z-10">
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
      </div>
    </SettingsSection>
  );
}
