/**
 * Vercel Cron — Quality Score Pre-computation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Triggered weekly (Sunday 02:00 UTC) by Vercel Cron.
 * Reads cached Yahoo Finance financials, runs the quality-score engine for
 * every ticker in the universe, and stores results in `stock_quality_scores`.
 *
 * Schedule: see vercel.json  →  "0 2 * * 0"
 *
 * Manual trigger (force recompute all):
 *   GET /api/cron/quality-scores?force=true
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Environment variables required:
 *   CRON_SECRET                — shared secret checked against Authorization header
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key (bypasses RLS)
 */

import { NextRequest, NextResponse } from "next/server";
import { computeQualityScores } from "@/lib/scripts/compute-quality-scores";

// Tell Next.js this route can run longer than the 10-s default.
// Vercel Hobby: max 60 s. Pro: max 300 s. Adjust if you upgrade.
export const maxDuration = 300;

// Required so the route is not statically built during `next build`
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── 1. Authorization ───────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[CronQuality] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse options ───────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  console.log(`[CronQuality] Starting quality score computation (force=${force})`);

  // ── 3. Run computation ─────────────────────────────────────────────────────
  try {
    const result = await computeQualityScores({ force });

    return NextResponse.json({
      ok: true,
      force,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CronQuality] Unhandled error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
