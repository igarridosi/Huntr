/**
 * A small EDGAR: two companies (Apple, and Alphabet under two tickers), a
 * quarter listing, daily indexes and companyfacts that tests can change
 * between runs, the way a real night changes them.
 */
export class FakeEdgar {
  listed = ["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15"];
  indexes: Record<string, string[]> = {};
  facts: Record<number, Array<{ end: string; val: number; form: string; filed: string; accn: string }>> = {
    320193: [{ end: "2026-06-27", val: 30e9, form: "10-Q", filed: "2026-08-01", accn: "0000320193-26-000010" }],
    1652044: [{ end: "2026-06-30", val: 20e9, form: "10-Q", filed: "2026-07-25", accn: "0001652044-26-000050" }],
  };
  failFacts = new Set<number>();
  /** Days listed for the quarter whose file answers 403 AccessDenied anyway. */
  unserved = new Set<string>();
  extraTickers: Record<string, number> = {};
  blocked = false;
  urls: string[] = [];

  fetch = (async (input: string) => {
    const url = String(input);
    this.urls.push(url);
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
    const missing = () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403, headers: { "content-type": "application/xml" } });
    if (this.blocked) return new Response("Undeclared Automated Tool", { status: 403, headers: { "content-type": "text/html" } });
    if (url.endsWith("company_tickers.json"))
      return json({
        0: { cik_str: 320193, ticker: "AAPL" },
        1: { cik_str: 1652044, ticker: "GOOGL" },
        2: { cik_str: 1652044, ticker: "GOOG" },
        3: { cik_str: 789019, ticker: "MSFT" },
        ...Object.fromEntries(Object.entries(this.extraTickers).map(([t, cik], i) => [10 + i, { cik_str: cik, ticker: t }])),
      });
    const q = /daily-index\/(\d{4})\/QTR(\d)\/index\.json$/.exec(url);
    if (q) {
      const days = this.listed.filter((d) => d.startsWith(q[1]) && Math.ceil(Number(d.slice(5, 7)) / 3) === Number(q[2]));
      return days.length ? json({ directory: { item: days.map((d) => ({ name: `form.${d.replace(/-/g, "")}.idx` })) } }) : missing();
    }
    const d = /form\.(\d{8})\.idx$/.exec(url);
    if (d) {
      const day = `${d[1].slice(0, 4)}-${d[1].slice(4, 6)}-${d[1].slice(6)}`;
      if (this.unserved.has(day)) return missing();
      return new Response((this.indexes[day] ?? []).join("\n"), { status: 200, headers: { "content-type": "application/octet-stream" } });
    }
    const f = /companyfacts\/CIK(\d{10})\.json$/.exec(url);
    if (f) {
      const cik = Number(f[1]);
      if (this.failFacts.has(cik)) return new Response("", { status: 500 });
      const rows = this.facts[cik];
      if (!rows) return new Response("", { status: 404 });
      return json({ facts: { "us-gaap": { CashAndCashEquivalentsAtCarryingValue: { units: { USD: rows } } } } });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  /** A 10-Q in the daily index of `day`, and (unless `late`) its figures in companyfacts. */
  file(day: string, cik: number, accn: string, val: number, late = false) {
    if (!this.listed.includes(day)) this.listed.push(day);
    (this.indexes[day] ??= []).push(`10-Q             COMPANY                                                       ${cik}      ${day.replace(/-/g, "")}    edgar/data/${cik}/${accn}.txt`);
    if (!late) this.facts[cik].push({ end: day, val, form: "10-Q", filed: day, accn });
  }
}
