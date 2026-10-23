/**
 * The Hunting Ground's data, served: the light cache read
 * (getHuntingGroundMetrics), then two gaps filled.
 *
 *  - Foreign filers. A company quoted in dollars and reporting in its own
 *    currency (TSM in TWD, ASML in EUR, Toyota in JPY) has its free cash flow
 *    converted at the current rate before it is divided by its market cap.
 *  - Industry, for the financial companies. Banks, insurers and property are
 *    left off the map because free cash flow does not measure them; Visa,
 *    Mastercard and the exchanges are in the same GICS sector and it does.
 *    The industry tells them apart; where no cached profile has it, the
 *    profile is fetched once (it is cached for a week).
 */

import "server-only";
import { getHuntingGroundMetrics, type HuntingGroundMetrics } from "@/lib/api/cache";
import { getFxRate, getProfile } from "@/lib/api/yahoo";
import { createClient } from "@/lib/supabase/server";

/** The GICS sectors whose companies need an industry to be placed or left out. */
const NEEDS_INDUSTRY = /financ|real estate/i;
const PROFILE_CONCURRENCY = 6;

export async function getHuntingGround(tickers: string[]): Promise<Record<string, HuntingGroundMetrics>> {
  const supabase = await createClient();
  const [metrics, { data: sectorRows }] = await Promise.all([
    getHuntingGroundMetrics(tickers),
    // The GICS sector the page shows, from our tickers table.
    supabase.from("tickers").select("symbol, sector").in("symbol", tickers.map((t) => t.toUpperCase())),
  ]);
  const sectors: Record<string, string> = Object.fromEntries((sectorRows ?? []).map((r) => [r.symbol, r.sector]));

  // Exchange rates, one per currency pair.
  const pairs = new Map<string, Promise<number | null>>();
  for (const m of Object.values(metrics)) {
    if (!m.pendingFx) continue;
    const key = `${m.pendingFx.from}${m.pendingFx.to}`;
    if (!pairs.has(key)) pairs.set(key, getFxRate(m.pendingFx.from, m.pendingFx.to).catch(() => null));
  }
  for (const m of Object.values(metrics)) {
    if (!m.pendingFx) continue;
    const rate = await pairs.get(`${m.pendingFx.from}${m.pendingFx.to}`);
    if (rate && rate > 0) {
      const y = (m.pendingFx.fcf * rate) / m.pendingFx.marketCap;
      if (Math.abs(y) <= 1) {
        m.fcfYield = y;
        m.fxFrom = m.pendingFx.from;
      }
    }
    m.pendingFx = null;
  }

  // Industries for the financial and property companies that lack one.
  const missing = Object.keys(metrics).filter((t) => {
    const sector = sectors[t] ?? metrics[t].sector ?? "";
    return NEEDS_INDUSTRY.test(sector) && !metrics[t].industry;
  });
  for (let i = 0; i < missing.length; i += PROFILE_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + PROFILE_CONCURRENCY).map(async (ticker) => {
        const profile = await getProfile(ticker).catch(() => null);
        if (profile?.industry && profile.industry !== "Unknown") metrics[ticker].industry = profile.industry;
      })
    );
  }

  return metrics;
}
