import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskActivityKind, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { calendarDaysBetween, dayKey, formatAbsolute, formatDay } from "@/lib/time";
import type { ActivityFeedItem, HistoryItem } from "./types";

// Task events in plain words: one function for a task's own history, one for the Home and Team feeds.
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
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_image: string | null;
  before_assignee: string | null;
  after_assignee: string | null;
  approver_name: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const statusLabel = (value: unknown) => (typeof value === "string" && value in TASK_STATUS_LABELS ? TASK_STATUS_LABELS[value as TaskStatus] : null);
const priorityLabel = (value: unknown) => (typeof value === "string" && value in TASK_PRIORITY_LABELS ? TASK_PRIORITY_LABELS[value as TaskPriority] : null);
const dayOrNone = (value: unknown, today: string) => (typeof value === "string" && value !== "" ? formatDay(value, today) : "No date");

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

function activityPhrase(row: HistoryRow, today: string): { phrase: string; change: HistoryItem["change"] } {
  const before = row.before ?? {};
  const after = row.after ?? {};
  switch (row.kind) {
    case "created":
      return { phrase: "created the task", change: null };
    case "edited":
      return editedPhrase(before, after);
    case "status_changed":
      return { phrase: "changed the status", change: { before: statusLabel(before.status), after: statusLabel(after.status) } };
    case "assigned":
      return {
        phrase: row.after_assignee ? `assigned it to ${row.after_assignee}` : "unassigned it",
        change: row.before_assignee ? { before: row.before_assignee, after: row.after_assignee ?? "Unassigned" } : null,
      };
    case "handed_over":
      return { phrase: `handed it over to ${row.after_assignee ?? "someone"}`, change: null };
    case "due_changed":
      return { phrase: "changed the due date", change: { before: dayOrNone(before.dueDate, today), after: dayOrNone(after.dueDate, today) } };
    case "priority_changed":
      return { phrase: "changed the priority", change: { before: priorityLabel(before.priority), after: priorityLabel(after.priority) } };
    case "blocked":
      return { phrase: text(after.blockedBy) ? `marked it blocked (waiting on ${text(after.blockedBy)})` : "marked it blocked", change: null };
    case "unblocked":
      return { phrase: "unblocked it", change: null };
    case "approval_requested":
      return { phrase: `asked ${row.approver_name ?? "someone"} to approve it`, change: null };
    case "approved":
      return { phrase: "approved it", change: null };
    case "sent_back":
      return { phrase: "sent it back", change: null };
    case "rejected":
      return { phrase: "rejected it", change: null };
    case "completed":
      return { phrase: "completed it", change: null };
    case "reopened":
      return { phrase: "reopened it", change: { before: statusLabel(before.status), after: statusLabel(after.status) } };
    case "link_added":
      return { phrase: `added evidence: ${text(after.label) ?? text(after.url) ?? "a link"}`, change: null };
    case "link_removed":
      return { phrase: `removed evidence: ${text(before.label) ?? text(before.url) ?? "a link"}`, change: null };
    default:
      return { phrase: "updated it", change: null };
  }
}

/** "posted an update", "blocked it", before → after: one entry of a task's history, timed in `timeZone`. */
export function phraseHistory(row: HistoryRow, timeZone: string, now: Date): HistoryItem {
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
    row.type === "progress" ? { phrase: "posted an update", change: null } : row.type === "comment" ? { phrase: "commented", change: null } : activityPhrase(row, today);

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
    at: at.toISOString(),
    day,
    dayLabel,
    time: new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(at),
    absolute: formatAbsolute(at, timeZone),
  };
}

/** The activity kinds worth a line in the Home and Team feeds (docs/PLAN.md §8): decisions and problems, not edits. */
export const FEED_KINDS = ["completed", "blocked", "unblocked", "approved", "sent_back", "rejected", "due_changed", "reopened"] as const satisfies readonly TaskActivityKind[];
export type FeedKind = (typeof FEED_KINDS)[number];

const FEED_VERBS: Record<FeedKind, string> = {
  completed: "completed",
  blocked: "flagged a blocker on",
  unblocked: "unblocked",
  approved: "approved",
  sent_back: "sent back",
  rejected: "rejected",
  due_changed: "changed the due date of",
  reopened: "reopened",
};

/** One row of the feed query (lib/dal/activity.ts), before it is phrased. */
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

/** "Jordan Dev completed Fix nightly backup", with the reason or the date change as the note. */
export function phraseFeed(row: FeedRow, today: string): ActivityFeedItem {
  const verb = FEED_VERBS[row.kind];
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
