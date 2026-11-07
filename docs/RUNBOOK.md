# Trackwise — Operations

The app runs on the team VPS under pm2, behind the reverse proxy, as two checkouts of this repository: **production** from `main` on port 3015 (pm2 app `tracker`) and **staging** from `staging` on port 3016 (`tracker-staging`; the Staging section below). Each has its own `.env.local` and its own database: PostgreSQL 16, either the VPS's own or a managed Neon database. This file is for whoever is on duty.

## Weekly (10 minutes)

1. `pm2 status` shows `tracker` and `tracker-staging` online with sane restart counts; the `Trackwise quality checks` run in GitHub Actions on the latest `main` is green.
2. Sign in to production, open Home as a leader, open one task, add a progress update, check the notification arrives. Use a real account; there are no test personas in production.
3. Check the backup directory has last night's dump (below).
4. `pm2 logs tracker --lines 200 | grep '"level":"error"'` (every log line is JSON from `lib/log.ts`).

## Environment

`.env.local` on the server, never in git. The full list with explanations is in `.env.example`. `ANTHROPIC_API_KEY` is optional: with it, "From a meeting" (`/capture`) sends pasted transcripts to the model and each draft costs money (one request per draft, six per person per ten minutes; `grep capture.drafted` in the logs shows the token counts); without it the page says it is not switched on. Rotate `BETTER_AUTH_SECRET` only with a planned sign-out of everyone. Never set `TEST_MODE_SECRET` in production; a production build answers 404 on `/api/test-login` regardless.

## Releases

`./deploy.sh` = `git pull --ff-only` → `npm ci` → `npm run build` → `pm2 startOrRestart` → `pm2 save`, for whichever branch its checkout is on: `main` restarts `tracker` from `ecosystem.config.js`, `staging` restarts `tracker-staging` from `ecosystem.staging.config.js`, anything else is refused. Since 2026-11-04 GitHub Actions runs it for every push to `main` or `staging` that passes the quality checks (the `deploy` job in `.github/workflows/quality.yml`, over SSH): the job runs in the GitHub environment named after the branch, `production` or `staging`, and reads that environment's `VPS_APP_DIR` secret (the checkout's directory); `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and `VPS_HOST_KEY` are repository secrets both environments share unless one overrides them. A push that fails the checks is not deployed; a pull request only runs the checks. Push the schema **before** the code that needs it: `npm run db:push` from a machine whose `.env.local` holds the production `DATABASE_URL` (`DATABASE_URL_DIRECT` for Neon). Once real data exists, schema changes are additive only.

**The 2026-11-03 release** (projects → goals → tasks, proposals) is the one exception: on a database still in the old shape run, in this order, `npm run db:backup` (every table to `backups/<stamp>/`), `npm run db:migrate-hierarchy` (one transaction, idempotent; prints every goal it moved) and then `npm run db:push`. The database this repo's `.env.local` pointed at was migrated on 2026-11-03; a database that already shows "Nothing to do" from the migration script needs only `db:push`.

**The 2026-11-07 release** (Deferred and Cancelled statuses, goals achieved by their tasks) needs, per environment and in this order, `npm run db:push` (two `task_status` values and two `task_activity_kind` values, additive) and then `npm run db:remove-closers` (deletes the old "Everything completed" rows; `--dry-run` first prints the counts per workspace). Done on the staging database on 2026-11-07; production gets both at release, before the code is deployed. Until then production cannot hold a deferred or cancelled task.

## Staging

Staging is the `staging` branch running as a second copy of the app on the same VPS, on its own database, so a change is used by a person before it reaches production. Work reaches production this way: a `feature/<name>` branch off `staging` → a reviewed pull request into `staging` (squash-merged; the push deploys staging) → the author and the owner try it on staging → a release pull request `staging` → `main` (merged with a merge commit, never squashed, so the two branches don't drift; the push deploys production). A hotfix branches off `main`, merges into `main` by pull request, and `main` is then merged back into `staging` so the next release keeps the fix. Both branches are protected: changes arrive only by pull request with the quality checks green.

Setting it up once, on the VPS as the app user (`<repo>` is the remote the production checkout pulls from: `git -C <production dir> remote get-url origin`):

1. `git clone -b staging <repo> tracker-staging` next to the production directory, then `cd tracker-staging`.
2. `.env.local`: copy production's and change what must differ. `BETTER_AUTH_URL` is the staging address (`https://staging.<domain>`); `DATABASE_URL` and `DATABASE_URL_DIRECT` point at the staging database (on Neon, a branch of the production database made in the Neon console: staging starts with production-shaped data and can be reset from it at any time); add `https://staging.<domain>/api/auth/callback/google` to the Google OAuth client's authorised redirect URIs. Leave `TEST_MODE_SECRET` out: staging is a production build, so `/api/test-login` answers 404 and the walkthrough personas do not exist there; people sign in with their real accounts, by Google or magic link.
3. `npm ci && npm run db:push && npm run build`, then `pm2 start ecosystem.staging.config.js && pm2 save`. The app listens on 3016.
4. Reverse proxy: a server block for `staging.<domain>` (DNS record first) proxying to `127.0.0.1:3016`, with a certificate like production's.
5. GitHub: Settings → Environments → create `staging` with the secret `VPS_APP_DIR` = this directory's absolute path, and `production` with `VPS_APP_DIR` = the production directory (an environment's secret wins over the repository secret of the same name; `production` may also require a reviewer before its deploy runs). Settings → Branches: protect `main` and `staging` (a pull request with one approving review, the `Trackwise quality checks` check required, the branch up to date before merging).

