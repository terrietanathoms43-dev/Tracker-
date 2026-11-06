import { CLOSED_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import type { ReportTask } from "./data";
import type { ReportRange } from "./range";

// The active reporting scope (docs/PLAN.md, 2026-11-06 log): "what this cycle was to work on". Every task whose
// status is not completed (rejected ones too), plus every task completed on or after the Since day (the range's
// first day: the day of the last report), grouped by status with the problems first and the completed work last.
// Pure, so the grouping and the counts are unit-tested; lib/reports/data.ts (`activeScopeTasks`) fetches the rows.

/** The groups in the order the view lists them: stuck, waiting on someone, moving, not started, dropped, then done. */
export const SCOPE_GROUPS = ["blocked", "awaiting_approval", "in_progress", "not_started", "rejected", "completed"] as const satisfies readonly TaskStatus[];
export type ScopeGroupStatus = (typeof SCOPE_GROUPS)[number];

export type ScopeGroup = {
  status: ScopeGroupStatus;
  label: string;
  tasks: ReportTask[];
};

export type ActiveScope = {
  range: ReportRange;
  /** Only the groups with anything in them, in SCOPE_GROUPS order. */
  groups: ScopeGroup[];
  total: number;
  /** Every status but completed, rejected ones too: the first half of the rule. */
  notCompleted: number;
  /** Open (neither completed nor rejected) and past its due date today. */
  overdue: number;
  blocked: number;
  /** Completed on or after the Since day. */
  completed: number;
  /** Created on or after the Since day: the work the cycle added, whatever its status now. */
  added: number;
};

/** Created on or after the Since day (the range's first day): new since the last report. */
export const addedInCycle = (task: Pick<ReportTask, "createdDay">, range: ReportRange): boolean => task.createdDay >= range.from;

const isOpenStatus = (status: TaskStatus) => !CLOSED_STATUSES.includes(status);

const UNDATED = "9999-12-31";
/** Soonest due first, undated last, then by title. */
const byDue = (a: ReportTask, b: ReportTask) => (a.dueDate ?? UNDATED).localeCompare(b.dueDate ?? UNDATED) || a.title.localeCompare(b.title);
/** Newest completion first, then by title. */
const byCompleted = (a: ReportTask, b: ReportTask) => (b.completedDay ?? "").localeCompare(a.completedDay ?? "") || a.title.localeCompare(b.title);

/** Groups the scope's rows (every one of them has a group) for the view and the CSV, and counts them. */
export function groupActiveScope(tasks: ReportTask[], range: ReportRange, today: string): ActiveScope {
  const groups = SCOPE_GROUPS.map(
    (status): ScopeGroup => ({
      status,
      label: TASK_STATUS_LABELS[status],
      tasks: tasks.filter((task) => task.status === status).sort(status === "completed" ? byCompleted : byDue),
    }),
  );
  const inScope = groups.flatMap((group) => group.tasks);
  const notCompleted = inScope.filter((task) => task.status !== "completed");
  return {
    range,
    groups: groups.filter((group) => group.tasks.length > 0),
    total: inScope.length,
    notCompleted: notCompleted.length,
    overdue: notCompleted.filter((task) => isOpenStatus(task.status) && task.dueDate !== null && task.dueDate < today).length,
    blocked: notCompleted.filter((task) => task.status === "blocked").length,
    completed: inScope.length - notCompleted.length,
    added: inScope.filter((task) => addedInCycle(task, range)).length,
  };
}
