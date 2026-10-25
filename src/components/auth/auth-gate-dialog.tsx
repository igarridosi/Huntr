"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Lock, LogIn, Plus, Search, Undo2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AuthGateReason =
  | "watchlist"
  | "dcf"
  | "portfolio"
  | "deepData"
  | "addTicker"
  | "charts"
  | "generic";

type Perk = "watchlist" | "deepData" | "dcf" | "portfolio" | "charts";

/** What an account gives, in the reader's terms: the one they reached for first. */
const PERKS: Record<Perk, string> = {
  watchlist: "Watchlists with earnings dates and price alerts",
  deepData: "20 years of financials and every earnings report",
  dcf: "DCF valuations saved per company",
  portfolio: "Portfolios with performance and dividends",
  charts: "Your charts kept in My charts",
};
const PERK_ORDER: Perk[] = ["watchlist", "deepData", "dcf", "portfolio", "charts"];

const COPY: Record<AuthGateReason, { title: string; line: string; perk: Perk | null }> = {
  watchlist: {
    title: "Keep every idea in one place",
    line: "Save this company and follow it: its price, its next earnings date and your alerts, on any device.",
    perk: "watchlist",
  },
  dcf: {
    title: "Keep your valuations",
    line: "Save this scenario and come back to it when the numbers change, instead of starting again.",
    perk: "dcf",
  },
  portfolio: {
    title: "Track what you own",
    line: "Add your positions and see how they do: performance, dividends and allocation in one view.",
    perk: "portfolio",
  },
  deepData: {
    title: "See 20 years, not 5",
    line: "A free account opens the full record: two decades of financials and every earnings report, to judge a business across a whole cycle.",
    perk: "deepData",
  },
  charts: {
    title: "Keep your charts",
    line: "Save what you build in My charts and reopen it any time; share links keep working as they do now.",
    perk: "charts",
  },
  addTicker: {
    title: "Bring any company into Huntr",
    line: "Add a ticker Huntr does not cover yet; it is analysed and kept for you.",
    perk: null,
  },
  generic: {
    title: "Make Huntr yours",
    line: "Save your work and pick it up on any device.",
    perk: null,
  },
};

/**
 * The invitation to sign up, shown when someone reaches for something that
 * needs an account. It leads with what they were about to do, shown, then
 * what else the account opens, and says what it costs (nothing) and where
 * they land afterwards (right here), the two doubts that stop a sign-up.
 */
