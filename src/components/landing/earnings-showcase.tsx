import { CalendarClock, Filter, Search, Sparkles, Clock3 } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";

const dayColumns = [
  {
    day: "Mon",
    date: "27",
    pre: ["VZ"],
    post: [],
  },
  {
    day: "Tue",
    date: "28",
    pre: ["KO", "NVS"],
    post: ["V"],
  },
  {
    day: "Wed",
    date: "29",
    pre: [],
    post: ["MSFT", "META", "AZN", "KLAC"],
  },
  {
    day: "Thu",
    date: "30",
    pre: ["LLY", "MA", "CAT", "MRK", "LIN"],
    post: ["AAPL", "AMZN", "MCD"],
  },
  {
    day: "Fri",
    date: "1",
    pre: ["XOM", "CVX", "ABBV"],
    post: [],
  },
] as const;

const logoMap: Record<string, string> = {
  VZ: "https://cdn.tickerlogos.com/verizon.com",
  KO: "https://cdn.tickerlogos.com/coca-colacompany.com",
  NVS: "https://cdn.tickerlogos.com/novartis.com",
  V: "https://cdn.tickerlogos.com/visa.com",
  MSFT: "https://cdn.tickerlogos.com/microsoft.com",
  META: "https://cdn.tickerlogos.com/meta.com",
  AZN: "https://cdn.tickerlogos.com/astrazeneca.com",
  KLAC: "https://cdn.tickerlogos.com/kla.com",
  LLY: "https://cdn.tickerlogos.com/lilly.com",
  MA: "https://cdn.tickerlogos.com/mastercard.com",
  CAT: "https://cdn.tickerlogos.com/caterpillar.com",
  MRK: "https://cdn.tickerlogos.com/merck.com",
  LIN: "https://cdn.tickerlogos.com/linde.com",
  AAPL: "https://cdn.tickerlogos.com/apple.com",
  AMZN: "https://cdn.tickerlogos.com/amazon.com",
  MCD: "https://cdn.tickerlogos.com/mcdonalds.com",
  XOM: "https://cdn.tickerlogos.com/exxonmobil.com",
  CVX: "https://cdn.tickerlogos.com/chevron.com",
  ABBV: "https://cdn.tickerlogos.com/abbvie.com",
};

const epsPoints = [
  { quarter: "Q4 '22", estimate: 2.4, reported: 2.35 },
  { quarter: "Q1 '23", estimate: 2.58, reported: 2.64 },
  { quarter: "Q2 '23", estimate: 2.72, reported: 2.81 },
  { quarter: "Q3 '23", estimate: 2.81, reported: 2.74 },
  { quarter: "Q4 '23", estimate: 2.88, reported: 2.96 },
  { quarter: "Q1 '24", estimate: 2.97, reported: 3.02 },
  { quarter: "Q2 '24", estimate: 3.16, reported: 3.11 },
  { quarter: "Q3 '24", estimate: 3.28, reported: 3.33 },
  { quarter: "Q4 '24", estimate: 3.34, reported: 3.43 },
  { quarter: "Q1 '25", estimate: 3.49, reported: 3.52 },
  { quarter: "Q2 '25", estimate: 3.62, reported: 3.58 },
  { quarter: "Q3 '25", estimate: 3.72, reported: 3.82 },
  { quarter: "Q4 '25", estimate: 3.85, reported: 3.92 },
  { quarter: "Q2 '26", estimate: 4.09, reported: 4.2 },
];

const epsTicks = [1.8, 2.7, 3.6, 4.5, 5.4] as const;

function mapEpsToY(value: number, min: number, max: number, top: number, bottom: number): number {
  if (max === min) return bottom;
  const ratio = (value - min) / (max - min);
  return bottom - ratio * (bottom - top);
}

