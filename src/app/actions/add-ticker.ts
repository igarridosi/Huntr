"use server";

/**
 * Server actions for adding a new ticker to the Huntr database.
 *
 * Flow:
 *   1. lookupTickerPreview  → validates symbol, fetches Yahoo profile, checks DB duplicate
 *   2. addTickerToDatabase  → upserts the ticker row into `tickers` (name/sector/website come
 *                             from Yahoo so the user doesn't have to fill in any form fields)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import * as dataService from "@/lib/api";
import type { StockProfile } from "@/types/stock";

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;

function sanitize(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Invalid ticker");
  const t = raw.trim().toUpperCase();
  if (!TICKER_RE.test(t)) throw new Error("Invalid ticker format");
  return t;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TickerLookupResult {
  profile: StockProfile | null;
  alreadyExists: boolean;
  error?: string;
}

export interface AddTickerResult {
  success: boolean;
  ticker?: string;
  name?: string;
  error?: string;
}

// ─── Step 1: Look up a ticker to preview before adding ───────────────────────

export async function lookupTickerPreview(
  raw: unknown
): Promise<TickerLookupResult> {
  let ticker: string;
  try {
    ticker = sanitize(raw);
  } catch {
    return { profile: null, alreadyExists: false, error: "Invalid ticker symbol." };
  }

  try {
    // Check for existing entry first (fast DB round-trip)
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("tickers")
      .select("symbol")
      .eq("symbol", ticker)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      return { profile: null, alreadyExists: true };
    }

    // Fetch profile from Yahoo Finance (cached 7 days in Supabase)
    const profile = await dataService.getStockProfile(ticker);

    if (!profile || !profile.name) {
      return {
        profile: null,
        alreadyExists: false,
        error: `"${ticker}" was not found. Check the symbol and try again.`,
      };
    }

    return { profile, alreadyExists: false };
  } catch {
    return {
      profile: null,
      alreadyExists: false,
      error: "Lookup failed. Check your connection and try again.",
    };
  }
}

// ─── Step 2: Persist the ticker into the tickers table ───────────────────────

export async function addTickerToDatabase(
  raw: unknown
): Promise<AddTickerResult> {
  let ticker: string;
  try {
    ticker = sanitize(raw);
  } catch {
    return { success: false, error: "Invalid ticker symbol." };
  }

  try {
    // Fetch profile once more (Supabase cache → instant round-trip)
    const profile = await dataService.getStockProfile(ticker);
    if (!profile || !profile.name) {
      return { success: false, error: "Could not retrieve profile data." };
    }

    // Normalise website to bare domain (matches the format seed-tickers.ts uses)
    let website = profile.website ?? "";
    if (website) {
      try {
        website = new URL(website.startsWith("http") ? website : `https://${website}`)
          .hostname.replace(/^www\./, "");
      } catch {
        // keep raw value
      }
    }

    const supabase = createAdminClient();
    const { error: dbError } = await supabase.from("tickers").upsert(
      {
        symbol: ticker,
        name: profile.name,
        sector: profile.sector || profile.industry || "Other",
        website,
        is_active: true,
      },
      { onConflict: "symbol" }
    );

    if (dbError) {
      return { success: false, error: "Database error — please try again." };
    }

    return { success: true, ticker, name: profile.name };
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
