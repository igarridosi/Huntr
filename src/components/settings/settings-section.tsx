"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}

/** One card per subject, so the page reads as a list of decisions. */
export function SettingsSection({ icon: Icon, title, description, children }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-sunset-orange" aria-hidden /> {title}
        </CardTitle>
        <p className="text-xs leading-relaxed text-mist">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

interface SettingRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/** A label on the left, the control on the right, stacked on a phone. */
export function SettingRow({ label, hint, children }: SettingRowProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm text-snow-peak">{label}</p>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-mist">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A yes/no that reads as one, and says which it is without colour alone. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange focus-visible:ring-offset-2 focus-visible:ring-offset-wolf-black ${
        checked ? "bg-sunset-orange" : "bg-wolf-border"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-snow-peak transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
