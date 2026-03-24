import {
  Calculator,
  BarChart3,
  Sigma,
  ShieldCheck,
  TrendingUp,
  SlidersHorizontal,
} from "lucide-react";

const assumptions = [
  { label: "Phase 1 Growth", value: "12.0%" },
  { label: "Phase 1 Duration", value: "5 years" },
  { label: "Phase 2 Growth", value: "6.0%" },
  { label: "WACC", value: "8.5%" },
];

const histogramBars = [
  28, 44, 58, 70, 76, 82, 86, 84, 90, 81, 67, 62, 59, 46, 54, 44, 31, 36, 25, 24, 18, 21, 19, 15, 16, 13, 12,
];

const sensitivityRows = [
  ["$430", "$471", "$522", "$591", "$687"],
  ["$346", "$370", "$399", "$436", "$483"],
  ["$287", "$303", "$322", "$344", "$371"],
  ["$245", "$256", "$268", "$282", "$299"],
  ["$213", "$220", "$229", "$239", "$250"],
];

function valueColor(value: string): string {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(numeric)) return "text-snow-peak";
  if (numeric >= 300) return "text-[#4DC990]";
  if (numeric < 230) return "text-[#FF4242]";
  return "text-golden-hour";
}

export function DCFShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_18%,rgba(255,140,66,0.1),transparent_35%),radial-gradient(circle_at_85%_82%,rgba(77,201,144,0.09),transparent_40%)]" />

      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">DCF Calculator + Monte Carlo Engine</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist sm:text-base">
            Scenario-driven valuation, probability distribution, and sensitivity analysis in one premium workflow. This
            is where valuation turns from opinion into structured decision-making.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-snow-peak">Model Assumptions</h3>
            <span className="rounded-md border border-wolf-border/50 bg-wolf-black/25 px-2 py-0.5 text-[10px] text-mist">
              Auto-filled
            </span>
          </div>

          <div className="space-y-3">
            {assumptions.map((item, idx) => (
              <div key={item.label} className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-mist">{item.label}</span>
                  <span className="font-mono text-snow-peak">{item.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-wolf-border/40">
                  <div
                    className="h-full rounded-full bg-sunset-orange"
                    style={{ width: `${25 + idx * 14}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <h3 className="text-sm font-semibold text-snow-peak">Valuation Output</h3>
          <div className="mt-3 rounded-xl border border-wolf-border/45 bg-wolf-black/25 p-4">
            <p className="text-[11px] uppercase tracking-wide text-mist">Intrinsic Value — Demo</p>
            <p className="mt-1 text-4xl font-bold font-mono text-snow-peak">$321.52</p>
            <p className="mt-2 text-sm text-[#4DC990]">+26.4% vs current price</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
              <p className="text-[10px] uppercase tracking-wide text-mist">Margin of Safety</p>
              <p className="mt-1 text-lg font-bold text-[#4DC990]">20.9%</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
              <p className="text-[10px] uppercase tracking-wide text-mist">Terminal Weight</p>
              <p className="mt-1 text-lg font-bold text-sunset-orange">64.9%</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
            <p className="text-[10px] uppercase tracking-wide text-mist">Value Bridge</p>
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-[12px]">
              <span className="text-mist">PV of FCFs</span>
              <span className="text-right font-mono text-snow-peak">1.67T</span>
              <span className="text-mist">PV of Terminal Value</span>
              <span className="text-right font-mono text-snow-peak">3.09T</span>
              <span className="text-mist">Enterprise Value</span>
              <span className="text-right font-mono font-semibold text-snow-peak">4.76T</span>
            </div>
          </div>
        </article>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-snow-peak inline-flex items-center gap-2">
              <Sigma className="h-4 w-4 text-sunset-orange" />
              Monte Carlo Simulation
            </h3>
            <span className="rounded-md border border-wolf-border/50 bg-wolf-black/25 px-2 py-0.5 text-[10px] text-mist">
              2,000 runs
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2 text-center">
              <p className="text-[10px] text-mist">Mean</p>
              <p className="text-sm font-semibold font-mono text-snow-peak">$353</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2 text-center">
              <p className="text-[10px] text-mist">Median</p>
              <p className="text-sm font-semibold font-mono text-snow-peak">$324</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2 text-center">
              <p className="text-[10px] text-mist">P10</p>
              <p className="text-sm font-semibold font-mono text-snow-peak">$207</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2 text-center">
              <p className="text-[10px] text-mist">P90</p>
              <p className="text-sm font-semibold font-mono text-snow-peak">$538</p>
            </div>
          </div>

          <div className="rounded-xl border border-wolf-border/40 bg-wolf-black/25 p-3">
            <div className="flex h-32 items-end gap-1">
              {histogramBars.map((value, idx) => (
                <div
                  key={`hist-${idx}`}
                  className={`flex-1 rounded-t ${idx < 6 ? "bg-bearish/55" : idx === 6 ? "bg-golden-hour" : "bg-[#4DC990]/65"}`}
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3 text-sm text-mist inline-flex items-center gap-2 w-full justify-between">
            <span className="inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#4DC990]" />
              Probability above current price
            </span>
            <span className="font-mono text-sunset-orange font-semibold">75.6%</span>
          </div>
        </article>

        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <h3 className="text-sm font-semibold text-snow-peak inline-flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sunset-orange" />
            Sensitivity Analysis (WACC x TGR)
          </h3>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-center text-sm">
              <thead>
                <tr className="border-b border-wolf-border/45 text-mist">
                  <th className="py-2 text-left text-xs font-medium">WACC \ TGR</th>
                  <th className="py-2 text-xs">2.0%</th>
                  <th className="py-2 text-xs">2.5%</th>
                  <th className="py-2 text-xs text-sunset-orange">3.0%</th>
                  <th className="py-2 text-xs">3.5%</th>
                  <th className="py-2 text-xs">4.0%</th>
                </tr>
              </thead>
              <tbody>
                {sensitivityRows.map((row, rowIdx) => (
                  <tr key={`row-${rowIdx}`} className="border-b border-wolf-border/25 last:border-0">
                    <td className="py-2 text-left text-xs text-mist">{`${6.5 + rowIdx}%`}</td>
                    {row.map((cell, cellIdx) => (
                      <td
                        key={`${rowIdx}-${cellIdx}`}
                        className={`py-2 font-mono ${rowIdx === 2 && cellIdx === 2 ? "rounded bg-sunset-orange/12" : ""} ${valueColor(cell)}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-wolf-border/45 bg-wolf-black/20 p-3 text-sm text-mist inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#4DC990]" />
          Regime-based assumptions
        </div>
        <div className="rounded-lg border border-wolf-border/45 bg-wolf-black/20 p-3 text-sm text-mist inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-sunset-orange" />
          One-click scenario switching
        </div>
        <div className="rounded-lg border border-wolf-border/45 bg-wolf-black/20 p-3 text-sm text-mist inline-flex items-center gap-2">
          <Sigma className="h-4 w-4 text-golden-hour" />
          Probabilistic valuation layer
        </div>
      </div>
    </section>
  );
}
