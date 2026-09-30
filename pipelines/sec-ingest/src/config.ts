/**
 * Where a run writes, from the environment: shared by the CLI and the Azure
 * Function so the two cannot drift apart.
 *
 *   store "disk"      state and facts in a folder; Postgres is not touched
 *   store "postgres"  state and facts in Postgres, as huntr_sec_ingest
 *   raw "disk"        raw payloads in the same folder
 *   raw "blob"        raw payloads in Blob Storage
 *
 * Environment:
 *   SEC_USER_AGENT                   required unless the run is disk-only
 *   SEC_INGEST_DATABASE_URL          the pooler URL, as huntr_sec_ingest (store "postgres")
 *   SEC_INGEST_DATABASE_CA           PEM of the CA to verify the database's certificate (optional)
 *   SEC_INGEST_DATABASE_TLS=disable  local test bed only
 *   SEC_RAW_BLOB_ACCOUNT_URL         https://<account>.blob.core.windows.net, with the managed identity
 *   SEC_RAW_BLOB_CONNECTION_STRING   instead of the URL: Azurite ("UseDevelopmentStorage=true")
 *   SEC_RAW_BLOB_CONTAINER           default "sec-raw"
 *   AZURE_CLIENT_ID                  in Azure: the user-assigned identity DefaultAzureCredential uses
 */

import { SEC_DEFAULT_USER_AGENT } from "../../../src/lib/sec/user-agent";
import { blobRaw, containerFor, type BlobTarget } from "./blob";
import { diskFacts, diskRaw, diskState } from "./disk";
import type { IngestDeps } from "./ingest";
import type { Logger } from "./log";
import { activeTickers, connect, postgresFacts, postgresState, type Db } from "./postgres";
import { createSecClient } from "./sec-client";
import type { RawStore } from "./stores";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface RunTarget {
  store: "disk" | "postgres";
  raw: "disk" | "blob";
  /** The folder for everything written to disk. */
  out: string;
  /** Explicit universe; when empty and the store is Postgres, the active rows of `tickers`. */
  tickers: string[];
}

export interface RunSetup {
  deps: IngestDeps;
  tickers: string[];
  userAgent: string;
  /** Releases the database connection, if one was opened. */
  close(): Promise<void>;
}

export function parseTickers(list: string | undefined): string[] {
  return (list ?? "")
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function blobTarget(env: NodeJS.ProcessEnv): BlobTarget {
  const container = env.SEC_RAW_BLOB_CONTAINER?.trim() || "sec-raw";
  const connectionString = env.SEC_RAW_BLOB_CONNECTION_STRING?.trim();
  const accountUrl = env.SEC_RAW_BLOB_ACCOUNT_URL?.trim();
  if (connectionString) return { connectionString, container };
  if (accountUrl) return { accountUrl, container };
  throw new ConfigError("raw payloads to Blob need SEC_RAW_BLOB_ACCOUNT_URL (Azure) or SEC_RAW_BLOB_CONNECTION_STRING (Azurite)");
}

export async function setupRun(target: RunTarget, env: NodeJS.ProcessEnv, log: Logger): Promise<RunSetup> {
  // A run that reaches anything beyond this machine must say who it is: the
  // SEC writes to that address before it blocks, and a default nobody chose
  // would hide a lost setting.
  const declared = env.SEC_USER_AGENT?.trim() || null;
  const diskOnly = target.store === "disk" && target.raw === "disk";
  if (!declared && !diskOnly) throw new ConfigError('SEC_USER_AGENT is required unless the run is disk-only, e.g. "Huntr huntrvalue.me contact@huntrvalue.me"');
  if (!declared) log("warn", "config", { note: "SEC_USER_AGENT is not set; the disk-only run declares the default", userAgent: SEC_DEFAULT_USER_AGENT });
  const userAgent = declared ?? SEC_DEFAULT_USER_AGENT;

  const raw: RawStore = target.raw === "blob" ? blobRaw(containerFor(blobTarget(env))) : diskRaw(target.out);

  let db: Db | null = null;
  let deps: IngestDeps;
  const client = createSecClient({ userAgent });
  if (target.store === "disk") {
    deps = { client, state: diskState(target.out), facts: diskFacts(target.out), raw, log };
  } else {
    const url = env.SEC_INGEST_DATABASE_URL?.trim();
    if (!url) throw new ConfigError("SEC_INGEST_DATABASE_URL is required to write to Postgres (the pooler URL, as huntr_sec_ingest)");
    const tls = env.SEC_INGEST_DATABASE_TLS === "disable" ? "disable" : { ca: env.SEC_INGEST_DATABASE_CA?.trim() || undefined };
    db = connect({ url, tls });
    deps = { client, state: postgresState(db), facts: postgresFacts(db), raw, log };
  }

  const close = async () => {
    if (db) await db.end({ timeout: 5 });
  };
  try {
    let tickers = target.tickers;
    if (tickers.length === 0 && db) tickers = await activeTickers(db);
    if (tickers.length === 0) throw new ConfigError(db ? "no active tickers in the database" : "no tickers: pass them explicitly for a run without Postgres");
    log("info", "config", { store: target.store, raw: target.raw, tickers: tickers.length });
    return { deps, tickers, userAgent, close };
  } catch (error) {
    await close();
    throw error;
  }
}
