"use client";

import { cn } from "@/lib/utils";
import type { PeriodType } from "@/types/financials";

interface PeriodToggleProps {
  value: PeriodType;
  onChange: (value: PeriodType) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-wolf-black/50 border border-wolf-border/50 p-0.5">
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
        "min-h-9 cursor-pointer rounded-md px-3 py-2 text-xs font-medium transition-all sm:min-h-0 sm:py-1.5",
        active
          ? "bg-sunset-orange/15 text-sunset-orange border border-sunset-orange/20"
          : "text-mist hover:text-snow-peak"
      )}
    >
      {label}
    </button>
  );
}
