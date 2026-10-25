"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Calculator,
  CalendarClock,
  ExternalLink,
  FileText,
  LineChart,
  Trash2,
  UserRoundSearch,
  X,
} from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { HG_ZONES, zoneOf } from "@/lib/hunting-ground";
import { cn } from "@/lib/utils";
import type { PriceAlert } from "@/types/watchlist";
import type { Idea } from "./use-ideas";
import {
  eventText,
  fairSource,
  GapBar,
  money,
  pct,
  qualityTone,
  shortDate,
  signedPct,
  STANCE_LABEL,
  STANCE_TEXT,
  yieldTone,
} from "./idea-bits";

export interface IdeaActions {
  setTargetPrice: (ticker: string, price: number | null) => void;
  updateNotes: (ticker: string, notes: string) => void;
  addAlert: (alert: Omit<PriceAlert, "id" | "created_at">) => void;
  removeAlert: (id: string) => void;
  removeTicker: (ticker: string) => void;
}

/**
 * One company, everything the list knows about it, in a panel from the
 * right: the fair value and how it was reached, the reader's thesis, the
 * business's quality, what is coming, its insiders, and the alerts. A modal
 * <dialog>, so focus stays inside and Escape closes it.
 */
export function IdeaPanel({
  idea,
  listName,
  actions,
  onClose,
}: {
  idea: Idea;
  listName: string;
  actions: IdeaActions;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const currency = idea.quote?.currency;

  return (
    <dialog
      ref={dialog}
      aria-label={`${idea.ticker}, ${idea.name}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="idea-drawer m-0 ml-auto h-dvh max-h-none w-full max-w-[30rem] overflow-hidden bg-transparent p-0 text-snow-peak"
    >
      <div className="flex h-full flex-col bg-wolf-surface shadow-2xl ring-1 ring-inset ring-wolf-border/70">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-wolf-border/40 p-5">
          <TickerLogo ticker={idea.ticker} src={idea.logo} className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold">{idea.ticker}</span>
              {idea.stance !== "none" ? (
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ring-current/20", STANCE_TEXT[idea.stance])}>
                  {STANCE_LABEL[idea.stance]}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-mist">
              {idea.name}
              {idea.sector ? ` · ${idea.sector}` : ""}
            </p>
          </div>
          <div className="text-right">
            {idea.price != null ? (
              <>
                <p className="font-mono text-base tabular-nums">{money(idea.price, currency)}</p>
                {idea.change != null ? (
                  <p className={cn("font-mono text-[11px] tabular-nums", idea.change > 0 ? "text-bullish" : idea.change < 0 ? "text-bearish" : "text-mist")}>
                    {signedPct(idea.change)} today
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          <FairValueSection key={`fair-${idea.ticker}`} idea={idea} currency={currency} actions={actions} />
          <ThesisSection key={`thesis-${idea.ticker}`} idea={idea} actions={actions} />
          <QualitySection idea={idea} />
          <CalendarSection idea={idea} />
          <InsiderSection idea={idea} />
          <AlertsSection key={`alerts-${idea.ticker}`} idea={idea} currency={currency} actions={actions} />

          <Section title="Go deeper">
            <div className="grid grid-cols-3 gap-2">
              <DeepLink href={ROUTES.SYMBOL(idea.ticker)} icon={<LineChart className="h-4 w-4" />} label="Overview" />
              <DeepLink href={ROUTES.SYMBOL_FINANCIALS(idea.ticker)} icon={<FileText className="h-4 w-4" />} label="Financials" />
              <DeepLink
                href={`${ROUTES.APP_DCF_CALCULATOR}?ticker=${encodeURIComponent(idea.ticker)}`}
                icon={<Calculator className="h-4 w-4" />}
                label="DCF"
              />
            </div>
          </Section>
        </div>

        <div className="border-t border-wolf-border/40 p-4">
          <button
            type="button"
            onClick={() => {
              actions.removeTicker(idea.ticker);
              dialog.current?.close();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-mist transition-colors duration-150 hover:bg-bearish/10 hover:text-bearish"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove from {listName}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-mist">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DeepLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-snow-peak/[0.03] py-3 text-xs text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
    >
      {icon}
      {label}
    </Link>
  );
}

function parsePrice(raw: string): number | null {
  const v = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ── Fair value ─────────────────────────────────────────────────────────────

function FairValueSection({ idea, currency, actions }: { idea: Idea; currency?: string; actions: IdeaActions }) {
  const [draft, setDraft] = useState(idea.target != null ? String(idea.target) : "");
  const fromDcf = idea.fair?.source === "dcf";
  const save = () => {
    const next = draft.trim() ? parsePrice(draft) : null;
    if (next !== idea.target) actions.setTargetPrice(idea.ticker, next);
  };

  return (
    <Section title="Fair value">
      {idea.fair && idea.gap != null ? (
        <div className="rounded-xl bg-snow-peak/[0.025] p-4 ring-1 ring-inset ring-wolf-border/40">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xl font-semibold tabular-nums">{money(idea.fair.value, currency)}</span>
            <span className="text-[11px] text-mist">{fairSource(idea.fair)}</span>
          </div>
          <p className={cn("mt-1 text-[13px] font-medium", STANCE_TEXT[idea.stance])}>
            {idea.gap <= 0
              ? `The price is ${Math.abs(idea.gap * 100).toFixed(0)}% below it`
              : `The price is ${(idea.gap * 100).toFixed(0)}% above it`}
          </p>
          {idea.fair.low != null && idea.fair.high != null && idea.price != null ? (
            <RangeBar low={idea.fair.low} base={idea.fair.value} high={idea.fair.high} price={idea.price} currency={currency} />
          ) : (
            <GapBar gap={idea.gap} stance={idea.stance} className="mt-3" />
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-snow-peak/[0.025] p-4 text-xs leading-relaxed text-mist ring-1 ring-inset ring-wolf-border/40">
          No fair value yet. Type the price at which you would buy, or build a DCF: a saved one takes over here.
        </p>
      )}

      <label className="mt-3 block text-[11.5px] text-mist" htmlFor={`buy-price-${idea.ticker}`}>
        {fromDcf ? "Your buy price (used when there is no saved DCF)" : "Your buy price"}
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={`buy-price-${idea.ticker}`}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder={idea.price != null ? `e.g. ${money(idea.price * 0.85, currency)}` : "e.g. 120"}
          className="h-9 text-sm"
        />
        {!fromDcf ? (
          <Link
            href={`${ROUTES.APP_DCF_CALCULATOR}?ticker=${encodeURIComponent(idea.ticker)}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs text-sunset-orange ring-1 ring-inset ring-sunset-orange/35 transition-colors duration-150 hover:bg-sunset-orange/10"
          >
            <Calculator className="h-3.5 w-3.5" />
            Build a DCF
          </Link>
        ) : null}
      </div>
    </Section>
  );
}

