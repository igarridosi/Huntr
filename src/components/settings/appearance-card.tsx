"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { Segmented, SettingRow, SettingsSection } from "./settings-section";
import { SelectMenu } from "@/components/ui/select-menu";
import { useTheme } from "@/providers/theme-provider";
import {
  DEFAULT_START_PAGE,
  START_PAGES,
  START_PAGE_COOKIE,
  START_PAGE_MAX_AGE,
  startPageFromCookieString,
  type StartPage,
  type ThemePreference,
} from "@/lib/settings/preferences";

const THEMES = [
  { value: "dark" as ThemePreference, label: "Dark", Icon: Moon },
  { value: "light" as ThemePreference, label: "Light", Icon: Sun },
  { value: "system" as ThemePreference, label: "System", Icon: Monitor },
] as const;

const START_PAGE_GROUPS = [{ label: "Open on", options: START_PAGES.map((p) => ({ value: p.value, label: p.label })) }];

const START_PAGE_EVENT = "huntr:start-page-change";

function subscribeToStartPage(onChange: () => void) {
  window.addEventListener(START_PAGE_EVENT, onChange);
  return () => window.removeEventListener(START_PAGE_EVENT, onChange);
}

/** The cookie is the state — the same value the middleware redirects on. */
function readStoredStartPage(): StartPage {
  return startPageFromCookieString(document.cookie);
}

export function AppearanceCard() {
  const { theme, preference, setPreference } = useTheme();
  // The cookie is an external store, and reading one in an effect is the
  // pattern the React Compiler rejects. The server snapshot is the
  // default, so hydration agrees and the real value arrives on the first
  // client read.
  const startPage = useSyncExternalStore<StartPage>(subscribeToStartPage, readStoredStartPage, () => DEFAULT_START_PAGE);

  const chooseStartPage = useCallback((value: StartPage) => {
    document.cookie = `${START_PAGE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${START_PAGE_MAX_AGE}; samesite=lax`;
    window.dispatchEvent(new Event(START_PAGE_EVENT));
  }, []);

  const startLabel = START_PAGES.find((p) => p.value === startPage)?.label ?? "Dashboard";

  return (
    <SettingsSection icon={Palette} title="Appearance" description="How the terminal looks, and where it opens.">
      <SettingRow
        label="Theme"
        hint={preference === "system" ? `Following the system, which is ${theme} right now.` : "Fixed, whatever the system does."}
        stacked
      >
        <Segmented options={THEMES} value={preference} onChange={setPreference} ariaLabel="Theme" />
      </SettingRow>

      <SettingRow label="Start page" hint={`Opening Huntr while signed in takes you to ${startLabel}.`}>
        <SelectMenu groups={START_PAGE_GROUPS} value={startPage} onChange={chooseStartPage} ariaLabel="Start page" className="w-48" />
      </SettingRow>
    </SettingsSection>
  );
}
