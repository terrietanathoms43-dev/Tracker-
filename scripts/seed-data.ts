/**
 * The demo content behind test mode (scripts/test-accounts.ts turns it into rows). Pure data, no I/O.
 *
 * The shape is the funnel (docs/PLAN.md, 2026-11-03 log): projects first, goals inside them, tasks under goals,
 * in a project alone, or standing on their own. Every time is "days ago" (or "due in days") relative to the
 * moment of seeding, so the dashboards always look alive: in Trackwise Demo two tasks are overdue, two await
 * Morgan's approval, three are blocked, six finished in the last two weeks, two were rejected, two are unassigned,
 * two have two people on them, one goal has a sub-goal with a task of its own, two tasks carry open comments (so
 * they can't be completed until those are resolved), one goal is past its target and shouts, one goal repeats
 * weekly, one task repeats daily at 8:00, three goals lead into one another, Lumen Health asks for sign-off
 * (Morgan then Avery, Jordan skips the queue) and four proposals cover every state.
 *
 * How a task spec becomes rows (taskRows in test-accounts.ts):
 *   - `updates` are progress updates, oldest first; the newest one's body / next action is copied onto the task
 *     (latest_progress / next_action). `comments` are kind=comment and never touch those columns; one marked
 *     `resolved` has resolved_at / resolved_by set.
 *   - A task with a `goal` is in that goal's project; `project` alone puts it in the project; neither makes it
 *     standalone.
 *   - `blocked`, `approval`, `completed` and `rejection` describe how the task reached its current status, and
 *     produce the matching task_activity rows (blocked, approval_requested, approved + completed, rejected).
 *   - `proposal` makes the task a proposal with the given chain, each step signed, declined or waiting.
 */
import type { ApprovalDecision, OrgRole, ProposalStatus, TaskPriority, TaskStatus } from "@/lib/constants";
import type { Recurrence } from "@/lib/recurrence";
import { OTHER_ORG, TEST_EMAIL_DOMAIN, TEST_ORG, TEST_PERSONAS, type TestPersona } from "@/lib/test-mode";

// --- people ---------------------------------------------------------------------

/** The sign-in personas plus Casey, a member of Other Co who never signs in (a second person for that tenant). */
export type Person = TestPersona | "casey";

export const PEOPLE: Record<Person, { email: string; name: string }> = {
  ...TEST_PERSONAS,
  casey: { email: `casey${TEST_EMAIL_DOMAIN}`, name: "Casey Other" },
};

// --- shapes ---------------------------------------------------------------------

export type SeedProject = {
  key: string;
  name: string;
  description: string;
  owner: Person;
  createdBy: Person;
  status: "active" | "completed" | "archived";
  targetInDays: number | null;
  createdDaysAgo: number;
  /** When the status last changed (completed / archived); defaults to createdDaysAgo. */
  updatedDaysAgo?: number;
  /** New tasks wait for this chain, in order (empty = any leader or admin); `bypass` skip the queue. */
  approvers?: Person[];
  bypass?: Person[];
};

export type SeedGoal = {
  key: string;
  /** The project it belongs to (a sub-goal takes its parent's). */
  project: string;
  title: string;
  description: string;
  owner: Person;
  /** The goal this one is a sub-goal of, by key (one level). Its target must not pass the parent's. */
  parent?: string;
  createdBy: Person;
  status: "active" | "completed" | "paused";
  targetInDays: number;
  successCriteria: string;
  createdDaysAgo: number;
  /** When the status last changed (completed / paused); defaults to createdDaysAgo. */
  updatedDaysAgo?: number;
  recurrence?: Recurrence;
  approvers?: Person[];
  bypass?: Person[];
};

export type SeedUpdate = { daysAgo: number; author: Person; body: string; next: string | null; blocker?: string };

export type SeedComment = { daysAgo: number; author: Person; body: string; /** Marked resolved by `resolvedBy` a little after it was written. */ resolvedBy?: Person };

export type SeedStep = {
  /** Who the step names; null means any leader or admin. */
  user: Person | null;
  decision?: ApprovalDecision;
  by?: Person;
  daysAgo?: number;
  note?: string;
};

export type SeedTask = {
  /** Only for tasks something else points at (a notification). */
  key?: string;
  title: string;
  description?: string;
  project?: string;
  goal?: string;
  /** The people on it (any number; empty = unassigned). */
  assignees: Person[];
  createdBy: Person;
  status: TaskStatus;
  priority: TaskPriority;
  createdDaysAgo: number;
  dueInDays: number | null;
  /** "HH:MM". */
  dueTime?: string;
  recurrence?: Recurrence;
  /** Manual importance (higher sorts first); most tasks leave it at 0. */
  sortRank?: number;
  updates: SeedUpdate[];
  comments?: SeedComment[];
  /** Evidence; added alongside the newest update unless daysAgo says otherwise. */
  links?: { url: string; label: string; daysAgo?: number }[];
  blocked?: { daysAgo: number; reason: string; by: string };
  /** Awaiting approval: asked at daysAgo, the approver is the task's approver_id. */
  approval?: { daysAgo: number; approver: Person };
  completed?: { daysAgo: number; summary: string; approvedBy?: Person };
  rejection?: { daysAgo: number; by: Person; reason: string };
  /** A proposal: its state and the chain it carries (task_approvals rows); `local` has no chain yet (2026-11-06 log). */
  proposal?: { status: ProposalStatus; steps: SeedStep[] };
};

