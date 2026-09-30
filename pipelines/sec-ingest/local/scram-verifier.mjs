// Prints the ALTER ROLE statement that sets huntr_sec_ingest's password
// without the password ever reaching the database, its logs or the SQL
// Editor's history: only the SCRAM-SHA-256 verifier does. It is what psql's
// \password does client-side, for when the SQL Editor is the way in.
//
//   node local/scram-verifier.mjs              # asks for the password twice, hidden
//   node local/scram-verifier.mjs other_role   # for another role
//
// Postgres stores a string in this format as the verifier as it is,
// whatever password_encryption says. Node's crypto only, no dependencies.
//
// The verifier is not the password, but whoever holds it can try guesses
// offline: use a long random password (a password manager's, 32+
// characters). Printable ASCII only, so that SASLprep, which Postgres
// applies to the password on login, leaves it exactly as typed.

import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const ITERATIONS = 4096; // Postgres's default scram_iterations
const MIN_LENGTH = 16;

/** SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>, as Postgres stores it (RFC 5802, RFC 7677). */
export function scramVerifier(password, { salt = randomBytes(16), iterations = ITERATIONS } = {}) {
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/** Why a password is refused, or null. */
export function passwordProblem(password) {
  if (password.length < MIN_LENGTH) return `at least ${MIN_LENGTH} characters (32+ from a password manager is better)`;
  if (!/^[\x21-\x7e]+$/.test(password)) return "printable ASCII only, no spaces: SASLprep would rewrite anything else";
  return null;
}

export function alterRole(role, verifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error(`not a plain role name: ${role}`);
  return `ALTER ROLE ${role} PASSWORD '${verifier}';`;
}

/** Reads a line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error("run this in a terminal: the password is read with echo off"));
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const role = process.argv[2] ?? "huntr_sec_ingest";
  const password = await askHidden(`Password for ${role}: `);
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`Refused: ${problem}.`);
    process.exit(1);
  }
  if ((await askHidden("Again: ")) !== password) {
    console.error("Refused: the two entries differ.");
    process.exit(1);
  }
  console.log("\nRun this in the Supabase SQL Editor (it carries the verifier, not the password):\n");
  console.log(alterRole(role, scramVerifier(password)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
