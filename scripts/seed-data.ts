/**
 * The demo content behind test mode (scripts/test-accounts.ts turns it into rows). Pure data, no I/O.
 *
 * Every time is "days ago" (or "due in days") relative to the moment of seeding, so the dashboards always look
 * alive: in Trackwise Demo two tasks are overdue, two await Morgan's approval, three are blocked, six finished in
 * the last two weeks, two were rejected, two are unassigned, two have two people on them, one goal has a sub-goal
 * with a task of its own, two tasks carry open comments (so they can't be completed until those are resolved), and
 * the six requests cover every state.
 *
 * How a task spec becomes rows (taskRows in test-accounts.ts):
 *   - `updates` are progress updates, oldest first; the newest one's body / next action is copied onto the task
 *     (latest_progress / next_action). `comments` are kind=comment and never touch those columns; one marked
 *     `resolved` has resolved_at / resolved_by set.
 *   - A task with a `project` takes its goal from that project (goal_id stays empty); `goal` links a task to a goal
 *     directly, without a project. Goal progress counts both paths, and a sub-goal's tasks count for its parent too.
 *   - `blocked`, `approval`, `completed` and `rejection` describe how the task reached its current status, and
 *     produce the matching task_activity rows (blocked, approval_requested, approved + completed, rejected).
 */
import type { OrgRole, RequestStatus, RequestUrgency, TaskPriority, TaskStatus } from "@/lib/constants";
import { OTHER_ORG, TEST_EMAIL_DOMAIN, TEST_ORG, TEST_PERSONAS, type TestPersona } from "@/lib/test-mode";

// --- people ---------------------------------------------------------------------

/** The sign-in personas plus Casey, a member of Other Co who never signs in (a second person for that tenant). */
export type Person = TestPersona | "casey";

export const PEOPLE: Record<Person, { email: string; name: string }> = {
  ...TEST_PERSONAS,
  casey: { email: `casey${TEST_EMAIL_DOMAIN}`, name: "Casey Other" },
};

// --- shapes ---------------------------------------------------------------------

export type SeedGoal = {
  key: string;
  title: string;
  description: string;
  owner: Person;
  /** The goal this one is a sub-goal of, by key (one level). Its target must not pass the parent's. */
  parent?: string;
  createdBy: Person;
  status: "active" | "achieved" | "paused";
  targetInDays: number;
  successCriteria: string;
  createdDaysAgo: number;
  /** When the status last changed (achieved / paused); defaults to createdDaysAgo. */
  updatedDaysAgo?: number;
};

export type SeedProject = {
  key: string;
  goal: string | null;
  name: string;
  description: string;
  owner: Person;
  createdBy: Person;
  status: "active" | "completed" | "archived";
  targetInDays: number | null;
  createdDaysAgo: number;
  /** When the status last changed (completed / archived); defaults to createdDaysAgo. */
  updatedDaysAgo?: number;
};

export type SeedDecision = { decision: "approved" | "deferred" | "rejected" | "converted" | "reopened"; by: Person; daysAgo: number; reason: string };

export type SeedRequest = {
  key: string;
  title: string;
  description: string;
  desiredOutcome: string;
  urgency: RequestUrgency;
  link?: string;
  requester: Person;
  status: RequestStatus;
  createdDaysAgo: number;
  /** Oldest first. The request row mirrors the newest one (a reopened request is back to "new" and undecided). */
  decisions: SeedDecision[];
  deferInDays?: number;
};

export type SeedUpdate = { daysAgo: number; author: Person; body: string; next: string | null; blocker?: string };

export type SeedComment = { daysAgo: number; author: Person; body: string; /** Marked resolved by `resolvedBy` a little after it was written. */ resolvedBy?: Person };

export type SeedTask = {
  /** Only for tasks something else points at (a request, a notification). */
  key?: string;
  title: string;
  description?: string;
  project?: string;
  goal?: string;
  /** The request this task was converted from (the request's converted_task_id points back). */
  request?: string;
  /** The people on it (any number; empty = unassigned). */
  assignees: Person[];
  createdBy: Person;
  status: TaskStatus;
  priority: TaskPriority;
  createdDaysAgo: number;
  dueInDays: number | null;
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
};

