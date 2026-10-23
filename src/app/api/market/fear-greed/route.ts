/**
 * Huntr's Fear & Greed index: the last ~270 trading days, each with its five
 * signals (src/lib/fear-greed.ts).
 *
 *   GET /api/market/fear-greed
 */

import { NextResponse } from "next/server";
import { getFearGreed } from "@/lib/api/fear-greed";
import { FEATURES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!FEATURES.ENABLE_REAL_API) return NextResponse.json({ computedAt: null, points: [] });
  const payload = await getFearGreed().catch((error) => {
    console.error("[fear-greed] failed:", error);
    return undefined;
  });
  if (payload === undefined) return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  return NextResponse.json(payload ?? { computedAt: null, points: [] });
}
