# Carrier search index

An always-available name search for **active** carriers, stored in a separate
free Neon project so search does not depend on DOT's throttled census feed.

- Project: `carrier-index` (Neon, `aws-us-east-2`)
- Table: `carrier_index` — ~15 list-view fields for ~2.25 M active carriers
- Search: Postgres full-text (word/prefix matching) — typically < 100 ms warm
- Detail fields (email, owner, cargo, full addresses) are fetched per carrier by
  `GET /api/carrier?dot=…` when a result card is expanded

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
npm run sync:carrier-index -- --limit 5000   # small test run (skips deletion)
```

The sync is resumable and incremental: it upserts only changed rows and removes
carriers that are no longer active using a temp-table anti-join. Socrata
throttles in long windows, so the script waits up to 3 minutes between retries.

## Storage

The free project is capped at 1 GB. A full active-carrier sync is expected to use
roughly 600–750 MB. If the script reports more than 850 MB, either drop
`dba_name` from the indexed expression or move this project to Neon Launch
(`$0.35/GB-month`).

## Weekly refresh

`.github/workflows/sync-carrier-index.yml` runs every Sunday at 03:00 UTC (and on
demand). Add these repository secrets before enabling it:

- `CARRIER_INDEX_DATABASE_URL_UNPOOLED`
- `DOT_APP_TOKEN`

## Rolling back

Unset `SEARCH_INDEX_ENABLED` (or set it to `false`) and redeploy. Name searches
fall back to the live census + SAFER path automatically; a failing index query
already falls through to that path at runtime.
