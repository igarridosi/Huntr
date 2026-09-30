# sec-ingest

Nightly SEC EDGAR ingest for Huntr. It reads EDGAR's daily index, fetches
`companyfacts` for the companies that filed a reviewed form (10-K, 10-Q,
20-F, 40-F and their amendments), and keeps the 42 XBRL concepts the app
reads, for periods ending in the last three years.

The rules for choosing a figure live in `src/lib/sec/` at the repo root,
shared with the app, so the app and the pipeline read the filings the same
way.

**Status:** the dry run and the Postgres and Blob Storage writers exist
and are tested locally (see below). The Azure Function and the
infrastructure come in later PRs. Migrations 011 and 012 are applied in
production.

## Try it

```bash
cd pipelines/sec-ingest
npm install
npm run dry-run -- --tickers AAPL,GOOG,GOOGL,V,HLN
```

It writes to `./out`:

| Path | What the real run would write it to |
|---|---|
| `state.json` | `sec_ingest_cursor` and `sec_ingest_state` |
| `facts/{cik}.json` | the rows of `sec_company_facts` for that company |
| `raw/sec/companyfacts/{cik}/{accession}.json.gz` | Blob Storage |

The log is one JSON object per line. The last line, `run.summary`, has the totals.

**Things to try**

- Run the same command twice. The second run is incremental: no new day
  has been published, so nothing is fetched and nothing changes.
- Set `cursor.lastIndexDate` in `out/state.json` back a few days, then
  run again. The pipeline reads those daily indexes and fetches only the
  companies that filed on those days.
- Pass `--tickers-file tickers.txt` (one ticker per line) and
  `--max-companies 20` to try a larger universe without loading all of it.
  A run cut short this way does not move the cursor.
- `--today YYYY-MM-DD` changes the day the run treats as today. By default
  it is today in New York, where EDGAR's days begin and end.

## The real run, locally

The Postgres and Blob writers are tested against containers, never
against Supabase or Azure (`local/docker-compose.yml`):

- **Two separate Postgres 15 stacks**, each with a small Supabase shim (the
  API roles and `tickers` as migration 002 created it) followed by
  migrations 011 and 012:
  - `postgres` and `pooler` (ports 54329 and 64329) are for manual runs.
  - `postgres-test` and `pooler-test` (ports 54339 and 64339) are for the
    integration tests, which truncate their tables freely. **The tests never
    touch what a manual run left behind.**
- **PgBouncer in transaction mode** in front of each Postgres, standing in
  for Supavisor. The pipeline connects through it as `huntr_sec_ingest`,
  with one connection and `prepare: false`, as it will in production.
- **Azurite**, the Azure Storage emulator. Runs write to the `sec-raw`
  container and tests to `sec-raw-test`.

The only password involved is a throwaway local one for the role, in
`local/db/90-local-password.sql`.

Everything runs from npm in `pipelines/sec-ingest`, the same on Windows,
macOS and Linux (`local/local.mjs`, no shell syntax). It needs Docker
running.

| Script | What it does |
|---|---|
| `npm run local:up` | Starts the containers and waits until they are ready. |
| `npm run local:run` | Makes a real run: EDGAR is real; Postgres and Blob are the local ones. It seeds AAPL, GOOG, GOOGL, V and HLN, builds, runs, then prints the result. Arguments after `--` go to the CLI. |
| `npm run local:status` | Shows the cursor, the rows and size of `sec_company_facts`, the state per company, and the blobs. |
| `npm run test:local` | Runs the integration tests against the test stack. |
| `npm run local:reset` | Deletes the data of every container and starts them again, which reapplies the migrations. |
| `npm run local:down` | Stops the containers and deletes their data. |

**A clean run from scratch:**

```bash
npm install
npm run local:reset
npm run local:run
npm run local:run
```

- The first `local:run` is a full load: 4 companies (GOOG and GOOGL are one
  CIK), 864 rows in `sec_company_facts` (about 208 kB), 4 blobs, and the
  cursor on the last day EDGAR published.
- The second is incremental: it fetches nothing and changes nothing.

The row count moves as the companies file. 864 is the figure as of
2026-09-30.

In CI the integration tests are skipped, because there are no containers:
they only run with `SEC_INGEST_LOCAL=1`, which `test:local` sets.

**In production** the same variables point at the Supabase pooler and the
storage account:

- `SEC_INGEST_DATABASE_URL` is the pooler URL in transaction mode, port
  6543, user `huntr_sec_ingest.<project-ref>`.
- `SEC_RAW_BLOB_ACCOUNT_URL` is the storage account URL. The managed
  identity signs the requests, so there is no key anywhere.
- TLS is verified. If the pooler's certificate does not chain to a public
  CA, pass Supabase's CA as a PEM in `SEC_INGEST_DATABASE_CA`.

## In Azure Functions

`src/azure.ts` registers a single timer function, `sec_ingest`. It builds
the run exactly as the CLI does (`src/config.ts`) and runs the same ingest
(`src/function.ts`).

