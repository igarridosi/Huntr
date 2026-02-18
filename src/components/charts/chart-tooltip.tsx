"use client";

import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}

/**
 * Custom dark tooltip for Recharts — Wolf Palette themed.
 * Pass as `content={<ChartTooltip />}` to any Recharts chart component.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-wolf-border bg-wolf-black/95 px-3 py-2 shadow-xl backdrop-blur-sm",
        "text-xs"
      )}
    >
      {label && (
        <p className="text-mist/70 font-medium mb-1.5">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color ?? "#FF8C42" }}
              />
              <span className="text-mist">{entry.name}</span>
            </div>
            <span className="font-mono font-medium text-snow-peak">
              {formatter
                ? formatter(entry.value, entry.name)
                : entry.value?.toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
