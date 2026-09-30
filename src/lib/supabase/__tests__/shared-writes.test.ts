import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Shared data is written by the server only.
 *
 * Migrations 002 and 008 created write policies with no TO clause and
 * USING (true), which Postgres applies to PUBLIC: with the anon key in
 * every browser, anyone could rewrite the cache, the quality scores or the
 * tickers. Migration 013 closed that. These tests keep it closed, from both
 * sides: no migration may leave such a policy standing, and no code may
 * write the shared tables with anything but the service role.
 */

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const SHARED_TABLES = ["tickers", "stock_cache", "stock_quality_scores", "analytics_events"];
/** Roles a policy without TO reaches, or that the API hands out. */
const API_ROLES = /\b(public|anon|authenticated)\b/i;

interface Policy {
  name: string;
  table: string;
  command: string;
  roles: string | null;
  using: string | null;
  check: string | null;
  file: string;
}

const bare = (table: string) => table.replace(/^public\./i, "").replace(/"/g, "").toLowerCase();

/** Every policy standing after the migrations are applied in order. */
function standingPolicies(): Policy[] {
  const standing = new Map<string, Policy>();
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
    const events: Array<{ at: number; apply: () => void }> = [];
    for (const m of sql.matchAll(/CREATE\s+POLICY\s+"?([\w-]+)"?\s+ON\s+([\w."]+)([\s\S]*?);/gi)) {
      const body = m[3];
      const policy: Policy = {
        name: m[1].toLowerCase(),
        table: bare(m[2]),
        command: (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(body)?.[1] ?? "ALL").toUpperCase(),
        roles: /\bTO\s+([\w\s,]+?)(?=\s+(?:USING|WITH|$))/i.exec(body)?.[1] ?? null,
        using: /\bUSING\s*\(([\s\S]*?)\)\s*(?:WITH|$)/i.exec(body + " ")?.[1]?.trim() ?? null,
        check: /\bWITH\s+CHECK\s*\(([\s\S]*?)\)\s*$/i.exec(body.trim())?.[1]?.trim() ?? null,
        file,
      };
      events.push({ at: m.index!, apply: () => standing.set(`${policy.table}.${policy.name}`, policy) });
    }
    for (const m of sql.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([\w-]+)"?\s+ON\s+([\w."]+)/gi)) {
      const key = `${bare(m[2])}.${m[1].toLowerCase()}`;
      events.push({ at: m.index!, apply: () => standing.delete(key) });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return [...standing.values()];
}

/** A write policy any API caller satisfies: no TO (PUBLIC) or an API role, and an unconditional true. */
function isOpenWrite(p: Policy): boolean {
  if (p.command === "SELECT") return false;
  const reachesApi = p.roles === null || API_ROLES.test(p.roles);
  const unconditional = [p.using, p.check].some((c) => c !== null && /^true$/i.test(c));
  return reachesApi && unconditional;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe("shared tables are written by the server only", () => {
  it("reads the migrations the way Postgres applies them", () => {
    const policies = standingPolicies();
    // A user-owned policy is found and is not open…
    const own = policies.find((p) => p.table === "user_charts" && p.command === "INSERT");
    expect(own).toBeDefined();
    expect(isOpenWrite(own!)).toBe(false);
    // …and the read policies 013 keeps are still standing.
    expect(policies.map((p) => `${p.table}.${p.name}`)).toEqual(expect.arrayContaining(["tickers.tickers_read", "stock_cache.stock_cache_read", "stock_quality_scores.quality_scores_read"]));
  });

  it("leaves no write policy open to the API roles after all migrations", () => {
    const open = standingPolicies().filter(isOpenWrite).map((p) => `${p.table}.${p.name} (${p.file})`);
    expect(open).toEqual([]);
  });

  it("writes the shared tables with the service role only", () => {
    const offenders: string[] = [];
    const tables = SHARED_TABLES.join("|");
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const text = fs.readFileSync(file, "utf8");
      const writes = new RegExp(String.raw`(\w+)\s*\.from\(\s*["'](${tables})["']\s*\)\s*\.(insert|upsert|update|delete)\(`, "g");
      for (const m of text.matchAll(writes)) {
        // The client this call goes through: the last one assigned to that name before it.
        const before = text.slice(0, m.index);
        const assignments = [...before.matchAll(new RegExp(String.raw`\b${m[1]}\s*=\s*(?:await\s+)?(create\w*Client)\(`, "g"))];
        const factory = assignments.at(-1)?.[1];
        if (factory !== "createAdminClient") offenders.push(`${path.relative(ROOT, file)}: ${m[2]}.${m[3]} through ${factory ?? "an unknown client"}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not let a maintenance script fall back to the anon key to write them", () => {
    const scripts = path.join(ROOT, "scripts");
    const offenders = fs
      .readdirSync(scripts)
      .filter((f) => /\.(js|ts|mjs)$/.test(f))
      .filter((f) => {
        const text = fs.readFileSync(path.join(scripts, f), "utf8");
        const writes = new RegExp(String.raw`from\(\s*["'](${SHARED_TABLES.join("|")})["']\s*\)\s*\.(insert|upsert|update|delete)\(`).test(text);
        return writes && /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