- **Schedule:** the app setting `SEC_INGEST_SCHEDULE` (NCRONTAB, UTC).
  `useMonitor` makes up a missed run once.
- **Switching it off:** set `AzureWebJobs.sec_ingest.Disabled = true`, no
  deploy needed.
- **Running it now:** *Actions → SEC ingest (run once) → Run workflow*. It
  waits for approval in `productionAzure`, then calls the admin API with the
  master key. The key is read through OIDC and masked, so it never appears in
  the logs. A 202 means the run was accepted; its outcome is in Application
  Insights. The portal's *Test/Run* also works, because CORS allows
  `https://portal.azure.com`.
- **`SEC_INGEST_MODE=blob-only`** is the first stage in the cloud:
  - raw payloads go to Blob Storage with the managed identity;
  - state and facts go to the instance's temporary disk, and Postgres is not
    touched;
  - the universe is `SEC_INGEST_TICKERS`.
- **`SEC_INGEST_MODE=real`:** Postgres and Blob.
- **Failing on purpose:** a run that raises an alert, or cannot run, throws.
  The invocation fails, and that is what the Azure Monitor alert watches.
- **No retries:** neither `host.json` nor the function defines a retry
  policy, so a failed invocation is not run again against EDGAR or
  Postgres. The next night's run, and the per-company retries, do that
  work. A test checks that the registration carries no retry options.

`npm run package:azure` builds `deploy/`, the folder the deploy workflow
zips: `dist/azure.mjs`, `host.json` and a `package.json` pointing at the
entry point. There is no `node_modules`. Everything is in the bundle except
`@azure/functions-core`, which the Functions worker provides at run time.

## Setting the role's password without sending it

The Supabase SQL Editor keeps a history, so the password should not be
typed there. This prints the `ALTER ROLE` statement with the SCRAM-SHA-256
verifier only:

```bash
npm run password:verifier
```

It asks for the password twice with echo off. Postgres stores a verifier in
that format as it is, and never sees the password.

If you have `psql` connected as the project's admin, `\password
huntr_sec_ingest` does the same thing client-side.

Use a long random password from a password manager. The tool refuses
anything under 16 characters, and anything outside printable ASCII, which
SASLprep would rewrite on login.

## How a run works

1. **Universe.** The tickers are resolved to CIKs with EDGAR's
   `company_tickers.json` and deduplicated: GOOG and GOOGL are one download.
2. **Days.** The quarter's `daily-index/{YYYY}/QTR{n}/index.json` lists the
   days that have an index.
   - A day not listed but earlier than the last listed day had no filings
     (a weekend or a holiday).
   - A day later than the last listed one may not be published yet, so the
     cursor waits for it.
   - EDGAR answers a missing index with **403 and an XML AccessDenied
     body**, not 404. A refused request (no User-Agent, too fast) is a 403
     with an HTML page: that one stops the run.
3. **First run** (no cursor). Every company is loaded in full.
4. **Later runs.** The pipeline fetches three kinds of company: those with
   a new reviewed filing in the indexes since the cursor, any company new
   to the universe, and any company that still owes something.
   - A daily index listed for its quarter that EDGAR does not serve is an
     error, not a quiet day: the run stops and the cursor stays.
   - **What a company owes is kept on the company, not on the run.** In
     `sec_ingest_state` the pipeline records the filing (`pending_accession`),
     the date it started being owed (`pending_since`) and the attempts so far
     (`pending_attempts`), and retries every night. There are two cases: the
     index has a filing that `companyfacts` does not carry yet, or the
     download failed. The cursor moves on either way, so one filing that
     never gets XBRL does not stop every other company from updating.
   - **Owed for 5 days** (`PENDING_GIVE_UP_DAYS`). The first run at least 5
     calendar days after `pending_since` flags the company: owed from a
     Monday and tried every night, that is the sixth attempt, on Saturday.
     - A filing that never reached `companyfacts` is given up on: the
       company is marked with `last_error` and the run raises the alarm.
     - A download that keeps failing is still retried every night, and the
       alarm stays on until it succeeds.
5. **Writes** are upserts by natural key (see
   `supabase/migrations/011_sec_company_facts.sql`), so running a night
   twice changes nothing. Rows whose period ended outside the window are
   pruned.

**Requests.** At most 8 per second, under the SEC's limit of 10. 429 and
5xx responses are retried after 1, 2 and 4 seconds. Every request declares
a User-Agent. In the dry run it comes from `SEC_USER_AGENT` or falls back to
the shared default (`src/lib/sec/user-agent.ts`), with a warning in the log.
Outside the dry run `SEC_USER_AGENT` is required: without it the pipeline
exits with code 2 before sending any request. The `universe` log line says
which User-Agent the run used.

**Exit codes.** `0` means a clean run. `1` means an alert: a company owing
for 5 days or more, 5 or more failures (and at least 10% of the
companies) in one run, or a cursor more than 4 days old. `2` means the run
could not complete, for example because EDGAR refused it, a listed index is
missing, or the configuration or arguments were wrong.

## Tests

The tests run with the repo's suite: `npm test` from the root.
