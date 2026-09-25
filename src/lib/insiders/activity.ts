import type { Form4Filing, InsiderOwner, PlanAttribution } from "./form4";

/**
 * From filings to what a reader can act on.
 *
 * The rule that separates this from a feed that shouts "CEO sold $50M":
 * only open-market trades (P, S) outside a Rule 10b5-1 plan count as an
 * insider buying or selling. Grants, exercises, tax withholding, gifts
 * and plan trades are shown — they are real — but none of them is a
 * decision about the stock taken on the day.
 */

export type InsiderKind = "buy" | "sell" | "grant" | "exercise" | "tax" | "gift" | "other";

const KIND: Record<string, InsiderKind> = {
  P: "buy",
  S: "sell",
  A: "grant",
  M: "exercise",
  X: "exercise",
  C: "exercise",
  F: "tax",
  G: "gift",
};

const LABEL: Record<InsiderKind, string> = {
  buy: "Open-market purchase",
  sell: "Open-market sale",
  grant: "Grant or award",
  exercise: "Exercise or conversion",
  tax: "Shares withheld for tax",
  gift: "Gift",
  other: "Other",
};

export function kindOf(code: string): InsiderKind {
  return KIND[code] ?? "other";
}

export function labelOf(kind: InsiderKind): string {
  return LABEL[kind];
}

export interface InsiderRow {
  accession: string;
  filingDate: string;
  amended: boolean;
  date: string;
  owner: string;
  ownerCik: string;
  role: string;
  code: string;
  kind: InsiderKind;
  shares: number;
  price: number | null;
  priceFootnoted: boolean;
  /** Shares × price, only when the filing gives a price. Never estimated. */
  value: number | null;
  acquired: boolean;
  sharesAfter: number | null;
  direct: boolean;
  nature: string | null;
  plan: PlanAttribution;
  /** An open-market trade taken on the day, outside any plan. */
  discretionary: boolean;
  footnotes: string[];
  /**
   * How many lines of the filing this row stands for. An order executed in
   * many small fills is filed one line per fill; it is one decision.
   */
  fills: number;
}

export function roleOf(o: InsiderOwner): string {
  const parts: string[] = [];
  if (o.officer) parts.push(o.officerTitle ?? "Officer");
  if (o.director) parts.push("Director");
  if (o.tenPercentOwner) parts.push("10% owner");
  return parts.length > 0 ? parts.join(" · ") : "Insider";
}

/**
 * A 4/A restates the whole filing it corrects, so it replaces it. The
 * amendment does not name the original's accession — only the owner and
 * the date the original went in — so that pair is the match. Without a
 * match the amendment stands on its own.
 */
export function supersedeAmendments(filings: Form4Filing[]): Form4Filing[] {
  const replaced = new Set<string>();
  for (const a of filings) {
    if (a.form !== "4/A" || !a.originalSubmissionDate) continue;
    const owners = new Set(a.owners.map((o) => o.cik));
    for (const f of filings) {
      if (f.form === "4" && f.filingDate === a.originalSubmissionDate && f.owners.some((o) => owners.has(o.cik))) {
        replaced.add(f.accession);
      }
    }
  }
  return filings.filter((f) => !replaced.has(f.accession));
}

/**
 * Lines of one filing that are the same order: same person, same day, same
 * code, same plan, same holding. A CEO selling under a plan can file thirty
 * fills of 4 to 78 shares for one instruction; they are one row here.
 *
 * Shares add up exactly. The price is the share-weighted average of the
 * fills, and only when every fill filed one — a missing price is never
 * filled in, so the value is then left out rather than estimated. The
 * holding after is the one filed after the last fill.
 */
function orderKey(t: Form4Filing["transactions"][number]): string {
  return [t.date, t.code, t.plan ?? "", t.acquired ? "A" : "D", t.direct ? "D" : `I:${t.nature ?? ""}`, t.security].join("|");
}