/** Bear to bull, with the base case and today's price on it. */
function RangeBar({ low, base, high, price, currency }: { low: number; base: number; high: number; price: number; currency?: string }) {
  const min = Math.min(low, price) * 0.95;
  const max = Math.max(high, price) * 1.05;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="mt-4">
      <div className="relative h-8">
        <span className="absolute top-3 h-1.5 w-full rounded-full bg-snow-peak/[0.06]" />
        <span
          className="absolute top-3 h-1.5 rounded-full bg-bullish/30"
          style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }}
        />
        <span className="absolute top-2 h-3.5 w-0.5 -translate-x-1/2 rounded bg-bullish" style={{ left: at(base) }} title="Base" />
        <span
          className="absolute top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-snow-peak shadow"
          style={{ left: at(price) }}
          title="Price"
        />
      </div>
      <div className="flex justify-between font-mono text-[10.5px] tabular-nums text-mist">
        <span>Bear {money(low, currency)}</span>
        <span className="text-snow-peak">Price {money(price, currency)}</span>
        <span>Bull {money(high, currency)}</span>
      </div>
    </div>
  );
}

// ── Thesis ────────────────────────────────────────────────────────────────

function ThesisSection({ idea, actions }: { idea: Idea; actions: IdeaActions }) {
  const [draft, setDraft] = useState(idea.notes);
  const [saved, setSaved] = useState(false);
  const save = () => {
    if (draft === idea.notes) return;
    actions.updateNotes(idea.ticker, draft);
    setSaved(true);
  };
  return (
    <Section title="Your thesis" aside={saved ? <span className="text-[11px] text-bullish">Saved</span> : null}>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        rows={4}
        maxLength={2000}
        placeholder="Why you own or want it, and what would change your mind."
        className="w-full resize-y rounded-xl bg-snow-peak/[0.025] p-3 text-[13px] leading-relaxed text-snow-peak ring-1 ring-inset ring-wolf-border/50 placeholder:text-mist/60 focus:outline-none focus:ring-sunset-orange/50"
      />
    </Section>
  );
}

