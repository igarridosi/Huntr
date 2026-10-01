import { BarChart3, Sigma, ShieldCheck, SlidersHorizontal } from "lucide-react";

/*
 * One demo valuation, and every figure on the card derived from it, so the
 * numbers agree: the intrinsic value, the price it beats by 26.4%, the
 * Monte Carlo spread around it, and the sensitivity grid whose centre is it.
 */
const INTRINSIC = 321.52;
const PRICE = INTRINSIC / 1.264;
const PV_FCF = 1.67;
const PV_TV = 3.09;

const assumptions = [
  { label: "Phase 1 Growth", value: 12, unit: "%", min: 0, max: 25 },
  { label: "Phase 1 Duration", value: 5, unit: " yrs", min: 0, max: 10 },
  { label: "Phase 2 Growth", value: 6, unit: "%", min: 0, max: 15 },
  { label: "Terminal Growth", value: 3, unit: "%", min: 0, max: 5 },
  { label: "WACC", value: 8.5, unit: "%", min: 5, max: 15 },
];

/** Monte Carlo outcomes: lognormal around the model's median. */
const MC_MEDIAN = 324;
const MC_SIGMA = 0.396;
const MC_RUNS = 2000;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
const cdf = (x: number) => phi(Math.log(x / MC_MEDIAN) / MC_SIGMA);
const quantile = (z: number) => MC_MEDIAN * Math.exp(MC_SIGMA * z);

const BIN_FROM = 100;
const BIN_WIDTH = 22;
const BIN_COUNT = 30;
const bins = Array.from({ length: BIN_COUNT }, (_, i) => {
  const lo = BIN_FROM + i * BIN_WIDTH;
  return { lo, hi: lo + BIN_WIDTH, p: cdf(lo + BIN_WIDTH) - cdf(lo) };
});
const maxBin = Math.max(...bins.map((b) => b.p));
const BIN_TO = BIN_FROM + BIN_COUNT * BIN_WIDTH;
const xPct = (value: number) => ((value - BIN_FROM) / (BIN_TO - BIN_FROM)) * 100;

const mcStats = [
  { label: "Mean", value: MC_MEDIAN * Math.exp((MC_SIGMA * MC_SIGMA) / 2) },
  { label: "Median", value: MC_MEDIAN },
  { label: "P10", value: quantile(-1.2816) },
  { label: "P90", value: quantile(1.2816) },
];
const probAbovePrice = 1 - cdf(PRICE);

const TGR = [2, 2.5, 3, 3.5, 4];
const WACC = [6.5, 7.5, 8.5, 9.5, 10.5];
const sensitivity = [
  [430, 471, 522, 591, 687],
  [346, 370, 399, 436, 483],
  [287, 303, 322, 344, 371],
  [245, 256, 268, 282, 299],
  [213, 220, 229, 239, 250],
];

/** Heat by upside over the price: orange above it, red below. */
function cellStyle(value: number) {
  const upside = value / PRICE - 1;
  if (upside >= 0) return { backgroundColor: `rgba(255,140,66,${(Math.min(upside / 1.3, 1) * 0.42 + 0.05).toFixed(3)})` };
  return { backgroundColor: `rgba(255,66,66,${(Math.min(-upside / 0.2, 1) * 0.3 + 0.06).toFixed(3)})` };
}

const usd = (value: number) => `$${Math.round(value)}`;

