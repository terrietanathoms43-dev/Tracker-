// Shared string unions: the database enums (db/schema.ts), the zod schemas (actions/) and the UI labels
// all read the same lists, so a status can never exist in one place and not another.

export const APP_NAME = "Trackwise";
export const APP_TAGLINE = "Know what your team is doing, and what's next.";

// --- roles --------------------------------------------------------------------

export const ORG_ROLES = ["admin", "leader", "member", "stakeholder"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  leader: "Leader",
  member: "Member",
  stakeholder: "Stakeholder",
};

/** One line per role, for pickers and invitations. */
export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  admin: "Everything, plus members and workspace settings",
  leader: "Manages projects and goals, approves work and proposals",
  member: "Works on tasks, updates progress, proposes work",
  stakeholder: "Proposes tasks, follows them, and signs off goals",
};

// --- tasks --------------------------------------------------------------------

/**
 * The one set of task statuses, used everywhere: lists, the board, every form, the reports. Deferred and Cancelled
 * (2026-11-07 log) close a task without completing it, like Rejected: each asks for a reason, none is ever overdue.
 */
export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "awaiting_approval",
  "blocked",
  "deferred",
  "rejected",
  "cancelled",
  "merged",
  "completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  blocked: "Blocked",
  deferred: "Deferred",
  rejected: "Rejected",
  cancelled: "Cancelled",
  merged: "Merged",
  completed: "Completed",
};

/** The closed statuses: hidden from lists unless "Show closed" is on, never overdue, never on the board but Completed. */
export const CLOSED_STATUSES: readonly TaskStatus[] = ["completed", "rejected", "deferred", "cancelled", "merged"];

/**
 * Closed without being completed: each asks for a reason (kept in `tasks.rejection_reason`) and can be reopened.
 * Merged (sub-tasks, 2026-11-08 log) is only possible on a task attached to a parent: a duplicate folded into it.
 */
export const CLOSED_WITHOUT_COMPLETION: readonly TaskStatus[] = ["rejected", "deferred", "cancelled", "merged"];

export const isClosedStatus = (status: TaskStatus): boolean => CLOSED_STATUSES.includes(status);

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TASK_UPDATE_KINDS = ["progress", "comment"] as const;
export type TaskUpdateKind = (typeof TASK_UPDATE_KINDS)[number];

export const TASK_ACTIVITY_KINDS = [
  "created",
  "edited",
  "status_changed",
  "assigned",
  "handed_over",
  "due_changed",
  "priority_changed",
  "blocked",
  "unblocked",
  "approval_requested",
  "approved",
  "sent_back",
  "rejected",
  "deferred",
  "cancelled",
  "merged",
  "completed",
  "reopened",
  "progress_updated",
  "commented",
  "comment_resolved",
  "comment_reopened",
  "link_added",
  "link_removed",
  "proposal_signed",
  "proposal_approved",
  "proposal_declined",
  "proposal_resubmitted",
  "proposal_sent",
  "published",
  "attached",
  "detached",
] as const;
export type TaskActivityKind = (typeof TASK_ACTIVITY_KINDS)[number];

// --- proposals (docs/PLAN.md, 2026-11-03 log) ------------------------------------

/**
 * A task that needs sign-off before it is live: waiting, approved (live), or declined (back to the proposer). `local`
 * (2026-11-06 log) comes before all of those: a task made where sign-off applies stays its maker's alone, off the
 * main board, until they send it for sign-off (or publish it, once sign-off is switched off there).
 */
export const PROPOSAL_STATUSES = ["pending", "approved", "declined", "local"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Waiting for sign-off",
  approved: "Approved",
  declined: "Declined",
  local: "Local",
};

/** What one step of a sign-off chain can say. */
export const APPROVAL_DECISIONS = ["approved", "declined"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

// --- projects and goals ------------------------------------------------------

export const PROJECT_STATUSES = ["active", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const GOAL_STATUSES = ["active", "completed", "paused"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  completed: "Completed",
  paused: "Paused",
};

// --- notifications -----------------------------------------------------------

export const NOTIFICATION_KINDS = [
  "assigned",
  "handover",
  "approval_requested",
  "approval_decided",
  "blocked",
  "proposal_waiting",
  "proposal_decided",
  "commented",
  "comment_resolved",
  "goal_achieved",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// --- app-wide values -----------------------------------------------------------

export const DEFAULT_TIMEZONE = "America/Jamaica";

/** Cookie holding the active workspace id (validated against membership on every request). */
export const ORG_COOKIE = "trackwise.org";

/** Cookie holding the person's /home tab order, hidden tabs and landing tab (written client-side). */
export const HOME_TABS_COOKIE = "trackwise.homeTabs";

/** Cookie holding the project every work screen is narrowed to ("" = all projects; written client-side). */
export const PROJECT_SCOPE_COOKIE = "trackwise.project";

export const INVITE_TTL_DAYS = 7;

/** "Recently finished" and the board's Completed column look back this far. */
export const RECENTLY_FINISHED_DAYS = 14;

/** Tasks due within this many days count as "due soon" in attention lists. */
export const DUE_SOON_DAYS = 2;
