/**
 * Gold, crude oil, the 10-year Treasury yield and bitcoin: their moves today,
 * for the Markets row of the Insights news.
 *
 *   GET /api/market/assets
 *
 * A route handler, not a Server Action, so it never queues the page's
 * actions behind it.
 */

import { NextResponse } from "next/server";
import { getNewsAssets } from "@/lib/api/yahoo";
import { FEATURES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!FEATURES.ENABLE_REAL_API) return NextResponse.json([]);
  return NextResponse.json(await getNewsAssets().catch(() => []));
}