export type SeedNotification = {
  person: Person;
  kind: "assigned" | "handover" | "approval_requested" | "approval_decided" | "blocked" | "proposal_waiting" | "proposal_decided" | "commented";
  title: string;
  body?: string;
  task?: string;
  daysAgo: number;
  read: boolean;
};

export type OrgSeed = {
  org: { name: string; slug: string; timezone: string };
  createdBy: Person;
  members: { person: Person; role: OrgRole }[];
  joinedDaysAgo: number;
  projects: SeedProject[];
  goals: SeedGoal[];
  /** "from leads into to", by goal key. */
  goalLinks: { from: string; to: string }[];
  tasks: SeedTask[];
  notifications: SeedNotification[];
};

const GH = "https://github.com/trackwise-demo/app";
const GRAFANA = "https://grafana.example.com/d";

// --- Trackwise Demo ------------------------------------------------------------------

const DEMO_PROJECTS: SeedProject[] = [
  {
    key: "onboarding",
    name: "Onboarding flow",
    description: "Sign-up, workspace setup, invitations and the first-task checklist.",
    owner: "leader",
    createdBy: "leader",
    status: "active",
    targetInDays: 45,
    createdDaysAgo: 28,
  },
  {
    key: "incidents",
    name: "Incident tooling",
    description: "Paging, runbooks, dashboards, the status page and the incident timeline.",
    owner: "member",
    createdBy: "leader",
    status: "active",
    targetInDays: 90,
    createdDaysAgo: 27,
  },
  {
    key: "lumen",
    name: "Lumen Health",
    description: "The patient-intake pilot for Lumen Health. New tasks are signed off by Morgan, then Avery; Jordan skips the queue.",
    owner: "leader",
    createdBy: "admin",
    status: "active",
    targetInDays: 60,
    createdDaysAgo: 14,
    approvers: ["leader", "admin"],
    bypass: ["member"],
  },
  {
    key: "billing",
    name: "Billing jobs migration",
    description: "Move the invoice, dunning and usage-export jobs off the old cron VM onto the queue workers.",
    owner: "member2",
    createdBy: "leader",
    status: "completed",
    targetInDays: -2,
    createdDaysAgo: 30,
    updatedDaysAgo: 2.5,
  },
];

const DEMO_GOALS: SeedGoal[] = [
  {
    key: "onboarding",
    project: "onboarding",
    title: "Ship the self-serve onboarding",
    description: "New teams should get from sign-up to their first tracked task without a call with us.",
    owner: "leader",
    createdBy: "admin",
    status: "active",
    targetInDays: 45,
    successCriteria: "70% of new workspaces create a task on their first day, with no support ticket.",
    createdDaysAgo: 28,
  },
  {
    key: "invite-flow",
    project: "onboarding",
    title: "Invitations work without a support call",
    description: "Half of the onboarding tickets are about invitation emails that never arrived or links that expired.",
    owner: "member2",
    parent: "onboarding",
    createdBy: "leader",
    status: "active",
    targetInDays: 30,
    successCriteria: "No invitation-related support ticket for two weeks running.",
    createdDaysAgo: 20,
  },
  {
    key: "status-page",
    project: "incidents",
    title: "Public status page live",
    description: "Customers find out about incidents from us, not from each other.",
    owner: "member",
    createdBy: "leader",
    status: "active",
    targetInDays: -5,
    successCriteria: "status.example.com shows every incident within five minutes of the page.",
    createdDaysAgo: 26,
  },
  {
    key: "incidents",
    project: "incidents",
    title: "Cut incident response time in half",
    description: "Median time from page to mitigation is 48 minutes; most of it goes on finding the right dashboard and person.",
    owner: "admin",
    createdBy: "admin",
    status: "active",
    targetInDays: 70,
    successCriteria: "Median time to mitigate under 24 minutes across the next ten incidents.",
    createdDaysAgo: 27,
  },
  {
    key: "reviews",
    project: "incidents",
    title: "Every incident gets a review",
    description: "A written review within a week of every incident, with the changes it led to.",
    owner: "leader",
    createdBy: "leader",
    status: "active",
    targetInDays: 100,
    successCriteria: "Ten incidents in a row reviewed within seven days.",
    createdDaysAgo: 10,
  },
  {
    key: "lumen-intake",
    project: "lumen",
    title: "Patient intake form ships",
    description: "Lumen's front desk stops re-typing paper forms.",
    owner: "leader",
    createdBy: "admin",
    status: "active",
    targetInDays: 40,
    successCriteria: "Every new patient at the pilot clinic is registered through the form for two weeks.",
    createdDaysAgo: 14,
  },
  {
    key: "ops-week",
    project: "lumen",
    title: "Weekly ops duties",
    description: "The things the pilot needs every week: the Monday standup, the summary to Lumen, the data check. Completing the week makes next week's.",
    owner: "member2",
    createdBy: "leader",
    status: "active",
    targetInDays: 4,
    successCriteria: "Every duty done by Sunday.",
    createdDaysAgo: 3,
    recurrence: { unit: "week", interval: 1 },
  },
  {
    key: "billing",
    project: "billing",
    title: "Retire the legacy billing jobs",
    description: "The nightly cron jobs on the old VM build invoices and dunning emails, fail silently, and nobody owns the box.",
    owner: "member2",
    createdBy: "leader",
    status: "completed",
    targetInDays: -2,
    successCriteria: "Every billing job runs on the queue workers with alerts, and the old VM is shut down.",
    createdDaysAgo: 30,
    updatedDaysAgo: 2.5,
  },
];

