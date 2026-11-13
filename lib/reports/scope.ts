import { statusDef, type StatusCatalog, type TaskStatusDef } from "@/lib/statuses";
import type { ReportTask } from "./data";
import type { ReportRange } from "./range";

// The active reporting scope (docs/PLAN.md, 2026-11-06 and 2026-11-07 logs): "what this cycle was to work on". Every
// task still open, plus every task closed on or after the Since day (the range's first day: the day of the last
// report), whether it was completed or closed without completing (rejected, deferred, cancelled). Grouped by status
// with the problems first, the closed-without-completing groups next and the completed work last. Pure, so the
// grouping and the counts are unit-tested; lib/reports/data.ts (`activeScopeTasks`) fetches the rows.

/** The groups' order in the view: stuck, waiting on someone, moving, other open work, parked/dropped, then done. */
const groupRank = (status: TaskStatusDef): number => {
  switch (status.kind) {
    case "blocked":
      return 0;
    case "awaiting_approval":
      return 1;
    case "in_progress":
      return 2;
    case "completed":
      return 5;
    default:
      return status.closed ? 4 : 3;
  }
};

export type ScopeGroup = {
  status: string;
  label: string;
  tasks: ReportTask[];
};

export type ActiveScope = {
  range: ReportRange;
  /** Only the groups with anything in them, in SCOPE_GROUPS order. */
  groups: ScopeGroup[];
  total: number;
  /** Everything in scope that is not completed: the open work, and what was closed without completing since the Since day. */
  notCompleted: number;
  /** Open (not closed) and past its due date today. */
  overdue: number;
  blocked: number;
  /** Completed on or after the Since day. */
  completed: number;
  /** Created on or after the Since day: the work the cycle added, whatever its status now. */
  added: number;
};

/** Created on or after the Since day (the range's first day): new since the last report. */
export const addedInCycle = (task: Pick<ReportTask, "createdDay">, range: ReportRange): boolean => task.createdDay >= range.from;

const isOpenStatus = (catalog: StatusCatalog, key: string) => !statusDef(catalog, key).closed;

const UNDATED = "9999-12-31";
/** Soonest due first, undated last, then by title. */
const byDue = (a: ReportTask, b: ReportTask) => (a.dueDate ?? UNDATED).localeCompare(b.dueDate ?? UNDATED) || a.title.localeCompare(b.title);
/** Newest closing first, then by title. */
const byClosed = (a: ReportTask, b: ReportTask) => (b.closedDay ?? "").localeCompare(a.closedDay ?? "") || a.title.localeCompare(b.title);

/** Groups the scope's rows (every one of them has a group) for the view and the CSV, and counts them. */
export function groupActiveScope(tasks: ReportTask[], range: ReportRange, today: string, catalog: StatusCatalog): ActiveScope {
  const groups = catalog
    .map((status): ScopeGroup => ({
      status: status.key,
      label: status.label,
      tasks: tasks.filter((task) => task.status === status.key).sort(!status.closed ? byDue : byClosed),
    }))
    .sort((a, b) => groupRank(statusDef(catalog, a.status)) - groupRank(statusDef(catalog, b.status)));
  const inScope = groups.flatMap((group) => group.tasks);
  const notCompleted = inScope.filter((task) => task.status !== "completed");
  return {
    range,
    groups: groups.filter((group) => group.tasks.length > 0),
    total: inScope.length,
    notCompleted: notCompleted.length,
    overdue: notCompleted.filter((task) => isOpenStatus(catalog, task.status) && task.dueDate !== null && task.dueDate < today).length,
    blocked: notCompleted.filter((task) => task.status === "blocked").length,
    completed: inScope.length - notCompleted.length,
    added: inScope.filter((task) => addedInCycle(task, range)).length,
  };
}
