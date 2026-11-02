# Trackwise — Build Plan (decisions are locked)

> **Status (2026-10-17):** full rebuild of Trackwise from the Supabase prototype onto the Apex stack. The old code is in git history at `eac1fa7` and is not referenced by anything here. Steps A–D below are the scope of the rebuild; walkthroughs `01`–`05` and the vitest suites are the regression net.
>
> Deviations from this plan are recorded here, dated, with the reason.
>
> **Decision log (2026-10-17, during the rebuild):**
>
> - Hosting went to Vercel for an afternoon and came back to the VPS under pm2 on port 3015 (§0). The database is now **Neon** (pooled `DATABASE_URL` for the app, `DATABASE_URL_DIRECT` for `db:push`); the data layer stayed plain Drizzle over `pg`. **Better Auth** replaced Auth.js (§1): sessions in our own tables, Google plus the magic-link plugin, the dev-only persona sign-in mints Better Auth's signed cookie.
> - Leaders may invite leaders, members and stakeholders; only admins may invite admins (`canInvite` in `lib/permissions.ts`). An admin or the inviting leader may resend, renew or revoke an invitation. Because only the token's hash is stored, "Copy new link" renews a link without sending email.
> - Removing a member or leaving a workspace unassigns that person's open tasks (activity `assigned` with a note), so no open task stays with someone who can no longer see it.
> - Stakeholders can read the workspace's member list under Settings → Workspace (read-only). §3 said "nothing else"; knowing who decides is useful and harmless.
> - A rejected task notifies its assignee with kind `approval_decided` ("Rejected: …"): the flow needs the notice and no `rejected` kind exists.
> - Evidence links may be removed by anyone who may edit the task, or by whoever added the link.
> - Goals and projects are never deleted (paused / archived instead) and keep no who/when history beyond `updated_at` and a log line: a planning activity table was not in the schema and is left for later.
> - Request decisions appear in the Team and Home activity feeds (`teamFeed` in `lib/dal/team.ts`), since §8 lists "request decided" as important.
> - Report tiles "Blocked now" and "Overdue now" count today's state, not the range. CSV exports start with a UTF-8 BOM and neutralise formula-leading cells.
> - The board got drag-and-drop (§5) after the first phase: a card dropped on another column is the same Change status (needs-input statuses still open the dialog; order inside a column isn't persisted).
>
> **Decision log (2026-10-18, teams and multiple assignees):**
>
> - **Terms.** The people in a workspace are its _members_. A _team_ is a named group of members inside the workspace (e.g. "Frontend") that can be assigned work. The old `/team` dashboard is now `/members` (the roster and the teams); `/team` redirects there. There are still no sub-tenants: teams live under one workspace and do not change visibility.
> - **Assignment is a set.** A task has any number of assignees: people (`task_assignees`) and teams (`task_teams`), all equal, with no "owner". Everyone assigned directly, or through a team they belong to, sees the task in My Work (team work is marked "via Frontend"), may edit it, and is told about assignment, approval decisions and comments. Workload per person and Contributions count direct assignments only; teams get their own rows. A goal may also name the teams that own it (`goal_teams`).
> - `tasks.assignee_id` is **legacy**: kept because real data exists (§0: additive only), no longer read or written. `scripts/backfill-assignees.ts` copies it into `task_assignees` once (idempotent); run it after `db:push` on any database that has tasks.
> - **Hand over to X** in Update progress makes X the task's only person (teams stay). "Approver must not be an assignee" means a direct assignee.
> - Teams are created and changed (name, description, members) by admins and leaders (`canManageTeams`); everyone else reads them. Deleting a team removes it from every task and goal; the history keeps its name. The `Viewer` carries `teamIds` (the teams the person is in, in the active workspace) so permission checks stay pure.
> - **Skipping the workspace.** A signed-in person without a workspace is no longer bounced to `/onboarding`: `/home` shows a no-workspace state (create one, or the invitations waiting for their email), the shell renders without a workspace, and the first onboarding step has "Skip for now". Every other `(app)` page still sends them to `/home`.
> - Home's header action is always **New task**; an admin who is still alone gets an invite banner instead of an invite button. The account menu says "User settings" and "Workspace".
> - The New task dialog renders at once; its pickers load behind it (and are prefetched once per session), so the title can be typed immediately.
>
> **Decision log (2026-10-20, quick-add bar):**
>
> - Tasks are added from an always-open **add bar** at the top of Home, My Work and Tasks, and on active project and goal pages (defaulting to them), instead of a New task button in the header. It has priority (Urgent / High / Normal / Low), Today / Tomorrow, a date, the project, **Add task**, and **More options**, which opens the full New task dialog with what was typed. N focuses the bar where there is one and opens the dialog elsewhere; ⌘K's New task still opens the dialog.
> - Typed shortcuts in the title (`lib/tasks/quick-add.ts`): `!urgent` `!high` `!normal` (`!medium`) `!low`, `@today` `@tomorrow`, and `@name` for a person (first name, full name without spaces, or the email's local part) or a team (name without spaces). An `@` that matches nobody, or more than one, stays in the title. Any mention assigns the task to exactly those mentioned; without one it is the creator's, as before. Typing `!` or `@` offers completions.
>
> **Decision log (2026-10-28, Home becomes the tab hub):**
>
> - `/home` is now the hub the app hangs off: a tab row — List, Board, Projects, Home — sits under the header, the tab picked by `?view=` (`list` is the plain value; a bare `/home` opens the person's landing tab). The old role-aware Home screen is the **Home** tab; `/tasks` is gone, `/projects` redirects into `/home` with its parameters intact, and `/tasks/[id]` / `/projects/[id]` are unchanged. There is no Tasks item in the navigation: the tab row is that navigation, and the sidebar's Home covers the whole hub.
> - The add bar stays on the List and Board tabs (and My Work); the Home and Projects tabs don't have it.
> - Tab order is a per-browser preference in the `trackwise.homeTabs` cookie (`lib/home-tabs.ts`, like `trackwise.tasks.lastQuery` but server-read for the landing). The tabs themselves drag sideways to reorder (the same sortable as the board); the first tab is where a bare `/home` opens — there is no separate landing setting. Defaults: members and leaders land on List, admins and stakeholders on Home; a stakeholder only ever has the Home tab, so their row never renders.
>
> **Decision log (2026-10-30, teams go, sub-goals and resolvable comments arrive):**
>
> - **No more teams.** The only groupings are projects, goals (with sub-goals) and tasks. Every team screen, picker, filter, report table and the Viewer's `teamIds` are gone; `/teams/*` redirects to `/members`, which is now the roster alone. The four team tables (`teams`, `team_members`, `task_teams`, `goal_teams`) **stay in the schema as legacy** (dropping them is not additive and real data exists); nothing reads or writes them. `scripts/backfill-team-assignees.ts` (`npm run db:backfill-team-assignees`) copies each team's current members onto its tasks as direct assignees once, so no work lost its people. Assignment is a set of people (`task_assignees`), and `Viewer = { userId, orgId, orgRole, timezone }`. Old history rows that named a team still read right (`lib/tasks/history.ts` keeps the legacy `teams` key).
> - **Sub-goals, one level.** `goals.parent_goal_id` (nullable, `set null` on delete). A goal may have sub-goals; a sub-goal may not. A sub-goal's target date can never be later than its parent's, checked both ways in `lib/goals/deadlines.ts` (saving a sub-goal, and moving a parent's date). A sub-goal's tasks (direct and through its projects) count for the sub-goal and roll up into the parent (`progressForGoals`, `tasksForGoal`, the `goal` filter). The Goals page lists top-level goals (each card says "2 sub-goals"); sub-goals live on their parent's page under "Sub-goals" with "New sub-goal"; a sub-goal's page points back at its parent. Pickers label a sub-goal "Parent › Sub-goal".
> - **Comments are resolved before completion.** `task_updates.resolved_at` / `resolved_by` (comments only). Anyone who may work on the task resolves or reopens a comment (`canResolveComment`, audit kinds `comment_resolved` / `comment_reopened`). `planTransition` refuses to complete (approving included) while a comment is open; the Resume card, the history heading, the Update progress form, the status dialog and the approver's buttons all say so before the save instead of after it.
> - **Reports.** Reports is a main navigation item (Home · My Work · Goals · Members · Requests · Reports; phone tabs show the first four, More has the rest) and leaves the account menu. The three views are Executive health · Workload · My work, the active one in the brand colour like the active date preset; the date row is presets plus **Custom**, and only Custom shows the From / To pickers and Apply. Contributors appear as avatar circles only (name on hover and for screen readers; stacked circles on shared work in Delivered and Open); the CSV keeps names. The Contributions table sorts on any header and grades its Completed column from red (0) to green (the column's highest value, re-graded as it changes); Blockers turn red only above zero. The Teams table and its CSV are gone.
> - **Filters show that they are on.** A narrowing picker takes the brand tint, and a "Filtered:" row of removable chips sits under the toolbar (tasks and requests) with Clear all. The default of `closed` is `false` again (the 2026-10-29 commit had flipped it, which made Clear filters turn Show closed on); the status chips show the statuses the list really shows (open ones, plus closed when Show closed is on).
> - **Character counters** show only in the last fifth of a cap, as "N left" (gold in the last tenth, red at zero). Input safety stays where it was: React escapes what it renders, zod caps and strips control characters on the server (`lib/sanitize.ts`), links must be http(s), emails escape HTML, CSV neutralises formula-leading cells, and the CSP has no inline-script allowance beyond what prerendering needs.

> **Decision log (2026-11-01, reports that say what is wrong, and capture from a meeting):**
>
> - **Reports narrow to a project.** `?project=` (an id, `none` for work in no project, empty for the whole workspace: the task filters' convention) scopes every section, the chart and the CSV files alike; the picker sits beside the date presets and wears the brand tint when it is on. Narrowed to a project, the health board shows that project and the goal it rolls up into (and that goal's parent), and requests step aside with a note, since they belong to no project.
> - **The Executive view opens with a verdict.** One sentence ("3 things need attention: …" or "Nothing needs intervention right now."), then five linked counts: delayed or at risk, blocked now, overdue now, decisions waiting, delivered in range. Then **Decisions waiting**: the tasks awaiting approval (the same evidence-first list as a leader's Home, with Approve / Send back) and the requests nobody has settled (new, deferred past their revisit day, approved but not yet a task), each with its Decide menu. Then the health board, the chart and Contributions.
> - **Health has four verdicts** (`lib/reports/health.ts`, unit-tested): _Delayed_ (target date passed with work still open; no tasks at all and a passed date counts too), _At risk_ (anything blocked, or a fifth or more of the work overdue), _Needs attention_ (some work overdue), _On track_. Rows list worst first; on-track rows fold behind "Show N on track" as soon as anything isn't. A completed or archived project chosen by name reads as on track.
> - **The daily chart** (`components/reports/range-chart.tsx`) draws one column per day from the start of the range to **14 days past today** (`TIMELINE_LOOKAHEAD_DAYS`; at most 120 days, keeping the most recent), each bar split into **one segment per task** with a 2px surface gap: completed (solid green), blockers raised (hatched red, so hue is never the only cue) and, from today on, what falls due (outlined). Days ahead are shaded; goal deadlines are pins. Columns are a fixed 28px inside a sideways scroller that opens with today in the middle. Hovering a day keeps its tasks on show until another day is hovered; clicking pins it; hovering a segment highlights its row. Colours are the status tokens, so both themes are right. The My work view draws only the viewer's own tasks.
> - **Capture from a meeting** (`/capture`, `actions/capture.ts`, `lib/capture/*`). A leader or admin (`canCapture`) pastes a transcript or notes (or uploads a `.vtt` / `.txt`, read in the browser), optionally starting from a project; the helper answers with a **draft**: the meeting's title and a summary, a project (existing, new or none), goals (existing or new; a new one may be a sub-goal) and tasks with people, due date, priority, goal and the quoted words each rests on. The review screen makes every line editable and tickable, and **one button creates what is ticked** in one transaction under the same rules as the forms (assignment validated, the sub-goal deadline rule, a `created` history row noting "Captured from …", `assigned` notices). Nothing is created before approval. The model is asked once per draft through the Anthropic SDK (`@anthropic-ai/sdk`, the one new dependency) with a strict output schema (`lib/capture/prompt.ts`); `ANTHROPIC_API_KEY` switches the feature on (without it the page says so and the add bar's "From a meeting", the palette's "Capture from a meeting" and the project page's button stay hidden), `CAPTURE_MODEL` overrides the model, six drafts per person per ten minutes, transcripts capped at 60,000 characters. **Test personas never reach the model**: in development they get a plain line parser (`lib/capture/fake.ts`: `Meeting:`, `Project:`, `Goal:` and `Action item:` lines), so `11-capture` costs nothing; `CAPTURE_PROVIDER=fake` gives anyone the parser in development.
> - **Negative first, everywhere** (the meeting's "Am I cool, or should I be doing something?"). The Executive verdict is the page's one hero line, the counts under it smaller. **Stalled** (in progress, nothing changed for 7 days: `STALLED_AFTER_DAYS`) joins the counts and gets its own list on the Executive and Workload views. An awaiting task names the goal and the project it touches, so a decision's impact is on the row. The Workload tiles are Overdue · Blocked · Stalled · Idle people · Delivered; the My work tiles Overdue · Blocked · Due in 7 days · Delivered. The per-person table (was Contributions, now **People**, the CSV still `table=contributions`) reads Overdue · Blocked · Open now (Idle at zero) · Completed · Change vs prior, opens worst first, and no longer counts progress updates or blockers raised.
> - **On pace?** (`lib/reports/pace.ts`, unit-tested). The chart card opens with a thermometer: the share of the scope's tasks done against the share a straight line from the start (the project's creation, or the oldest task) to the target date (the project's; for the whole workspace the latest top-level goal's) expects by today; within five points is on pace. Being behind that line makes a goal or project _Needs attention_ on the health board. "At risk" is therefore defined entirely from task rows: blocked work or a fifth overdue (at risk), a passed target with open work (delayed), anything overdue or behind pace (needs attention), nothing estimated.
> - **Left for a later round, by the meeting's own scoping (Reports only for now):** the project selector on Home and My Work (the List and Board tabs already filter by project); the project → goals → tasks hierarchy with goals added from a project page (today a project rolls up into one goal, so this needs a model decision first); goals shown as checklists on the goal page.

> - **Client feedback, same day.** The date presets are rolling spans — Week · Month · 3 months · 6 months · Year to date — plus Custom, whose pickers now take any day, future ones included (a range running past today shows what is coming). **Overdue work is drawn in the chart**: an open task due before today is a solid red segment on its due day with a red wash down the column and a "!" above the bar, counted in red in the subtitle (with how many fell due before the chart's first day), and listed in the inspector; goal-deadline pins take the goal's health colour (red when at risk or delayed, amber needs attention, green on track). **"All clear" counts everything**: every health verdict short of on track (not just delayed / at risk), the scope being behind pace, blocked, overdue, stalled and decisions waiting. The shared native select draws its open list in dark chrome and styles grouped options too, so the project picker's groups no longer fall back to grey. **The add bar has an assignee picker** (a typed @mention still wins; picking clears the mention from the title) in an options row that starts open and folds behind "Hide options" (remembered per browser in `trackwise.quickAdd.options`); the buttons stay on a footer row, and while folded the hint says what is set.

> - **The chart fills its card and zooms** (no scrollbar, like a trends chart): the column width is the card's width divided by the days on show; by default each day gets at least 24px (a phone opens on a fortnight or so, a desktop on the whole window), the view ends at the window's end so today is always in it, − / + show more or fewer days anchored on today, ‹ › move along the window, Fit all shows every day. **A quiet grey pulse runs behind the bars**: every `task_activity` row of every task in scope, per day (created, edited, status changes, assignments, comments, links, everything), drawn to its own relative scale with the exact count in the day's inspector, so a busy day reads as busy even when nothing was finished.


This file is the hand-off for anyone building Trackwise. Read `docs/BRIEF.md` for intent; this file says _how_. Follow the `apex-architecture`, `apex-ui` and `apex-ux` skills for everything not spelled out here. If something is genuinely impossible, say so in the report rather than silently choosing differently.

Owner context: the owner's own dev team and their manager. One workspace in practice, multi-tenant in design. Fresh database; nothing is migrated from Supabase.

## 0. Ground rules

- Next.js **16.4.1** (same as Clarity); read `node_modules/next/dist/docs/` before using an API. `cacheComponents` and `partialPrefetching` on.
- Strict TypeScript. `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` pass at the end of every step.
- Dependencies stay minimal and match Clarity's versions. **No** react-hook-form, Redis, queues, cron workers, file storage SDKs. **Exception**: `@dnd-kit` (core + sortable + utilities) powers the board's drag-and-drop through the generic `components/kanban.tsx`. `@anthropic-ai/sdk` serves "From a meeting" alone (2026-11-01 log).
- Schema with `drizzle-kit push` (`npm run db:push`), no migrations folder.
- Dev server `npm run dev` → port **3015** (`BETTER_AUTH_URL=http://localhost:3015`). Never read or print `.env*` values; scripts load them with `dotenv`.
- Prod: the team VPS, pm2 via `ecosystem.config.js` on port **3015**, `deploy.sh` run by the owner. The database is Postgres reached through `DATABASE_URL` (the VPS's own, or a managed Neon database; `DATABASE_URL_DIRECT` for `db:push` when the main URL is pooled). Email over SMTP (nodemailer). Never deploy, push or run `db:push` against production unless asked.
- Phone **and** desktop: every screenshot check runs at 390×844 and 1280×900, light and dark.

## 1. Stack (exact)

| Concern    | Choice                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | `better-auth` 1.7 with its Drizzle adapter: database sessions in our tables, Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, button hidden until set) and the magic-link plugin sending through `lib/mail` (SMTP from `SMTP_HOST`, `SMTP_PORT`, `EMAIL`, `EMAIL_PASS`). `BETTER_AUTH_URL` + `BETTER_AUTH_SECRET`. |
| DB         | `drizzle-orm` 0.45, `drizzle-kit` 0.31, `pg`. `DATABASE_URL` → Postgres 16, database `trackwise`.                                                                                                                                                                                                                    |
| UI         | Tailwind v4 via `@tailwindcss/turbopack`, shadcn/ui (new-york, neutral, CSS variables), `radix-ui`, `lucide-react`, `sonner`, `next-themes`, `cmdk`.                                                                                                                                                                 |
| Validation | `zod` v4 on the server in every action.                                                                                                                                                                                                                                                                              |
| Dates      | `Intl` + `lib/time.ts`; workspace timezone default `America/Jamaica`, per-user override.                                                                                                                                                                                                                             |
| Scripts    | `tsx`, `dotenv`; `vitest` unit tests; headless-Chrome walkthroughs.                                                                                                                                                                                                                                                  |
| AI         | `@anthropic-ai/sdk` 1.3, for "From a meeting" only: `ANTHROPIC_API_KEY` switches it on, `CAPTURE_MODEL` picks the model (default `claude-opus-5-5`). Test personas get a plain parser instead (`lib/capture/fake.ts`).                                                                                       |

Fonts: Geist Sans + Geist Mono.

## 2. Routes and navigation

```
/                          landing (static) → /home when signed in
/login                     magic link + Google
/login/check-email
/invite/[token]            accept a workspace invitation
/onboarding                create workspace → invite (skippable) → done
(app) group, authenticated, shell:
  /home                    the tab hub: ?view=list (filters in URL) · ?view=board (status columns) ·
                           ?view=projects (active projects, archived behind ?all=1) · ?view=home
                           (role-aware overview: member next steps · leader team health · stakeholder
                           requests); bare /home opens the landing tab (cookie, List for members and
                           leaders, Home for admins and stakeholders)
  /my-work                 Needs attention · Continue working · Waiting on others · Recently finished
  /tasks                   → /home (parameters carried over)   /tasks/[id]  Resume card → details → comments & history
  /projects                → /home?view=projects                /projects/[id]  project header + its tasks grouped by status
  /goals                   goals with progress (completed / total)
  /goals/[id]              goal header + sub-goals (top-level goals), projects and tasks under it; a sub-goal page points back at its parent
  /members                 the roster (role, open work) and Invite people (workers; /team and /teams/* redirect here)
  /requests                list (stakeholders see their own) + New request
  /requests/[id]           request detail, decisions, linked task's Resume card
  /reports                 ?from&to&cut=exec|leader|member&project → three views (Executive health · Workload · My work); print + CSV
  /reports/export          route handler: CSV (table=delivered|open|contributions, project)
  /capture                 ?project → a transcript in, a draft of goals and tasks under a project out, approved before anything is created (leaders, admins; hidden until ANTHROPIC_API_KEY is set)
  /notifications
  /settings                profile: name, timezone, email preferences
  /settings/workspace      name, timezone, members, invitations, delete workspace (admin)
/api/auth/[...nextauth]
/api/test-login            dev-only persona sign-in (§9)
```

Navigation: **Home · My Work · Goals · Members · Requests · Reports** (sidebar, desktop). Phone bottom tabs: Home · My Work · Goals · Members · More (Requests, Reports, User settings, Workspace, Sign out). The tab row under the /home header (_Home · List · Board · Projects_, draggable per person — see the 2026-10-28 log) reaches the tasks views and projects; projects are also reached from goals. Stakeholders see Home · Requests only. User settings and Workspace live in the account menu. A signed-in person with no workspace sees Home only.

## 3. Tenancy, roles, visibility

- Active workspace = cookie `trackwise.org` (orgId), validated against `organization_members` on every request; fallback to the oldest membership, cookie rewritten. Switcher = server action + redirect to `/home`.
- Who may have an account: `ALLOWED_EMAIL_DOMAINS` (e.g. `intellibus.com`) limits sign-in and invitations to those domains, enforced in `lib/auth.ts` hooks (magic link request, user creation) and in `actions/invitations.ts`; test personas are exempt outside production. Unset means anyone.
- Org role `organization_members.role`: `admin | leader | member | stakeholder`. There are no teams (2026-10-30 log): work is grouped by projects, goals and sub-goals only.
- Rules (`lib/permissions.ts`, used by every DAL query and action):
   - **admin**: everything in the workspace, plus settings, members, invitations, delete.
   - **leader**: read everything; create/edit/archive projects and goals; create/edit/assign any task; approve or send back; reject; decide requests; see Members and Reports; turn a meeting transcript into goals and tasks (`/capture`).
   - **member**: read all tasks, projects, goals and requests; create tasks; edit a task they created or are assigned to; update progress, comment on and resolve comments on any task; hand over; submit requests. Members page read-only. Reports visible (the My work view).
   - **stakeholder**: read only their own requests and the tasks converted from them; submit requests. Nothing else; nav shows Home and Requests.
- `Viewer = { userId, orgId, orgRole, timezone }`. Every DAL function takes it and filters by `orgId` in SQL; lookups by id also check `orgId`.

## 4. Schema

IDs are `text` UUIDs, timestamps `timestamptz` server-generated, enums as `pgEnum` from `lib/constants.ts`.

```
users / sessions / accounts / verifications   Better Auth core shape (name, email, email_verified bool, image; session token + expires_at; provider accounts; pending tokens); users also carry timezone
organizations         id, name, slug (unique), timezone, created_by, created_at
organization_members  org_id, user_id, role, joined_at, invited_by                        PK(org_id, user_id)
invitations           id, org_id, email (lower), role, token_hash (unique sha256), invited_by, expires_at (7d), accepted_at?, created_at
teams / team_members / task_teams / goal_teams   LEGACY, unused since 2026-10-30 (kept: dropping is not additive); see the decision log
task_assignees        task_id, user_id, assigned_by?, assigned_at                           PK(task_id, user_id)   the people assigned (the only kind of assignment)
goals                 id, org_id, parent_goal_id? (one level; a sub-goal never has sub-goals), title, description?, owner_id, target_date? (never after the parent's), success_criteria?, status (active|achieved|paused), created_by, created_at, updated_at
projects              id, org_id, goal_id?, name, description?, owner_id?, status (active|completed|archived), target_date?, created_by, created_at, updated_at
requests              id, org_id, title, description?, desired_outcome?, urgency (low|normal|high|critical), link?, requester_id, status (new|approved|deferred|rejected|converted), decided_at?, decided_by?, decision_reason?, defer_until?, converted_task_id?, created_at, updated_at
request_decisions     id, request_id, decider_id, decision (approved|deferred|rejected|converted|reopened), reason?, created_at   (append-only)
tasks                 id, org_id, project_id?, goal_id?, request_id?, title, description?, assignee_id? (legacy, see the 2026-10-18 log), created_by, approver_id?, priority (low|normal|high|urgent), status (not_started|in_progress|awaiting_approval|blocked|rejected|completed), due_date?, started_at?, completed_at?, blocked_reason?, blocked_by?, rejection_reason?, latest_progress?, next_action?, completion_summary?, sort_rank (double, default 0), created_at, updated_at
task_updates          id, task_id, author_id, kind (progress|comment), body, next_action?, blocker?, resolved_at? + resolved_by? (comments: open until resolved), created_at   (append-only but for the resolved pair)
task_links            id, task_id, url, label?, added_by, created_at
task_activity         id, org_id, task_id, actor_id, kind (created|edited|status_changed|assigned|handed_over|due_changed|priority_changed|blocked|unblocked|approval_requested|approved|sent_back|rejected|completed|reopened|progress_updated|commented|link_added|link_removed), before jsonb?, after jsonb?, note?, created_at   (append-only)
notifications         id, user_id, org_id, kind, title, body?, href, read_at?, created_at
notification_preferences  user_id PK, email_assignment, email_approval, email_handover, email_blocked, email_request_decision, email_comment (bools)
```

Indexes: `tasks(org_id, status)`, `tasks(org_id, assignee_id, status)`, `task_assignees(user_id)`, `goals(parent_goal_id)`, `tasks(org_id, project_id)`, `tasks(org_id, goal_id)`, `tasks(org_id, due_date)`, `tasks(request_id)`, `task_updates(task_id, created_at desc)`, `task_activity(task_id, created_at desc)`, `task_activity(org_id, created_at desc)`, `requests(org_id, status)`, `requests(org_id, requester_id)`, `projects(org_id, status)`, `goals(org_id, status)`, `invitations(org_id)`, `organization_members(user_id)`, `notifications(user_id, read_at)`.

## 5. Task behaviour (the heart of the product)

- **Create**: title required; assignees default to you (any number of people, one picker); project optional (defaults to the one you came from); everything else optional. One dialog (`N` anywhere, shown at once while its pickers load) and a `/tasks/[id]` page. Assigning someone else notifies each person (`assigned`); the history records the change with names (`assigned`, before → after).
- **Update progress** (signature; on the task page, in the row menu, from ⌘K): _Latest progress_ (required), _Next action_ (required unless completing), optional _I'm blocked_ (reason required, who/what unblocks optional), _Evidence link_, _Hand over to_ (X becomes the only person on it), _Mark as_ (in progress / awaiting approval / completed). One transaction: `task_updates` row, denormalised `latest_progress`/`next_action` on the task, `task_activity` rows, notices.
- **Comment**: a `task_updates` row with `kind=comment`, open until someone who may work on the task marks it resolved (`resolved_at`, `resolved_by`; activity `comment_resolved` / `comment_reopened`); activity `commented`; notifies the people on the task (and the creator if different) when the author is someone else.
- **Transitions** via `lib/tasks/transitions.ts` (pure `planTransition`), same rules as Clarity: blocked needs a reason; awaiting approval needs an approver (defaults to a leader: the task's approver, else the first leader/admin who is not the assignee); approve → completed (`approved` + `completed`), send back → in progress (`sent_back`); completed sets `completed_at`, reopen clears it (`reopened`); rejected needs a reason; first in-progress sets `started_at`; completing (approving included) is refused while a comment on the task is open.
- **Who may do what**: approve/send back = the approver or any leader/admin; reject = edit rights; the rest = progress rights (any member on a task in the workspace).
- **Resume card** first on the task page: next action (large), latest progress, blocker strip, evidence chips, last update by/when, inline Update progress form. Then details (project, goal, assignee, due, priority, created by, request), then comments + history merged newest first, 20 at a time.
- **Lists**: dense rows (status icon · title · next action · reason · due · priority · assignees as an avatar stack) with hover "⋯" (Update progress · Change status · Copy link) and long-press sheet. Filters in the URL: `q`, `status`, `assignee` (me/none/id), `priority`, `project`, `goal`, `due` (overdue/week/none), `closed`, `sort` (smart/due/priority/updated/created). Closed hidden by default. A filter that is on is visible as such: the control takes the brand tint and a "Filtered:" chip row under the toolbar names each one, removable, with Clear all.
- **Board** (`/home?view=board`): five columns (Not started · In progress · Awaiting approval · Blocked · Completed in the last 14 days), compact cards (title, assignee, due, priority), the same filters. Drag a card onto another column to change its status — statuses that need a reason or an approver open the transition dialog instead of applying; the card menu does the same by hand.
- **My Work grouping**: "my" work is every task I am assigned to. _Needs attention_ = overdue, due within 2 days, blocked, awaiting my approval, sent back; _Continue working_ = my not*started/in_progress ordered overdue → due soonest → priority → sort_rank → updated; \_Waiting on others* = my awaiting*approval + blocked; \_Recently finished* = my completed in the last 14 days.

## 6. Projects and goals

- Project: name required; description, owner, goal, target date optional; status `active | completed | archived`. Project page: header (owner, goal, target, counts), _New task_ defaulting to this project, tasks grouped by status, archived shows a banner.
- Goal: title required; description, owner (defaults to creator), parent goal (optional: makes it a sub-goal, one level), target date (a sub-goal's never later than its parent's, and a parent's never earlier than a sub-goal's: `lib/goals/deadlines.ts`), success criteria; status `active | achieved | paused`. Goal page: header with progress (completed / total counting tasks linked directly, through its projects and through its sub-goals), the sub-goals as cards with _New sub-goal_ (top-level goals only), projects list, tasks list, _New task_ defaulting to this goal. The Goals page lists top-level goals; pickers label a sub-goal "Parent › Sub-goal".
- Create/edit are dialogs for leaders and admins; members see read-only pages with the task actions they are allowed.

## 7. Requests

- New request (anyone in the workspace): title, description, desired outcome / business reason, urgency, optional link. Stakeholders' nav leads here.
- Decisions (leaders, admins) inline on the list and the detail page: **Approve** (optional "create the task now" with assignee / priority / due), **Defer** (optional revisit date), **Reject** (reason required), **Convert to task** (when approved). Each decision = `request_decisions` row + request fields, one transaction; the requester is notified with the reason; a converted request links to its task and the task back to it.
- Requesters see status, reason, decider and the linked task's Resume card read-only.

## 8. Home, Team, Reports, notifications

- **Home**: greeting + workspace; _New task_ in the header; a banner when requests await my decision (leaders) and one inviting colleagues when an admin is still alone; _Pick up where you left off_ (My Work's first five); leaders also get count tiles (active · completed 30d · overdue · blocked · awaiting approval), _Needs attention_, _Workload_, _Goals_ progress strip, _Recent decisions and activity_; stakeholders get _Your requests_. Without a workspace: a welcome card with _Create a workspace_ and the invitations waiting for that email.
- **Members** (`/members`): the roster, one row per member with role and open / blocked / overdue work (admins manage roles under Settings → Workspace); _Invite people_ (admins, leaders).
- **Reports**: `?from&to&cut&project` (default last 30 days and the whole workspace; presets plus Custom, which alone shows the From / To pickers; a project picker beside them) → three views, the active one in the brand colour: _Executive health_ (admins first: the verdict sentence and five linked counts, _Decisions waiting_ — approvals with Approve / Send back and unsettled requests with Decide — the health board worst first with four verdicts, the daily chart, Contributions), _Workload_ (leaders first: tiles, blocked duration, the chart, _Delivered_, _Open commitments_, _Blocked and overdue_, _Contributions_, _Goals_), _My work_ (members: their own numbers, their own segments in the chart, their lists). The chart runs from the range's start to 14 days past today, one segment per task, scrolled to today. Contributors are avatar circles only (names on hover, for screen readers and on paper; stacked when work was shared). _Contributions_ sorts on every header; its Completed column is graded red (0) → green (the column's highest value), Blockers red only above zero. Print styles; `/reports/export?from&to&table=delivered|open|contributions&project` returns CSV (names included).
- **Notifications**: kinds `assigned | handover | approval_requested | approval_decided | blocked | request_decided | commented`; in-app rows now, emails after the response per preferences (`lib/notify.ts`). `/notifications` lists them and marks read; the bell shows unread.

## 9. Design system

Follow `apex-ui`. Brand slots (Trackwise keeps its colours):

| Slot                                 | Light                                              | Dark                                            |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| `primary`                            | `oklch(0.43 0.14 262)` (royal blue #234a9e)        | `oklch(0.72 0.14 262)`                          |
| `primary-foreground`                 | `oklch(0.99 0 0)`                                  | `oklch(0.16 0.02 262)`                          |
| `ring` / `link`                      | `oklch(0.55 0.17 262)` / `oklch(0.45 0.15 262)`    | `oklch(0.72 0.15 262)` / `oklch(0.78 0.12 262)` |
| `selection`                          | `oklch(0.55 0.17 262 / 0.18)`                      | `oklch(0.72 0.15 262 / 0.3)`                    |
| `sidebar-accent`                     | `oklch(0.95 0.025 262)`                            | `oklch(0.26 0.04 262)`                          |
| `highlight` / `highlight-foreground` | `oklch(0.84 0.11 82)` gold / `oklch(0.32 0.08 70)` | `oklch(0.82 0.12 82)` / `oklch(0.2 0.05 70)`    |

Gold appears only as: the goal progress fill, the active-tab underline on the /home tab row, the logo mark's dot, and the "highlight" badge for _Needs attention_ counts. Everything else is the standard's neutrals and status colours. Nav icons: Home `House`, My Work `ListChecks`, Tasks `SquareCheckBig`, Goals `Target`, Members `Users`, Requests `Inbox`, Projects `FolderKanban`, Reports `BarChart3`, User settings `Settings`, Workspace `Building2`; a sub-goal is `GitBranch`.

## 10. Test personas and the AI dev loop

Domain `@trackwise.test`. Workspace **"Trackwise Demo"** (slug `trackwise-demo`, timezone America/Jamaica); a second workspace **"Other Co"** (slug `other-co`) for isolation checks.

| `as=`         | Who                                 | Role                                      |
| ------------- | ----------------------------------- | ----------------------------------------- |
| `admin`       | Avery Admin `avery@trackwise.test`  | admin                                     |
| `leader`      | Morgan Lead `morgan@trackwise.test` | leader                                    |
| `member`      | Jordan Dev `jordan@trackwise.test`  | member                                    |
| `member2`     | Sam Dev `sam@trackwise.test`        | member                                    |
| `stakeholder` | Taylor Ops `taylor@trackwise.test`  | stakeholder                               |
| `other`       | Riley Other `riley@trackwise.test`  | admin of Other Co (+ Casey Other, member) |

Seed (relative to now): 3 top-level goals plus one sub-goal under onboarding (with a task of its own), 3 projects (one per goal, one completed), 25 tasks across every status with 1–4 updates each (two with two people on them, two unassigned), evidence links, two overdue, two awaiting Morgan's approval, three blocked with reasons, six completed in the last two weeks, six comments of which four are still open (the overdue pager task has two, so it can't be completed until they are resolved); 6 requests across every state (two from Taylor, one converted). Scripts: `test:seed | test:status | test:tidy | test:clean`; `scripts/test-browser.mjs`; walkthroughs `01-sign-in`, `02-pages`, `03-task-flow`, `04-requests`, `05-roles`, `06-workspace`, `07-planning`, `08-sub-goals`, `09-comments`, `10-reports`, `11-capture`; a deliberately small vitest set: `lib/permissions`, `lib/tasks/transitions` (status rules, open comments), `lib/tasks/my-work`, `lib/goals/deadlines`, `lib/sanitize` and `lib/reports/csv` (input safety), `lib/reports/health`, `lib/reports/range` and `lib/reports/params` (the verdicts, the chart window, the project parameter), `lib/capture/fake` (the parser and the draft normaliser), and `lib/dal/isolation.test.ts` behind `TRACKWISE_DB_TESTS=1`. `.claude/settings.json` denies reading `.env*`.

## 11. Code layout

As `apex-architecture`: `app/` routes with `loading.tsx` per segment; `actions/{auth,org,invitations,members,profile,tasks,projects,goals,requests,notifications,capture}.ts`; `components/{ui,shell,tasks,projects,goals,requests,members,dashboard,reports,capture,settings,onboarding,notifications}/` plus shared pieces; `db/schema.ts`; `lib/{auth,viewer,permissions,guards,action-result,toast-result,constants,time,log,notify,org-cookie,invite-token,safe-path,test-mode}.ts`, `lib/dal/*`, `lib/tasks/*`, `lib/mail/*`, `lib/reports/*`, `lib/capture/*`; `scripts/`; `docs/`.

## 12. Steps

- **A — Foundation**: deps and configs; constants, schema, `db:push`; auth + login + magic link; viewer, permissions, action-result, guards; test mode + `test-login` + seed + browser script; tokens + shell + theme; landing, onboarding, invitations, settings (profile, workspace members/invitations). Ends with `01-sign-in` green.
- **B — Tasks**: list + filters + board, create dialog + `N` + ⌘K, detail with Resume card, Update progress, transitions, comments, history, My Work. Ends with `03-task-flow` green and screenshots of My Work and a task at both sizes and themes.
- **C — Structure and decisions**: projects, goals, Team, Home, requests with decisions, `02-pages`, `04-requests`, `05-roles`, permission and isolation tests.
- **D — Value and polish**: reports + CSV + print, notifications + preferences + emails, keyboard shortcuts, AGENTS.md, README, RUNBOOK.
- **E — Teams and shared assignment** (2026-10-18): the five new tables and the backfill script; assignment as a set through every list, the task page, My Work, requests, reports and notifications; the Members page and team pages; teams on goals; the no-workspace Home and the skippable first step; the instant New task dialog. Ended with `08-teams` green and the whole suite green.
- **F — Simpler structure** (2026-10-30): teams removed (tables kept as legacy, `db:backfill-team-assignees`), sub-goals one level deep with the deadline rule, comments resolved before completion, Reports in the navigation with its three views recoloured and a Custom range, avatar-only contributors and the graded, sortable Contributions table, visible filters, quieter character counters. Ends with `08-sub-goals` and `09-comments` green and the whole suite green.
- **G — Reports that say what is wrong, and capture from a meeting** (2026-11-01): the project picker on Reports, the verdict strip, Decisions waiting, the four-verdict health board worst first, the per-task daily chart with its two-week look-ahead and sticky inspector; `/capture` with the review screen, the Anthropic SDK behind a key, the plain parser for test personas. Ends with `10-reports` and `11-capture` green and the whole suite green.

Each step ends with `typecheck`, `lint`, `build`, `test:unit` exit 0; the relevant walkthrough green; screenshots reviewed at both sizes and themes.

## Risks

| Risk                                      | Mitigation                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Next 16 APIs differ from training data    | read `node_modules/next/dist/docs/` first; copy patterns from Clarity                        |
| Remote database latency                   | pool timeouts, keepalive, fail fast                                                          |
| Cross-workspace leakage                   | `isolation.test.ts` against two seeded workspaces                                            |
| Google OAuth redirect for the new origin  | documented in README; Google button hidden until configured                                  |
| A managed database (Neon) behind a pooler | `DATABASE_URL` pooled for the app, `DATABASE_URL_DIRECT` for `drizzle-kit push`; TLS on both |
