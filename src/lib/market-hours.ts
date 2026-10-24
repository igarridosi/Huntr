/**
 * Where the US stock market's day stands, in New York time: pre-market
 * (4:00-9:30), open (9:30-16:00), after hours (16:00-20:00) or closed, and
 * how long until that changes. Weekends and NYSE holidays are closed; on an
 * early-close day the session ends at 13:00.
 *
 * The holiday list is NYSE's published calendar and has to be extended each
 * year: past its last year, only weekends are known to be closed.
 */

export type MarketPhase = "pre" | "open" | "after" | "closed";

/** NYSE full-day closures (ISO days, New York). */
const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** NYSE early closes at 13:00 (ISO days, New York). */
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const PRE = 4 * 60;
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const EARLY_CLOSE = 13 * 60;
const AFTER_END = 20 * 60;

interface NyClock {
  /** ISO day in New York. */
  day: string;
  /** Minutes since midnight in New York. */
  minutes: number;
  /** 0 Sunday … 6 Saturday. */
  weekday: number;
}

function nyClock(at: Date): NyClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: weekdays.indexOf(parts.weekday),
  };
}

export function isTradingDay(day: string, weekday: number): boolean {
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(day);
}

/** The ISO day after `day`, and its weekday. */
function nextDay(day: string, weekday: number): { day: string; weekday: number } {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { day: d.toISOString().slice(0, 10), weekday: (weekday + 1) % 7 };
}

export interface MarketStatus {
  phase: MarketPhase;
  /** Minutes until the phase changes (the open, the close, the end of after hours…). */
  minutesLeft: number;
  /** What happens then, said plainly: "closes", "opens", "after hours end". */
  next: "opens" | "closes" | "pre-market opens" | "after hours end";
  /** When it is more than a day away: the weekday it opens, "Mon". */
  nextDayLabel: string | null;
  earlyClose: boolean;
}

export function marketStatus(at: Date): MarketStatus {
  const { day, minutes, weekday } = nyClock(at);
  const trading = isTradingDay(day, weekday);
  const close = EARLY_CLOSES.has(day) ? EARLY_CLOSE : CLOSE;
  const earlyClose = EARLY_CLOSES.has(day);

  if (trading && minutes >= PRE && minutes < OPEN) {
    return { phase: "pre", minutesLeft: OPEN - minutes, next: "opens", nextDayLabel: null, earlyClose };
  }
  if (trading && minutes >= OPEN && minutes < close) {
    return { phase: "open", minutesLeft: close - minutes, next: "closes", nextDayLabel: null, earlyClose };
  }
  if (trading && minutes >= close && minutes < AFTER_END) {
    return { phase: "after", minutesLeft: AFTER_END - minutes, next: "after hours end", nextDayLabel: null, earlyClose };
  }

  // Closed: before pre-market today, or until the next trading day's open.
  if (trading && minutes < PRE) {
    return { phase: "closed", minutesLeft: OPEN - minutes, next: "opens", nextDayLabel: null, earlyClose };
  }
  let cursor = nextDay(day, weekday);
  let days = 1;
  while (!isTradingDay(cursor.day, cursor.weekday) && days < 10) {
    cursor = nextDay(cursor.day, cursor.weekday);
    days++;
  }
  const minutesLeft = days * 24 * 60 - minutes + OPEN;
  const label = days > 1 ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][cursor.weekday] : null;
  return { phase: "closed", minutesLeft, next: "opens", nextDayLabel: label, earlyClose: false };
}

/** "2h 14m", "45m", "3d": short, for a pill. */
export function formatCountdown(minutes: number): string {
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