From then on a merge into `staging` deploys itself. A schema change is applied to staging with `npm run db:push` **in the staging directory** (its `.env.local` names the staging database) before the pull request is tried there, and to production the same way in the production directory right before the release pull request merges.

## Database

- Schema is `db/schema.ts`; no migrations folder.
- Connections: one pm2 process with a pool of 10 (`db/index.ts`). On Neon, use the pooled URL in the app and keep the pool small; `too many connections` means the pooler's limit, not Postgres's.
- Access: the VPS's Postgres must accept the app's connection (local socket or `pg_hba.conf`); Neon needs `?sslmode=require`.

### Dev, staging and production

Three databases, one per environment, never shared and never pointed at from another environment's `.env.local`:

| Environment | Code | Database | Who writes to it |
| --- | --- | --- | --- |
| Production | `main`, the VPS production checkout | the production database, named only in that checkout's `.env.local` | real people; `db:push` right before a release merges |
| Staging | `staging`, the VPS staging checkout | its own database, named only in that checkout's `.env.local` | people trying a release; `db:push` when a pull request is tried there |
| Dev | a feature branch on a developer's machine | that developer's own database (`DATABASE_URL` in their `.env.local`); the `.test` personas live only here | the developer, the walkthroughs, `db:push` while building |

**Schema moves with the code, downstream to upstream:** `npm run db:push` against dev while a change is built, against staging (in the staging directory) when its pull request is tried there, against production (in the production directory) right before the release pull request merges. Once a database holds real data a change is additive only, and production gets a dump first (below).

**Data moves the other way only, production → staging → dev**, with `npm run db:copy` (`scripts/db-copy.ts`): `pg_dump` of the source's `public` schema into `backups/` and `pg_restore` into the target in one transaction, then a row count of every table compared. A name is a URL in `.env.local`: `--from=prod` reads `PROD_DATABASE_URL`, `--to=dev` reads `DEV_DATABASE_URL`, `local` is `DATABASE_URL` itself (the `_DIRECT` variant wins when set; Neon's pooler cannot serve a dump). A target that already has tables needs `--replace`; production is refused as a target, whatever it is called. The tools come from PATH, `PG_BIN`, or pgAdmin's runtime folder (it ships `pg_dump` and `pg_restore`); their major version must be at least the source server's. So:

- Refresh your dev database from production: `npm run db:copy -- --from=prod --to=local --replace`, then `npm run test:seed` to put the personas back.
- Reset staging before a release is tried: `npm run db:copy -- --from=prod --to=staging --replace` from a machine whose `.env.local` has both URLs (on Neon, a staging *branch* of production can instead be reset from its parent in the console in one click).
- A restorable backup of production: `npm run db:copy -- --from=prod --dump-only` (`db:backup` writes the same tables as JSON, for reading by hand).

A copy brings sessions along, so people signed in to production are also signed in to the copy while the two share `BETTER_AUTH_SECRET`. What differs per environment besides the database: `BETTER_AUTH_URL` (and the matching Google redirect URI), `TEST_MODE_SECRET` (dev only), SMTP and `ANTHROPIC_API_KEY` as wanted.

### Backups

VPS Postgres, nightly cron as the postgres user:

```cron
15 3 * * * pg_dump -Fc trackwise > /var/backups/trackwise/trackwise-$(date +\%F).dump && find /var/backups/trackwise -name '*.dump' -mtime +21 -delete
```

Sync the directory off the box (rclone to object storage or Drive). Neon keeps point-in-time history on paid plans; on the free tier run the same `pg_dump` against the direct URL (or `npm run db:copy -- --from=prod --dump-only` from any machine with the client tools). Restore test once a quarter on a disposable database: `npm run db:copy -- --from=prod --to=<that database>` is exactly that test.

## Incidents

| Symptom | First checks | Then |
| --- | --- | --- |
| Site down | `pm2 status`, `pm2 logs tracker`, the reverse proxy's upstream | `pm2 restart tracker`; if it hot-loops, a bad `.env.local` or a failed build |
| Deploy fails | the output of `deploy.sh`; the GitHub Actions run on the same commit | Fix forward on `main`; never change the database to make a build pass |
| "Something went wrong" toasts | logs for `action.failed` | The `error` field names the cause; most are database connectivity |
| Everyone signed out | `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL` changed | Restore the previous values |
| Tasks "missing" | The active workspace (switcher), the Show closed toggle, filters in the URL | Nothing is deleted by the app except whole workspaces by an admin |
| Sign-in email not arriving | SMTP variables, provider's sending limits, spam folder | Logs show `mail.sent` / `mail.skipped` per message |
| Google sign-in error | The OAuth client's authorised redirect URI must be `https://<domain>/api/auth/callback/google` | `BETTER_AUTH_URL` must match the domain users visit |
| Unauthorised access suspected | Settings → Workspace → change the member's role or remove them | Rotate `BETTER_AUTH_SECRET`; review `task_activity` and `request_decisions` for what changed |

## Roles

`admin` (everything + members/settings) · `leader` (manage projects/goals, assign and edit any task, approve, decide requests) · `member` (own tasks, progress on any task, requests) · `stakeholder` (own requests only). Enforced in `lib/permissions.ts`; the UI only hides what a role cannot use.

## Before any release

`npm run typecheck && npm run lint && npm run test:unit && npm run build`, then `npm run test:walk` against a dev server with seeded personas, then the change tried on staging by a person. A release is the release pull request `staging` → `main` merging; GitHub Actions then runs `./deploy.sh` in the production checkout (or run it there yourself).
