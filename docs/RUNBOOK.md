# Trackwise — Operations

The app runs on Vercel (deploys from `main`); the database is PostgreSQL 16 on the team VPS. This file is for whoever is on duty.

## Weekly (10 minutes)

1. Open the latest Production deployment in Vercel and the `Trackwise quality checks` run in GitHub Actions: both green.
2. Sign in to production, open Home as a leader, open one task, add a progress update, check the notification arrives. Use a real account; there are no test personas in production.
3. Check the backup directory on the VPS has last night's dump (below).
4. Skim Vercel's function logs for `"level":"error"` lines (every log line is JSON from `lib/log.ts`).

## Environment

Set in the Vercel project (Settings → Environment Variables). The full list with explanations is in `README.md` and `.env.example`. Rotate `AUTH_SECRET` only with a planned sign-out of everyone (database sessions survive, but Auth.js cookies are re-signed). Never set `TEST_MODE_SECRET` in production; a production build answers 404 on `/api/test-login` regardless.

## Database

- Schema is `db/schema.ts`, applied with `npm run db:push` from a developer machine whose `.env.local` points at production. Once real data exists, changes are additive (new nullable columns, new tables). Push the schema **before** pushing code that needs it.
- Connections: each warm Vercel function holds a pool of up to 5 connections (`db/index.ts`). If `too many connections` ever appears, install pgbouncer on the VPS in transaction mode and point `DATABASE_URL` at it.
- Access: Postgres must accept remote connections from Vercel (`listen_addresses`, `pg_hba.conf` with `scram-sha-256`, firewall on 5432). Prefer TLS (`?sslmode=require`).

### Backups

On the VPS, as the postgres user, a nightly cron:

```cron
15 3 * * * pg_dump -Fc trackwise > /var/backups/trackwise/trackwise-$(date +\%F).dump && find /var/backups/trackwise -name '*.dump' -mtime +21 -delete
```

Sync `/var/backups/trackwise` off the box (rclone to object storage or Drive). Restore test once a quarter on a disposable database: `createdb trackwise_restore && pg_restore -d trackwise_restore trackwise-YYYY-MM-DD.dump`, sign in against it locally, then drop it.

## Incidents

| Symptom | First checks | Then |
| --- | --- | --- |
| Deployment fails | Vercel build log; the GitHub Actions run on the same commit | Fix forward on `main`; never change the database to make a build pass |
| "Something went wrong" toasts | Vercel function logs for `action.failed` | The `error` field names the cause; most are database connectivity |
| Everyone signed out | `AUTH_SECRET` or `AUTH_URL` changed | Restore the previous values |
| Tasks "missing" | The active workspace (switcher), the Show closed toggle, filters in the URL | Nothing is deleted by the app except whole workspaces by an admin |
| Sign-in email not arriving | SMTP variables, provider's sending limits, spam folder | Vercel logs show `mail.sent` / `mail.skipped` per message |
| Google sign-in error | The OAuth client's authorised redirect URI must be `https://<domain>/api/auth/callback/google` | `AUTH_URL` must match the domain users visit |
| Unauthorised access suspected | Settings → Workspace → change the member's role or remove them | Rotate `AUTH_SECRET`; review `task_activity` and `request_decisions` for what changed |

## Roles

`admin` (everything + members/settings) · `leader` (manage projects/goals, assign and edit any task, approve, decide requests) · `member` (own tasks, progress on any task, requests) · `stakeholder` (own requests only). Enforced in `lib/permissions.ts`; the UI only hides what a role cannot use.

## Before any release

`npm run typecheck && npm run lint && npm run test:unit && npm run build`, then `npm run test:walk` against a dev server with seeded personas, then screenshots of Home (leader) and a task at phone and desktop size. A release is a push to `main`.
