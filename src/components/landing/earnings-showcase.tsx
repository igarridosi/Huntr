import { CalendarClock, Filter, Moon, Search, Sparkles, Sunrise } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";

const dayColumns = [
  { day: "Mon", date: "27", pre: ["VZ"], post: [] },
  { day: "Tue", date: "28", pre: ["KO", "NVS"], post: ["V"] },
  { day: "Wed", date: "29", pre: [], post: ["MSFT", "META", "AZN", "KLAC"], today: true },
  { day: "Thu", date: "30", pre: ["LLY", "MA", "CAT", "MRK", "LIN"], post: ["AAPL", "AMZN", "MCD"] },
  { day: "Fri", date: "1", pre: ["XOM", "CVX", "ABBV"], post: [] },
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

/**
 * One EPS history drives the chart, the next estimate and the table of
 * recent quarters, so they agree. The last quarter has no reported figure
 * yet: it is the one this week's call is about.
 */
const eps = [
  { quarter: "Q3 '23", estimate: 2.65, reported: 2.69 },
  { quarter: "Q4 '23", estimate: 2.78, reported: 2.93 },
  { quarter: "Q1 '24", estimate: 2.82, reported: 2.94 },
  { quarter: "Q2 '24", estimate: 2.93, reported: 2.95 },
  { quarter: "Q3 '24", estimate: 3.1, reported: 3.3 },
  { quarter: "Q4 '24", estimate: 3.11, reported: 3.23 },
  { quarter: "Q1 '25", estimate: 3.22, reported: 3.46 },
  { quarter: "Q2 '25", estimate: 3.35, reported: 3.65 },
  { quarter: "Q3 '25", estimate: 3.67, reported: 3.72 },
  { quarter: "Q4 '25", estimate: 3.88, reported: 3.84 },
  { quarter: "Q1 '26", estimate: 4.09, reported: null },
] as const;

const next = eps[eps.length - 1];
const reported = eps.filter((p) => p.reported !== null) as { quarter: string; estimate: number; reported: number }[];
const recent = reported.slice(-3).reverse();
const beats = reported.filter((p) => p.reported >= p.estimate).length;

const CHART = { left: 44, right: 590, top: 16, bottom: 180, width: 600, height: 214 };
const EPS_MIN = 2.5;
const EPS_MAX = 4.25;
const epsTicks = [2.5, 3, 3.5, 4];
const xAt = (i: number) => CHART.left + (i * (CHART.right - CHART.left)) / (eps.length - 1);
const yAt = (v: number) => CHART.bottom - ((v - EPS_MIN) / (EPS_MAX - EPS_MIN)) * (CHART.bottom - CHART.top);

function TickerChip({ ticker }: { ticker: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-wolf-border/45 bg-wolf-black/50 px-1.5 py-0.5 font-mono text-[10px] text-snow-peak">
      <TickerLogo ticker={ticker} src={logoMap[ticker]} className="h-4 w-4" imageClassName="rounded" fallbackClassName="rounded text-[8px]" />
      {ticker}
    </span>
  );
}

function Session({ icon: Icon, label, tickers }: { icon: typeof Sunrise; label: string; tickers: readonly string[] }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] text-mist">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {tickers.length > 0 ? (
          tickers.map((t) => <TickerChip key={t} ticker={t} />)
        ) : (
          <span className="text-[10px] text-mist/50">—</span>
        )}
      </div>
    </div>
  );
}

