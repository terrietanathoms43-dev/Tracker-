# Trackwise — Build Plan (decisions are locked)

> **Status (2026-10-17):** full rebuild of Trackwise from the Supabase prototype onto the Apex stack. The old code is in git history at `eac1fa7` and is not referenced by anything here. Steps A–D below are the scope of the rebuild; walkthroughs `01`–`05` and the vitest suites are the regression net.
>
> Deviations from this plan are recorded here, dated, with the reason.
>
> **Decision log (2026-10-17, during the rebuild):**
> - Hosting went to Vercel for an afternoon and came back to the VPS under pm2 on port 3015 (§0). The database is now **Neon** (pooled `DATABASE_URL` for the app, `DATABASE_URL_DIRECT` for `db:push`); the data layer stayed plain Drizzle over `pg`. **Better Auth** replaced Auth.js (§1): sessions in our own tables, Google plus the magic-link plugin, the dev-only persona sign-in mints Better Auth's signed cookie.
> - Leaders may invite leaders, members and stakeholders; only admins may invite admins (`canInvite` in `lib/permissions.ts`). An admin or the inviting leader may resend, renew or revoke an invitation. Because only the token's hash is stored, "Copy new link" renews a link without sending email.
> - Removing a member or leaving a workspace unassigns that person's open tasks (activity `assigned` with a note), so no open task stays with someone who can no longer see it.
> - Stakeholders can read the workspace's member list under Settings → Workspace (read-only). §3 said "nothing else"; knowing who decides is useful and harmless.
> - A rejected task notifies its assignee with kind `approval_decided` ("Rejected: …"): the flow needs the notice and no `rejected` kind exists.
> - Evidence links may be removed by anyone who may edit the task, or by whoever added the link.
> - Goals and projects are never deleted (paused / archived instead) and keep no who/when history beyond `updated_at` and a log line: a planning activity table was not in the schema and is left for later.
> - Request decisions appear in the Team and Home activity feeds (`teamFeed` in `lib/dal/team.ts`), since §8 lists "request decided" as important.
> - Report tiles "Blocked now" and "Overdue now" count today's state, not the range. CSV exports start with a UTF-8 BOM and neutralise formula-leading cells.
> - The board has no drag-and-drop (§5); status changes go through the card menu.

This file is the hand-off for anyone building Trackwise. Read `docs/BRIEF.md` for intent; this file says *how*. Follow the `apex-architecture`, `apex-ui` and `apex-ux` skills for everything not spelled out here. If something is genuinely impossible, say so in the report rather than silently choosing differently.

Owner context: the owner's own dev team and their manager. One workspace in practice, multi-tenant in design. Fresh database; nothing is migrated from Supabase.

## 0. Ground rules

- Next.js **16.4.1** (same as Clarity); read `node_modules/next/dist/docs/` before using an API. `cacheComponents` and `partialPrefetching` on.
- Strict TypeScript. `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` pass at the end of every step.
- Dependencies stay minimal and match Clarity's versions. **No** react-hook-form, Redis, queues, cron workers, drag-and-drop libraries, file storage SDKs.
- Schema with `drizzle-kit push` (`npm run db:push`), no migrations folder.
- Dev server `npm run dev` → port **3015** (`BETTER_AUTH_URL=http://localhost:3015`). Never read or print `.env*` values; scripts load them with `dotenv`.
- Prod: the team VPS, pm2 via `ecosystem.config.js` on port **3015**, `deploy.sh` run by the owner. The database is Postgres reached through `DATABASE_URL` (the VPS's own, or a managed Neon database; `DATABASE_URL_DIRECT` for `db:push` when the main URL is pooled). Email over SMTP (nodemailer). Never deploy, push or run `db:push` against production unless asked.
- Phone **and** desktop: every screenshot check runs at 390×844 and 1280×900, light and dark.

## 1. Stack (exact)

| Concern | Choice |
| --- | --- |
| Auth | `better-auth` 1.7 with its Drizzle adapter: database sessions in our tables, Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, button hidden until set) and the magic-link plugin sending through `lib/mail` (SMTP from `SMTP_HOST`, `SMTP_PORT`, `EMAIL`, `EMAIL_PASS`). `BETTER_AUTH_URL` + `BETTER_AUTH_SECRET`. |
| DB | `drizzle-orm` 0.45, `drizzle-kit` 0.31, `pg`. `DATABASE_URL` → Postgres 16, database `trackwise`. |
| UI | Tailwind v4 via `@tailwindcss/turbopack`, shadcn/ui (new-york, neutral, CSS variables), `radix-ui`, `lucide-react`, `sonner`, `next-themes`, `cmdk`. |
| Validation | `zod` v4 on the server in every action. |
| Dates | `Intl` + `lib/time.ts`; workspace timezone default `America/Jamaica`, per-user override. |
| Scripts | `tsx`, `dotenv`; `vitest` unit tests; headless-Chrome walkthroughs. |

