# Carrier search index

An always-available name search for **active** carriers, stored in a separate
free Neon project so search does not depend on DOT's throttled census feed.

- Project: `carrier-index` (Neon, `aws-us-east-2`)
- Table: `carrier_index` — ~15 list-view fields for ~2.25 M active carriers
- Search: Postgres full-text (word/prefix matching) — typically < 100 ms warm
- Email is stored on the index row and returned with results (masked for
  signed-out users); the remaining detail fields (owner, cargo, full addresses)
  are fetched per carrier by `GET /api/carrier?dot=…` when a result card is
  expanded

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `CARRIER_INDEX_DATABASE_URL` | Vercel + `.env.local` | Pooled connection used by the app |
| `CARRIER_INDEX_DATABASE_URL_UNPOOLED` | `.env.local`, GitHub Actions secret | Direct connection for schema + sync |
| `SEARCH_INDEX_ENABLED` | Vercel + `.env.local` | `true` routes name searches to the index |
| `DOT_APP_TOKEN` | Vercel, `.env.local`, GitHub Actions secret | Socrata app token |

Leave `SEARCH_INDEX_ENABLED` unset until the first sync has finished; searches
then keep using the live census and SAFER exactly as before.

## Commands

```bash
npm run apply:carrier-index-schema    # create/refresh tables and indexes
npm run sync:carrier-index            # full sync of active carriers (slow: 1-3 h)
npm run sync:carrier-index -- --delta-days 2   # only carriers added recently
npm run sync:carrier-index -- --limit 5000     # small test run (skips deletion)
npm run sync:carrier-index -- --offset 150000  # resume an interrupted full run
npm run backfill:carrier-email                 # fast email-only fill for existing rows
npm run backfill:carrier-email -- --offset 200000  # resume the email backfill
```

The sync is resumable and incremental: it upserts only changed rows and removes
carriers that are no longer active using a temp-table anti-join. Socrata
throttles in long windows, so the script waits up to 3 minutes between retries.

`backfill:carrier-email` is the fast repair path for the `email` column: it
fetches only `dot_number,email_address` for active carriers and runs a set-based
`UPDATE … FROM unnest(...)` against rows where `email IS NULL`, without
rewriting whole rows. The weekly full sync also fills email for new rows; use
the backfill after a long gap or when coverage needs to catch up quickly.

## Storage

The free project is capped at 1 GB. The current full active-carrier index uses
about **500 MB**. The `email` column adds roughly another 100 MB once fully
populated. If the project ever reports more than 850 MB, either drop `dba_name`
from the indexed expression or move it to Neon Launch (`$0.35/GB-month`).

## Automatic refresh

The FMCSA census file is fully rewritten **weekly (Wednesdays around 12:00 UTC)**,
while **new carriers are added daily** (~300–550 per weekday). The index therefore
uses two jobs:

| Workflow | Schedule (UTC) | Mode |
|---|---|---|
| `sync-carrier-index.yml` | Wednesdays **13:00** | Full refresh: insert/update/remove all active carriers |
| `sync-carrier-index-delta.yml` | **Daily 13:00** | `--delta-days 2`: new carriers only, no deletion |

Both share the `carrier-index-sync` concurrency group so they never overlap
(the full run deletes inactive carriers, which must not race a delta insert).

> **Where these run:** GitHub Actions on the upstream account is locked for
> billing, so the schedules currently execute from the public fork
> `rizwandigitaltribe-byte/carrier-snapshot`. See
> [run-sync-from-fork.md](./run-sync-from-fork.md) for secrets, manual runs,
> verification and troubleshooting. The workflow files here remain the source of
> truth; the fork must be synced (**Sync fork → Update branch**) after any
> workflow or sync-script change.

Add these repository secrets (Settings → Secrets and variables → Actions) before
the schedules do any work; until then the workflows log a warning and skip:

- `CARRIER_INDEX_DATABASE_URL_UNPOOLED`
- `DOT_APP_TOKEN`

Minutes used: the weekly full run is ~150 min/week, the daily delta ~1 min/day —
roughly 680 of the 2,000 monthly minutes on a private repo.

## Rolling back

Unset `SEARCH_INDEX_ENABLED` (or set it to `false`) and redeploy. Name searches
fall back to the live census + SAFER path automatically; a failing index query
already falls through to that path at runtime.
