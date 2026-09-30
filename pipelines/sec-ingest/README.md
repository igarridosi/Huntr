# sec-ingest

Nightly SEC EDGAR ingest for Huntr. It reads EDGAR's daily index, fetches
`companyfacts` for the companies that filed a reviewed form (10-K, 10-Q,
20-F, 40-F and their amendments), and keeps the 42 XBRL concepts the app
reads, for periods ending in the last three years.

The rules for choosing a figure live in `src/lib/sec/` at the repo root,
shared with the app, so the app and the pipeline read the filings the same
way.

**Status:** dry run only. The pipeline writes to a local folder. The
Postgres and Blob Storage writers, the Azure Function and the infrastructure
come in later PRs. They need migration 012
(`supabase/migrations/012_sec_ingest_pending.sql`), which is not applied yet.

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
   - **More than 5 days owed** (`PENDING_GIVE_UP_DAYS`):
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
for more than 5 days, 5 or more failures (and at least 10% of the
companies) in one run, or a cursor more than 4 days old. `2` means the run
could not complete, for example because EDGAR refused it, a listed index is
missing, or the configuration or arguments were wrong.

## Tests

The tests run with the repo's suite: `npm test` from the root.
