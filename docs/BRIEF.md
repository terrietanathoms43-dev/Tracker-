# Trackwise — Product Brief

> Rewritten 2026-10-17 from the owner's original Trackwise README and the Supabase prototype (kept in git history at `eac1fa7`). This is the statement of intent. Where it conflicts with `docs/PLAN.md`, the plan wins: the plan records the decisions made after reading this.

## 1. Mission

Trackwise is a small team's single place for **tracking team tasks and goals**: who owns what, where each piece of work stopped, what happens next, and how the work adds up against the goals the team agreed to.

**"Know what your team is doing, and what's next."**

It should feel as calm as a well-kept notebook and as immediately useful to a team lead as a good standing meeting, without the meeting. Impressive in its simplicity, not its number of features.

## 2. Technology stack

Next.js App Router + TypeScript · PostgreSQL on the team's VPS · Drizzle ORM/Kit · Better Auth (Google + email magic links) · Tailwind CSS + shadcn/ui on Radix · Lucide · Zod · Nodemailer · pm2. The same stack and conventions as the team's reference project, Clarity, so that anyone who knows one can work on the other, and so the codebase can be used to teach how Next.js works.

## 3. Product philosophy

Every feature passes at least one of three tests: it saves the user time, it improves visibility or accountability, or it helps someone make a better decision. Nothing else ships.

Three levels of visibility:

- **Member**: "What should I do, where did I stop, what's next?"
- **Leader**: "Is the team on track, what's blocked, where do I step in?"
- **Stakeholder**: "What did I ask for, what was decided, and what's being delivered?"

No time tracking, no screenshots, no productivity scores, no leaderboards. Honest statuses, clear ownership, real evidence.

## 4. Roles and workspace model

Multi-tenant: a user can belong to several **workspaces** (organisations). Within a workspace:

- **Admin**: everything, plus members, invitations and workspace settings.
- **Leader**: manages projects and goals, assigns and edits any task, approves completed work, decides requests, sees the team page and reports.
- **Member**: creates tasks, works on and updates their own, adds progress to any task, hands work over, submits requests.
- **Stakeholder**: submits requests and follows what happens to them; sees only their requests and the tasks created from them.

The "team" is the workspace's members. Sub-teams are not modelled; projects group work.

## 5. Tasks (the core)

A task has: title, description, project (optional), goal (optional), assignee, creator, approver (when awaiting approval), priority (low · normal · high · urgent), status, due date, started/completed dates, **latest progress**, **next action**, blocker reason and who/what unblocks it, rejection reason, evidence links, comments, activity history.

Statuses: **Not started · In progress · Awaiting approval · Blocked · Rejected · Completed.** Each has behaviour: blocked asks for a reason; awaiting approval names an approver, who approves or sends back with a note; completed may carry a summary and evidence; rejected keeps its reason; completed → anything is a reopen that keeps history.

The task page answers *What is this? What happened? What happens next? Who needs to act?* at the top, not in a feed.

## 6. Signature feature: Update progress and resume

Every task leads with **Next action** (most prominent), **Latest progress**, **Blocker** (if any) and **Evidence**. A compact **Update progress** form (progress + next action, optional blocker / evidence / hand over / status) takes seconds and writes one history entry. **My Work** groups a person's tasks: Needs attention · Continue working · Waiting on others · Recently finished.

## 7. Projects and goals

**Goals** are lightweight: title, description, owner, target date, success criteria, status (active · achieved · paused). **Projects** group tasks and may point at a goal. Goal and project pages show the work underneath them with real counts (completed / total, blocked, overdue), never invented percentages. Clicking a goal shows the work that moves it.

## 8. Team view (leaders)

Open it and know the team's health: counts (active · completed in period · overdue · blocked · awaiting approval), **Needs attention** (blocked, approvals, due soon, overdue, unassigned, requests awaiting a decision), **Workload** by member (what each person actively owns), goal progress, and a feed of important changes only.

## 9. Requests

Anyone, including stakeholders, can submit a request (title, description, desired outcome, urgency). Leaders decide: approve (optionally converting to a task at once), defer (with a revisit date), reject (with a reason), convert to a task. Every decision is recorded with who, when and why. The requester follows the request and the task it became.

## 10. Reports

A date range and the facts: completed work with evidence, open commitments, blocked and overdue items, contributions per member (factual, no comparisons), goal progress. Print-friendly, CSV export. Deterministic from stored data.

## 11. Notifications

Minimal and actionable: assigned, handed over, approval requested, approval decided, blocked (to leaders), request decided, comment on your task. In-app always, email by preference. Each opens the item.

## 12. Design direction

Premium, calm, modern. The Apex UI standard (`apex-ui` skill): Geist type, lucide icons, oklch tokens, one brand accent, light and dark, phone and desktop. **Trackwise keeps its colours**: royal blue (`#234a9e`) as the primary and warm gold (`#f2c56f`) as the single highlight. Everything else is the standard's neutrals. Every important screen has one clear primary action.

## 13. What NOT to build (now)

AI meeting assistant · encrypted client-side backups (the VPS runs `pg_dump`) · team chat / messages · recurring task automation · task dependencies · file attachments (evidence links instead) · calendar grid (due dates live on tasks and lists) · sub-teams · budgets · Gantt · timesheets · drag-and-drop board (status menus first; drag can come later) · custom report builders · integrations.

## 14. Key journeys

- **A. Member resumes work**: sign in → Home shows what needs me → open task → read next action → work → update progress in seconds.
- **B. Leader checks the team**: sign in → Team counts and attention list → open a blocked task → intervene → back. Under 60 seconds.
- **C. Stakeholder asks**: submit request → leader decides with a reason → approved work becomes a linked task → stakeholder follows it.
- **D. Goal review**: open a goal → see projects and tasks under it, what's done, what's blocked → adjust.
- **E. Report**: pick a range → print or export what was delivered and what's outstanding.

## 15. Phases

1. **Core** (this rebuild): auth, workspaces, roles, invitations, tasks with progress/transitions/history, projects, goals, My Work, Home, Team, requests, notifications, reports, settings, test personas.
2. **Later**: drag-and-drop board, recurring tasks, saved views, richer reports, sample data.

## 16. Success

The member thinks: "I always know where I stopped and what's next." The leader thinks: "I can see what the team is doing, what's stuck, and what we delivered." The stakeholder thinks: "I know what happened to what I asked for."