export type SeedNotification = {
  person: Person;
  kind: "assigned" | "handover" | "approval_requested" | "approval_decided" | "blocked" | "request_decided" | "commented";
  title: string;
  body?: string;
  task?: string;
  request?: string;
  daysAgo: number;
  read: boolean;
};

export type OrgSeed = {
  org: { name: string; slug: string; timezone: string };
  createdBy: Person;
  members: { person: Person; role: OrgRole }[];
  joinedDaysAgo: number;
  goals: SeedGoal[];
  projects: SeedProject[];
  requests: SeedRequest[];
  tasks: SeedTask[];
  notifications: SeedNotification[];
};

const GH = "https://github.com/trackwise-demo/app";
const GRAFANA = "https://grafana.example.com/d";

// --- Trackwise Demo ------------------------------------------------------------------

const DEMO_GOALS: SeedGoal[] = [
  {
    key: "onboarding",
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
    key: "incidents",
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
    key: "billing",
    title: "Retire the legacy billing jobs",
    description: "The nightly cron jobs on the old VM build invoices and dunning emails, fail silently, and nobody owns the box.",
    owner: "member2",
    createdBy: "leader",
    status: "achieved",
    targetInDays: -2,
    successCriteria: "Every billing job runs on the queue workers with alerts, and the old VM is shut down.",
    createdDaysAgo: 30,
    updatedDaysAgo: 2.5,
  },
];

const DEMO_PROJECTS: SeedProject[] = [
  {
    key: "onboarding",
    goal: "onboarding",
    name: "Onboarding flow",
    description: "Sign-up, workspace setup, invitations and the first-task checklist.",
    owner: "leader",
    createdBy: "leader",
    status: "active",
    targetInDays: 30,
    createdDaysAgo: 27,
  },
  {
    key: "incidents",
    goal: "incidents",
    name: "Incident tooling",
    description: "Paging, runbooks, dashboards and the incident timeline.",
    owner: "member",
    createdBy: "leader",
    status: "active",
    targetInDays: 50,
    createdDaysAgo: 26,
  },
  {
    key: "billing",
    goal: "billing",
    name: "Billing jobs migration",
    description: "Move the invoice, dunning and usage-export jobs off the old cron VM onto the queue workers.",
    owner: "member2",
    createdBy: "leader",
    status: "completed",
    targetInDays: -2,
    createdDaysAgo: 29,
    updatedDaysAgo: 2.5,
  },
];

const DEMO_REQUESTS: SeedRequest[] = [
  {
    key: "invoices",
    title: "Export invoices as CSV for finance",
    description: "Finance rebuilds the monthly invoice list by hand from the admin console.",
    desiredOutcome: "A monthly CSV of invoices, so month-end close takes an hour instead of two days.",
    urgency: "high",
    requester: "stakeholder",
    status: "new",
    createdDaysAgo: 1,
    decisions: [],
  },
  {
    key: "timezones",
    title: "Show incident start times in our time zone",
    description: "The incident timeline and the digest email show UTC. On the last two calls we argued about when things started.",
    desiredOutcome: "Every time on an incident shows in the reader's own time zone.",
    urgency: "high",
    link: "https://status.example.com/incidents/2291",
    requester: "stakeholder",
    status: "converted",
    createdDaysAgo: 4,
    decisions: [
      { decision: "approved", by: "leader", daysAgo: 3.2, reason: "Confusing times slowed the last two incident calls; worth fixing now." },
      { decision: "converted", by: "leader", daysAgo: 3, reason: "Jordan is taking it this week." },
    ],
  },
  {
    key: "sso",
    title: "Single sign-on for the admin console",
    description: "Security asked that staff stop sharing passwords for the console.",
    desiredOutcome: "Console access through our Okta tenant.",
    urgency: "normal",
    requester: "admin",
    status: "approved",
    createdDaysAgo: 6,
    decisions: [{ decision: "approved", by: "leader", daysAgo: 2, reason: "Security needs it; planned for the sprint after onboarding ships." }],
  },
  {
    key: "status-dark",
    title: "Dark mode for the public status page",
    description: "A few customers asked for it on the community forum.",
    desiredOutcome: "The status page follows the visitor's system theme.",
    urgency: "low",
    requester: "member",
    status: "deferred",
    createdDaysAgo: 12,
    decisions: [{ decision: "deferred", by: "leader", daysAgo: 8, reason: "Nice to have; revisit after the incident work." }],
    deferInDays: 21,
  },
  {
    key: "rust",
    title: "Rewrite the reporting service in Rust",
    description: "Reports time out for our three largest customers.",
    desiredOutcome: "Reports that finish in under ten seconds.",
    urgency: "normal",
    requester: "member2",
    status: "rejected",
    createdDaysAgo: 15,
    decisions: [{ decision: "rejected", by: "leader", daysAgo: 11, reason: "A rewrite is too risky this quarter; the slow query is being indexed instead." }],
  },
  {
    key: "bulk-invite",
    title: "Bulk-invite teammates from a CSV",
    description: "Larger customers want to invite a whole department at once instead of one email at a time.",
    desiredOutcome: "Upload a CSV of emails and roles from the workspace settings.",
    urgency: "normal",
    requester: "admin",
    status: "new",
    createdDaysAgo: 14,
    decisions: [
      { decision: "deferred", by: "leader", daysAgo: 10, reason: "After the invite-link work lands." },
      { decision: "reopened", by: "leader", daysAgo: 1, reason: "Invite links are live and a 200-seat customer is asking for this now." },
    ],
  },
];