export function toRows(filings: Form4Filing[]): InsiderRow[] {
  const rows: InsiderRow[] = [];
  for (const f of supersedeAmendments(filings)) {
    const owner = f.owners[0];
    if (!owner) continue;
    const name = f.owners.length > 1 ? `${owner.name} +${f.owners.length - 1}` : owner.name;

    // Filing order is kept, so "holds after" comes from the last fill.
    const orders = new Map<string, Form4Filing["transactions"]>();
    for (const t of f.transactions) {
      const k = orderKey(t);
      const list = orders.get(k);
      if (list) list.push(t);
      else orders.set(k, [t]);
    }

    for (const fills of orders.values()) {
      const first = fills[0];
      const last = fills[fills.length - 1];
      const kind = kindOf(first.code);
      const shares = fills.reduce((sum, t) => sum + t.shares, 0);
      const allPriced = fills.every((t) => t.price !== null);
      const value = allPriced ? fills.reduce((sum, t) => sum + t.shares * (t.price as number), 0) : null;
      const footnotes = [...new Set(fills.flatMap((t) => t.footnotes))];
      rows.push({
        accession: f.accession,
        filingDate: f.filingDate,
        amended: f.form === "4/A",
        date: first.date,
        owner: name,
        ownerCik: owner.cik,
        role: roleOf(owner),
        code: first.code,
        kind,
        shares,
        price: value !== null && shares > 0 ? value / shares : null,
        // An average of several fills is an average, whatever the filing says.
        priceFootnoted: fills.length > 1 || fills.some((t) => t.priceFootnoted),
        value,
        acquired: first.acquired,
        sharesAfter: last.sharesAfter,
        direct: first.direct,
        nature: first.nature,
        plan: first.plan,
        discretionary: (kind === "buy" || kind === "sell") && first.plan === null,
        footnotes,
        fills: fills.length,
      });
    }
  }
  // Newest trade first; the filing date breaks ties so a batch stays together.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.filingDate.localeCompare(a.filingDate));
}

// ─── The summary ─────────────────────────────────────────────────────────

export interface FlowTotals {
  count: number;
  shares: number;
  /** Sum of the rows that carry a price. */
  value: number;
  /** Rows counted in `count` and `shares` that filed no price, so are absent from `value`. */
  unpriced: number;
}

export interface Cluster {
  from: string;
  to: string;
  insiders: string[];
}

export interface InsiderSummary {
  from: string;
  to: string;
  buys: FlowTotals;
  sells: FlowTotals;
  planBuys: FlowTotals;
  planSells: FlowTotals;
  /** Distinct people with a discretionary purchase in the window. */
  buyers: number;
  /** Discretionary shares bought minus sold. */
  netShares: number;
  other: Record<Exclude<InsiderKind, "buy" | "sell">, number>;
  /** Three or more distinct insiders buying on the open market within 90 days. */
  cluster: Cluster | null;
}

const DAY = 86_400_000;
export const SUMMARY_DAYS = 365;
export const CLUSTER_DAYS = 90;
export const CLUSTER_MIN = 3;

function totals(rows: InsiderRow[]): FlowTotals {
  const priced = rows.filter((r) => r.value !== null);
  return {
    count: rows.length,
    shares: rows.reduce((s, r) => s + r.shares, 0),
    value: priced.reduce((s, r) => s + (r.value ?? 0), 0),
    unpriced: rows.length - priced.length,
  };
}

/** The widest 90-day run of discretionary buying by three or more people. */
export function findCluster(rows: InsiderRow[]): Cluster | null {
  const buys = rows.filter((r) => r.kind === "buy" && r.discretionary).sort((a, b) => a.date.localeCompare(b.date));
  let best: Cluster | null = null;
  for (let i = 0; i < buys.length; i++) {
    const start = Date.parse(buys[i].date);
    const people = new Map<string, string>();
    let end = buys[i].date;
    for (let j = i; j < buys.length && Date.parse(buys[j].date) - start <= CLUSTER_DAYS * DAY; j++) {
      people.set(buys[j].ownerCik || buys[j].owner, buys[j].owner);
      end = buys[j].date;
    }
    if (people.size >= CLUSTER_MIN && (!best || people.size > best.insiders.length)) {
      best = { from: buys[i].date, to: end, insiders: [...people.values()] };
    }
  }
  return best;
}

/**
 * The last twelve months, measured back from `asOf` — passed in rather
 * than read from the clock, so the same rows always summarise the same way.
 */
export function summarize(rows: InsiderRow[], asOf: string): InsiderSummary {
  const to = asOf.slice(0, 10);
  const from = new Date(Date.parse(to) - SUMMARY_DAYS * DAY).toISOString().slice(0, 10);
  const inWindow = rows.filter((r) => r.date >= from && r.date <= to);

  const buys = inWindow.filter((r) => r.kind === "buy" && r.discretionary);
  const sells = inWindow.filter((r) => r.kind === "sell" && r.discretionary);
  const count = (k: InsiderKind) => inWindow.filter((r) => r.kind === k).length;

  return {
    from,
    to,
    buys: totals(buys),
    sells: totals(sells),
    planBuys: totals(inWindow.filter((r) => r.kind === "buy" && !r.discretionary)),
    planSells: totals(inWindow.filter((r) => r.kind === "sell" && !r.discretionary)),
    buyers: new Set(buys.map((r) => r.ownerCik || r.owner)).size,
    netShares: buys.reduce((s, r) => s + r.shares, 0) - sells.reduce((s, r) => s + r.shares, 0),
    other: { grant: count("grant"), exercise: count("exercise"), tax: count("tax"), gift: count("gift"), other: count("other") },
    cluster: findCluster(inWindow),
  };
}
