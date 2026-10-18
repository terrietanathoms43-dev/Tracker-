# Trackwise

A small team's tracker for tasks and goals: who owns what, where it stopped, what happens next.

- **Intent**: `docs/BRIEF.md` · **Decisions (locked)**: `docs/PLAN.md` · **How to build on it**: `AGENTS.md` · **Operations**: `docs/RUNBOOK.md`
- **Stack**: Next.js 16 (App Router, React Server Components, server actions) · PostgreSQL + Drizzle ORM over `pg` · Better Auth (Google + email magic link) · Tailwind v4 + shadcn/ui · Zod · Nodemailer · pm2 on the team VPS
- **Conventions**: the Apex skills (`apex-architecture`, `apex-ui`, `apex-ux`, `apex-planning`, `apex-recursive-walkthrough`), shared with the Clarity project.

## Run it locally

```bash
cp .env.example .env.local      # fill in DATABASE_URL and BETTER_AUTH_SECRET; SMTP and Google are optional in development
npm install
npm run db:push                 # applies db/schema.ts to the database in DATABASE_URL (DATABASE_URL_DIRECT if set)
npm run dev                     # http://localhost:3015
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

The unit tests are deliberately few: permissions, task status transitions, request decisions, the My Work grouping, CSV safety, and an opt-in cross-workspace isolation test. Flows are proven by the walkthroughs.

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
```

Every workspace-scoped query carries `org_id`; permissions are pure functions; status changes go through one pure `planTransition`; history tables are append-only. Read `AGENTS.md` for the rest.

## Deploying (VPS + pm2)

```bash
# once, on the server
npm i -g pm2
git clone <repo> && cd Tracker-
cp .env.example .env.local      # production values: BETTER_AUTH_URL=https://<domain>, BETTER_AUTH_SECRET, DATABASE_URL, SMTP, Google
npm ci && npm run build
pm2 start ecosystem.config.js && pm2 save

# every release
./deploy.sh                     # pull → npm ci → build → pm2 startOrRestart
```

Set `ALLOWED_EMAIL_DOMAINS=intellibus.com` to allow only company addresses to sign in or be invited. The app listens on port 3015 behind your reverse proxy. Apply schema changes before the code that needs them: `npm run db:push` with the production `DATABASE_URL` (or `DATABASE_URL_DIRECT` for a pooled Neon database). Never set `TEST_MODE_SECRET` on the server. Backups and incident steps are in `docs/RUNBOOK.md`.

### Using Neon instead of the VPS's Postgres

Nothing in the code changes. Put Neon's pooled connection string in `DATABASE_URL` and its direct one in `DATABASE_URL_DIRECT`, run `npm run db:push`, then `npm run test:seed` for a development copy. A "claimable" Neon database must be claimed to a Neon account before its expiry or it is deleted with everything in it.