const DEMO_TASKS: SeedTask[] = [
  // --- in progress (two of them overdue) -------------------------------------------
  {
    key: "tz-timestamps",
    title: "Show incident timestamps in the viewer's time zone",
    description: "From Taylor's request: the timeline, the incident header and the digest email all print UTC.",
    project: "incidents",
    request: "timezones",
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
    project: "onboarding",
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
    project: "incidents",
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
    project: "onboarding",
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
    updates: [
      { daysAgo: 1, author: "member", body: "Runbook links added to the 12 API alerts; the database alerts still have none.", next: "Add links to the 7 database alerts and lint the alert rules in CI." },
    ],
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
    updates: [
      { daysAgo: 1, author: "leader", body: "New credentials are in the vault; three of five services switched.", next: "Switch the worker and the cron service, then revoke the old user." },
    ],
  },
  {
    title: "Draft the incident review template",
    goal: "incidents",
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
  { title: "Evaluate a hosted status page provider", goal: "incidents", assignees: [], createdBy: "leader", status: "not_started", priority: "normal", createdDaysAgo: 1, dueInDays: null, updates: [] },
  { title: "Translate the invitation email into Spanish", project: "onboarding", assignees: [], createdBy: "admin", status: "not_started", priority: "low", createdDaysAgo: 2, dueInDays: 12, updates: [] },

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
      {
        daysAgo: 2,
        author: "member",
        body: "Production DNS change requested.",
        next: "Verify the domain once the records are live.",
        blocker: "The production DNS change waits for IT's Thursday change window.",
      },
    ],
    blocked: { daysAgo: 2, reason: "The production DNS change waits for IT's Thursday change window.", by: "IT (DNS change request #5521)" },
  },
  {
    title: "Upgrade the paging integration to the v2 API",
    project: "incidents",
    assignees: ["member2"],
    createdBy: "leader",
    status: "blocked",
    priority: "normal",
    createdDaysAgo: 14,
    dueInDays: 20,
    updates: [
      { daysAgo: 12, author: "member2", body: "Client library updated; staging webhooks verified.", next: "Migrate the production webhook." },
      {
        daysAgo: 5,
        author: "member2",
        body: "The production migration fails: the v2 API rejects our account's legacy token.",
        next: "Apply the vendor's new token and retry.",
        blocker: "Vendor support case #88213 is open.",
      },
    ],
    comments: [{ daysAgo: 4, author: "leader", body: "I've escalated the vendor case with our account manager." }],
    links: [{ url: "https://support.example.com/cases/88213", label: "Vendor case #88213" }],
    blocked: { daysAgo: 5, reason: "Vendor support case #88213: the v2 API rejects our account's legacy token.", by: "Vendor support" },
  },
  {
    title: "Send a welcome email after workspace creation",
    project: "onboarding",
    assignees: ["member"],
    createdBy: "member",
    status: "blocked",
    priority: "high",
    createdDaysAgo: 8,
    dueInDays: 3,
    updates: [
      {
        daysAgo: 1.5,
        author: "member",
        body: "Template written and reviewed by Morgan.",
        next: "Trigger it from the workspace-created event.",
        blocker: "Needs the verified sending domain first.",
      },
    ],
    blocked: { daysAgo: 1.5, reason: "Needs the verified sending domain before anything can be sent.", by: "Jordan (sending domain task)" },
  },

  // --- awaiting Morgan's approval -------------------------------------------------------
  {
    key: "invite-links",
    title: "Invite teammates by link from onboarding",
    project: "onboarding",
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
    project: "incidents",
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
    project: "billing",
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
    project: "billing",
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
    project: "billing",
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
    project: "billing",
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
    project: "onboarding",
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
    project: "incidents",
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
];

