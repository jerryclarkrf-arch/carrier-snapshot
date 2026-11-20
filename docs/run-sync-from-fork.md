# Running the index sync from a fork

GitHub Actions on the upstream repository (`jerryclarkrf-arch/carrier-snapshot`)
cannot start jobs — the account is locked for a billing issue. The workflows
themselves are fine, so they run from a fork with its own secrets:

- **Upstream (source of truth):** `jerryclarkrf-arch/carrier-snapshot`
- **Runner fork:** `rizwandigitaltribe-byte/carrier-snapshot` (public, `main`)

The fork executes the same `.github/workflows/sync-carrier-index*.yml` files
against the same Neon `carrier-index` project, so the app needs no changes.

_Last verified: 2026-11-20 — delta run
[`44787687427`](https://github.com/rizwandigitaltribe-byte/carrier-snapshot/actions/runs/44787687427)
green; `/api/health/index` reported `lastSync: 2026-11-20 17:54`._

## One-time setup (fork owner)

1. Fork the upstream repo (already done:
   `rizwandigitaltribe-byte/carrier-snapshot`).
2. In the fork: **Settings → Secrets and variables → Actions → New repository
   secret**, add both:
   - `CARRIER_INDEX_DATABASE_URL_UNPOOLED` — direct (unpooled) connection
     string for the `carrier-index` Neon project
   - `DOT_APP_TOKEN` — Socrata app token
3. Open the **Actions** tab. If GitHub says workflows are disabled for the fork,
   click **I understand my workflows, go ahead and enable them**. Scheduled
   workflows in forks are disabled until Actions is enabled.
4. **Actions → Sync new carriers (delta) → Run workflow.** A green run within a
   minute confirms the secrets and database access.

## Daily operation

Both schedules are UTC:

| Workflow | Schedule | What it does |
|---|---|---|
| `sync-carrier-index-delta.yml` | Daily **13:00** | `--delta-days 2`: new carriers only, no deletion |
| `sync-carrier-index.yml` | Wednesdays **13:00** | Full refresh: insert/update/remove active carriers |

Both use the `carrier-index-sync` concurrency group, so they never overlap.

### After changing the workflows or the sync script upstream

The fork does **not** update automatically. In the fork:

1. Click **Sync fork → Update branch** (fast-forwards `main` to upstream).
2. Re-run the workflow manually, or wait for the next schedule.

If the fork is behind, it keeps running the old workflow or script.

## Verifying a run

1. The run is green and the log ends with
   `Done: rows=… table=… database=… removed=…`.
2. `GET /api/health/index` shows a matching `lastSync`:
   ```json
   {"configured":true,"enabled":true,"rows":2247695,"size":"511 MB","lastSync":"2026-11-20 17:54"}
   ```
3. After a full run, `size` must stay below **850 MB** (the free Neon project is
   capped at 1 GB). The script prints a warning above 850 MB.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Fails at `npm install --no-save … pg` | Runner or npm registry problem. The job installs only `pg`; it does not need the full dependency tree. Re-run, then check npm status. |
| Log shows `::warning::Repository secrets … are not set`, run is green | Add both secrets in the fork (Settings → Secrets and variables → Actions). The job deliberately skips instead of failing. |
| Fails at `node scripts/sync-carrier-index.mjs` | Bad or expired DB URL, suspended Neon compute, or a Socrata 4xx. The exact error is in the step log. HTTP 429/5xx are retried with backoff (up to 12 attempts, capped at 3 min). |
| No scheduled run | Schedules only run on the fork's default branch and only after Actions is enabled. GitHub also disables schedules after 60 days without repository activity — open the Actions tab and re-enable the workflow. |
| "This branch is N commits behind" | The fork is running old code. Click **Sync fork → Update branch**. |
| Cannot download logs through the API | `/actions/runs/{id}/logs` requires admin on the repository. Use the run page in the browser. |

## Workflow install step

The workflows intentionally run:

```yaml
- run: npm install --no-save --no-audit --no-fund pg@^8.23.1
```

instead of `npm ci --omit=dev`. The sync script imports only `pg`; installing
the full Next.js/React/Tailwind tree made `npm ci` fail on the runner (run
`44770922986`, 2026-11-20) and is much slower. Do not revert this without
re-testing a run on the fork.

## When the upstream billing lock is lifted

1. Add both secrets to the **upstream** repository.
2. Disable the fork's workflows (**Actions → workflow → ⋯ → Disable workflow**)
   or delete the fork, so both repositories do not run duplicate full syncs.
3. The upstream workflows then take over unchanged. Delta runs are idempotent;
   duplicate runs are wasteful, not harmful.

## Notes

- The fork is public; the secrets are encrypted repository secrets and are never
  written to logs. The connection string grants schema ownership on the index
  project — keep it only in repository secrets.
- Standard GitHub-hosted runners are free for public repositories, so the fork
  does not consume the upstream account's minutes.
- The local repair/backfill path is unchanged: with `.env.local` present, run
  `npm run sync:carrier-index -- --offset N` to resume a full sync at a page
  boundary, or omit `--offset` to restart it.