Fonts: Geist Sans + Geist Mono.

## 2. Routes and navigation

```
/                          landing (static) → /home when signed in
/login                     magic link + Google
/login/check-email
/invite/[token]            accept a workspace invitation
/onboarding                create workspace → invite (skippable) → done
(app) group, authenticated, shell:
  /home                    role-aware: member next steps · leader team health · stakeholder requests
  /my-work                 Needs attention · Continue working · Waiting on others · Recently finished
  /tasks                   list (filters in URL) · ?view=board shows status columns
  /tasks/[id]              Resume card → details → comments & history
  /projects                active projects with counts; archived behind a toggle
  /projects/[id]           project header + its tasks grouped by status
  /goals                   goals with progress (completed / total)
  /goals/[id]              goal header + projects and tasks under it
  /team                    members, workload, attention list, important activity (leaders + admins; members read-only)
  /requests                list (stakeholders see their own) + New request
  /requests/[id]           request detail, decisions, linked task's Resume card
  /reports                 range → summary, delivered with evidence, outstanding, contributions, goals; print + CSV
  /reports/export          route handler: CSV
  /notifications
  /settings                profile: name, timezone, email preferences
  /settings/workspace      name, timezone, members, invitations, delete workspace (admin)
/api/auth/[...nextauth]
/api/test-login            dev-only persona sign-in (§9)
```

Navigation: **Home · My Work · Tasks · Goals · Team · Requests** (sidebar, desktop). Phone bottom tabs: Home · My Work · Tasks · Goals · More (Team, Requests, Reports, Settings, Workspace, Sign out). Projects is reached from the Tasks page header (a secondary tab row: *List · Board · Projects*) and from goals. Reports is reached from Team and from the account menu. Stakeholders see Home · Requests only. Settings/Workspace live in the account menu.

## 3. Tenancy, roles, visibility

- Active workspace = cookie `trackwise.org` (orgId), validated against `organization_members` on every request; fallback to the oldest membership, cookie rewritten. Switcher = server action + redirect to `/home`.
- Who may have an account: `ALLOWED_EMAIL_DOMAINS` (e.g. `intellibus.com`) limits sign-in and invitations to those domains, enforced in `lib/auth.ts` hooks (magic link request, user creation) and in `actions/invitations.ts`; test personas are exempt outside production. Unset means anyone.
- Org role `organization_members.role`: `admin | leader | member | stakeholder`. No team tables.
- Rules (`lib/permissions.ts`, used by every DAL query and action):
  - **admin**: everything in the workspace, plus settings, members, invitations, delete.
  - **leader**: read everything; create/edit/archive projects and goals; create/edit/assign any task; approve or send back; reject; decide requests; see Team and Reports.
  - **member**: read all tasks, projects, goals and requests; create tasks; edit a task they created or are assigned to; update progress and comment on any task; hand over; submit requests. Team page read-only (no attention actions beyond their own tasks). Reports visible.
  - **stakeholder**: read only their own requests and the tasks converted from them; submit requests. Nothing else; nav shows Home and Requests.
- `Viewer = { userId, orgId, orgRole, timezone }`. Every DAL function takes it and filters by `orgId` in SQL; lookups by id also check `orgId`.

## 4. Schema

IDs are `text` UUIDs, timestamps `timestamptz` server-generated, enums as `pgEnum` from `lib/constants.ts`.