export function EarningsShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-16">

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-snow-peak sm:text-4xl">Earnings Intelligence</h2>
          <p className="mt-2 text-sm text-mist sm:text-base">
            A high-signal earnings workspace combining weekly calendar flow, before/after market buckets, and fast
            estimate context in one professional view.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-surface/40 px-2 py-1 font-mono text-[10px] text-mist">
          <Sparkles className="h-3 w-3 text-sunset-orange" />
          Institutional Calendar Flow
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Calendar */}
        <article className="huntr-grain rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-snow-peak">
              <CalendarClock className="h-4 w-4 text-sunset-orange" />
              Earnings This Week
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-black/40 px-2 py-1 text-[10px] text-mist">
                <Search className="h-3 w-3" /> Search
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-wolf-border/50 bg-wolf-black/40 px-2 py-1 text-[10px] text-mist">
                <Filter className="h-3 w-3" /> Watchlist Filter
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {dayColumns.map((col) => {
              const today = "today" in col && col.today;
              const count = col.pre.length + col.post.length;
              return (
                <div
                  key={col.day}
                  className={`rounded-xl border p-2.5 ${today ? "border-sunset-orange/45 bg-sunset-orange/[0.06]" : "border-wolf-border/45 bg-wolf-black/35"}`}
                >
                  <div className="mb-2.5 flex items-end justify-between border-b border-wolf-border/40 pb-2">
                    <div>
                      <p className={`font-mono text-[10px] uppercase tracking-wider ${today ? "text-sunset-orange" : "text-mist"}`}>
                        {col.day}
                        {today && " · today"}
                      </p>
                      <p className="text-lg font-bold leading-none text-snow-peak">{col.date}</p>
                    </div>
                    <span className="font-mono text-[10px] text-mist/70">{count}</span>
                  </div>
                  <div className="divide-y divide-wolf-border/30">
                    <Session icon={Sunrise} label="Before open" tickers={col.pre} />
                    <Session icon={Moon} label="After close" tickers={col.post} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* Company panel */}
        <article className="huntr-grain flex flex-col gap-3 rounded-2xl border border-wolf-border/50 bg-wolf-surface/45 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <TickerLogo ticker="MSFT" src={logoMap.MSFT} className="h-10 w-10" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[10px]" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold leading-tight text-snow-peak">MSFT</h3>
              <p className="text-xs text-mist">Microsoft</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-sunset-orange/35 bg-sunset-orange/10 px-2 py-1 font-mono text-[10px] text-sunset-orange">
              <Moon className="h-3 w-3" /> Wed · after close
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Mkt cap", "2.77T"],
              ["P/E", "23.3"],
              ["P/S", "9.8"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-2">
                <p className="font-mono text-[10px] uppercase text-mist">{label}</p>
                <p className="font-mono text-sm font-semibold text-snow-peak">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-mist">Next estimate · {next.quarter}</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-snow-peak">EPS ${next.estimate.toFixed(2)}</p>
            </div>
            <p className="text-right font-mono text-[10px] text-mist">
              beat <span className="text-bullish">{beats}</span> of {reported.length}
            </p>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-mist">EPS: estimate vs reported</p>
            <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="h-auto w-full" aria-hidden>
              {epsTicks.map((tick) => (
                <g key={tick}>
                  <line x1={CHART.left} y1={yAt(tick)} x2={CHART.right} y2={yAt(tick)} stroke="#22353A" strokeDasharray="3 4" />
                  <text x={CHART.left - 8} y={yAt(tick) + 4} textAnchor="end" fontSize="11" fill="#8C9DA1" fontFamily="monospace">
                    ${tick.toFixed(2)}
                  </text>
                </g>
              ))}
              <line x1={CHART.left} y1={CHART.bottom} x2={CHART.right} y2={CHART.bottom} stroke="#2A3B40" />

              {/* Consensus path, through the next quarter */}
              <polyline
                points={eps.map((p, i) => `${xAt(i)},${yAt(p.estimate)}`).join(" ")}
                fill="none"
                stroke="#8C9DA1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              {eps.map((p, i) => (
                <g key={p.quarter}>
                  <circle cx={xAt(i)} cy={yAt(p.estimate)} r="4" fill="#0B1416" stroke="#8C9DA1" strokeWidth="1.5" />
                  {p.reported !== null ? (
                    <circle cx={xAt(i)} cy={yAt(p.reported)} r="5" fill={p.reported >= p.estimate ? "#34D399" : "#FF4242"} />
                  ) : (
                    <circle cx={xAt(i)} cy={yAt(p.estimate)} r="7" fill="none" stroke="#FF8C42" strokeWidth="2" />
                  )}
                  {i % 2 === 0 || i === eps.length - 1 ? (
                    <text x={xAt(i)} y={CHART.bottom + 18} textAnchor="middle" fontSize="10" fill={p.reported === null ? "#FF8C42" : "#8C9DA1"} fontFamily="monospace">
                      {p.quarter}
                    </text>
                  ) : null}
                </g>
              ))}
            </svg>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-mist">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-mist" /> Estimate</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-bullish" /> Beat</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-bearish" /> Miss</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-sunset-orange" /> Next</span>
            </div>
          </div>

          <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-mist">Recent quarters</p>
            <div className="grid grid-cols-4 gap-y-1.5 font-mono text-[11px]">
              <span className="text-mist">Quarter</span>
              <span className="text-mist">Est.</span>
              <span className="text-mist">Reported</span>
              <span className="text-right text-mist">Surprise</span>
              {recent.map((q) => {
                const surprise = (q.reported / q.estimate - 1) * 100;
                return (
                  <div key={q.quarter} className="contents text-snow-peak">
                    <span>{q.quarter}</span>
                    <span>${q.estimate.toFixed(2)}</span>
                    <span>${q.reported.toFixed(2)}</span>
                    <span className={`text-right ${surprise >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {surprise >= 0 ? "+" : "−"}
                      {Math.abs(surprise).toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