export function AuthGateDialog({
  reason,
  onClose,
  onSignup,
  onLogin,
}: {
  reason: AuthGateReason | null;
  onClose: () => void;
  onSignup: () => void;
  onLogin: () => void;
}) {
  const copy = reason ? COPY[reason] : null;
  const perks = copy ? [...(copy.perk ? [copy.perk] : []), ...PERK_ORDER.filter((p) => p !== copy.perk)] : [];

  return (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[26rem] overflow-hidden p-0" aria-labelledby="auth-gate-title">
        {reason && copy ? (
          <>
            <div className="relative h-36 overflow-hidden border-b border-wolf-border/60 bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-sunset-orange)_14%,transparent),transparent_70%)]">
              <Visual reason={reason} />
            </div>

            <div className="space-y-5 p-6">
              <div className="space-y-1.5">
                <h3 id="auth-gate-title" className="text-lg font-semibold tracking-[-0.015em] text-snow-peak">
                  {copy.title}
                </h3>
                <p className="text-[13px] leading-relaxed text-mist">{copy.line}</p>
              </div>

              <ul className="space-y-2" aria-label="A free account includes">
                {perks.map((p, i) => {
                  const lead = p === copy.perk;
                  return (
                    <li
                      key={p}
                      className="insight-enter flex items-center gap-2.5 text-[12.5px]"
                      style={{ "--enter-delay": `${80 + i * 45}ms` } as React.CSSProperties}
                    >
                      <span
                        className={cn(
                          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                          lead ? "bg-sunset-orange text-wolf-black" : "bg-bullish/15 text-bullish"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                      </span>
                      <span className={lead ? "font-medium text-snow-peak" : "text-snow-peak/80"}>{PERKS[p]}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={onSignup}
                  className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sunset-orange text-sm font-semibold text-wolf-black transition-[background-color,transform] duration-150 hover:bg-sunset-orange/90 active:scale-[0.98]"
                >
                  Create my free account
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </button>
                <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-mist">
                  <span>Free while in beta</span>
                  <span className="h-3 w-px bg-mist/40" aria-hidden />
                  <span>No card</span>
                  <span className="h-3 w-px bg-mist/40" aria-hidden />
                  <span className="inline-flex items-center gap-1">
                    <Undo2 className="h-3 w-3" aria-hidden /> You come back right here
                  </span>
                </p>
              </div>

              <div className="border-t border-wolf-border/60 pt-4 text-center text-[12.5px] text-mist">
                Already have an account?{" "}
                <button type="button" onClick={onLogin} className="inline-flex items-center gap-1 font-medium text-snow-peak hover:text-sunset-orange">
                  Sign in <LogIn className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── What they reached for, shown ─────────────────────────────────────────────

function Visual({ reason }: { reason: AuthGateReason }) {
  switch (reason) {
    case "deepData":
      return <HistoryVisual />;
    case "watchlist":
      return <WatchlistVisual />;
    case "dcf":
      return <DcfVisual />;
    case "portfolio":
      return <PortfolioVisual />;
    case "charts":
      return <ChartsVisual />;
    case "addTicker":
      return <AddTickerVisual />;
    default:
      return <WatchlistVisual />;
  }
}

/** Twenty years of bars: the last five open, the fifteen before them waiting behind the account. */
function HistoryVisual() {
  const heights = [22, 26, 24, 30, 34, 31, 38, 42, 40, 47, 52, 49, 56, 61, 58, 66, 71, 69, 78, 84];
  return (
    <div className="absolute inset-x-8 bottom-5 top-6 flex items-end gap-[5px]" aria-hidden>
      {heights.map((h, i) => {
        const open = i >= 15;
        return (
          <span
            key={i}
            className={cn("insight-enter flex-1 rounded-t-[3px]", open ? "bg-sunset-orange/85" : "bg-snow-peak/[0.09]")}
            style={{ height: `${h}%`, "--enter-delay": `${i * 18}ms` } as React.CSSProperties}
          />
        );
      })}
      <span className="absolute left-[30%] top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-wolf-surface/90 px-2.5 py-1 text-[11px] font-medium text-snow-peak ring-1 ring-inset ring-wolf-border/70 backdrop-blur">
        <Lock className="h-3 w-3 text-sunset-orange" /> 15 more years
      </span>
      <span className="absolute -top-1 right-0 font-mono text-[10px] text-sunset-orange">5Y today</span>
    </div>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("absolute inset-x-10 top-6 rounded-xl bg-wolf-surface/85 p-2.5 ring-1 ring-inset ring-wolf-border/70 shadow-2xl shadow-wolf-black/50", className)}
      aria-hidden
    >
      {children}
    </div>
  );
}

function WatchlistVisual() {
  const rows = [
    { t: "AAPL", up: true, d: "Earnings Nov 2", path: "M0 12 L8 10 L16 11 L24 7 L32 8 L40 4" },
    { t: "MSFT", up: true, d: "Alert at $500", path: "M0 11 L8 12 L16 8 L24 9 L32 5 L40 6" },
    { t: "V", up: false, d: "Earnings Oct 27", path: "M0 4 L8 6 L16 5 L24 9 L32 8 L40 11" },
  ];
  return (
    <Frame>
      {rows.map((r, i) => (
        <div
          key={r.t}
          className="insight-enter flex h-7 items-center gap-2.5 px-1"
          style={{ "--enter-delay": `${i * 60}ms` } as React.CSSProperties}
        >
          <span className="text-sunset-orange">★</span>
          <span className="w-10 font-mono text-[11px] font-semibold text-snow-peak">{r.t}</span>
          <svg viewBox="0 0 40 14" className="h-3.5 w-12">
            <path d={r.path} fill="none" stroke={r.up ? "var(--color-bullish)" : "var(--color-bearish)"} strokeWidth="1.5" />
          </svg>
          <span className="ml-auto rounded-md bg-snow-peak/[0.05] px-1.5 py-0.5 text-[10px] text-mist">{r.d}</span>
        </div>
      ))}
    </Frame>
  );
}

function DcfVisual() {
  const cases = [
    { label: "Bear", value: "$148", w: "46%", tone: "bg-bearish/70" },
    { label: "Base", value: "$212", w: "66%", tone: "bg-sunset-orange/85" },
    { label: "Bull", value: "$268", w: "84%", tone: "bg-bullish/70" },
  ];
  return (
    <Frame>
      {cases.map((c, i) => (
        <div
          key={c.label}
          className="insight-enter flex h-7 items-center gap-2.5 px-1"
          style={{ "--enter-delay": `${i * 60}ms` } as React.CSSProperties}
        >
          <span className="w-9 text-[11px] text-mist">{c.label}</span>
          <span className="relative h-2 flex-1 rounded-full bg-snow-peak/[0.06]">
            <span className={cn("absolute inset-y-0 left-0 rounded-full", c.tone)} style={{ width: c.w }} />
          </span>
          <span className="w-10 text-right font-mono text-[11px] font-semibold text-snow-peak">{c.value}</span>
        </div>
      ))}
    </Frame>
  );
}

function PortfolioVisual() {
  return (
    <Frame className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-mono text-sm font-semibold text-snow-peak">$48,210</span>
        <span className="font-mono text-[11px] font-semibold text-bullish">+12.4%</span>
      </div>
      <svg viewBox="0 0 200 50" className="h-14 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gate-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-bullish)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--color-bullish)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 42 L20 38 L40 40 L60 31 L80 33 L100 24 L120 27 L140 18 L160 20 L180 11 L200 8 L200 50 L0 50 Z" fill="url(#gate-area)" />
        <path d="M0 42 L20 38 L40 40 L60 31 L80 33 L100 24 L120 27 L140 18 L160 20 L180 11 L200 8" fill="none" stroke="var(--color-bullish)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </Frame>
  );
}

function ChartsVisual() {
  const lines = [
    "M0 30 L15 24 L30 27 L45 15 L60 18 L75 8",
    "M0 10 L15 16 L30 12 L45 22 L60 19 L75 27",
    "M0 26 L15 20 L30 22 L45 14 L60 16 L75 12",
  ];
  return (
    <div className="absolute inset-x-8 top-7 grid grid-cols-3 gap-2.5" aria-hidden>
      {lines.map((d, i) => (
        <div
          key={i}
          className="insight-enter rounded-lg bg-wolf-surface/85 p-2 ring-1 ring-inset ring-wolf-border/70"
          style={{ "--enter-delay": `${i * 70}ms` } as React.CSSProperties}
        >
          <svg viewBox="0 0 75 34" className="h-12 w-full">
            <path d={d} fill="none" stroke={i === 1 ? "var(--color-glacier)" : "var(--color-sunset-orange)"} strokeWidth="1.6" />
          </svg>
        </div>
      ))}
    </div>
  );
}

function AddTickerVisual() {
  return (
    <Frame className="flex items-center gap-2.5 px-3 py-3">
      <Search className="h-4 w-4 text-mist" />
      <span className="font-mono text-[12px] text-snow-peak">ASML</span>
      <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-sunset-orange px-2 py-1 text-[11px] font-semibold text-wolf-black">
        <Plus className="h-3 w-3" strokeWidth={3} /> Add
      </span>
    </Frame>
  );
}
