import "server-only";
import { GuardError } from "@/lib/action-result";
import { activeGoalProgress, type GoalProgress } from "@/lib/dal/team";
import { canSeeReports, type Viewer } from "@/lib/permissions";
import { contributionsTable, deliveredTable, openTable, toCsv } from "./csv";
import { blockedOrOverdue, contributionCounts, deliveredTasks, openCommitments, progressUpdateCount, type ContributionRow, type ReportTask } from "./data";
import type { ReportTable } from "./params";
import type { ReportRange } from "./range";

// Assembles the report the page shows and the CSV files the export route sends, from lib/reports/data.ts.
// Both check the same access rule, so the export can never show more than the page.

export type ReportSummary = {
  delivered: number;
  /** Open tasks due inside the range (not counting older overdue work). */
  openDueInRange: number;
  blocked: number;
  overdue: number;
  progressUpdates: number;
};

export type Report = {
  range: ReportRange;
  summary: ReportSummary;
  delivered: ReportTask[];
  open: ReportTask[];
  blockedOverdue: ReportTask[];
  contributions: ContributionRow[];
  goals: GoalProgress[];
  /** Tasks under each goal completed in the range, by goal id. */
  goalsDeliveredInRange: Record<string, number>;
};

/** Reports are for the people who do the work (PLAN §3): stakeholders are refused here as well as by the page. */
function assertCanSeeReports(viewer: Viewer): void {
  if (!canSeeReports(viewer)) throw new GuardError("forbidden");
}

/** Everything /reports prints for a range. Blocked and overdue are as of `today`, whatever the range. */
export async function buildReport(viewer: Viewer, range: ReportRange, today: string): Promise<Report> {
  assertCanSeeReports(viewer);
  const [delivered, open, blockedOverdue, contributions, goals, progressUpdates] = await Promise.all([
    deliveredTasks(viewer, range),
    openCommitments(viewer, range, today),
    blockedOrOverdue(viewer, today),
    contributionCounts(viewer, range),
    activeGoalProgress(viewer),
    progressUpdateCount(viewer, range),
  ]);
  const goalsDeliveredInRange: Record<string, number> = {};
  for (const task of delivered) {
    if (task.goalId) goalsDeliveredInRange[task.goalId] = (goalsDeliveredInRange[task.goalId] ?? 0) + 1;
  }
  const dueInRange = (task: ReportTask) => task.dueDate !== null && task.dueDate >= range.from && task.dueDate <= range.to;
  return {
    range,
    summary: {
      delivered: delivered.length,
      openDueInRange: open.filter(dueInRange).length,
      blocked: blockedOverdue.filter((task) => task.status === "blocked").length,
      overdue: blockedOverdue.filter((task) => task.dueDate !== null && task.dueDate < today).length,
      progressUpdates,
    },
    delivered,
    open,
    blockedOverdue,
    contributions,
    goals,
    goalsDeliveredInRange,
  };
}

/** One of the report's tables as a CSV file, reading only the rows that table needs. */
export async function buildCsv(viewer: Viewer, table: ReportTable, range: ReportRange, today: string): Promise<string> {
  assertCanSeeReports(viewer);
  switch (table) {
    case "delivered":
      return toCsv(deliveredTable(await deliveredTasks(viewer, range)));
    case "open":
      return toCsv(openTable(await openCommitments(viewer, range, today), today));
    case "contributions":
      return toCsv(contributionsTable(await contributionCounts(viewer, range)));
  }
}