/** The chain the branch view shows: a status page leads to faster responses, which lead to reviews. */
const DEMO_GOAL_LINKS = [
  { from: "status-page", to: "incidents" },
  { from: "incidents", to: "reviews" },
];

const DEMO_TASKS: SeedTask[] = [
  // --- in progress (two of them overdue) -------------------------------------------
  {
    key: "tz-timestamps",
    title: "Show incident timestamps in the viewer's time zone",
    description: "From Taylor: the timeline, the incident header and the digest email all print UTC.",
    goal: "incidents",
    assignees: ["member"],
    createdBy: "leader",
    status: "in_progress",
    priority: "high",
    createdDaysAgo: 3,
    dueInDays: 2,
    updates: [
      { daysAgo: 2.5, author: "member", body: "Found the three places that format times on the server with the host's zone.", next: "Move them to the shared formatter and pass the viewer's zone." },
      { daysAgo: 0.4, author: "member", body: "Timeline and incident header now use the viewer's zone; the digest email still prints UTC.", next: "Fix the digest template and ask Taylor to check yesterday's incident." },
    ],
    comments: [{ daysAgo: 1.2, author: "leader", body: "Taylor's team reads these in Kingston, so check America/Jamaica as well as UTC." }],
    links: [{ url: `${GH}/pull/1318`, label: "PR #1318" }],
  },
  {
    title: "Rate-limit the public sign-up endpoint",
    description: "A bot created 400 workspaces in an hour last week.",
    goal: "onboarding",
    assignees: ["member2"],
    createdBy: "leader",
    status: "in_progress",
    priority: "high",
    createdDaysAgo: 9,
    dueInDays: -2,
    sortRank: 1,
    updates: [
      { daysAgo: 7, author: "member2", body: "Chose a token bucket per IP address, stored in Postgres.", next: "Write the middleware and the 429 response." },
      { daysAgo: 2, author: "member2", body: "Middleware is in; the 429 response still lacks a Retry-After header.", next: "Add Retry-After and load test at 300 requests a second." },
    ],
  },
  {
    key: "pager",
    title: "Route pages to the secondary on-call after 10 minutes",
    description: "Two incidents last month sat unacknowledged for over 20 minutes.",
    goal: "incidents",
    assignees: ["member"],
    createdBy: "leader",
    status: "in_progress",
    priority: "urgent",
    createdDaysAgo: 16,
    dueInDays: -4,
    sortRank: 2,
    updates: [
      { daysAgo: 14, author: "member", body: "Escalation policy drafted in the paging tool's staging account.", next: "Wire the 10-minute timer to the secondary schedule." },
      { daysAgo: 8, author: "member", body: "The timer works in staging; the secondary schedule has gaps on weekends.", next: "Fill the weekend gaps with Morgan, then enable it in production." },
      { daysAgo: 3, author: "member", body: "Weekend gaps filled through the end of next month.", next: "Enable the policy in production and send a test page." },
    ],
    comments: [
      { daysAgo: 1, author: "leader", body: "This is past its due date. Anything I can take off your plate to get it switched on?" },
      { daysAgo: 0.8, author: "member", body: "Only the production switch; doing it once today's deploy freeze lifts." },
    ],
    links: [{ url: `${GH}/pull/1290`, label: "PR #1290", daysAgo: 8 }],
  },
  {
    title: "Build the first-task checklist on the empty home screen",
    goal: "onboarding",
    assignees: ["member2"],
    createdBy: "leader",
    status: "in_progress",
    priority: "normal",
    createdDaysAgo: 6,
    dueInDays: 5,
    updates: [
      { daysAgo: 4, author: "member2", body: "Checklist component built: create a task, invite a teammate, add a goal.", next: "Tick each item off from real data." },
      { daysAgo: 1, author: "member2", body: "Items tick off from real data; copy reviewed with Morgan.", next: "Add the dismiss button and an analytics event." },
    ],
    links: [{ url: `${GH}/pull/1312`, label: "PR #1312" }],
  },
  {
    title: "Add a runbook link to every alert",
    project: "incidents",
    assignees: ["member", "member2"],
    createdBy: "member",
    status: "in_progress",
    priority: "normal",
    createdDaysAgo: 5,
    dueInDays: 3,
    updates: [{ daysAgo: 1, author: "member", body: "Runbook links added to the 12 API alerts; the database alerts still have none.", next: "Add links to the 7 database alerts and lint the alert rules in CI." }],
    links: [{ url: `${GRAFANA}/alerting/list?search=api`, label: "API alert rules" }],
  },
  {
    title: "Rotate the staging database credentials",
    assignees: ["leader", "member2"],
    createdBy: "leader",
    status: "in_progress",
    priority: "normal",
    createdDaysAgo: 2,
    dueInDays: 4,
    updates: [{ daysAgo: 1, author: "leader", body: "New credentials are in the vault; three of five services switched.", next: "Switch the worker and the cron service, then revoke the old user." }],
  },
  {
    title: "Draft the incident review template",
    goal: "reviews",
    assignees: ["leader"],
    createdBy: "leader",
    status: "in_progress",
    priority: "low",
    createdDaysAgo: 6,
    dueInDays: null,
    updates: [{ daysAgo: 2, author: "leader", body: "Outline and the timeline section are written.", next: "Write the 'what we will change' section and share it with the team." }],
  },
  {
    title: "Rewrite the invitation email's help text",
    description: "Under the sub-goal: the email says nothing about what to do when the link has expired.",
    goal: "invite-flow",
    assignees: ["member2"],
    createdBy: "leader",
    status: "in_progress",
    priority: "normal",
    createdDaysAgo: 5,
    dueInDays: 9,
    updates: [{ daysAgo: 1.5, author: "member2", body: "Drafted the new copy with support's three most common questions answered.", next: "Review the wording with Morgan and ship it behind the flag." }],
  },
  {
    title: "Publish the status page under status.example.com",
    description: "The last thing between the status page and customers: DNS and the custom domain on the provider.",
    goal: "status-page",
    assignees: ["member"],
    createdBy: "leader",
    status: "in_progress",
    priority: "high",
    createdDaysAgo: 12,
    dueInDays: -5,
    updates: [{ daysAgo: 6, author: "member", body: "Provider account set up and the components defined.", next: "Point the DNS record at the provider and verify the certificate." }],
  },

  // --- the pilot's weekly duties (a repeating goal) and a repeating task -------------------------
  {
    title: "Run the Monday standup with Lumen",
    goal: "ops-week",
    assignees: ["member2"],
    createdBy: "leader",
    status: "completed",
    priority: "normal",
    createdDaysAgo: 3,
    dueInDays: -2,
    updates: [{ daysAgo: 2, author: "member2", body: "Standup held; two questions about the consent step noted.", next: null }],
    completed: { daysAgo: 2, summary: "Held. Notes in the shared doc." },
  },
  {
    title: "Send Lumen the weekly summary",
    goal: "ops-week",
    assignees: ["member2"],
    createdBy: "leader",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 3,
    dueInDays: 4,
    updates: [],
  },
  {
    title: "Check the intake data export",
    goal: "ops-week",
    assignees: ["member"],
    createdBy: "leader",
    status: "not_started",
    priority: "low",
    createdDaysAgo: 3,
    dueInDays: 3,
    updates: [],
  },
  {
    key: "tapes",
    title: "Change the backup tapes",
    description: "Swap the overnight tape set in the server room and log the serial numbers. Repeats every day at 8:00.",
    assignees: ["member"],
    createdBy: "admin",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 1,
    dueInDays: 0,
    dueTime: "08:00",
    recurrence: { unit: "day", interval: 1, time: "08:00" },
    updates: [],
  },

  // --- not started (two unassigned) ---------------------------------------------------
  { title: "Archive unused staging buckets", assignees: ["member2"], createdBy: "leader", status: "not_started", priority: "low", createdDaysAgo: 4, dueInDays: 14, updates: [] },
  {
    title: "Add an audit log for role changes",
    description: "Admins want to see who changed whose role, and when.",
    assignees: ["member"],
    createdBy: "admin",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 3,
    dueInDays: 2,
    updates: [],
  },
  { title: "Evaluate a hosted status page provider", goal: "status-page", assignees: [], createdBy: "leader", status: "not_started", priority: "normal", createdDaysAgo: 1, dueInDays: null, updates: [] },
  { title: "Translate the invitation email into Spanish", project: "onboarding", assignees: [], createdBy: "admin", status: "not_started", priority: "low", createdDaysAgo: 2, dueInDays: 12, updates: [] },
  {
    title: "Wire the intake form to the clinic's calendar",
    description: "Jordan skips Lumen's sign-off queue, so this went live at once.",
    goal: "lumen-intake",
    assignees: ["member"],
    createdBy: "member",
    status: "not_started",
    priority: "high",
    createdDaysAgo: 1,
    dueInDays: 10,
    updates: [],
  },

  // --- blocked ------------------------------------------------------------------------
  {
    key: "sending-domain",
    title: "Verify the sending domain for invitation emails",
    goal: "invite-flow",
    assignees: ["member"],
    createdBy: "leader",
    status: "blocked",
    priority: "high",
    createdDaysAgo: 7,
    dueInDays: 6,
    updates: [
      { daysAgo: 6, author: "member", body: "Added the SPF and DKIM records in the staging zone.", next: "Add the same records to the production DNS zone." },
      { daysAgo: 2, author: "member", body: "Production DNS change requested.", next: "Verify the domain once the records are live.", blocker: "The production DNS change waits for IT's Thursday change window." },
    ],
    blocked: { daysAgo: 2, reason: "The production DNS change waits for IT's Thursday change window.", by: "IT (DNS change request #5521)" },
  },
  {
    title: "Upgrade the paging integration to the v2 API",
    goal: "incidents",
    assignees: ["member2"],
    createdBy: "leader",
    status: "blocked",
    priority: "normal",
    createdDaysAgo: 14,
    dueInDays: 20,
    updates: [
      { daysAgo: 12, author: "member2", body: "Client library updated; staging webhooks verified.", next: "Migrate the production webhook." },
      { daysAgo: 5, author: "member2", body: "The production migration fails: the v2 API rejects our account's legacy token.", next: "Apply the vendor's new token and retry.", blocker: "Vendor support case #88213 is open." },
    ],
    comments: [{ daysAgo: 4, author: "leader", body: "I've escalated the vendor case with our account manager." }],
    links: [{ url: "https://support.example.com/cases/88213", label: "Vendor case #88213" }],
    blocked: { daysAgo: 5, reason: "Vendor support case #88213: the v2 API rejects our account's legacy token.", by: "Vendor support" },
  },
  {
    title: "Send a welcome email after workspace creation",
    goal: "onboarding",
    assignees: ["member"],
    createdBy: "member",
    status: "blocked",
    priority: "high",
    createdDaysAgo: 8,
    dueInDays: 3,
    updates: [{ daysAgo: 1.5, author: "member", body: "Template written and reviewed by Morgan.", next: "Trigger it from the workspace-created event.", blocker: "Needs the verified sending domain first." }],
    blocked: { daysAgo: 1.5, reason: "Needs the verified sending domain before anything can be sent.", by: "Jordan (sending domain task)" },
  },

  // --- awaiting Morgan's approval -------------------------------------------------------
  {
    key: "invite-links",
    title: "Invite teammates by link from onboarding",
    goal: "invite-flow",
    assignees: ["member"],
    createdBy: "leader",
    status: "awaiting_approval",
    priority: "high",
    createdDaysAgo: 11,
    dueInDays: 1,
    updates: [
      { daysAgo: 9, author: "member", body: "Invite links work with a 7-day expiry in staging.", next: "Add the copy-link button to the onboarding invite step." },
      { daysAgo: 4, author: "member", body: "Copy-link button is in; invitations are accepted end to end in staging.", next: "Ship it behind the flag to production." },
      { daysAgo: 0.5, author: "member", body: "Enabled in production for new workspaces; 14 invitations accepted today.", next: "Morgan to review the numbers and approve." },
    ],
    comments: [{ daysAgo: 0.3, author: "admin", body: "Lovely. The acceptance numbers look great.", resolvedBy: "member" }],
    links: [
      { url: `${GH}/pull/1276`, label: "PR #1276", daysAgo: 4 },
      { url: `${GRAFANA}/product/invitations?from=now-7d`, label: "Invitations dashboard" },
    ],
    approval: { daysAgo: 0.5, approver: "leader" },
  },
  {
    key: "flags",
    title: "Clean up feature flags older than 90 days",
    assignees: ["member2"],
    createdBy: "member2",
    status: "awaiting_approval",
    priority: "low",
    createdDaysAgo: 6,
    dueInDays: 5,
    updates: [{ daysAgo: 1, author: "member2", body: "Removed 23 stale flags; kept 4 on purpose and documented why.", next: "Morgan to confirm the four we kept." }],
    links: [{ url: `${GH}/pull/1295`, label: "PR #1295" }],
    approval: { daysAgo: 1, approver: "leader" },
  },

  // --- rejected --------------------------------------------------------------------------
  {
    title: "Add a second paging provider as a fallback",
    goal: "incidents",
    assignees: ["member2"],
    createdBy: "member2",
    status: "rejected",
    priority: "normal",
    createdDaysAgo: 13,
    dueInDays: null,
    updates: [{ daysAgo: 11, author: "member2", body: "Priced two providers; a fallback adds about $600 a month.", next: "Decide whether the cost is worth it." }],
    rejection: { daysAgo: 10, by: "leader", reason: "The primary provider has met its SLA all year. Revisit if it misses twice in a quarter." },
  },
  {
    title: "Port the dunning emails to the old template engine",
    goal: "billing",
    assignees: ["member"],
    createdBy: "admin",
    status: "rejected",
    priority: "normal",
    createdDaysAgo: 18,
    dueInDays: null,
    updates: [{ daysAgo: 16, author: "member", body: "Ported two of the six dunning templates.", next: "Port the remaining four." }],
    rejection: { daysAgo: 15, by: "leader", reason: "Dunning moves to the new mailer instead; porting the old templates would be thrown away." },
  },

  // --- completed in the last two weeks -------------------------------------------------------
  {
    title: "Move the invoice job to the queue workers",
    goal: "billing",
    assignees: ["member2"],
    createdBy: "leader",
    status: "completed",
    priority: "normal",
    createdDaysAgo: 13,
    dueInDays: -8,
    updates: [
      { daysAgo: 12, author: "member2", body: "The invoice job runs on the queue in shadow mode; its output matches the cron job.", next: "Switch production over and remove the cron entry." },
      { daysAgo: 9.1, author: "member2", body: "Production switched; the cron entry is removed.", next: null },
    ],
    links: [{ url: `${GH}/pull/1262`, label: "PR #1262" }],
    completed: { daysAgo: 9, summary: "Invoices now generate on the queue workers, with retries and an alert on failure." },
  },
  {
    key: "dunning",
    title: "Move the dunning emails to the new mailer",
    goal: "billing",
    assignees: ["member"],
    createdBy: "leader",
    status: "completed",
    priority: "high",
    createdDaysAgo: 14,
    dueInDays: -5,
    updates: [
      { daysAgo: 12, author: "member", body: "All six templates rebuilt in the new mailer.", next: "Run both senders side by side for a week." },
      { daysAgo: 6.2, author: "member", body: "A week side by side with identical output; the old sender is switched off.", next: null },
    ],
    comments: [{ daysAgo: 7, author: "member2", body: "The side-by-side diff looks clean on my end too.", resolvedBy: "member" }],
    links: [{ url: `${GH}/pull/1270`, label: "PR #1270" }],
    completed: { daysAgo: 6, summary: "Dunning emails go out from the new mailer; the old sender is off.", approvedBy: "leader" },
  },
  {
    title: "Shut down the legacy billing VM",
    goal: "billing",
    assignees: ["member2"],
    createdBy: "admin",
    status: "completed",
    priority: "normal",
    createdDaysAgo: 7,
    dueInDays: -2,
    updates: [{ daysAgo: 3.2, author: "member2", body: "Final snapshot taken, DNS entry removed, VM powered off.", next: null }],
    completed: { daysAgo: 3, summary: "The old billing VM is off; its snapshot is archived for 90 days.", approvedBy: "leader" },
  },
  {
    title: "Fix the flaky sign-up integration test",
    goal: "onboarding",
    assignees: ["member"],
    createdBy: "member",
    status: "completed",
    priority: "normal",
    createdDaysAgo: 4,
    dueInDays: -1,
    updates: [{ daysAgo: 1.2, author: "member", body: "The root cause was a shared test user; each run now creates its own.", next: null }],
    links: [{ url: `${GH}/pull/1299`, label: "PR #1299" }],
    completed: { daysAgo: 1, summary: "Each run creates its own user; 50 consecutive green runs." },
  },
  {
    title: "Add p95 latency panels to the incident dashboard",
    goal: "incidents",
    assignees: ["member2"],
    createdBy: "member",
    status: "completed",
    priority: "normal",
    createdDaysAgo: 10,
    dueInDays: -4,
    updates: [
      { daysAgo: 8, author: "member2", body: "Panels for the five busiest endpoints are in.", next: "Split them by region." },
      { daysAgo: 5.1, author: "member2", body: "Region split added and shared in the incidents channel.", next: null },
    ],
    links: [{ url: `${GRAFANA}/incidents/latency?var-region=all`, label: "Incident latency dashboard" }],
    completed: { daysAgo: 5, summary: "The incident dashboard shows p95 per endpoint and per region." },
  },
  {
    title: "Onboard Sam to the on-call rotation",
    goal: "incidents",
    assignees: ["leader"],
    createdBy: "leader",
    status: "completed",
    priority: "low",
    createdDaysAgo: 16,
    dueInDays: -11,
    updates: [{ daysAgo: 12.1, author: "leader", body: "Shadow shift done; Sam carried the primary pager for a week.", next: null }],
    completed: { daysAgo: 12, summary: "Sam is on the rotation from next week." },
  },

  // --- proposals: every state --------------------------------------------------------------
  {
    key: "invoices",
    title: "Export invoices as CSV for finance",
    description: "Finance rebuilds the monthly invoice list by hand from the admin console. A monthly CSV of invoices would make month-end close an hour instead of two days.",
    assignees: [],
    createdBy: "stakeholder",
    status: "not_started",
    priority: "high",
    createdDaysAgo: 1,
    dueInDays: null,
    updates: [],
    proposal: { status: "pending", steps: [{ user: null }] },
  },
  {
    key: "sms",
    title: "Add appointment reminders by SMS",
    description: "Lumen's no-show rate is 18%. A reminder the day before should halve it.",
    goal: "lumen-intake",
    assignees: ["member2"],
    createdBy: "member2",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 2,
    dueInDays: 21,
    updates: [],
    proposal: { status: "pending", steps: [{ user: "leader" }, { user: "admin" }] },
  },
  {
    key: "spanish-intake",
    title: "Translate the intake form into Spanish",
    description: "A third of the pilot clinic's patients prefer Spanish.",
    goal: "lumen-intake",
    assignees: ["member2"],
    createdBy: "member2",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 3,
    dueInDays: 30,
    updates: [],
    proposal: { status: "pending", steps: [{ user: "leader", decision: "approved", by: "leader", daysAgo: 2 }, { user: "admin" }] },
  },
  {
    key: "rust",
    title: "Rewrite the reporting service in Rust",
    description: "Reports time out for our three largest customers. Reports that finish in under ten seconds would stop the escalations.",
    assignees: [],
    createdBy: "stakeholder",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 15,
    dueInDays: null,
    updates: [],
    proposal: { status: "declined", steps: [{ user: null, decision: "declined", by: "leader", daysAgo: 11, note: "A rewrite is too risky this quarter; the slow query is being indexed instead." }] },
  },
  {
    key: "history-card",
    title: "Show appointment history on the patient card",
    description: "Signed off by Morgan and Avery: a live task now.",
    goal: "lumen-intake",
    assignees: ["member2"],
    createdBy: "member2",
    status: "in_progress",
    priority: "normal",
    createdDaysAgo: 6,
    dueInDays: 15,
    updates: [{ daysAgo: 1, author: "member2", body: "Card layout done; pulling the last five visits from the API.", next: "Paginate past five and handle patients with none." }],
    proposal: {
      status: "approved",
      steps: [
        { user: "leader", decision: "approved", by: "leader", daysAgo: 5 },
        { user: "admin", decision: "approved", by: "admin", daysAgo: 4, note: "Go ahead." },
      ],
    },
  },
];

