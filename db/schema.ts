import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  APPROVAL_DECISIONS,
  DEFAULT_TIMEZONE,
  GOAL_STATUSES,
  ORG_ROLES,
  PROJECT_STATUSES,
  PROPOSAL_STATUSES,
  TASK_ACTIVITY_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_UPDATE_KINDS,
} from "@/lib/constants";
import type { Recurrence } from "@/lib/recurrence";

// The whole Trackwise schema (docs/PLAN.md §4), applied with `npm run db:push`. The 2026-11-03 overhaul (the
// rigid workspace → projects → goals → tasks funnel, proposals, repeats, goal links) was applied with
// `npm run db:migrate-hierarchy` first, which moves existing rows into the new shape before `db:push` adds the rest.
// Conventions: text UUID ids, timestamptz created on the server, calendar days as "YYYY-MM-DD" strings,
// enums from lib/constants.ts, every workspace-scoped table carries org_id.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });

// --- enums ------------------------------------------------------------------

export const orgRoleEnum = pgEnum("org_role", ORG_ROLES);
export const goalStatusEnum = pgEnum("goal_status", GOAL_STATUSES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const taskUpdateKindEnum = pgEnum("task_update_kind", TASK_UPDATE_KINDS);
export const taskActivityKindEnum = pgEnum("task_activity_kind", TASK_ACTIVITY_KINDS);
export const proposalStatusEnum = pgEnum("proposal_status", PROPOSAL_STATUSES);
export const approvalDecisionEnum = pgEnum("approval_decision", APPROVAL_DECISIONS);

// --- Better Auth (the core fields its Drizzle adapter expects, plus our timezone) ---------------------
// Property names must match Better Auth's field names (emailVerified, expiresAt, userId, …); the column
// names underneath follow the rest of the schema's snake_case.

export const users = pgTable("users", {
  id: id(),
  /** Never empty: lib/auth.ts fills it from the email's local part when a provider sends none. */
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Overrides the workspace's timezone when set. */
  timezone: text("timezone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** The credential in the signed cookie; one row per signed-in browser. */
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tstz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** A sign-in method linked to a user: Google today; a password column exists because the core schema has one. */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/** Pending magic-link and verification tokens. */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Better Auth's rate limiter (`rateLimit.storage: "database"` in lib/auth.ts): one counter per client IP and auth path. */
export const rateLimit = pgTable("rate_limit", {
  id: id(),
  /** Client IP plus the auth path, built and written by Better Auth. */
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  /** Unix milliseconds of the request that opened the current window. */
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Drizzle relations for the auth tables (the `relations()` API of drizzle-orm 0.45; `defineRelations` is 1.x).
// They make `db.query.users.findFirst({ with: { sessions: true } })` possible and let Better Auth use native joins
// if `advanced.database.joins` is ever turned on. Nothing depends on them today. The rate-limit table has no foreign
// key, so it has no relations.
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// --- workspaces (organizations) -----------------------------------------------

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default(DEFAULT_TIMEZONE),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    joinedAt: tstz("joined_at").notNull().defaultNow(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("organization_members_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Always stored lowercased. */
    email: text("email").notNull(),
    role: orgRoleEnum("role").notNull().default("member"),
    /** sha256 (hex) of the 32-byte token in the link; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: tstz("expires_at").notNull(),
    acceptedAt: tstz("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

// --- projects → goals → tasks (docs/PLAN.md, 2026-11-03 log) -------------------------------------------------
// A project is the top of the funnel; every goal belongs to exactly one project; a task may belong to a goal (and
// then to that goal's project), to a project alone, or to nothing at all.

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: projectStatusEnum("status").notNull().default("active"),
    targetDate: day("target_date"),
    /** New tasks in this project wait for the sign-off chain in approval_steps (unless the creator is in approval_bypass). */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_status_idx").on(t.orgId, t.status)],
);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The project the goal belongs to; a sub-goal is always in its parent's project. */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * The goal this one is a sub-goal of (one level: a sub-goal never has sub-goals of its own, docs/PLAN.md
     * 2026-10-30 log). A sub-goal's target date can never be later than its parent's.
     */
    parentGoalId: text("parent_goal_id").references((): AnyPgColumn => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    targetDate: day("target_date"),
    successCriteria: text("success_criteria"),
    status: goalStatusEnum("status").notNull().default("active"),
    /** How often the goal comes round (lib/recurrence.ts); completing it makes the next one, tasks included. */
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    /** Every occurrence of a repeating goal shares the first one's id. */
    seriesId: text("series_id"),
    /** New tasks under this goal wait for the chain in approval_steps; overrides the project's rule. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    completedAt: tstz("completed_at"),
    completedBy: text("completed_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("goals_org_status_idx").on(t.orgId, t.status),
    index("goals_org_project_idx").on(t.orgId, t.projectId),
    index("goals_parent_idx").on(t.parentGoalId),
    index("goals_series_idx").on(t.seriesId),
  ],
);

/** "From leads into to": the branch view's arrows between goals (docs/PLAN.md, 2026-11-03 log). Never a cycle. */
export const goalLinks = pgTable(
  "goal_links",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fromGoalId: text("from_goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    toGoalId: text("to_goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.fromGoalId, t.toGoalId] }), index("goal_links_to_idx").on(t.toGoalId), index("goal_links_org_idx").on(t.orgId)],
);

/** The projects a person pinned to the top of their project pickers, in their own order, per workspace. */
export const projectPins = pgTable(
  "project_pins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] }), index("project_pins_user_org_idx").on(t.userId, t.orgId)],
);

/** A person's running notes in a workspace: the Draft tab and the floating notepad (2026-11-04 log). */
export const drafts = pgTable(
  "drafts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

/**
 * The sign-off chain of a project or a goal (exactly one of the two is set), in order. A step with no user means
 * "any leader or admin". A goal's chain, when the goal requires approval, overrides its project's.
 */
export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("approval_steps_project_idx").on(t.projectId), index("approval_steps_goal_idx").on(t.goalId)],
);

/** People whose new tasks in a project or goal go live at once, chain or no chain. */
export const approvalBypass = pgTable(
  "approval_bypass",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("approval_bypass_project_idx").on(t.projectId), index("approval_bypass_goal_idx").on(t.goalId)],
);

// --- tasks ----------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** When set, project_id is that goal's project (actions keep the two in step). */
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    approverId: text("approver_id").references(() => users.id, { onDelete: "set null" }),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    dueDate: day("due_date"),
    /** "HH:MM" in the workspace's day, when a time matters ("every day at 8:00 AM"). */
    dueTime: text("due_time"),
    /** How often the task comes round (lib/recurrence.ts); completing it makes the next occurrence. */
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    /** Every occurrence of a repeating task shares the first one's id. */
    seriesId: text("series_id"),
    /** The goal's "Everything completed" task (2026-11-04 log): completing it, last, marks the goal achieved. */
    goalCloser: boolean("goal_closer").notNull().default(false),
    /** Null for a task that was live from the start; otherwise where its sign-off stands (task_approvals has the chain). */
    proposalStatus: proposalStatusEnum("proposal_status"),
    startedAt: tstz("started_at"),
    completedAt: tstz("completed_at"),
    blockedReason: text("blocked_reason"),
    /** Who or what could unblock it (free text). */
    blockedBy: text("blocked_by"),
    /** Why it was closed without being completed: rejected, deferred or cancelled (2026-11-07 log). */
    rejectionReason: text("rejection_reason"),
    /** Denormalised from the newest progress update so lists never join history. */
    latestProgress: text("latest_progress"),
    nextAction: text("next_action"),
    completionSummary: text("completion_summary"),
    /** Manual importance; higher sorts first within the smart order. */
    sortRank: doublePrecision("sort_rank").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_org_status_idx").on(t.orgId, t.status),
    index("tasks_org_project_idx").on(t.orgId, t.projectId),
    index("tasks_org_goal_idx").on(t.orgId, t.goalId),
    index("tasks_org_due_idx").on(t.orgId, t.dueDate),
    index("tasks_org_proposal_idx").on(t.orgId, t.proposalStatus),
    index("tasks_series_idx").on(t.seriesId),
  ],
);

