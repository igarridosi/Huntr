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
        "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
        active
          ? "bg-sunset-orange/15 text-sunset-orange border border-sunset-orange/20"
          : "text-mist hover:text-snow-peak"
      )}
    >
      {label}
    </button>
  );
}