export function DCFShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">

      <div className="mb-8 max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">DCF Calculator + Monte Carlo Engine</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist sm:text-base">
          Scenario-driven valuation, probability distribution, and sensitivity analysis in one premium workflow. This is
          where valuation turns from opinion into structured decision-making.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.25fr]">
        {/* Assumptions */}
        <article className="huntr-grain rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-snow-peak">Model Assumptions</h3>
            <span className="rounded-md border border-wolf-border/50 bg-wolf-black/30 px-2 py-0.5 font-mono text-[10px] text-mist">
              Auto-filled
            </span>
          </div>

          <ul className="divide-y divide-wolf-border/40">
            {assumptions.map((item) => {
              const pct = ((item.value - item.min) / (item.max - item.min)) * 100;
              return (
                <li key={item.label} className="py-3 first:pt-0 last:pb-0">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-mist">{item.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-snow-peak">
                      {item.value.toFixed(item.unit === "%" ? 1 : 0)}
                      {item.unit}
                    </span>
                  </div>
                  {/* A slider at rest: the track is the input's range */}
                  <div className="relative h-1.5 rounded-full bg-wolf-border/40">
                    <div className="h-full rounded-full bg-gradient-to-r from-sunset-orange/60 to-sunset-orange" style={{ width: `${pct}%` }} />
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sunset-orange bg-wolf-black"
                      style={{ left: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[9px] text-mist/60">
                    <span>{item.min}</span>
                    <span>{item.max}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        {/* Output */}
        <article className="huntr-grain flex flex-col gap-3 rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-snow-peak">Valuation Output</h3>

          <div className="rounded-xl border border-sunset-orange/25 bg-wolf-black/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Intrinsic value · demo</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <p className="font-mono text-4xl font-bold tabular-nums text-snow-peak">${INTRINSIC.toFixed(2)}</p>
              <p className="font-mono text-sm text-bullish">+26.4% vs price</p>
            </div>
            {/* Price against value, on one scale: value labelled above, price below */}
            <div className="relative mt-5 h-3 font-mono text-[10px]">
              <span className="absolute -translate-x-1/2 whitespace-nowrap text-sunset-orange" style={{ left: `${(1 / 1.15) * 100}%` }}>
                value
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-wolf-border/40">
              <div
                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-golden-hour/70 to-sunset-orange"
                style={{ left: `${(PRICE / (INTRINSIC * 1.15)) * 100}%`, width: `${((INTRINSIC - PRICE) / (INTRINSIC * 1.15)) * 100}%` }}
              />
              <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-snow-peak" style={{ left: `${(PRICE / (INTRINSIC * 1.15)) * 100}%` }} />
              <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-sunset-orange" style={{ left: `${(1 / 1.15) * 100}%` }} />
            </div>
            <div className="relative mt-1.5 h-3 font-mono text-[10px]">
              <span className="absolute -translate-x-1/2 whitespace-nowrap text-mist" style={{ left: `${(PRICE / (INTRINSIC * 1.15)) * 100}%` }}>
                price ${PRICE.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Margin of Safety</p>
              <p className="mt-1 font-mono text-lg font-bold text-bullish">{((1 - PRICE / INTRINSIC) * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Terminal Weight</p>
              <p className="mt-1 font-mono text-lg font-bold text-sunset-orange">{((PV_TV / (PV_FCF + PV_TV)) * 100).toFixed(1)}%</p>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Value Bridge</p>
            <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
              <div className="bg-golden-hour" style={{ width: `${(PV_FCF / (PV_FCF + PV_TV)) * 100}%` }} />
              <div className="flex-1 bg-sunset-orange" />
            </div>
            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-y-1 text-[12px]">
              <span className="inline-flex items-center gap-2 text-mist"><span className="h-2 w-2 rounded-sm bg-golden-hour" />PV of FCFs</span>
              <span className="text-right font-mono text-snow-peak">{PV_FCF.toFixed(2)}T</span>
              <span className="inline-flex items-center gap-2 text-mist"><span className="h-2 w-2 rounded-sm bg-sunset-orange" />PV of Terminal Value</span>
              <span className="text-right font-mono text-snow-peak">{PV_TV.toFixed(2)}T</span>
              <span className="border-t border-wolf-border/40 pt-1 text-mist">Enterprise Value</span>
              <span className="border-t border-wolf-border/40 pt-1 text-right font-mono font-semibold text-snow-peak">{(PV_FCF + PV_TV).toFixed(2)}T</span>
            </div>
          </div>
        </article>
      </div>

      {/* Monte Carlo */}
      <article className="huntr-grain mt-4 rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-snow-peak">
            <Sigma className="h-4 w-4 text-sunset-orange" />
            Monte Carlo Simulation
          </h3>
          <span className="rounded-md border border-wolf-border/50 bg-wolf-black/30 px-2 py-0.5 font-mono text-[10px] text-mist">
            {MC_RUNS.toLocaleString("en-US")} runs
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mcStats.map((s) => (
            <div key={s.label} className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-2.5 text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-mist">{s.label}</p>
              <p className="font-mono text-sm font-semibold tabular-nums text-snow-peak">{usd(s.value)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-wolf-border/40 bg-wolf-black/30 p-3 pb-2 pt-7">
          <div className="relative h-36">
            <div className="flex h-full items-end gap-[3px]">
              {bins.map((b) => {
                const atPrice = b.lo <= PRICE && PRICE < b.hi;
                const above = b.lo >= PRICE;
                return (
                  <div
                    key={b.lo}
                    className={`flex-1 rounded-t-sm ${atPrice ? "bg-golden-hour" : above ? "bg-sunset-orange/80" : "bg-[#2A4A52]"}`}
                    style={{ height: `${Math.max((b.p / maxBin) * 100, 1.5)}%` }}
                  />
                );
              })}
            </div>
            {/* Price and median markers */}
            <div className="absolute inset-y-0 border-l border-dashed border-snow-peak/70" style={{ left: `${xPct(PRICE)}%` }}>
              <span className="absolute -top-5 right-1.5 whitespace-nowrap font-mono text-[9px] text-snow-peak">price {usd(PRICE)}</span>
            </div>
            <div className="absolute inset-y-0 border-l border-dashed border-sunset-orange/80" style={{ left: `${xPct(MC_MEDIAN)}%` }}>
              <span className="absolute -top-5 left-1.5 whitespace-nowrap font-mono text-[9px] text-sunset-orange">median {usd(MC_MEDIAN)}</span>
            </div>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-wolf-border/40 pt-1.5 font-mono text-[9px] text-mist/70">
            {[100, 265, 430, 595, 760].map((v) => (
              <span key={v}>${v}</span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3 text-sm text-mist">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-sunset-orange/80" />
            Probability above current price
          </span>
          <span className="font-mono font-semibold text-sunset-orange">{(probAbovePrice * 100).toFixed(1)}%</span>
        </div>
      </article>

      {/* Sensitivity */}
      <article className="huntr-grain mt-4 rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-snow-peak">
            <BarChart3 className="h-4 w-4 text-sunset-orange" />
            Sensitivity Analysis (WACC × TGR)
          </h3>
          <span className="font-mono text-[10px] text-mist">heat = upside over price {usd(PRICE)}</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-sm">
            <thead>
              <tr className="text-mist">
                <th className="w-24 py-1.5 text-left font-mono text-[10px] font-medium">WACC \ TGR</th>
                {TGR.map((t) => (
                  <th key={t} className={`py-1.5 font-mono text-[11px] font-medium ${t === 3 ? "text-sunset-orange" : ""}`}>
                    {t.toFixed(1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitivity.map((row, r) => (
                <tr key={WACC[r]}>
                  <td className={`py-1.5 text-left font-mono text-[11px] ${WACC[r] === 8.5 ? "text-sunset-orange" : "text-mist"}`}>
                    {WACC[r].toFixed(1)}%
                  </td>
                  {row.map((value, c) => (
                    <td
                      key={c}
                      className={`rounded-md py-2 font-mono text-[13px] tabular-nums text-snow-peak ${r === 2 && c === 2 ? "outline-2 -outline-offset-2 outline-snow-peak/80 font-bold" : ""}`}
                      style={cellStyle(value)}
                    >
                      {usd(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-wolf-border/50 bg-wolf-border/40 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, label: "Regime-based assumptions" },
          { icon: SlidersHorizontal, label: "One-click scenario switching" },
          { icon: Sigma, label: "Probabilistic valuation layer" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="inline-flex items-center gap-2 bg-wolf-black p-4 text-sm text-mist">
            <Icon className="h-4 w-4 text-sunset-orange" />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}
