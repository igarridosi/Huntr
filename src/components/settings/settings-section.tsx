"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  /** A destructive section reads as one before it is read at all. */
  tone?: "default" | "danger";
}

/**
 * One card per subject, so the page reads as a list of decisions.
 *
 * The card is a translucent material rather than a flat panel: a large
 * surface reads as thicker than a chip, so the blur and the shadow are
 * heavier here than on the rows inside it. Under
 * `prefers-reduced-transparency` the blur drops and the background goes
 * solid, which is the whole point of that setting.
 */
export function SettingsSection({ icon: Icon, title, description, children, tone = "default" }: SettingsSectionProps) {
  const danger = tone === "danger";
  return (
    <section
      className={[
        "rounded-2xl p-5 shadow-xl backdrop-blur-xl motion-reduce:transition-none",
        "supports-[backdrop-filter]:bg-wolf-surface/60 bg-wolf-surface",
        "[@media(prefers-reduced-transparency:reduce)]:bg-wolf-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
        danger
          ? "ring-1 ring-inset ring-bearish/30 shadow-bearish/[0.06]"
          : "ring-1 ring-inset ring-wolf-border/60 shadow-wolf-black/40",
      ].join(" ")}
    >
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold leading-tight tracking-[-0.01em] text-snow-peak">
          <Icon className={`h-4 w-4 ${danger ? "text-bearish" : "text-sunset-orange"}`} aria-hidden />
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-mist">{description}</p>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  hint?: string;
  children?: ReactNode;
  /** The control sits under the label instead of beside it. */
  stacked?: boolean;
}

/** A label on the left, the control on the right, stacked on a phone. */
export function SettingRow({ label, hint, children, stacked = false }: SettingRowProps) {
  return (
    <div
      className={[
        "rounded-xl border border-wolf-border/40 bg-wolf-black/25 p-4",
        stacked ? "space-y-3" : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="text-sm leading-tight text-snow-peak">{label}</p>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-mist">{hint}</p> : null}
      </div>
      {children ? <div className={stacked ? "" : "shrink-0"}>{children}</div> : null}
    </div>
  );
}

/**
 * A yes/no that reads as one. The knob moves on a critically damped
 * curve — no overshoot on a control that carries no momentum — and the
 * whole switch dips the instant it is pressed rather than on release.
 */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-7 w-[52px] rounded-full ring-1 ring-inset transition-[background-color,transform] duration-200 ease-out",
        "active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange focus-visible:ring-offset-2 focus-visible:ring-offset-wolf-black",
        checked ? "bg-sunset-orange ring-sunset-orange/40" : "bg-wolf-border/70 ring-wolf-border",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "absolute top-1 h-5 w-5 rounded-full bg-snow-peak shadow-sm",
          "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          "motion-reduce:transition-none",
          checked ? "translate-x-[26px]" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; Icon?: LucideIcon }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

/**
 * A segmented control whose selection slides between options instead of
 * blinking from one to the next: the indicator is a single element that
 * travels, so the eye follows the choice rather than re-finding it.
 */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative grid gap-1 rounded-xl border border-wolf-border/60 bg-wolf-black/40 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* The travelling selection. Transform only, so it stays on the compositor. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-lg bg-sunset-orange/15 ring-1 ring-inset ring-sunset-orange/30 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(calc(${index} * (100% + 0.25rem)))`,
        }}
      />
      {options.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={[
            "relative z-10 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-[color,transform] duration-150",
            "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange",
            v === value ? "font-medium text-sunset-orange" : "text-mist hover:text-snow-peak",
          ].join(" ")}
        >
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}
