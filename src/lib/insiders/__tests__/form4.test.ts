import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseForm4, type Form4Filing } from "../form4";
import { findCluster, summarize, supersedeAmendments, toRows, type InsiderRow } from "../activity";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const parse = (name: string, accession: string, filingDate: string) => {
  const f = parseForm4(fixture(name), { accession, filingDate });
  if (!f) throw new Error(`fixture ${name} did not parse`);
  return f;
};

// All six are real filings pulled from EDGAR on 2026-09-25.
const fisBuy = () => parse("fis-purchase-in-lieu-of-retainer.xml", "0001628280-26-048468", "2026-07-16");
const fisAmend = () => parse("fis-4a-amendment.xml", "0001193125-26-131813", "2026-03-30");
const aapl = () => parse("aapl-plan-sale-rsu-tax.xml", "0001140361-26-037020", "2026-09-17");
const tsla = () => parse("tsla-plan-sales-indirect.xml", "0001104659-26-001460", "2026-01-06");
const yetiTax = () => parse("yeti-tax-withholding.xml", "0001104659-26-098372", "2026-08-18");
const yetiGrant = () => parse("yeti-grant.xml", "0001104659-26-058691", "2026-05-11");

describe("parseForm4", () => {
  it("reads the owner, the role and every share movement (YETI, tax withholding)", () => {
    const f = yetiTax();
    expect(f.form).toBe("4");
    expect(f.owners[0]).toMatchObject({ name: "Reintjes Matthew J", director: true, officer: true, officerTitle: "Chair, President and CEO" });
    expect(f.transactions).toHaveLength(2);
    expect(f.transactions[0]).toMatchObject({ date: "2026-08-14", code: "F", shares: 2228, price: 44.56, acquired: false, sharesAfter: 466222, direct: true, plan: null });
    expect(f.transactions[0].footnotes[0]).toMatch(/withheld by the Issuer to satisfy tax/);
  });

  it("keeps the non-derivative table only, so an RSU settlement is not counted twice (Apple)", () => {
    const f = aapl();
    // M appears in both tables in the filing; only the share side is kept.
    expect(f.transactions.map((t) => t.code)).toEqual(["S", "M", "F"]);
  });

  it("reads the plan box as true/false as well as 1/0", () => {
    expect(aapl().planBox).toBe(true); // Apple writes "true"
    expect(tsla().planBox).toBe(true); // Tesla writes "1"
    expect(yetiTax().planBox).toBe(false); // YETI writes "0"
  });

  it("attributes the plan to the line its footnote names, not to the whole filing (Apple)", () => {
    const [sale, exercise, tax] = aapl().transactions;
    expect(sale.plan).toBe("line");
    expect(exercise.plan).toBeNull();
    expect(tax.plan).toBeNull();
  });

  it("marks a weighted-average price and an indirect holding (Tesla, sales through a trust)", () => {
    const t = tsla().transactions[0];
    expect(t).toMatchObject({ code: "S", shares: 1803, price: 435.865, priceFootnoted: true, direct: false, nature: "By JRM Rev. Trust", plan: "line" });
  });

  it("treats a zero price on a grant as no price, not as free (YETI)", () => {
    const grant = yetiGrant().transactions.find((t) => t.code === "A");
    expect(grant?.price).toBeNull();
  });

  it("reads the date of the filing a 4/A corrects (FIS)", () => {
    const f = fisAmend();
    expect(f.form).toBe("4/A");
    expect(f.originalSubmissionDate).toBe("2026-03-09");
  });

  it("ignores anything that is not a Form 4", () => {
    expect(parseForm4("<ownershipDocument><documentType>3</documentType></ownershipDocument>", { accession: "x", filingDate: "2026-01-01" })).toBeNull();
  });
});

