# Trackwise — Operations

The app runs on the team VPS under pm2 (port 3015, behind the reverse proxy); the database is PostgreSQL 16, either the VPS's own or a managed Neon database. This file is for whoever is on duty.

## Weekly (10 minutes)

1. `pm2 status` shows `tracker` online with a sane restart count; the `Trackwise quality checks` run in GitHub Actions on the latest `main` is green.
2. Sign in to production, open Home as a leader, open one task, add a progress update, check the notification arrives. Use a real account; there are no test personas in production.
3. Check the backup directory has last night's dump (below).
4. `pm2 logs tracker --lines 200 | grep '"level":"error"'` (every log line is JSON from `lib/log.ts`).

## Environment

`.env.local` on the server, never in git. The full list with explanations is in `.env.example`. Rotate `BETTER_AUTH_SECRET` only with a planned sign-out of everyone. Never set `TEST_MODE_SECRET` in production; a production build answers 404 on `/api/test-login` regardless.

## Releases

`./deploy.sh` = `git pull` → `npm ci` → `npm run build` → `pm2 startOrRestart` → `pm2 save`. Push the schema **before** the code that needs it: `npm run db:push` from a machine whose `.env.local` holds the production `DATABASE_URL` (`DATABASE_URL_DIRECT` for Neon). Once real data exists, schema changes are additive only.

## Database

- Schema is `db/schema.ts`; no migrations folder.
- Connections: one pm2 process with a pool of 10 (`db/index.ts`). On Neon, use the pooled URL in the app and keep the pool small; `too many connections` means the pooler's limit, not Postgres's.
- Access: the VPS's Postgres must accept the app's connection (local socket or `pg_hba.conf`); Neon needs `?sslmode=require`.

### Backups

VPS Postgres, nightly cron as the postgres user:

```cron
15 3 * * * pg_dump -Fc trackwise > /var/backups/trackwise/trackwise-$(date +\%F).dump && find /var/backups/trackwise -name '*.dump' -mtime +21 -delete
```

Sync the directory off the box (rclone to object storage or Drive). Neon keeps point-in-time history on paid plans; on the free tier run the same `pg_dump` against the direct URL. Restore test once a quarter on a disposable database.

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

`npm run typecheck && npm run lint && npm run test:unit && npm run build`, then `npm run test:walk` against a dev server with seeded personas. A release is `./deploy.sh` on the server.
