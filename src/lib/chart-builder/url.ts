/**
 * Chart Builder — spec ⇄ URL parameter.
 *
 * `?c=<base64url(JSON)>`. A typical spec is well under a kilobyte, so no
 * compression is needed and no dependency is pulled in. Decoding runs the
 * migration and normalisation, so what comes out is always a current,
 * rule-abiding spec — or null when the string is not one.
 */

import { migrateSpec, normalizeSpec, type ChartSpec } from "./spec";

export const SPEC_QUERY_PARAM = "c";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodeSpec(spec: ChartSpec): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(spec)));
}

export function decodeSpec(encoded: string | null | undefined): ChartSpec | null {
  if (!encoded) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  const migrated = migrateSpec(parsed);
  if (!migrated.ok) return null;
  return normalizeSpec(migrated.spec);
}