describe("toRows", () => {
  it("does not count a purchase made under a plan as an insider buying (FIS chairman, in lieu of his retainer)", () => {
    const [row] = toRows([fisBuy()]);
    expect(row).toMatchObject({ kind: "buy", code: "P", shares: 1386, price: 41.39, plan: "line", discretionary: false });
    expect(row.value).toBeCloseTo(57_366.54, 2);
    expect(row.role).toBe("Director");
  });

  it("does not count plan sales, tax withholding or exercises as selling (Apple)", () => {
    const rows = toRows([aapl()]);
    expect(rows.filter((r) => r.discretionary)).toHaveLength(0);
    expect(rows.map((r) => r.kind).sort()).toEqual(["exercise", "sell", "tax"]);
  });

  it("folds the fills of one order into one row, exactly (Tesla director, plan sales through a trust)", () => {
    const f = tsla();
    const sold = f.transactions.filter((t) => t.code === "S");
    const rows = toRows([f]);
    const sale = rows.find((r) => r.code === "S")!;
    // Every fill that day is the same instruction: one row.
    expect(rows.filter((r) => r.code === "S")).toHaveLength(1);
    expect(sale.fills).toBe(sold.length);
    expect(sale.shares).toBe(sold.reduce((s, t) => s + t.shares, 0));
    const value = sold.reduce((s, t) => s + t.shares * (t.price as number), 0);
    expect(sale.value).toBeCloseTo(value, 6);
    expect(sale.price).toBeCloseTo(value / sale.shares, 6);
    // The holding after is the one filed after the last fill.
    expect(sale.sharesAfter).toBe(sold[sold.length - 1].sharesAfter);
    expect(sale).toMatchObject({ plan: "line", direct: false, nature: "By JRM Rev. Trust", priceFootnoted: true });
  });

  it("keeps different orders apart even inside one filing (Apple: sale, exercise, tax)", () => {
    expect(toRows([aapl()]).map((r) => r.code).sort()).toEqual(["F", "M", "S"]);
  });

  it("gives no value to a line that filed no price", () => {
    const rows = toRows([yetiGrant()]);
    expect(rows.every((r) => r.price === null ? r.value === null : true)).toBe(true);
  });
});

describe("supersedeAmendments", () => {
  it("replaces the original with the 4/A that corrects it — same owner, original date", () => {
    const amend = fisAmend();
    const original: Form4Filing = { ...amend, accession: "orig", form: "4", filingDate: "2026-03-09", originalSubmissionDate: null };
    const unrelated: Form4Filing = { ...original, accession: "other", owners: [{ ...amend.owners[0], cik: "0000000001" }] };
    expect(supersedeAmendments([original, amend, unrelated]).map((f) => f.accession)).toEqual([amend.accession, "other"]);
  });

  it("keeps a 4/A whose original is not on file", () => {
    expect(supersedeAmendments([fisAmend()])).toHaveLength(1);
  });
});

describe("summarize and findCluster", () => {
  const row = (over: Partial<InsiderRow>): InsiderRow => ({
    accession: "a", filingDate: "2026-06-01", amended: false, date: "2026-06-01", owner: "A", ownerCik: "1", role: "Director",
    code: "P", kind: "buy", shares: 100, price: 10, priceFootnoted: false, value: 1_000, acquired: true, sharesAfter: 1_000,
    direct: true, nature: null, plan: null, discretionary: true, footnotes: [], fills: 1, ...over,
  });

  it("splits discretionary trades from plan trades and keeps the unpriced ones out of value", () => {
    const s = summarize([
      row({}),
      row({ ownerCik: "2", owner: "B", price: null, value: null }),
      row({ code: "S", kind: "sell", shares: 40, value: 400, discretionary: true }),
      row({ code: "S", kind: "sell", shares: 500, value: 5_000, plan: "line", discretionary: false }),
      row({ code: "F", kind: "tax", discretionary: false }),
      row({ date: "2024-01-01" }), // outside the twelve months
    ], "2026-09-25");
    expect(s.buys).toEqual({ count: 2, shares: 200, value: 1_000, unpriced: 1 });
    expect(s.sells).toEqual({ count: 1, shares: 40, value: 400, unpriced: 0 });
    expect(s.planSells.count).toBe(1);
    expect(s.buyers).toBe(2);
    expect(s.netShares).toBe(160);
    expect(s.other.tax).toBe(1);
  });

  it("calls a cluster at three distinct buyers inside 90 days, and not at two or at 91 days", () => {
    const a = row({ ownerCik: "1", owner: "A", date: "2026-03-01" });
    const b = row({ ownerCik: "2", owner: "B", date: "2026-04-01" });
    const c = row({ ownerCik: "3", owner: "C", date: "2026-05-30" });
    expect(findCluster([a, b, c])).toEqual({ from: "2026-03-01", to: "2026-05-30", insiders: ["A", "B", "C"] });
    expect(findCluster([a, b])).toBeNull();
    expect(findCluster([a, b, row({ ownerCik: "3", owner: "C", date: "2026-05-31" })])).toBeNull();
    // The same person three times is one buyer, not a cluster.
    expect(findCluster([a, { ...a, date: "2026-03-02" }, { ...a, date: "2026-03-03" }])).toBeNull();
    // Plan purchases never make a cluster.
    expect(findCluster([a, b, { ...c, discretionary: false, plan: "line" }])).toBeNull();
  });
});