```
users / sessions / accounts / verifications   Better Auth core shape (name, email, email_verified bool, image; session token + expires_at; provider accounts; pending tokens); users also carry timezone
organizations         id, name, slug (unique), timezone, created_by, created_at
organization_members  org_id, user_id, role, joined_at, invited_by                        PK(org_id, user_id)
invitations           id, org_id, email (lower), role, token_hash (unique sha256), invited_by, expires_at (7d), accepted_at?, created_at
goals                 id, org_id, title, description?, owner_id, target_date?, success_criteria?, status (active|achieved|paused), created_by, created_at, updated_at
projects              id, org_id, goal_id?, name, description?, owner_id?, status (active|completed|archived), target_date?, created_by, created_at, updated_at
requests              id, org_id, title, description?, desired_outcome?, urgency (low|normal|high|critical), link?, requester_id, status (new|approved|deferred|rejected|converted), decided_at?, decided_by?, decision_reason?, defer_until?, converted_task_id?, created_at, updated_at
request_decisions     id, request_id, decider_id, decision (approved|deferred|rejected|converted|reopened), reason?, created_at   (append-only)
tasks                 id, org_id, project_id?, goal_id?, request_id?, title, description?, assignee_id?, created_by, approver_id?, priority (low|normal|high|urgent), status (not_started|in_progress|awaiting_approval|blocked|rejected|completed), due_date?, started_at?, completed_at?, blocked_reason?, blocked_by?, rejection_reason?, latest_progress?, next_action?, completion_summary?, sort_rank (double, default 0), created_at, updated_at
task_updates          id, task_id, author_id, kind (progress|comment), body, next_action?, blocker?, created_at   (append-only)
task_links            id, task_id, url, label?, added_by, created_at
task_activity         id, org_id, task_id, actor_id, kind (created|edited|status_changed|assigned|handed_over|due_changed|priority_changed|blocked|unblocked|approval_requested|approved|sent_back|rejected|completed|reopened|progress_updated|commented|link_added|link_removed), before jsonb?, after jsonb?, note?, created_at   (append-only)
notifications         id, user_id, org_id, kind, title, body?, href, read_at?, created_at
notification_preferences  user_id PK, email_assignment, email_approval, email_handover, email_blocked, email_request_decision, email_comment (bools)
```

Indexes: `tasks(org_id, status)`, `tasks(org_id, assignee_id, status)`, `tasks(org_id, project_id)`, `tasks(org_id, goal_id)`, `tasks(org_id, due_date)`, `tasks(request_id)`, `task_updates(task_id, created_at desc)`, `task_activity(task_id, created_at desc)`, `task_activity(org_id, created_at desc)`, `requests(org_id, status)`, `requests(org_id, requester_id)`, `projects(org_id, status)`, `goals(org_id, status)`, `invitations(org_id)`, `organization_members(user_id)`, `notifications(user_id, read_at)`.

## 5. Task behaviour (the heart of the product)

