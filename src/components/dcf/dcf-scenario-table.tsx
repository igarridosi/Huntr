"use client";

import { cn, formatPercent } from "@/lib/utils";
import type { DCFInputs, DCFScenarioKey, DCFScenarioSet } from "@/lib/calculations";
import { AlertTriangle } from "lucide-react";

/**
 * The three scenarios' assumptions side by side.
 *
 * Until now the only way to see all three was to switch tabs and hold the
 * numbers in your head, or export the JSON and read it. That is why a bear
 * case assuming margin expansion, and a base case starting below its own bear,
 * both survived: each looked reasonable alone, and nothing ever put them next
 * to each other.
 *
 * Eight rows, because eight is what the model takes. Deliberately dense - the
 * value of this panel is that the whole set fits in one glance, and a
 * comfortable version that needed scrolling would not do the one job it has.
 *
 * The row highlight lives here and the written warnings live in the tray
 * above it. Printing both in the same place said everything twice.
 */
interface DCFScenarioTableProps {
  scenarios: DCFScenarioSet;
  activeScenario: DCFScenarioKey;
  onScenarioChange: (scenario: DCFScenarioKey) => void;
  /** The live inputs, which the active scenario is showing. */
  liveInputs: DCFInputs;
}

const KEYS: DCFScenarioKey[] = ["bear", "base", "bull"];

type Row = {
  label: string;
  read: (inputs: DCFInputs) => number;
  format: (value: number) => string;
  /** Which way the figure should move from bear to bull, when it should. */
  direction: "up" | "down" | null;
};

const asPercent = (value: number) => formatPercent(value, 1);
const asYears = (value: number) => `${Math.round(value)}y`;

const ROWS: Row[] = [
  { label: "Growth ph.1", read: (i) => i.growthRatePhase1, format: asPercent, direction: "up" },
  { label: "Years ph.1", read: (i) => i.yearsPhase1, format: asYears, direction: null },
  { label: "Growth ph.2", read: (i) => i.growthRatePhase2, format: asPercent, direction: "up" },
  { label: "Years ph.2", read: (i) => i.yearsPhase2, format: asYears, direction: null },
  { label: "FCF margin", read: (i) => i.baseFCFMargin, format: asPercent, direction: "up" },
  { label: "Terminal margin", read: (i) => i.terminalFCFMargin, format: asPercent, direction: "up" },
  { label: "WACC", read: (i) => i.wacc, format: asPercent, direction: "down" },
  { label: "Terminal growth", read: (i) => i.terminalGrowthRate, format: asPercent, direction: "up" },
];

export function DCFScenarioTable({
  scenarios,
  activeScenario,
  onScenarioChange,
  liveInputs,
}: DCFScenarioTableProps) {
  // The active scenario is shown as it currently stands. Reading it from the
  // stored set would print the values before the last slider moved.
  const inputsFor = (key: DCFScenarioKey) =>
    key === activeScenario ? liveInputs : scenarios[key].inputs;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
        All three scenarios
      </p>

      <div className="overflow-x-auto scroll-quiet">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="pb-1 text-left font-medium text-mist/50" />
              {KEYS.map((key) => (
                <th key={key} className="pb-1 text-right">
                  <button
                    type="button"
                    onClick={() => onScenarioChange(key)}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-medium capitalize",
                      "transition-[background-color,color] duration-150 ease-out",
                      key === activeScenario
                        ? "bg-sunset-orange/15 text-sunset-orange"
                        : "text-mist hover:bg-snow-peak/[0.06] hover:text-snow-peak",
                      "motion-reduce:transition-none"
                    )}
                  >
                    {key}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = KEYS.map((key) => row.read(inputsFor(key)));
              // Flagged per row rather than per scenario, so the eye lands on
              // the line that is out of order instead of on a banner about it.
              const outOfOrder =
                row.direction === null
                  ? false
                  : row.direction === "up"
                    ? !(values[0] <= values[1] && values[1] <= values[2])
                    : !(values[0] >= values[1] && values[1] >= values[2]);

              return (
                <tr
                  key={row.label}
                  className="border-t border-wolf-border/20 first:border-t-0"
                >
                  <td className="py-1 pr-2 text-mist/70">
                    <span className="inline-flex items-center gap-1">
                      {outOfOrder ? (
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-golden-hour" />
                      ) : null}
                      {row.label}
                    </span>
                  </td>
                  {values.map((value, index) => (
                    <td
                      key={KEYS[index]}
                      className={cn(
                        "py-1 text-right font-mono tabular-nums",
                        outOfOrder ? "text-golden-hour" : "text-snow-peak",
                        KEYS[index] === activeScenario && "font-semibold"
                      )}
                    >
                      {row.format(value)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
