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
- **`SEC_INGEST_MODE=real`** (the default in the infrastructure): Postgres
  and Blob, with the universe taken from the active rows of `tickers`.
  - The database URL is a Key Vault reference to a pinned secret version,
    and the deploy checks that it resolves to that version (see "Rotating
    the database URL").
  - TLS to Supabase's pooler is verified against Supabase's own root CA
    (`infra/sec-ingest/certs/`), which is not in the public trust stores.
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

## Deploying

`.github/workflows/sec-ingest-deploy.yml` runs on a push to `main` that
changes the infrastructure, the pipeline's code or `src/lib/sec/`. Markdown,
tests and the local test bed do not trigger it. It has three jobs, each in
its own GitHub environment with its own identity, all through OIDC with no
secret anywhere. Every environment deploys from `main` only.

| Job | Environment | Approval | Identity and roles | Runs when |
|---|---|---|---|---|
| `plan` | `productionAzurePlan` | none | `huntr-sec-ingest-plan`: Reader on `rg-huntr-sec-ingest`, Storage Blob Data Reader on the `tfstate` container | always |
| `apply` | `productionAzure` | required | `huntr-sec-ingest-deploy`: Contributor on the resource group, and Role Based Access Control Administrator limited by a condition to three data roles for service principals | the plan has infrastructure changes, or a destroy |
| `publish` | `productionAzurePublish` | none | `huntr-sec-ingest-publish`: Website Contributor on the function app only | the plan has no changes: code alone |

- **The plan cannot write.** Reader and Storage Blob Data Reader allow no
  write in Azure or to the state, and no action that returns keys or setting
  values. It cannot take the state's lease either, so it plans with
  `-lock=false`. Runs are serialised by the workflow's concurrency group,
  and the apply plans again with the lock. It applies only if that plan is
  identical to the one shown.
- **Settings outside Terraform.** Terraform owns the whole list of app
  settings, but its plan does not see one added in the portal. Before
  publishing, `infra/sec-ingest/scripts/check-app.sh settings` compares the
  live names with the plan's, and any difference stops the deploy. The
  apply runs the same check before it applies, unless that apply replaces
  the list itself. Along with it, the job checks that host storage uses the
  identity only and that the database URL's Key Vault reference resolves.
- **Accepted risk.** Code reaches production without an approval when the
  infrastructure does not change, and Website Contributor could also change
  the function app's settings. Two things mitigate it:
  - `main` is protected by a ruleset: a pull request is required (with no
    reviews, since this is a one-person project), the check
    `lint · typecheck · test · build` must pass, force pushes and deletion
    are blocked, and nobody can bypass it.
  - The settings check fails the deploy if the live settings differ from
    Terraform's.

  The `terraform` CI check is deliberately not required. It only runs on
  pull requests that touch `infra/`, and requiring it would block every
  other one. Infrastructure changes still need an approval at the apply.

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

## Rotating the database URL

The function reads `SEC_INGEST_DATABASE_URL` as a Key Vault reference to
**one pinned version** of the secret `sec-ingest-database-url`. The version
is in `infra/sec-ingest/database-url.auto.tfvars`; it is an identifier, not
a secret.

It is pinned because of what happened on 2026-10-01. A reference without a
version is served from the platform's cache, and after a rotation the
function kept reading the old version: `configreferences` said `Resolved`,
and the run failed with "Invalid URL". Restarting did not help. Pinned, a
rotation is a change to the setting, which makes the platform read the
secret again, and it goes through review and the apply's approval.

Do it away from the nightly run (06:00 UTC). Never paste the URL or the
password into a chat, an issue, a commit or a command line.

1. **New password**, if it changes. Generate one in a password manager and
   set it with `npm run password:verifier` (see above). From then on the
   old URL fails, so finish steps 2 and 3 before the next run.
2. **New secret version.** In the portal: Key Vault `kv-huntr-sec-e329` →
   Secrets → `sec-ingest-database-url` → New Version, and paste the URL,
   with the password percent-encoded. Do not use
   `az keyvault secret set --value`: the value would stay in the shell's
   history and in the command's output. Then read the new version's id;
   this prints no value:

   ```bash
   az keyvault secret list-versions --vault-name kv-huntr-sec-e329 --name sec-ingest-database-url --query "[].{id:id, enabled:attributes.enabled, created:attributes.created}" -o table
   ```

3. **Pin it.** Open a pull request that changes `database_url_secret_version`
   in `database-url.auto.tfvars` to the new id's last part, 32 hex
   characters. After the merge:
   - The plan shows the function app updated, with
     "Database URL secret version: old -> new".
   - The apply waits for approval.
   - After the apply, `check-app.sh keyvault` checks that the reference is
     `Resolved` to that version.
4. **Check that it connects.** Run *SEC ingest (run once)* and look at
   `run.summary` in Application Insights. If the URL is malformed, the
   error names the part that is wrong (scheme, user, password, host, port
   or database), never the value.
5. **Disable the older versions**, only now. Until then they are the way
   back: a pull request to the previous version. Disable them in the portal
   (the version → Enabled: No), or:

   ```bash
   az keyvault secret set-attributes --vault-name kv-huntr-sec-e329 --name sec-ingest-database-url --version <old-version> --enabled false -o none
   ```

**Checking it without the value.** Neither command prints the URL:

```bash
az rest --method get --url "https://management.azure.com/subscriptions/<subscription-id>/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Web/sites/func-huntr-sec-ingest-e329/config/configreferences/appsettings/SEC_INGEST_DATABASE_URL?api-version=2024-04-01" --query "{status: properties.status, version: properties.secretVersion}"
az keyvault secret list-versions --vault-name kv-huntr-sec-e329 --name sec-ingest-database-url --query "[].{id:id, enabled:attributes.enabled}" -o table
```

The first must say `Resolved` and the pinned version. The second must show
that version as the only one enabled. `az keyvault secret show` without
`--query` prints the value: do not use it.

## How a run works

1. **Universe.** The tickers are resolved to CIKs with EDGAR's
   `company_tickers.json` and deduplicated: GOOG and GOOGL are one download.
   A share class written with a dot or a slash (BRK.B, BRK/B) is looked up
   under EDGAR's hyphen (BRK-B). A company is named, in the logs and in
   `sec_ingest_state.ticker`, by the ticker EDGAR lists first for its CIK,
   which is its main listing: CMCSA, not the CCZ notes. The name changes
   the next time the company is fetched. What does not resolve is listed in
   `run.summary` as `companies.unresolved`; see below.
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

## Tickers EDGAR does not resolve

The universe is the active rows of the app's `tickers` table, which is
seeded from exchange listings, not from EDGAR. Some of them have no
company in EDGAR, and that is expected: they are listed in `run.summary`
(`companies.unresolved`), skipped, and are not errors. The run of
2026-10-01 (918 active tickers) breaks down like this:

| | Tickers | Count |
|---|---|---|
| Loaded | one company per CIK | 891 companies |
| Same CIK as a loaded ticker: no extra download | ACGLO, BBDO, CMCSA, FOXA, FWONK, GOOGL, NWSA, SOJC, TBB, ZG | 10 |
| Not in `company_tickers.json` | see the table below | 17 |

Of the 891, one has no `companyfacts`: **IBN** (ICICI Bank, CIK 1103838),
a foreign issuer filing 20-F. EDGAR answers its `companyfacts` with a 404
(the latest 20-F, filed 2026-07-20, carries no XBRL). It counts in
`companies.withoutFacts`, is recorded without an error, and has no raw
payload: 890 payloads for 891 companies.

The 17 unresolved, checked against EDGAR on 2026-10-01:

| Cause | Tickers | Outcome |
|---|---|---|
| Share class written with a dot | BRK.B (EDGAR: BRK-B) | Resolved by the pipeline since this change |
| Ticker changed, same company and CIK | BK (now BNY), PSTG (now P, Everpure), SATS (now ECHO), EQR (now VMRK, Vivmark Residential) | Fix in the `tickers` table; until then, excluded |
| Deregistered (Form 15) in 2026 | AVB, BLD, CFLT, CTRA, EA, EXAS, HOLX, WBS | Expected exclusion: EDGAR no longer updates them |
| Foreign issuer delisted and deregistered (Forms 25 and 15F) in 2026 | AXIA (AXIA Energia; its ADRs now trade over the counter) | Expected exclusion |
| Delisted and deregistered in 2026 | CUK (Carnival plc, now Carnival UK Ltd.) | Expected exclusion: CCL, Carnival Corp Ltd., is loaded |
| Preferred share | FITBI (Fifth Third, Series I) | Expected exclusion: FITB is loaded |
| Foreign company that files no reports with the SEC | LRLCY (L'Oréal) | Expected exclusion |

Tickers in `tickers` that are not a common stock (ACGLO, SOJC, TBB,
FITBI), changed tickers and deregistered companies are a data question
for the app, not for this pipeline.

## Tests

The tests run with the repo's suite: `npm test` from the root.
