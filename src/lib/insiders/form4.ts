/**
 * Reading a Form 4 — the filing an officer, director or 10% owner makes
 * within two business days of trading the company's stock.
 *
 * The XML follows one fixed SEC schema (`ownershipDocument`), so it is
 * read with a narrow extractor rather than a general parser: no new
 * dependency, and every rule below is pinned by a real filing in
 * `__tests__/fixtures`.
 *
 * What the extractor keeps is the non-derivative table — shares that
 * actually changed hands. The derivative table restates the same event
 * from the option's side (an RSU settled appears in both), so counting
 * it too would double every exercise.
 */

export interface InsiderOwner {
  cik: string;
  name: string;
  director: boolean;
  officer: boolean;
  officerTitle: string | null;
  tenPercentOwner: boolean;
}

/**
 * Whether a trade ran under a Rule 10b5-1 plan — scheduled months ahead,
 * so it says nothing about what the insider thinks today.
 *
 * - `line`: the transaction's own footnote says so.
 * - `filing`: the filing's plan box is ticked but no footnote names the
 *   line; attributed to its open-market trades, since grants, exercises
 *   and tax withholding are not trades a plan schedules.
 */
export type PlanAttribution = "line" | "filing" | null;

export interface Form4Transaction {
  date: string;
  code: string;
  security: string;
  shares: number;
  /** Per share, as filed. Null when the filing gives none (grants, exercises). */
  price: number | null;
  /** A price the filing qualifies in a footnote — typically a weighted average over a range. */
  priceFootnoted: boolean;
  acquired: boolean;
  sharesAfter: number | null;
  direct: boolean;
  /** For indirect holdings: the trust, spouse or fund that holds them. */
  nature: string | null;
  plan: PlanAttribution;
  footnotes: string[];
}

export interface Form4Filing {
  accession: string;
  filingDate: string;
  form: "4" | "4/A";
  periodOfReport: string | null;
  /** On a 4/A: the date the filing it corrects was submitted. */
  originalSubmissionDate: string | null;
  owners: InsiderOwner[];
  /** The filing-level Rule 10b5-1 box. */
  planBox: boolean;
  transactions: Form4Transaction[];
}

// ─── Extraction helpers ──────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m)
    .trim();
}

/** Every <tag>…</tag> block, inner content only. Tags used here never nest in themselves. */
function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function text(xml: string, tag: string): string | null {
  const b = blocks(xml, tag)[0];
  if (b === undefined) return null;
  const v = decode(b);
  return v === "" ? null : v;
}

/** The SEC wraps most figures as <tag><value>x</value></tag>. */
function value(xml: string, tag: string): string | null {
  const b = blocks(xml, tag)[0];
  return b === undefined ? null : text(b, "value");
}

function num(s: string | null): number | null {
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Filers write booleans as 1/0 or true/false — Apple one way, Tesla the other. */
function flag(s: string | null): boolean {
  return s !== null && (s === "1" || s.toLowerCase() === "true");
}

function footnoteIds(xml: string): string[] {
  const ids: string[] = [];
  const re = /<footnoteId\s+id="([^"]+)"\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) ids.push(m[1]);
  return ids;
}

const PLAN_RE = /10b5-1/i;

// ─── The parser ──────────────────────────────────────────────────────────

export function parseForm4(xml: string, meta: { accession: string; filingDate: string }): Form4Filing | null {
  const docType = text(xml, "documentType");
  if (docType !== "4" && docType !== "4/A") return null;

  const notes = new Map<string, string>();
  for (const m of xml.matchAll(/<footnote\s+id="([^"]+)"\s*>([\s\S]*?)<\/footnote>/g)) notes.set(m[1], decode(m[2]));

  const owners: InsiderOwner[] = blocks(xml, "reportingOwner").map((o) => ({
    cik: text(o, "rptOwnerCik") ?? "",
    name: text(o, "rptOwnerName") ?? "Unknown",
    director: flag(text(o, "isDirector")),
    officer: flag(text(o, "isOfficer")),
    officerTitle: text(o, "officerTitle"),
    tenPercentOwner: flag(text(o, "isTenPercentOwner")),
  }));

  const planBox = flag(text(xml, "aff10b5One"));
  const table = blocks(xml, "nonDerivativeTable")[0] ?? "";

  const transactions: Form4Transaction[] = blocks(table, "nonDerivativeTransaction").map((t) => {
    const ids = footnoteIds(t);
    const footnotes = ids.map((id) => notes.get(id)).filter((n): n is string => Boolean(n));
    const priceBlock = blocks(t, "transactionPricePerShare")[0] ?? "";
    const price = num(value(t, "transactionPricePerShare"));
    return {
      date: value(t, "transactionDate") ?? meta.filingDate,
      code: text(t, "transactionCode") ?? "",
      security: value(t, "securityTitle") ?? "",
      shares: num(value(t, "transactionShares")) ?? 0,
      // A price of 0 on a grant is "no price", not "free".
      price: price !== null && price > 0 ? price : null,
      priceFootnoted: footnoteIds(priceBlock).length > 0,
      acquired: value(t, "transactionAcquiredDisposedCode") === "A",
      sharesAfter: num(value(t, "sharesOwnedFollowingTransaction")),
      direct: value(t, "directOrIndirectOwnership") !== "I",
      nature: value(t, "natureOfOwnership"),
      plan: footnotes.some((n) => PLAN_RE.test(n)) ? "line" : null,
      footnotes,
    };
  });

  // The plan box without a footnote naming the line: it belongs to the
  // open-market trades, not to grants, exercises or tax withholding.
  if (planBox && !transactions.some((t) => t.plan === "line")) {
    for (const t of transactions) if (t.code === "P" || t.code === "S") t.plan = "filing";
  }

  return {
    accession: meta.accession,
    filingDate: meta.filingDate,
    form: docType,
    periodOfReport: text(xml, "periodOfReport"),
    originalSubmissionDate: text(xml, "dateOfOriginalSubmission"),
    owners,
    planBox,
    transactions,
  };
}