const DEMO_LOCAL_TASKS: SeedTask[] = [
  // --- local tasks (2026-11-06 log): Sam's alone until sent for sign-off; Lumen Health asks for it ---------------
  {
    key: "clinic-faq",
    title: "Draft the clinic FAQ page",
    description: "The front desk answers the same six questions by phone. A page on the intake site would cut the calls; Sam is gathering the questions before proposing it.",
    goal: "lumen-intake",
    assignees: ["member2"],
    createdBy: "member2",
    status: "not_started",
    priority: "normal",
    createdDaysAgo: 1,
    dueInDays: 12,
    updates: [],
    proposal: { status: "local", steps: [] },
  },
  {
    key: "feedback-form",
    title: "Set up the pilot feedback form",
    description: "One form the clinic staff fill in at the end of each week, so the pilot's problems are heard before the summary goes to Lumen.",
    project: "lumen",
    assignees: ["member2"],
    createdBy: "member2",
    status: "not_started",
    priority: "low",
    createdDaysAgo: 0.5,
    dueInDays: null,
    updates: [],
    proposal: { status: "local", steps: [] },
  },
];

const DEMO_NOTIFICATIONS: SeedNotification[] = [
  // Morgan: two approvals waiting, a blocker, a reply, a proposal to sign.
  { person: "leader", kind: "approval_requested", title: 'Jordan Dev asked you to approve "Invite teammates by link from onboarding"', task: "invite-links", daysAgo: 0.5, read: false },
  { person: "leader", kind: "approval_requested", title: 'Sam Dev asked you to approve "Clean up feature flags older than 90 days"', task: "flags", daysAgo: 1, read: false },
  { person: "leader", kind: "blocked", title: 'Jordan Dev is blocked on "Verify the sending domain for invitation emails"', body: "The production DNS change waits for IT's Thursday change window.", task: "sending-domain", daysAgo: 2, read: false },
  { person: "leader", kind: "commented", title: 'Jordan Dev commented on "Route pages to the secondary on-call after 10 minutes"', body: "Only the production switch; doing it once today's deploy freeze lifts.", task: "pager", daysAgo: 0.8, read: true },
  { person: "leader", kind: "proposal_waiting", title: "Proposal to sign off: Add appointment reminders by SMS", body: "Step 1 of 2.", task: "sms", daysAgo: 2, read: false },
  { person: "leader", kind: "proposal_waiting", title: "Proposal to sign off: Export invoices as CSV for finance", body: "Step 1 of 1.", task: "invoices", daysAgo: 1, read: false },
  // Avery: a proposal that reached their step.
  { person: "admin", kind: "proposal_waiting", title: "Proposal to sign off: Translate the intake form into Spanish", body: "Step 2 of 2.", task: "spanish-intake", daysAgo: 2, read: false },
  // Jordan: an assignment, comments, an approval decided.
  { person: "member", kind: "assigned", title: 'Morgan Lead assigned you "Show incident timestamps in the viewer\'s time zone"', task: "tz-timestamps", daysAgo: 3, read: true },
  { person: "member", kind: "commented", title: 'Morgan Lead commented on "Route pages to the secondary on-call after 10 minutes"', body: "This is past its due date. Anything I can take off your plate to get it switched on?", task: "pager", daysAgo: 1, read: false },
  { person: "member", kind: "commented", title: 'Avery Admin commented on "Invite teammates by link from onboarding"', body: "Lovely. The acceptance numbers look great.", task: "invite-links", daysAgo: 0.3, read: false },
  { person: "member", kind: "approval_decided", title: 'Morgan Lead approved "Move the dunning emails to the new mailer"', task: "dunning", daysAgo: 6, read: true },
  // Sam: a proposal approved.
  { person: "member2", kind: "proposal_decided", title: "Approved: Show appointment history on the patient card", body: "Go ahead.", task: "history-card", daysAgo: 4, read: true },
  // Taylor: a proposal declined.
  { person: "stakeholder", kind: "proposal_decided", title: "Declined: Rewrite the reporting service in Rust", body: "A rewrite is too risky this quarter; the slow query is being indexed instead.", task: "rust", daysAgo: 11, read: true },
];

