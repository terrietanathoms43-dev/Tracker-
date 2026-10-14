# Trackwise — Team Leadership & Accountability

A team-leader-first work management application built around six principles: clear task ownership, honest statuses, actionable handovers, fair performance benchmarks, organizational goal alignment, and transparent request decisions.

## Technology
Next.js App Router, TypeScript, Supabase Auth/Postgres with RLS, Tailwind CSS, Vercel.

## Product capabilities
- Organizations and teams; a user may lead one team and join another.
- Projects, organizational goals, tasks, owners, dates and task dependencies.
- Statuses: not_started, underway, awaiting_approval, blocked, rejected, completed.
- Progress updates with next actions, blocker reasons, and handover notes.
- Request inbox: submitted, approved, deferred, rejected; approved requests may become tasks.
- Auditable activity history.
- Fair, agreed performance benchmarks; never rank people by raw task counts alone.

## Security
Every organization-scoped record must be protected by PostgreSQL row-level security. Client input cannot determine permission. Service-role keys must never appear in browser code.

## Deployment
The Supabase schema and organization-onboarding migration have been applied to the Trackwise database. Configure the two public Supabase environment variables in Vercel. Verify the build, authentication, access policies, and end-to-end workflows before a production launch.


## Repository
The active Trackwise repository is `terrietanathoms43-dev/Tracker-`. The previous `Tracker` repository is retained as an archive of earlier work.

## Database
Uses the existing Supabase project `lyxozmoqkljaflofupcs`. Switching GitHub repositories does **not** require creating or replacing database tables. Apply only migrations not yet present in the project.
