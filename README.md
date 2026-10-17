# Trackwise

A small team's tracker for tasks and goals: who owns what, where it stopped, what happens next.

- **Intent**: `docs/BRIEF.md` · **Decisions (locked)**: `docs/PLAN.md` · **How to build on it**: `AGENTS.md` · **Operations**: `docs/RUNBOOK.md`
- **Stack**: Next.js 16 (App Router, React Server Components, server actions) · PostgreSQL + Drizzle ORM · Auth.js (Google + email magic link) · Tailwind v4 + shadcn/ui · Zod · Nodemailer
- **Conventions**: the Apex skills (`apex-architecture`, `apex-ui`, `apex-ux`, `apex-planning`), shared with the Clarity project.

## Run it locally

```bash
cp .env.example .env.local      # fill in DATABASE_URL, AUTH_SECRET; SMTP and Google are optional in development
npm install
npm run db:push                 # applies db/schema.ts to the database in DATABASE_URL
npm run dev                     # http://localhost:3020
```

Without SMTP settings, sign-in links and every other email are printed to the dev server log instead of being sent, so you can sign in by copying the link from the terminal. Without Google credentials the Google button is hidden.

### Test personas (development only)

```bash
npm run test:seed               # six .test personas, two workspaces, realistic tasks/goals/requests
node scripts/test-browser.mjs leader /home --width=1280 --height=900   # screenshot, signed in as Morgan
npm run test:walk               # every walkthrough script, then tidy
```

Set `TEST_MODE_SECRET` (16+ characters) in `.env.local` first. The roster and rules are in `AGENTS.md` and `docs/TEST-ACCOUNTS.md`.

### Checks

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

## How the code is organised

```
app/            routes; (app)/layout.tsx is the shell, every segment has a loading.tsx skeleton
actions/        server actions, one file per feature; each: zod → requireViewer → permission → transaction → ActionResult
components/     ui/ (shadcn primitives), shell/, then one folder per feature; shared pieces at the top level
db/             schema.ts (the whole database) and index.ts (the pool)
lib/            viewer.ts (who is asking), permissions.ts (who may do what), dal/ (queries, all scoped by workspace),
                tasks/ (pure domain logic with tests), mail/, notify.ts, time.ts, constants.ts
scripts/        seed and test tooling (test-accounts.ts, test-browser.mjs, test-walkthrough/)
docs/           BRIEF.md, PLAN.md, RUNBOOK.md, TEST-ACCOUNTS.md (generated)
legacy/         the previous Supabase prototype, kept only until the team deletes it
```

Every workspace-scoped query carries `org_id`; permissions are pure functions; status changes go through one pure `planTransition`; history tables are append-only. Read `AGENTS.md` for the rest.

## Deploying (Vercel + Postgres on the VPS)

The app deploys to Vercel from `main`. **A push to `main` is a deploy**, so the environment must be ready first.

1. Create the production database once on the VPS: `createdb trackwise` (any name; it goes in the URL). Make sure Postgres accepts connections from Vercel's IPs (or everywhere, with a strong password and SSL) in `postgresql.conf` / `pg_hba.conf`.
2. In the Vercel project → Settings → Environment Variables, add for **Production**:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `postgres://USER:PASSWORD@HOST:5432/trackwise` (add `?sslmode=require` when the server has TLS) |
   | `AUTH_SECRET` | a fresh random value (`openssl rand -base64 32`), different from any other app |
   | `AUTH_URL` | `https://<your production domain>` |
   | `AUTH_TRUST_HOST` | `true` |
   | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | the Google OAuth client; add `https://<domain>/api/auth/callback/google` to its authorised redirect URIs |
   | `SMTP_HOST`, `SMTP_PORT`, `EMAIL`, `EMAIL_PASS`, `EMAIL_FROM` | the SMTP account that sends sign-in links, invitations and notifications |

   Do **not** set `TEST_MODE_SECRET` in production. For Preview deployments set everything except `AUTH_URL` (previews use their own origin; Google sign-in is production-only, magic links work everywhere).
3. Apply the schema from your machine with the production URL in `.env.local`: `npm run db:push`.
4. Push `main`. Vercel builds with `next build`; the GitHub Actions workflow runs typecheck, lint, unit tests and a build on every push and pull request.

Backups: a nightly `pg_dump` on the VPS, described in `docs/RUNBOOK.md`.
