"use client";

import { cn } from "@/lib/utils";
import type { PeriodType } from "@/types/financials";

interface PeriodToggleProps {
  value: PeriodType;
  onChange: (value: PeriodType) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-wolf-black/40 p-1 ring-1 ring-inset ring-wolf-border/40">
      <ToggleButton
        label="Annual"
        active={value === "annual"}
        onClick={() => onChange("annual")}
      />
      <ToggleButton
        label="Quarterly"
        active={value === "quarterly"}
        onClick={() => onChange("quarterly")}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 cursor-pointer rounded-lg px-3 text-[12px] font-medium",
        "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96]",
        "motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-7",
        active
          ? "bg-sunset-orange/12 text-sunset-orange"
          : "text-mist hover:text-snow-peak"
      )}
    >
      {label}
    </button>
  );
}
