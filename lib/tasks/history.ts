import { TASK_PRIORITY_LABELS, type TaskActivityKind, type TaskPriority } from "@/lib/constants";
import { factoryWorded, statusLabel, statusOf, type StatusCatalog } from "@/lib/statuses";
import { calendarDaysBetween, dayKey, formatAbsolute, formatDay } from "@/lib/time";
import { joinNames, listNames, type AssignmentSnapshot } from "./assignees";
import { DUE_CHANGE_LABELS, type DueChangeKind } from "./due-change";
import type { ActivityFeedItem, HistoryItem } from "./types";

// Task events in plain words: one function for a task's own history, one for the Home and Members feeds.
// Pure, so the wording can change without touching a query.

/** One row of the merged history query (lib/dal/history.ts), before it is phrased. */
export type HistoryRow = {
  type: "progress" | "comment" | "activity";
  id: string;
  created_at: Date | string;
  kind: TaskActivityKind | null;
  body: string | null;
  next_action: string | null;
  blocker: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  /** Comments: when it was marked resolved, and by whom. */
  resolved_at: Date | string | null;
  resolved_by_name: string | null;
  /** Comments: the live tasks made from it, oldest first (null when there are none, and on every other row). */
  linked?: { id: string; title: string; status: string }[] | null;
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_image: string | null;
  before_assignee: string | null;
  after_assignee: string | null;
  approver_name: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const storedLabel = (statuses: StatusCatalog, value: unknown) => {
  if (typeof value !== "string" || value === "") return null;
  // Deferred was a status until 2026-11-24: history rows from then still name it.
  if (value === "deferred") return "Deferred";
  return statusLabel(statuses, value);
};

type NamedKind = "blocked" | "rejected" | "cancelled" | "completed";

/** The verbs for the statuses with their own history kinds, while each keeps its factory name. */
const NAMED_VERBS: Record<NamedKind, { phrase: string; verb: string }> = {
  blocked: { phrase: "marked it blocked", verb: "flagged a blocker on" },
  rejected: { phrase: "rejected it", verb: "rejected" },
  cancelled: { phrase: "cancelled it", verb: "cancelled" },
  completed: { phrase: "completed it", verb: "completed" },
};

/** The status a named activity entered — the row's own `after.status`, else the built-in the kind is named for. */
const enteredStatus = (statuses: StatusCatalog, kind: NamedKind, after: Record<string, unknown> | null) => statusOf(statuses, text(after?.status) ?? kind);

/** "completed it", or "marked it Complete JA" once the workspace renamed Completed: history speaks the workspace's words. */
function namedPhrase(statuses: StatusCatalog, kind: NamedKind, after: Record<string, unknown>): string {
  const status = enteredStatus(statuses, kind, after);
  return status === undefined || factoryWorded(status) ? NAMED_VERBS[kind].phrase : `marked it ${status.label}`;
}
const priorityLabel = (value: unknown) => (typeof value === "string" && value in TASK_PRIORITY_LABELS ? TASK_PRIORITY_LABELS[value as TaskPriority] : null);
const dayOrNone = (value: unknown, today: string) => (typeof value === "string" && value !== "" ? formatDay(value, today) : "No date");

/** The dates of a due-date change row, before → after. */
const dueChange = (before: Record<string, unknown>, after: Record<string, unknown>, today: string) => ({ before: dayOrNone(before.dueDate, today), after: dayOrNone(after.dueDate, today) });
/** "approved a date change: " in front of what the change did, on the row an admin wrote for someone else's request. */
const approvedPrefix = (after: Record<string, unknown>) => (after.approved === true ? "approved a date change: " : "");
/** " (Deferred)": what a requested or declined change would have been. */
const dueChangeName = (kind: unknown) => (typeof kind === "string" && kind in DUE_CHANGE_LABELS ? ` (${DUE_CHANGE_LABELS[kind as DueChangeKind].toLowerCase()})` : "");

/** The names on one side of an assignment row written since assignment became a set; null for a legacy row. */
function assignmentNames(side: Record<string, unknown>): string[] | null {
  if (!Array.isArray(side.assignees) && !Array.isArray(side.teams)) return null;
  return listNames(side as Partial<AssignmentSnapshot>);
}

/** "assigned it to Jordan Dev and Sam Dev", "changed who it's assigned to" (before → after), "unassigned it". */
function assignedPhrase(row: HistoryRow, before: Record<string, unknown>, after: Record<string, unknown>): { phrase: string; change: HistoryItem["change"] } {
  const to = assignmentNames(after);
  const from = assignmentNames(before);
  if (to === null && from === null) {
    // A row from before assignment became a set: one person on each side.
    return {
      phrase: row.after_assignee ? `assigned it to ${row.after_assignee}` : "unassigned it",
      change: row.before_assignee ? { before: row.before_assignee, after: row.after_assignee ?? "Unassigned" } : null,
    };
  }
  const was = from ?? [];
  const now = to ?? [];
  if (now.length === 0) return { phrase: "unassigned it", change: was.length > 0 ? { before: joinNames(was), after: "Unassigned" } : null };
  if (was.length === 0) return { phrase: `assigned it to ${joinNames(now)}`, change: null };
  return { phrase: "changed who it's assigned to", change: { before: joinNames(was), after: joinNames(now) } };
}

function editedPhrase(before: Record<string, unknown>, after: Record<string, unknown>): { phrase: string; change: HistoryItem["change"] } {
  const field = Object.keys(after)[0] ?? Object.keys(before)[0] ?? "details";
  switch (field) {
    case "title":
      return { phrase: "renamed it", change: { before: text(before.title), after: text(after.title) } };
    case "description":
      return { phrase: "edited the description", change: null };
    case "projectId":
      return { phrase: text(after.projectName) ? `moved it to ${text(after.projectName)}` : "took it out of its project", change: null };
    case "goalId":
      return { phrase: text(after.goalTitle) ? `linked it to the goal ${text(after.goalTitle)}` : "unlinked its goal", change: null };
    default:
      return { phrase: "edited it", change: null };
  }
}

function activityPhrase(row: HistoryRow, today: string, statuses: StatusCatalog): { phrase: string; change: HistoryItem["change"] } {
  const before = row.before ?? {};
  const after = row.after ?? {};
  switch (row.kind) {
    case "created":
      return { phrase: after.local === true ? "created it as a local task" : after.proposal === true ? "proposed the task" : text(after.fromCommentId) ? "made the task from a comment" : "created the task", change: null };
    case "edited":
      return editedPhrase(before, after);
    case "status_changed":
      return { phrase: "changed the status", change: { before: storedLabel(statuses, before.status), after: storedLabel(statuses, after.status) } };
    case "assigned":
      return assignedPhrase(row, before, after);
    case "handed_over": {
      const to = assignmentNames(after);
      return { phrase: `handed it over to ${to ? joinNames(to) || "someone" : (row.after_assignee ?? "someone")}`, change: null };
    }
    // Due-date changes (2026-11-24 log): named for what they do, with the reason as the row's note. A row an admin
    // wrote for someone else's request says it was approved.
    case "due_changed":
      return { phrase: `${approvedPrefix(after)}changed the due date`, change: dueChange(before, after, today) };
    case "scheduled":
      return { phrase: `${approvedPrefix(after)}scheduled it`, change: dueChange(before, after, today) };
    case "brought_forward":
      return { phrase: `${approvedPrefix(after)}brought the deadline forward`, change: dueChange(before, after, today) };
    case "due_removed":
      return { phrase: `${approvedPrefix(after)}removed the due date`, change: dueChange(before, after, today) };
    case "due_change_requested":
      return { phrase: `asked for a date change${dueChangeName(after.change)}`, change: dueChange(before, after, today) };
    case "due_change_declined":
      return { phrase: after.withdrawn === true ? "withdrew the date change" : `declined the date change${dueChangeName(after.change)}`, change: dueChange(before, after, today) };
    case "priority_changed":
      return { phrase: "changed the priority", change: { before: priorityLabel(before.priority), after: priorityLabel(after.priority) } };
    case "blocked": {
      const phrase = namedPhrase(statuses, "blocked", after);
      return { phrase: text(after.blockedBy) ? `${phrase} (waiting on ${text(after.blockedBy)})` : phrase, change: null };
    }
    case "unblocked":
      return { phrase: "unblocked it", change: null };
    case "approval_requested":
      return { phrase: `asked ${row.approver_name ?? "someone"} to approve it`, change: null };
    case "approved":
      return { phrase: "approved it", change: null };
    case "sent_back":
      return { phrase: "sent it back", change: null };
    case "rejected":
      return { phrase: namedPhrase(statuses, row.kind, after), change: null };
    // A deadline moved later to a future date. Until 2026-11-24 Deferred was a status: those rows carry no dates.
    case "deferred":
      return { phrase: `${approvedPrefix(after)}deferred it`, change: "dueDate" in after ? dueChange(before, after, today) : null };
    case "cancelled":
      return { phrase: namedPhrase(statuses, row.kind, after), change: null };
    case "merged":
      return { phrase: text(after.parentTitle) ? `merged it into ${text(after.parentTitle)}` : "merged it into its parent", change: null };
    case "attached":
      return { phrase: text(after.parentTitle) ? `attached it to ${text(after.parentTitle)}` : "attached it to a task", change: null };
    case "detached":
      return { phrase: text(before.parentTitle) ? `detached it from ${text(before.parentTitle)}` : "detached it from its parent", change: null };
    case "grouped": {
      const name = text(after.groupName);
      const mates = Array.isArray(after.with) ? after.with.filter((title): title is string => typeof title === "string" && title !== "") : [];
      const more = typeof after.size === "number" ? Math.max(0, after.size - 1 - mates.length) : 0;
      const withWhom = mates.length > 0 ? ` with ${joinNames(more > 0 ? [...mates, `${more} more`] : mates)}` : "";
      return { phrase: name ? `put it in the group ${name}${withWhom}` : `grouped it${withWhom}`, change: null };
    }
    case "ungrouped":
      return { phrase: text(before.groupName) ? `took it out of the group ${text(before.groupName)}` : "took it out of its group", change: null };
    case "completed":
      return { phrase: namedPhrase(statuses, "completed", after), change: null };
    case "reopened":
      return { phrase: "reopened it", change: { before: storedLabel(statuses, before.status), after: storedLabel(statuses, after.status) } };
    // A comment resolved or opened again by the task made from it (2026-11-11 log): the note names that task.
    case "comment_resolved":
      return { phrase: text(after.byTaskId) ? "resolved a comment by closing the task made from it" : "resolved a comment", change: null };
    case "comment_reopened":
      return { phrase: text(after.byTaskId) ? "opened a comment again by reopening the task made from it" : "reopened a comment", change: null };
    case "link_added":
      return { phrase: `added evidence: ${text(after.label) ?? text(after.url) ?? "a link"}`, change: null };
    case "link_removed":
      return { phrase: `removed evidence: ${text(before.label) ?? text(before.url) ?? "a link"}`, change: null };
    case "proposal_signed":
      return { phrase: text(after.step) ? `signed off step ${text(after.step)} of the proposal` : "signed off the proposal", change: null };
    case "proposal_approved":
      return { phrase: "approved the proposal: it is now a live task", change: null };
    case "proposal_declined":
      return { phrase: "declined the proposal", change: null };
    case "proposal_resubmitted":
      return { phrase: "sent the proposal for sign-off again", change: null };
    case "proposal_sent":
      return { phrase: "sent it for sign-off", change: null };
    case "published":
      return { phrase: "published it: it is a live task now", change: null };
    default:
      return { phrase: "updated it", change: null };
  }
}

/** "posted an update", "blocked it", before → after: one entry of a task's history, timed in `timeZone`. */
export function phraseHistory(row: HistoryRow, timeZone: string, now: Date, statuses: StatusCatalog): HistoryItem {
  const at = new Date(row.created_at);
  const day = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  const daysAgo = calendarDaysBetween(day, today);
  const dayLabel =
    daysAgo === 0
      ? "Today"
      : daysAgo === 1
        ? "Yesterday"
        : new Intl.DateTimeFormat("en", { timeZone, weekday: "short", month: "short", day: "numeric", ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) }).format(at);
  const { phrase, change } =
    row.type === "progress" ? { phrase: "posted an update", change: null } : row.type === "comment" ? { phrase: "commented", change: null } : activityPhrase(row, today, statuses);

  return {
    id: row.id,
    type: row.type === "activity" ? (row.kind ?? "edited") : row.type,
    actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email, image: row.actor_image },
    phrase,
    change,
    note: row.note,
    body: row.body,
    nextAction: row.next_action,
    blocker: row.blocker,
    resolved: row.type === "comment" && row.resolved_at ? { by: row.resolved_by_name ?? "someone", at: new Date(row.resolved_at).toISOString() } : null,
    tasks: row.type === "comment" ? (row.linked ?? []) : [],
    at: at.toISOString(),
    day,
    dayLabel,
    time: new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(at),
    absolute: formatAbsolute(at, timeZone),
  };
}