// ── Quality ───────────────────────────────────────────────────────────────

function QualitySection({ idea }: { idea: Idea }) {
  const m = idea.metrics;
  if (!m) {
    return (
      <Section title="Business quality">
        <div className="h-24 animate-pulse rounded-xl bg-snow-peak/[0.03]" />
      </Section>
    );
  }
  const zone = m.quality != null && m.fcfYield != null && !idea.unmeasured ? zoneOf(m.quality, m.fcfYield) : null;
  const parts: Array<[string, number | null]> = [
    ["Profitability", m.profitability],
    ["Financial health", m.financialHealth],
    ["Growth", m.growth],
    ["Cash generation", m.cashGeneration],
  ];
  return (
    <Section
      title="Business quality"
      aside={zone ? <span className="text-[11px] text-mist">{HG_ZONES[zone].label} · {HG_ZONES[zone].line.toLowerCase()}</span> : null}
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Quality score" value={m.quality != null ? String(Math.round(m.quality)) : "—"} tone={m.quality != null ? qualityTone(m.quality) : undefined} />
        <Stat
          label="FCF yield"
          value={idea.unmeasured ? "n/m" : m.fcfYield != null ? pct(m.fcfYield) : "—"}
          tone={!idea.unmeasured && m.fcfYield != null ? yieldTone(m.fcfYield) : undefined}
        />
      </div>
      <ul className="mt-3 space-y-2">
        {parts.map(([label, v]) => (
          <li key={label} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-xs">
            <span className="text-mist">{label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-snow-peak/[0.06]">
              <span
                className="block h-full origin-left rounded-full bg-sunset-orange/70"
                style={{ transform: `scaleX(${v != null ? Math.max(0, Math.min(100, v)) / 100 : 0})` }}
              />
            </span>
            <span className="text-right font-mono tabular-nums text-snow-peak">{v != null ? Math.round(v) : "—"}</span>
          </li>
        ))}
      </ul>
      {idea.unmeasured ? (
        <p className="mt-2 text-[11px] text-mist/80">Free cash flow does not measure a bank, insurer or landlord, so it has no yield here.</p>
      ) : null}
    </Section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-snow-peak/[0.025] px-3 py-2.5 ring-1 ring-inset ring-wolf-border/40">
      <p className="text-[11px] text-mist">{label}</p>
      <p className={cn("mt-0.5 font-mono text-lg font-semibold tabular-nums text-snow-peak", tone)}>{value}</p>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────

function CalendarSection({ idea }: { idea: Idea }) {
  const q = idea.quote;
  if (!q) return null;
  const rows: Array<[string, string]> = [];
  if (q.next_earnings_date) {
    rows.push(["Next earnings", `${shortDate(q.next_earnings_date)}${q.earnings_timing && q.earnings_timing !== "Time TBD" ? ` · ${q.earnings_timing.toLowerCase()}` : ""}`]);
  }
  if (q.ex_dividend_date) rows.push(["Ex-dividend", shortDate(q.ex_dividend_date)]);
  if (q.dividend_yield > 0) rows.push(["Dividend yield", pct(q.dividend_yield, 2)]);
  if (rows.length === 0) return null;
  return (
    <Section
      title="Coming up"
      aside={idea.event ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-snow-peak">
          <CalendarClock className="h-3 w-3 text-mist" />
          {eventText(idea.event)}
        </span>
      ) : null}
    >
      <dl className="divide-y divide-wolf-border/30 rounded-xl ring-1 ring-inset ring-wolf-border/40">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2 text-xs">
            <dt className="text-mist">{k}</dt>
            <dd className="font-mono tabular-nums text-snow-peak">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

// ── Insiders ──────────────────────────────────────────────────────────────

function InsiderSection({ idea }: { idea: Idea }) {
  const s = idea.signal;
  const text = !s
    ? "No insider record on file yet. Tracks reads it from the SEC when you open it."
    : s.cluster
      ? `${s.buyers} insiders bought on the open market within weeks of each other: the strongest signal Form 4 gives.`
      : s.buys > 0
        ? `${s.buys} open-market buy${s.buys === 1 ? "" : "s"} by ${s.buyers} insider${s.buyers === 1 ? "" : "s"} in the last year${s.sells > 0 ? `, against ${s.sells} sale${s.sells === 1 ? "" : "s"}` : ""}.`
        : s.sells > 0
          ? `No open-market buys in the last year; ${s.sells} sale${s.sells === 1 ? "" : "s"}, often planned or for taxes.`
          : "No open-market trades by insiders in the last year.";
  return (
    <Section title="Insiders">
      <div className="flex items-start gap-3 rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/40">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            s?.cluster ? "bg-sunset-orange/12 text-sunset-orange" : s && s.buys > 0 ? "bg-bullish/12 text-bullish" : "bg-snow-peak/[0.06] text-mist"
          )}
        >
          {s && s.buys > 0 ? <ArrowUpRight className="h-4 w-4" /> : <UserRoundSearch className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-relaxed text-snow-peak/90">{text}</p>
          <Link
            href={`${ROUTES.APP_TRACKS}?ticker=${encodeURIComponent(idea.ticker)}`}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-sunset-orange hover:underline"
          >
            Open in Tracks <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────

function AlertsSection({ idea, currency, actions }: { idea: Idea; currency?: string; actions: IdeaActions }) {
  const [type, setType] = useState<"below" | "above">("below");
  const [draft, setDraft] = useState("");
  const value = parsePrice(draft);
  const add = () => {
    if (value == null) return;
    actions.addAlert({ ticker: idea.ticker, type, price: value, active: true });
    setDraft("");
  };
  return (
    <Section title="Price alerts">
      {idea.alerts.length > 0 ? (
        <ul className="mb-2.5 space-y-1.5">
          {idea.alerts.map((a) => {
            const hit = idea.price != null && a.active && (a.type === "below" ? idea.price <= a.price : idea.price >= a.price);
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-snow-peak/[0.025] px-3 py-2 text-xs ring-1 ring-inset ring-wolf-border/40">
                <BellRing className={cn("h-3.5 w-3.5", hit ? "text-sunset-orange" : "text-mist")} />
                <span className="text-mist">{a.type === "below" ? "Falls to" : "Rises to"}</span>
                <span className="font-mono tabular-nums text-snow-peak">{money(a.price, currency)}</span>
                {hit ? <span className="text-[11px] text-sunset-orange">reached</span> : null}
                <button
                  type="button"
                  onClick={() => actions.removeAlert(a.id)}
                  aria-label={`Remove the alert at ${money(a.price, currency)}`}
                  className="ml-auto rounded p-1 text-mist transition-colors hover:text-bearish"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <div className="flex shrink-0 rounded-lg bg-snow-peak/[0.03] p-0.5 ring-1 ring-inset ring-wolf-border/50" role="radiogroup" aria-label="Direction">
          {(["below", "above"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "rounded-md px-2.5 text-xs transition-colors duration-150",
                type === t ? "bg-sunset-orange/15 text-sunset-orange" : "text-mist hover:text-snow-peak"
              )}
            >
              {t === "below" ? "Falls to" : "Rises to"}
            </button>
          ))}
        </div>
        <Input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Price"
          aria-label="Alert price"
          className="h-9 text-sm"
        />
        <Button type="button" size="sm" onClick={add} disabled={value == null}>
          Add
        </Button>
      </div>
    </Section>
  );
}