/** The people a task is assigned to (any number; equals, no owner). */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: tstz("assigned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

/**
 * A proposal's sign-off chain, one row per step in order, copied from the project's or goal's chain when the task
 * was proposed. `decision` is null while the step waits; the first undecided step is the one that is up.
 */
export const taskApprovals = pgTable(
  "task_approvals",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** The first person the step names (older rows; user_ids has them all); null means any leader or admin. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Everyone the step names, any one of whom signs it (2026-11-04 log); null on rows written before groups. */
    userIds: text("user_ids").array(),
    decision: approvalDecisionEnum("decision"),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("task_approvals_task_idx").on(t.taskId, t.position)],
);

/** Append-only (a comment's resolved_at / resolved_by are the one thing that changes): progress updates (the Resume history) and comments share one timeline. */
export const taskUpdates = pgTable(
  "task_updates",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    kind: taskUpdateKindEnum("kind").notNull().default("progress"),
    /** Progress: what got done. Comment: the comment. */
    body: text("body").notNull(),
    /** Progress only; null on the update that completes a task. */
    nextAction: text("next_action"),
    blocker: text("blocker"),
    /** Comments only: when and by whom it was marked resolved. A task can't be completed while a comment is open. */
    resolvedAt: tstz("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("task_updates_task_idx").on(t.taskId, t.createdAt.desc())],
);

/** Evidence: links to commits, tickets, documents, dashboards. */
export const taskLinks = pgTable(
  "task_links",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("task_links_task_idx").on(t.taskId)],
);

/** Append-only audit trail: who changed what, when. Never updated or deleted. */
export const taskActivity = pgTable(
  "task_activity",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    kind: taskActivityKindEnum("kind").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt.desc()), index("task_activity_org_idx").on(t.orgId, t.createdAt.desc())],
);

// --- notifications ----------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** App path the notification opens. */
    href: text("href").notNull(),
    readAt: tstz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_read_idx").on(t.userId, t.readAt)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailAssignment: boolean("email_assignment").notNull().default(true),
  emailApproval: boolean("email_approval").notNull().default(true),
  emailHandover: boolean("email_handover").notNull().default(true),
  /** Leaders: a task was marked blocked. */
  emailBlocked: boolean("email_blocked").notNull().default(true),
  /** A proposal waits for my sign-off, or mine was decided. */
  emailProposal: boolean("email_proposal").notNull().default(true),
  emailComment: boolean("email_comment").notNull().default(false),
});

// --- row types ----------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalLink = typeof goalLinks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskApproval = typeof taskApprovals.$inferSelect;
export type TaskUpdate = typeof taskUpdates.$inferSelect;
export type TaskLink = typeof taskLinks.$inferSelect;
export type TaskActivity = typeof taskActivity.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