/** The activity kinds worth a line in the Home and Members feeds (docs/PLAN.md §8): decisions and problems, not edits. */
export const FEED_KINDS = ["completed", "blocked", "unblocked", "approved", "sent_back", "rejected", "due_changed", "reopened", "proposal_approved", "proposal_declined"] as const satisfies readonly TaskActivityKind[];
export type FeedKind = (typeof FEED_KINDS)[number];

const FEED_VERBS: Record<Exclude<FeedKind, NamedKind>, string> = {
  unblocked: "unblocked",
  approved: "approved",
  sent_back: "sent back",
  due_changed: "changed the due date of",
  reopened: "reopened",
  proposal_approved: "approved the proposal",
  proposal_declined: "declined the proposal",
};

/** One row of the feed query (lib/dal/tasks.ts recentActivity), before it is phrased. */
export type FeedRow = {
  id: string;
  kind: FeedKind;
  note: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
  taskId: string;
  taskTitle: string;
  actor: { id: string; name: string | null; email: string | null; image: string | null };
};

/** The feed's verb: "completed", or "marked Complete JA" once the workspace renamed the status. */
function feedVerb(row: FeedRow, statuses: StatusCatalog): string {
  if (row.kind !== "completed" && row.kind !== "blocked" && row.kind !== "rejected") return FEED_VERBS[row.kind];
  const status = enteredStatus(statuses, row.kind, row.after);
  return status === undefined || factoryWorded(status) ? NAMED_VERBS[row.kind].verb : `marked ${status.label}:`;
}

/** "Jordan Dev completed Fix nightly backup", with the reason or the date change as the note. */
export function phraseFeed(row: FeedRow, today: string, statuses: StatusCatalog): ActivityFeedItem {
  const verb = feedVerb(row, statuses);
  const actorName = row.actor.name ?? row.actor.email ?? "Someone";
  const note =
    row.kind === "due_changed"
      ? `${dayOrNone(row.before?.dueDate, today)} → ${dayOrNone(row.after?.dueDate, today)}`
      : row.note;
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actor,
    verb,
    task: { id: row.taskId, title: row.taskTitle },
    href: `/tasks/${row.taskId}`,
    summary: `${actorName} ${verb} ${row.taskTitle}`,
    note,
    at: row.createdAt.toISOString(),
  };
}