- **Create**: title required; assignee defaults to self; project optional (defaults to the one you came from); everything else optional. One dialog (`N` anywhere) and a `/tasks/[id]` page.
- **Update progress** (signature; on the task page, in the row menu, from ⌘K): *Latest progress* (required), *Next action* (required unless completing), optional *I'm blocked* (reason required, who/what unblocks optional), *Evidence link*, *Hand over to*, *Mark as* (in progress / awaiting approval / completed). One transaction: `task_updates` row, denormalised `latest_progress`/`next_action` on the task, `task_activity` rows, notices.
- **Comment**: a `task_updates` row with `kind=comment`; activity `commented`; notifies the assignee (and the creator if different) when the author is someone else.
- **Transitions** via `lib/tasks/transitions.ts` (pure `planTransition`), same rules as Clarity: blocked needs a reason; awaiting approval needs an approver (defaults to a leader: the task's approver, else the first leader/admin who is not the assignee); approve → completed (`approved` + `completed`), send back → in progress (`sent_back`); completed sets `completed_at`, reopen clears it (`reopened`); rejected needs a reason; first in-progress sets `started_at`.
- **Who may do what**: approve/send back = the approver or any leader/admin; reject = edit rights; the rest = progress rights (any member on a task in the workspace).
- **Resume card** first on the task page: next action (large), latest progress, blocker strip, evidence chips, last update by/when, inline Update progress form. Then details (project, goal, assignee, due, priority, created by, request), then comments + history merged newest first, 20 at a time.
- **Lists**: dense rows (status icon · title · next action · reason · due · priority · assignee) with hover "⋯" (Update progress · Change status · Copy link) and long-press sheet. Filters in the URL: `q`, `status`, `assignee` (me/none/id), `priority`, `project`, `goal`, `due` (overdue/week/none), `closed`, `sort` (smart/due/priority/updated/created). Closed hidden by default.
- **Board** (`/tasks?view=board`): five columns (Not started · In progress · Awaiting approval · Blocked · Completed in the last 14 days), compact cards (title, assignee, due, priority), the same filters, card menu changes status. No drag-and-drop in this phase.
- **My Work grouping**: *Needs attention* = overdue, due within 2 days, blocked, awaiting my approval, sent back; *Continue working* = my not_started/in_progress ordered overdue → due soonest → priority → sort_rank → updated; *Waiting on others* = my awaiting_approval + blocked; *Recently finished* = my completed in the last 14 days.

## 6. Projects and goals

- Project: name required; description, owner, goal, target date optional; status `active | completed | archived`. Project page: header (owner, goal, target, counts), *New task* defaulting to this project, tasks grouped by status, archived shows a banner.
- Goal: title required; description, owner (defaults to creator), target date, success criteria; status `active | achieved | paused`. Goal page: header with progress (completed / total tasks counting tasks linked directly and through its projects), projects list, tasks list, *New task* defaulting to this goal.
- Create/edit are dialogs for leaders and admins; members see read-only pages with the task actions they are allowed.

## 7. Requests

- New request (anyone in the workspace): title, description, desired outcome / business reason, urgency, optional link. Stakeholders' nav leads here.
- Decisions (leaders, admins) inline on the list and the detail page: **Approve** (optional "create the task now" with assignee / priority / due), **Defer** (optional revisit date), **Reject** (reason required), **Convert to task** (when approved). Each decision = `request_decisions` row + request fields, one transaction; the requester is notified with the reason; a converted request links to its task and the task back to it.
- Requesters see status, reason, decider and the linked task's Resume card read-only.

## 8. Home, Team, Reports, notifications

- **Home**: greeting + workspace; a banner when requests await my decision (leaders); *Pick up where you left off* (My Work's first five); leaders also get count tiles (active · completed 30d · overdue · blocked · awaiting approval), *Needs attention*, *Goals* progress strip, *Recent decisions and activity*; stakeholders get *Your requests*.
- **Team**: count tiles; *Needs attention*; *Workload* per member (active tasks with titles on hover, blocked and overdue counts, unassigned row); *Goals* progress; *Recent important activity* (completed, blocked/unblocked, approved, sent back, rejected, due changed, request decided; not edits or progress). Range 7 / 30 / 90 days in the URL.
- **Reports**: `?from&to` (default last 30 days) → summary tiles, *Delivered* (completed tasks with evidence and assignee), *Open commitments* (open with due in range), *Blocked and overdue*, *Contributions per member* (completed, progress updates, blockers raised; counts only), *Goals* (progress). Print styles; `/reports/export?from&to&table=delivered|open|contributions` returns CSV.
- **Notifications**: kinds `assigned | handover | approval_requested | approval_decided | blocked | request_decided | commented`; in-app rows now, emails after the response per preferences (`lib/notify.ts`). `/notifications` lists them and marks read; the bell shows unread.

## 9. Design system

Follow `apex-ui`. Brand slots (Trackwise keeps its colours):

| Slot | Light | Dark |
| --- | --- | --- |
| `primary` | `oklch(0.43 0.14 262)` (royal blue #234a9e) | `oklch(0.72 0.14 262)` |
| `primary-foreground` | `oklch(0.99 0 0)` | `oklch(0.16 0.02 262)` |
| `ring` / `link` | `oklch(0.55 0.17 262)` / `oklch(0.45 0.15 262)` | `oklch(0.72 0.15 262)` / `oklch(0.78 0.12 262)` |
| `selection` | `oklch(0.55 0.17 262 / 0.18)` | `oklch(0.72 0.15 262 / 0.3)` |
| `sidebar-accent` | `oklch(0.95 0.025 262)` | `oklch(0.26 0.04 262)` |
| `highlight` / `highlight-foreground` | `oklch(0.84 0.11 82)` gold / `oklch(0.32 0.08 70)` | `oklch(0.82 0.12 82)` / `oklch(0.2 0.05 70)` |

Gold appears only as: the goal progress fill, the active-tab underline on the Tasks sub-tabs, the logo mark's dot, and the "highlight" badge for *Needs attention* counts. Everything else is the standard's neutrals and status colours. Nav icons: Home `House`, My Work `ListChecks`, Tasks `SquareCheckBig`, Goals `Target`, Team `Users`, Requests `Inbox`, Projects `FolderKanban`, Reports `BarChart3`, Settings `Settings`, Workspace `Building2`.

## 10. Test personas and the AI dev loop

Domain `@trackwise.test`. Workspace **"Trackwise Demo"** (slug `trackwise-demo`, timezone America/Jamaica); a second workspace **"Other Co"** (slug `other-co`) for isolation checks.

| `as=` | Who | Role |
| --- | --- | --- |
| `admin` | Avery Admin `avery@trackwise.test` | admin |
| `leader` | Morgan Lead `morgan@trackwise.test` | leader |
| `member` | Jordan Dev `jordan@trackwise.test` | member |
| `member2` | Sam Dev `sam@trackwise.test` | member |
| `stakeholder` | Taylor Ops `taylor@trackwise.test` | stakeholder |
| `other` | Riley Other `riley@trackwise.test` | admin of Other Co (+ Casey Other, member) |

Seed (relative to now): 3 goals, 3 projects (one per goal, one completed), ~24 tasks across every status with 1–4 updates each, evidence links, two overdue, two awaiting Morgan's approval, three blocked with reasons, six completed in the last two weeks, a few comments; 6 requests across every state (two from Taylor, one converted). Scripts: `test:seed | test:status | test:tidy | test:clean`; `scripts/test-browser.mjs`; walkthroughs `01-sign-in`, `02-pages`, `03-task-flow`, `04-requests`, `05-roles`; vitest for `lib/permissions`, `lib/tasks/*`, `lib/time`, `lib/mail`, and `lib/dal/isolation.test.ts` behind `TRACKWISE_DB_TESTS=1`. `.claude/settings.json` denies reading `.env*`.

## 11. Code layout

As `apex-architecture`: `app/` routes with `loading.tsx` per segment; `actions/{auth,org,invitations,members,profile,tasks,projects,goals,requests,notifications}.ts`; `components/{ui,shell,tasks,projects,goals,requests,team,reports,settings,onboarding,notifications}/` plus shared pieces; `db/schema.ts`; `lib/{auth,viewer,permissions,guards,action-result,toast-result,constants,time,log,notify,org-cookie,invite-token,safe-path,test-mode}.ts`, `lib/dal/*`, `lib/tasks/*`, `lib/mail/*`, `lib/reports/*`; `scripts/`; `docs/`.

## 12. Steps

- **A — Foundation**: deps and configs; constants, schema, `db:push`; auth + login + magic link; viewer, permissions, action-result, guards; test mode + `test-login` + seed + browser script; tokens + shell + theme; landing, onboarding, invitations, settings (profile, workspace members/invitations). Ends with `01-sign-in` green.
- **B — Tasks**: list + filters + board, create dialog + `N` + ⌘K, detail with Resume card, Update progress, transitions, comments, history, My Work. Ends with `03-task-flow` green and screenshots of My Work and a task at both sizes and themes.
- **C — Structure and decisions**: projects, goals, Team, Home, requests with decisions, `02-pages`, `04-requests`, `05-roles`, permission and isolation tests.
- **D — Value and polish**: reports + CSV + print, notifications + preferences + emails, keyboard shortcuts, AGENTS.md, README, RUNBOOK.

Each step ends with `typecheck`, `lint`, `build`, `test:unit` exit 0; the relevant walkthrough green; screenshots reviewed at both sizes and themes.

## Risks

| Risk | Mitigation |
| --- | --- |
| Next 16 APIs differ from training data | read `node_modules/next/dist/docs/` first; copy patterns from Clarity |
| Remote database latency | pool timeouts, keepalive, fail fast |
| Cross-workspace leakage | `isolation.test.ts` against two seeded workspaces |
| Google OAuth redirect for the new origin | documented in README; Google button hidden until configured |
| A managed database (Neon) behind a pooler | `DATABASE_URL` pooled for the app, `DATABASE_URL_DIRECT` for `drizzle-kit push`; TLS on both |