export function EarningsShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(255,140,66,0.08),transparent_35%),radial-gradient(circle_at_88%_82%,rgba(77,201,144,0.07),transparent_40%)]" />

      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">
            Earnings Intelligence
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-mist sm:text-base">
            A high-signal earnings workspace combining weekly calendar flow, before/after market buckets, and fast
            estimate context in one professional view.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-surface/40 px-2 py-1 text-[10px] font-mono text-mist">
          <Sparkles className="h-3 w-3 text-sunset-orange" />
          Institutional Calendar Flow
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_0.95fr]">
        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-snow-peak">
              <CalendarClock className="h-4 w-4 text-sunset-orange" />
              Earnings This Week
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-black/30 px-2 py-1 text-[10px] text-mist">
                <Search className="h-3 w-3" />
                Search
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-black/30 px-2 py-1 text-[10px] text-mist">
                <Filter className="h-3 w-3" />
                Watchlist Filter
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {dayColumns.map((col) => (
              <div key={col.day} className="rounded-xl border border-wolf-border/45 bg-wolf-black/22 p-2.5">
                <div className="mb-2 border-b border-wolf-border/35 pb-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-mist">{col.day}</p>
                  <p className="text-sm font-semibold text-snow-peak">{col.date}</p>
                </div>

                <div className="space-y-2">
                  <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/30 p-2">
                    <p className="text-[10px] text-mist inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" /> Before Open
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {col.pre.length > 0 ? (
                        col.pre.map((ticker) => (
                          <span key={`${col.day}-${ticker}`} className="inline-flex items-center gap-1 rounded-md border border-wolf-border/45 bg-wolf-black/35 px-1.5 py-0.5 text-[10px] font-mono text-snow-peak">
                            <TickerLogo ticker={ticker} src={logoMap[ticker]} className="h-4 w-4" imageClassName="rounded" fallbackClassName="rounded text-[8px]" />
                            {ticker}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-mist/70">No reports</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/30 p-2">
                    <p className="text-[10px] text-mist inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" /> After Close
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {col.post.length > 0 ? (
                        col.post.map((ticker) => (
                          <span key={`${col.day}-${ticker}`} className="inline-flex items-center gap-1 rounded-md border border-wolf-border/45 bg-wolf-black/35 px-1.5 py-0.5 text-[10px] font-mono text-snow-peak">
                            <TickerLogo ticker={ticker} src={logoMap[ticker]} className="h-4 w-4" imageClassName="rounded" fallbackClassName="rounded text-[8px]" />
                            {ticker}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-mist/70">No reports</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4">
          <div className="mb-3 flex items-center gap-3">
            <TickerLogo ticker="MSFT" src={logoMap.MSFT} className="h-10 w-10" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[10px]" />
            <div>
              <h3 className="text-lg font-semibold text-snow-peak m-2">MSFT</h3>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2">
              <p className="text-[10px] text-mist">MKT CAP</p>
              <p className="text-sm font-semibold text-snow-peak">2.77T</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2">
              <p className="text-[10px] text-mist">P/E</p>
              <p className="text-sm font-semibold text-snow-peak">23.3</p>
            </div>
            <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-2">
              <p className="text-[10px] text-mist">P/S</p>
              <p className="text-sm font-semibold text-snow-peak">9.8</p>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-mist">Next Estimate</p>
            <p className="text-base font-semibold text-snow-peak mt-1">EPS: $4.09</p>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-mist mb-2">Estimate EPS</p>
            <svg viewBox="0 0 600 220" className="h-40 w-full" preserveAspectRatio="none" aria-hidden>
              {(() => {
                const left = 64;
                const right = 580;
                const top = 24;
                const bottom = 170;

                const min = epsTicks[0];
                const max = epsTicks[epsTicks.length - 1];
                const xStep = (right - left) / (epsPoints.length - 1);

                return (
                  <>
                    <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" />

                    {epsTicks.map((tick) => {
                      const y = mapEpsToY(tick, min, max, top, bottom);
                      return (
                        <g key={`tick-${tick}`}>
                          <line x1={left} y1={y} x2={right} y2={y} stroke="#22353A" strokeWidth="0.9" strokeDasharray="3 4" />
                          <text x={left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#8EA1A8">${tick.toFixed(2)}</text>
                        </g>
                      );
                    })}

                    {epsPoints.map((point, idx) => {
                      const x = left + idx * xStep;
                      return (
                        <line
                          key={`vline-${point.quarter}`}
                          x1={x}
                          y1={top}
                          x2={x}
                          y2={bottom}
                          stroke="#1D2D31"
                          strokeWidth="0.8"
                          strokeDasharray="2 5"
                        />
                      );
                    })}

                    {epsPoints.map((point, idx) => {
                      const x = left + idx * xStep;
                      const yEstimate = mapEpsToY(point.estimate, min, max, top, bottom);
                      const yReported = mapEpsToY(point.reported, min, max, top, bottom);
                      const beat = point.reported >= point.estimate;

                      return (
                        <g key={`dot-${point.quarter}`}>
                          <circle cx={x} cy={yEstimate} r={4.7} fill="#0F1D20" stroke="#7D8D92" strokeWidth="1.8" />
                          <circle cx={x} cy={yReported} r={5.1} fill={beat ? "#27D7A1" : "#FF4A4A"} />
                        </g>
                      );
                    })}

                    <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#2A3B40" strokeWidth="1" />

                    {epsPoints.map((point, idx) => {
                      const x = left + idx * xStep;
                      return (
                        <text
                          key={`xlabel-${point.quarter}`}
                          x={x - 6}
                          y={188}
                          transform={`rotate(-45 ${x - 6} 188)`}
                          fontSize="9"
                          fill="#7F939A"
                        >
                          {point.quarter}
                        </text>
                      );
                    })}
                  </>
                );
              })()}
            </svg>

            <div className="mt-1 flex items-center gap-4 text-[10px] text-mist">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#7D8D92]" /> Estimate</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#4DC990]" /> EPS Beat</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#FF4242]" /> EPS Miss</span>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/25 p-3">
            <p className="text-[10px] uppercase tracking-wide text-mist mb-2">Recent Quarters</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="grid grid-cols-4 text-mist">
                <span>Quarter</span><span>Estimate</span><span>Reported</span><span className="text-right">Surprise</span>
              </div>
              {[
                ["Q2", "$3.85", "$5.16", "+34.08%"],
                ["Q1", "$3.66", "$3.72", "+1.59%"],
                ["Q4", "$3.38", "$3.65", "+8.01%"],
              ].map((row) => (
                <div key={row[0]} className="grid grid-cols-4 text-snow-peak">
                  <span>{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span><span className="text-right text-[#4DC990]">{row[3]}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