const DEMO_NOTIFICATIONS: SeedNotification[] = [
  // Morgan: two approvals waiting, a blocker, a reply.
  { person: "leader", kind: "approval_requested", title: 'Jordan Dev asked you to approve "Invite teammates by link from onboarding"', task: "invite-links", daysAgo: 0.5, read: false },
  { person: "leader", kind: "approval_requested", title: 'Sam Dev asked you to approve "Clean up feature flags older than 90 days"', task: "flags", daysAgo: 1, read: false },
  {
    person: "leader",
    kind: "blocked",
    title: 'Jordan Dev is blocked on "Verify the sending domain for invitation emails"',
    body: "The production DNS change waits for IT's Thursday change window.",
    task: "sending-domain",
    daysAgo: 2,
    read: false,
  },
  {
    person: "leader",
    kind: "commented",
    title: 'Jordan Dev commented on "Route pages to the secondary on-call after 10 minutes"',
    body: "Only the production switch; doing it once today's deploy freeze lifts.",
    task: "pager",
    daysAgo: 0.8,
    read: true,
  },
  // Jordan: an assignment, comments, an approval decided.
  { person: "member", kind: "assigned", title: 'Morgan Lead assigned you "Show incident timestamps in the viewer\'s time zone"', task: "tz-timestamps", daysAgo: 3, read: true },
  {
    person: "member",
    kind: "commented",
    title: 'Morgan Lead commented on "Route pages to the secondary on-call after 10 minutes"',
    body: "This is past its due date. Anything I can take off your plate to get it switched on?",
    task: "pager",
    daysAgo: 1,
    read: false,
  },
  {
    person: "member",
    kind: "commented",
    title: 'Avery Admin commented on "Invite teammates by link from onboarding"',
    body: "Lovely. The acceptance numbers look great.",
    task: "invite-links",
    daysAgo: 0.3,
    read: false,
  },
  { person: "member", kind: "approval_decided", title: 'Morgan Lead approved "Move the dunning emails to the new mailer"', task: "dunning", daysAgo: 6, read: true },
  // Taylor: their request became a task.
  {
    person: "stakeholder",
    kind: "request_decided",
    title: 'Your request "Show incident start times in our time zone" is now a task',
    body: "Jordan is taking it this week.",
    request: "timezones",
    daysAgo: 3,
    read: true,
  },
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
  goals: DEMO_GOALS,
  projects: DEMO_PROJECTS,
  requests: DEMO_REQUESTS,
  tasks: DEMO_TASKS,
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
  goals: [
    {
      key: "support",
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
  projects: [
    {
      key: "help-center",
      goal: "support",
      name: "Help center refresh",
      description: "Rewrite the top 20 articles and the reply macros.",
      owner: "other",
      createdBy: "other",
      status: "active",
      targetInDays: 30,
      createdDaysAgo: 18,
    },
  ],
  requests: [
    {
      key: "weekends",
      title: "Phone support on weekends",
      description: "Enterprise customers ask for weekend cover.",
      desiredOutcome: "A phone line staffed on Saturdays and Sundays.",
      urgency: "normal",
      requester: "casey",
      status: "new",
      createdDaysAgo: 2,
      decisions: [],
    },
  ],
  tasks: [
    {
      title: "Reply to the Acme escalation",
      project: "help-center",
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
      project: "help-center",
      assignees: ["casey"],
      createdBy: "other",
      status: "completed",
      priority: "normal",
      createdDaysAgo: 5,
      dueInDays: -1,
      updates: [{ daysAgo: 2.1, author: "casey", body: "Hours posted on the help center and in the auto-reply.", next: null }],
      completed: { daysAgo: 2, summary: "Holiday hours are live on the help center and in the auto-reply." },
    },
  ],
  notifications: [],
};