export const DEMO: OrgSeed = {
  org: TEST_ORG,
  createdBy: "admin",
  members: [
    { person: "admin", role: "admin" },
    { person: "leader", role: "leader" },
    { person: "member", role: "member" },
    { person: "member2", role: "member" },
    { person: "stakeholder", role: "stakeholder" },
  ],
  joinedDaysAgo: 30,
  projects: DEMO_PROJECTS,
  goals: DEMO_GOALS,
  goalLinks: DEMO_GOAL_LINKS,
  tasks: [...DEMO_TASKS, ...DEMO_LOCAL_TASKS],
  notifications: DEMO_NOTIFICATIONS,
};

// --- Other Co: a separate tenant, to prove nothing crosses ----------------------------------

export const OTHER: OrgSeed = {
  org: OTHER_ORG,
  createdBy: "other",
  members: [
    { person: "other", role: "admin" },
    { person: "casey", role: "member" },
  ],
  joinedDaysAgo: 20,
  projects: [
    {
      key: "help-center",
      name: "Help center refresh",
      description: "Rewrite the top 20 articles and the reply macros.",
      owner: "other",
      createdBy: "other",
      status: "active",
      targetInDays: 30,
      createdDaysAgo: 18,
      approvers: ["other"],
    },
  ],
  goals: [
    {
      key: "support",
      project: "help-center",
      title: "Answer every support ticket within a day",
      description: "Customers wait up to three days for a first reply.",
      owner: "other",
      createdBy: "other",
      status: "active",
      targetInDays: 60,
      successCriteria: "95% of tickets get a first reply within 24 hours for a month.",
      createdDaysAgo: 18,
    },
  ],
  goalLinks: [],
  tasks: [
    {
      title: "Reply to the Acme escalation",
      goal: "support",
      assignees: ["casey"],
      createdBy: "other",
      status: "in_progress",
      priority: "high",
      createdDaysAgo: 3,
      dueInDays: 1,
      updates: [{ daysAgo: 1, author: "casey", body: "Drafted the reply with the full timeline.", next: "Send it after Riley reviews it." }],
    },
    { title: "Refresh the help-center reply macros", project: "help-center", assignees: ["other"], createdBy: "other", status: "not_started", priority: "normal", createdDaysAgo: 3, dueInDays: 7, updates: [] },
    {
      title: "Publish the holiday support hours",
      goal: "support",
      assignees: ["casey"],
      createdBy: "other",
      status: "completed",
      priority: "normal",
      createdDaysAgo: 5,
      dueInDays: -1,
      updates: [{ daysAgo: 2.1, author: "casey", body: "Hours posted on the help center and in the auto-reply.", next: null }],
      completed: { daysAgo: 2, summary: "Holiday hours are live on the help center and in the auto-reply." },
    },
    {
      title: "Phone support on weekends",
      description: "Enterprise customers ask for weekend cover: a phone line staffed on Saturdays and Sundays.",
      project: "help-center",
      assignees: [],
      createdBy: "casey",
      status: "not_started",
      priority: "normal",
      createdDaysAgo: 2,
      dueInDays: null,
      updates: [],
      proposal: { status: "pending", steps: [{ user: "other" }] },
    },
  ],
  notifications: [],
};
