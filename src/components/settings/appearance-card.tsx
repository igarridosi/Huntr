"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { SettingRow, SettingsSection } from "./settings-section";
import { SelectMenu } from "@/components/ui/select-menu";
import { useTheme } from "@/providers/theme-provider";
import { cn } from "@/lib/utils";
import { DEFAULT_START_PAGE, readStartPage, START_PAGES, START_PAGE_KEY, type StartPage, type ThemePreference } from "@/lib/settings/preferences";

const THEMES: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
];

const START_PAGE_GROUPS = [{ label: "Open on", options: START_PAGES.map((p) => ({ value: p.value, label: p.label })) }];

const START_PAGE_EVENT = "huntr:start-page-change";

function subscribeToStartPage(onChange: () => void) {
  window.addEventListener(START_PAGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(START_PAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStoredStartPage(): StartPage {
  try {
    return readStartPage(localStorage.getItem(START_PAGE_KEY));
  } catch {
    // Storage can be blocked; the default stands.
    return DEFAULT_START_PAGE;
  }
}

export function AppearanceCard() {
  const { theme, preference, setPreference } = useTheme();
  // localStorage is an external store, and reading one in an effect is the
  // pattern the React Compiler rejects. The server snapshot is the default,
  // so hydration agrees and the real value arrives on the first client read.
  const startPage = useSyncExternalStore<StartPage>(subscribeToStartPage, readStoredStartPage, () => DEFAULT_START_PAGE);

  const chooseStartPage = useCallback((value: StartPage) => {
    try {
      localStorage.setItem(START_PAGE_KEY, value);
    } catch {
      // Nothing to persist to; nothing to announce either.
    }
    window.dispatchEvent(new Event(START_PAGE_EVENT));
  }, []);

  return (
    <SettingsSection icon={Palette} title="Appearance" description="How the terminal looks, and where it opens.">
      <SettingRow
        label="Theme"
        hint={preference === "system" ? `Following the system, which is ${theme} right now.` : "Fixed, whatever the system does."}
      >
        <div className="flex items-center gap-1 rounded-lg border border-wolf-border/60 bg-wolf-black/40 p-1">
          {THEMES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              aria-pressed={preference === value}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange",
                preference === value ? "bg-sunset-orange/15 text-sunset-orange" : "text-mist hover:text-snow-peak"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Start page" hint="Where signing in takes you.">
        <SelectMenu groups={START_PAGE_GROUPS} value={startPage} onChange={chooseStartPage} ariaLabel="Start page" className="w-48" />
      </SettingRow>
    </SettingsSection>
  );
}
