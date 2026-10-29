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
  leader: "Manages projects and goals, approves work, decides requests",
  member: "Works on tasks, updates progress, submits requests",
  stakeholder: "Submits requests and follows what happens to them",
};

// --- tasks --------------------------------------------------------------------

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "awaiting_approval",
  "blocked",
  "rejected",
  "completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  blocked: "Blocked",
  rejected: "Rejected",
  completed: "Completed",
};

/** Completed and rejected: hidden from lists unless "Show closed" is on. */
export const CLOSED_STATUSES: readonly TaskStatus[] = ["completed", "rejected"];

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
  "completed",
  "reopened",
  "progress_updated",
  "commented",
  "link_added",
  "link_removed",
] as const;
export type TaskActivityKind = (typeof TASK_ACTIVITY_KINDS)[number];

// --- projects and goals ------------------------------------------------------

export const PROJECT_STATUSES = ["active", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const GOAL_STATUSES = ["active", "achieved", "paused"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  paused: "Paused",
};

// --- requests -----------------------------------------------------------------

export const REQUEST_URGENCIES = ["low", "normal", "high", "critical"] as const;
export type RequestUrgency = (typeof REQUEST_URGENCIES)[number];

export const REQUEST_URGENCY_LABELS: Record<RequestUrgency, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export const REQUEST_STATUSES = ["new", "approved", "deferred", "rejected", "converted"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  approved: "Approved",
  deferred: "Deferred",
  rejected: "Rejected",
  converted: "Converted to a task",
};

export const REQUEST_DECISIONS = ["approved", "deferred", "rejected", "converted", "reopened"] as const;
export type RequestDecision = (typeof REQUEST_DECISIONS)[number];

// --- notifications -----------------------------------------------------------

export const NOTIFICATION_KINDS = [
  "assigned",
  "handover",
  "approval_requested",
  "approval_decided",
  "blocked",
  "request_decided",
  "commented",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// --- app-wide values -----------------------------------------------------------

export const DEFAULT_TIMEZONE = "America/Jamaica";

/** Cookie holding the active workspace id (validated against membership on every request). */
export const ORG_COOKIE = "trackwise.org";

/** Cookie holding the person's /home tab order, hidden tabs and landing tab (written client-side). */
export const HOME_TABS_COOKIE = "trackwise.homeTabs";

export const INVITE_TTL_DAYS = 7;

/** "Recently finished" and the board's Completed column look back this far. */
export const RECENTLY_FINISHED_DAYS = 14;

/** Tasks due within this many days count as "due soon" in attention lists. */
export const DUE_SOON_DAYS = 2;
