// The local test bed from npm, the same on Windows, macOS and Linux: no
// shell syntax, no environment variables set on the command line. Every
// command talks to the containers in local/docker-compose.yml only.
//
//   node local/local.mjs up        start the containers and wait until they are ready
//   node local/local.mjs down      stop them and delete their data
//   node local/local.mjs reset     down, then up: a clean slate
//   node local/local.mjs test      the integration tests, against the test database
//   node local/local.mjs run [...] a real run against the manual-run database and Azurite
//   node local/local.mjs status    what the manual-run database holds

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pipeline = path.resolve(here, "..");
const repo = path.resolve(pipeline, "../..");
const compose = path.join(here, "docker-compose.yml");

/** The manual-run stack. The tests use their own (see postgres.local.test.ts). */
const RUN = {
  adminUrl: "postgres://postgres:postgres@localhost:54329/postgres",
  pipelineUrl: "postgres://huntr_sec_ingest:local-only-not-a-secret@localhost:64329/postgres",
  blob: "UseDevelopmentStorage=true",
  container: "sec-raw",
  tickers: ["AAPL", "GOOG", "GOOGL", "V", "HLN"],
};

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const docker = (...args) => sh("docker", ["compose", "-f", compose, ...args]);

async function seed() {
  const { default: postgres } = await import("postgres");
  const admin = postgres(RUN.adminUrl, { onnotice: () => {} });
  try {
    for (const symbol of RUN.tickers) await admin`insert into public.tickers (symbol) values (${symbol}) on conflict do nothing`;
  } finally {
    await admin.end({ timeout: 5 });
  }
  const { BlobServiceClient } = await import("@azure/storage-blob");
  await BlobServiceClient.fromConnectionString(RUN.blob).getContainerClient(RUN.container).createIfNotExists();
}

async function status() {
  const { default: postgres } = await import("postgres");
  const admin = postgres(RUN.adminUrl, { onnotice: () => {} });
  try {
    const [cursor] = await admin`select last_index_date::text as cursor from public.sec_ingest_cursor`;
    const [facts] = await admin`select count(*)::int as rows, pg_size_pretty(pg_total_relation_size('public.sec_company_facts')) as size from public.sec_company_facts`;
    const companies = await admin`select cik, ticker, facts_stored, last_accession, pending_since::text from public.sec_ingest_state order by cik`;
    console.log(`cursor: ${cursor?.cursor ?? "none"}   sec_company_facts: ${facts.rows} rows, ${facts.size}`);
    console.table(companies);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const container = BlobServiceClient.fromConnectionString(RUN.blob).getContainerClient(RUN.container);
  if (await container.exists()) for await (const b of container.listBlobsFlat()) console.log(`blob ${b.name} ${b.properties.contentLength} bytes`);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "up":
    docker("up", "-d", "--wait");
    break;
  case "down":
    docker("down", "-v");
    break;
  case "reset":
    docker("down", "-v");
    docker("up", "-d", "--wait");
    break;
  case "test": {
    const vitest = path.join(repo, "node_modules", "vitest", "vitest.mjs");
    sh(process.execPath, [vitest, "run", "pipelines/sec-ingest", ...rest], { cwd: repo, env: { ...process.env, SEC_INGEST_LOCAL: "1" } });
    break;
  }
  case "run": {
    await seed();
    sh(process.execPath, [path.join(pipeline, "build.mjs")], { cwd: pipeline });
    const cli = path.join(pipeline, "dist", "cli.mjs");
    if (!existsSync(cli)) throw new Error("the build did not produce dist/cli.mjs");
    const env = {
      ...process.env,
      SEC_USER_AGENT: process.env.SEC_USER_AGENT || "Huntr huntrvalue.me contact@huntrvalue.me",
      SEC_INGEST_DATABASE_URL: RUN.pipelineUrl,
      SEC_INGEST_DATABASE_TLS: "disable",
      SEC_RAW_BLOB_CONNECTION_STRING: RUN.blob,
      SEC_RAW_BLOB_CONTAINER: RUN.container,
    };
    const result = spawnSync(process.execPath, [cli, ...rest], { cwd: pipeline, env, stdio: "inherit" });
    await status();
    process.exit(result.status ?? 1);
  }
  case "status":
    await status();
    break;
  default:
    console.error("usage: node local/local.mjs up | down | reset | test | run [cli args] | status");
    process.exit(2);
}
