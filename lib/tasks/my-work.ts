import { DUE_SOON_DAYS, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { calendarDaysBetween } from "@/lib/time";
import type { TaskListItem } from "./types";

// My Work grouping (docs/PLAN.md §5) as a pure function, so it is unit-tested without a database.
// A task appears in exactly one group. Precedence: Needs attention (I must act now) → Waiting on others
// (someone else must act) → Continue working → Recently finished.

export type MyWorkRow = {
  item: TaskListItem;
  approverId: string | null;
  /** Assigned to the viewer, directly or through one of their teams. */
  mine: boolean;
  sortRank: number;
  completedAt: Date | null;
  /** In progress because an approver sent it back (its latest status event). */
  sentBack: boolean;
};

export type MyWorkGroups = {
  attention: TaskListItem[];
  continueWorking: TaskListItem[];
  waiting: TaskListItem[];
  finished: TaskListItem[];
};

/** The reason chips Needs attention can show, most pressing first. */
export const ATTENTION_REASONS = ["Your approval", "Sent back", "Blocked", "Overdue", "Due soon"] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const OPEN: ReadonlySet<TaskStatus> = new Set(["not_started", "in_progress", "awaiting_approval", "blocked"]);

function daysUntilDue(item: TaskListItem, today: string): number | null {
  return item.dueDate ? calendarDaysBetween(today, item.dueDate) : null;
}

/** The "smart" order: overdue → due soonest → urgent first → manual rank → most recently updated. */
export function smartCompare(today: string) {
  return (a: MyWorkRow, b: MyWorkRow): number => {
    const dueA = daysUntilDue(a.item, today);
    const dueB = daysUntilDue(b.item, today);
    const overdueA = dueA !== null && dueA < 0 ? 0 : 1;
    const overdueB = dueB !== null && dueB < 0 ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    if ((dueA ?? Infinity) !== (dueB ?? Infinity)) return (dueA ?? Infinity) - (dueB ?? Infinity);
    if (PRIORITY_RANK[a.item.priority] !== PRIORITY_RANK[b.item.priority]) return PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority];
    if (a.sortRank !== b.sortRank) return b.sortRank - a.sortRank;
    return b.item.updatedAt.localeCompare(a.item.updatedAt);
  };
}

/** Why a task needs the viewer now, or null when it doesn't. */
export function attentionReason(row: MyWorkRow, viewerId: string, today: string): AttentionReason | null {
  const { item } = row;
  if (item.status === "awaiting_approval" && row.approverId === viewerId) return "Your approval";
  if (!row.mine || !OPEN.has(item.status)) return null;
  if (row.sentBack) return "Sent back";
  // My own task waiting for someone else's approval is theirs to act on, whatever its date.
  if (item.status === "awaiting_approval") return null;
  const days = daysUntilDue(item, today);
  // Blocked work with a far-off (or no) date waits on others; blocked work that is due now is still mine to chase.
  if (item.status === "blocked") return days !== null && days <= DUE_SOON_DAYS ? "Blocked" : null;
  if (days !== null && days < 0) return "Overdue";
  if (days !== null && days <= DUE_SOON_DAYS) return "Due soon";
  return null;
}

/** Sorts the viewer's tasks into the four My Work groups; attention items carry their reason chip. */
export function groupMyWork(rows: MyWorkRow[], viewerId: string, today: string): MyWorkGroups {
  const sorted = [...rows].sort(smartCompare(today));
  const groups: MyWorkGroups = { attention: [], continueWorking: [], waiting: [], finished: [] };
  const finished: MyWorkRow[] = [];
  for (const row of sorted) {
    const { mine } = row;
    const reason = attentionReason(row, viewerId, today);
    if (reason !== null) groups.attention.push({ ...row.item, reason });
    else if (mine && (row.item.status === "awaiting_approval" || row.item.status === "blocked")) groups.waiting.push(row.item);
    else if (mine && (row.item.status === "in_progress" || row.item.status === "not_started")) groups.continueWorking.push(row.item);
    else if (mine && row.item.status === "completed") finished.push(row);
  }
  groups.finished = finished.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)).map((row) => row.item);
  return groups;
}

/** "Pick up where you left off": what the viewer can act on, in order (Needs attention, then Continue working). */
export function resumeOrder(groups: MyWorkGroups): TaskListItem[] {
  return [...groups.attention, ...groups.continueWorking];
}
