import { describe, expect, it } from "vitest";
import { formatCountdown, marketStatus } from "../market-hours";

/** A moment given in New York time (EDT, UTC-4, in October). */
const ny = (iso: string) => new Date(`${iso}-04:00`);

describe("marketStatus", () => {
  it("reads a regular session", () => {
    expect(marketStatus(ny("2026-10-23T08:00:00"))).toMatchObject({ phase: "pre", next: "opens", minutesLeft: 90 });
    expect(marketStatus(ny("2026-10-23T13:46:00"))).toMatchObject({ phase: "open", next: "closes", minutesLeft: 134 });
    expect(marketStatus(ny("2026-10-23T17:00:00"))).toMatchObject({ phase: "after", next: "after hours end", minutesLeft: 180 });
  });

  it("is closed over the weekend, until Monday's open", () => {
    const s = marketStatus(ny("2026-10-24T12:00:00"));
    expect(s).toMatchObject({ phase: "closed", next: "opens", nextDayLabel: "Mon" });
    expect(s.minutesLeft).toBe(2 * 24 * 60 - 12 * 60 + 9 * 60 + 30);
  });

  it("is closed late at night, until the next morning's open", () => {
    expect(marketStatus(ny("2026-10-22T22:00:00"))).toMatchObject({ phase: "closed", nextDayLabel: null, minutesLeft: 11 * 60 + 30 });
    expect(marketStatus(ny("2026-10-23T02:00:00"))).toMatchObject({ phase: "closed", minutesLeft: 7 * 60 + 30 });
  });

  it("knows the holidays and the early closes", () => {
    expect(marketStatus(new Date("2026-11-26T15:00:00-05:00"))).toMatchObject({ phase: "closed", nextDayLabel: null });
    expect(marketStatus(new Date("2026-11-27T12:00:00-05:00"))).toMatchObject({ phase: "open", minutesLeft: 60, earlyClose: true });
    // Good Friday 2027 is 26 March: on the Thursday evening, the next open is Monday.
    expect(marketStatus(new Date("2027-03-25T21:00:00-04:00"))).toMatchObject({ phase: "closed", nextDayLabel: "Mon" });
  });
});

describe("formatCountdown", () => {
  it("is short", () => {
    expect(formatCountdown(134)).toBe("2h 14m");
    expect(formatCountdown(45)).toBe("45m");
    expect(formatCountdown(3000)).toBe("2d");
  });
});
