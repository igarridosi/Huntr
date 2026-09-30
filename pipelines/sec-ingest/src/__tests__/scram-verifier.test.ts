import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs tool with no types
import { alterRole, passwordProblem, scramVerifier } from "../../local/scram-verifier.mjs";

// Written by Postgres 15 itself (CREATE ROLE ... PASSWORD with
// password_encryption = scram-sha-256) for the password below: the tool has
// to produce the same verifier from the same salt.
const POSTGRES_VERIFIER =
  "SCRAM-SHA-256$4096:FuX93VZCAHY3D75C6/OH4w==$6XEsUWS1oPXgrRxRsvPO2xGCCKbhJCL6wlctte7x8+c=:tRfdSSdcJ9b6DACzUcnDnTdkzPdOb8mUuhRvLGe5oGU=";

describe("scram-verifier", () => {
  it("matches the verifier Postgres computes for the same password and salt", () => {
    const salt = Buffer.from("FuX93VZCAHY3D75C6/OH4w==", "base64");
    expect(scramVerifier("correct horse battery staple", { salt, iterations: 4096 })).toBe(POSTGRES_VERIFIER);
  });

  it("uses a fresh salt every time", () => {
    expect(scramVerifier("X9!long-enough-password")).not.toBe(scramVerifier("X9!long-enough-password"));
  });

  it("refuses short passwords and anything SASLprep would rewrite", () => {
    expect(passwordProblem("short")).toMatch(/at least 16/);
    expect(passwordProblem("has spaces in it here")).toMatch(/printable ASCII/);
    expect(passwordProblem("contraseña-larga-y-segura")).toMatch(/printable ASCII/);
    expect(passwordProblem("Zq7!vR2#pL9@xW4$mN6^")).toBeNull();
  });

  it("writes an ALTER ROLE for a plain role name only", () => {
    expect(alterRole("huntr_sec_ingest", "SCRAM-SHA-256$x")).toBe("ALTER ROLE huntr_sec_ingest PASSWORD 'SCRAM-SHA-256$x';");
    expect(() => alterRole("x; drop table t", "v")).toThrow(/not a plain role name/);
  });
});
