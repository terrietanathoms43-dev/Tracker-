import "server-only";
import { GuardError } from "@/lib/action-result";
import { activeGoalProgress, type GoalProgress } from "@/lib/dal/dashboard";
import { canSeeReports, type Viewer } from "@/lib/permissions";
import { contributionsTable, deliveredTable, openTable, scopeTable, toCsv } from "./csv";
import {
  activeScopeTasks,
  blockedDurationStats,
  blockedOrOverdue,
  contributionCounts,
  deliveredTasks,
  openCommitments,
  pendingDecisions,
  progressUpdateCount,
  projectAndGoalHealth,
  reportPace,
  reportProject,
  reportTimeline,
  stalledTasks,
  type BlockedDurationStats,
  type ContributionRow,
  type HealthBoard,
  type PendingDecisions,
  type ReportProjectOption,
  type ReportTask,
  type TimelineDay,
} from "./data";
import type { Pace } from "./pace";
import type { ReportProject, ReportTable } from "./params";
import { timelineWindow, type ReportRange } from "./range";
import { listItemsByIds } from "@/lib/dal/tasks";
import type { TaskListItem } from "@/lib/tasks/types";
import { groupActiveScope, type ActiveScope } from "./scope";

// Assembles the report the page shows and the CSV files the export route sends, from lib/reports/data.ts.
// Both check the same access rule, so the export can never show more than the page.

export type ReportSummary = {
  delivered: number;
  /** Open tasks due inside the range (not counting older overdue work). */
  openDueInRange: number;
  blocked: number;
  overdue: number;
  progressUpdates: number;
  /** Goals and projects the health board judges anything but on track (delayed, at risk, needs attention). */
  problems: number;
  /** The scope's work as a whole is behind the pace its target date needs. */
  behindPace: boolean;
  /** Approvals and proposals waiting for someone to decide. */
  decisions: number;
  /** In progress, but untouched for a week or more. */
  stalled: number;
  /** Workers with nothing open at all. */
  idlePeople: number;
};

/** Which project the report is about: the navigation's scope (docs/PLAN.md, 2026-11-03 log). */
export type ReportScope = {
  project: ReportProject;
  /** The chosen project, when `project` names one this workspace has. */
  chosen: ReportProjectOption | null;
};

export type Report = {
  range: ReportRange;
  /** The days the chart draws: the range plus the look-ahead. */
  window: ReportRange;
  scope: ReportScope;
  summary: ReportSummary;
  delivered: ReportTask[];
  open: ReportTask[];
  blockedOverdue: ReportTask[];
  stalled: ReportTask[];
  /** Is the scope's work as a whole on pace for its target date? */
  pace: Pace;
  contributions: ContributionRow[];
  goals: GoalProgress[];
  /** Tasks under each goal completed in the range, by goal id. */
  goalsDeliveredInRange: Record<string, number>;
  timeline: TimelineDay[];
  healthBoard: HealthBoard;
  blockedDuration: BlockedDurationStats;
  decisions: PendingDecisions;
};

/** Reports are for the people who do the work (PLAN §3): stakeholders are refused here as well as by the page. */
function assertCanSeeReports(viewer: Viewer): void {
  if (!canSeeReports(viewer)) throw new GuardError("forbidden");
}

/**
 * Everything /reports prints for a range and a project. Blocked and overdue are as of `today`, whatever the range.
 * `includeLocal` (the My work view) draws the viewer's own local tasks in the activity widget; nothing else counts them.
 */
export async function buildReport(viewer: Viewer, range: ReportRange, today: string, project: ReportProject, options: { includeLocal?: boolean } = {}): Promise<Report> {
  assertCanSeeReports(viewer);
  // Two waves rather than one: the sections fan out into twenty-odd queries, and a pool of ten against a database
  // that may be waking up should not have them all racing for a connection at once.
  const [delivered, open, blockedOverdue, goals, progressUpdates, blockedDuration, chosen] = await Promise.all([
    deliveredTasks(viewer, range, project),
    openCommitments(viewer, range, today, project),
    blockedOrOverdue(viewer, today, project),
    activeGoalProgress(viewer, 20, project === "none" ? "" : project),
    progressUpdateCount(viewer, range, project),
    blockedDurationStats(viewer, project),
    reportProject(viewer, project),
  ]);
  const [contributions, healthBoard, timeline, decisions, stalled, pace] = await Promise.all([
    contributionCounts(viewer, range, today, project),
    projectAndGoalHealth(viewer, today, project),
    reportTimeline(viewer, range, today, project, { includeLocal: options.includeLocal === true }),
    pendingDecisions(viewer, project),
    stalledTasks(viewer, project),
    reportPace(viewer, today, project),
  ]);
  const goalsDeliveredInRange: Record<string, number> = {};
  for (const task of delivered) {
    if (task.goalId) goalsDeliveredInRange[task.goalId] = (goalsDeliveredInRange[task.goalId] ?? 0) + 1;
  }
  const dueInRange = (task: ReportTask) => task.dueDate !== null && task.dueDate >= range.from && task.dueDate <= range.to;
  return {
    range,
    window: timelineWindow(range, today),
    scope: { project, chosen },
    summary: {
      delivered: delivered.length,
      openDueInRange: open.filter(dueInRange).length,
      blocked: blockedOverdue.filter((task) => task.status === "blocked").length,
      overdue: blockedOverdue.filter((task) => task.dueDate !== null && task.dueDate < today).length,
      progressUpdates,
      // "All clear" has to mean it: every verdict short of on track counts, not just the worst two.
      problems: [...healthBoard.goals, ...healthBoard.projects].filter((row) => row.health !== "on_track").length,
      behindPace: pace.verdict === "behind",
      decisions: decisions.approvals.length + decisions.proposals.length,
      stalled: stalled.length,
      idlePeople: contributions.filter((row) => row.open === 0).length,
    },
    delivered,
    open,
    blockedOverdue,
    stalled,
    pace,
    contributions,
    goals,
    goalsDeliveredInRange,
    timeline,
    healthBoard,
    blockedDuration,
    decisions,
  };
}

/**
 * The Active scope view (docs/PLAN.md, 2026-11-06 and 2026-11-07 logs): every live task still open, plus what was
 * closed on or after the Since day, grouped by status (lib/reports/scope.ts), with the standard list row for each
 * (`items`), so the view draws the same rows as every other list. The same access rule as the rest of the report.
 */
export async function buildActiveScope(viewer: Viewer, range: ReportRange, today: string, project: ReportProject): Promise<{ scope: ReportScope; active: ActiveScope; items: Map<string, TaskListItem> }> {
  assertCanSeeReports(viewer);
  const [rows, chosen] = await Promise.all([activeScopeTasks(viewer, range, project), reportProject(viewer, project)]);
  const items = await listItemsByIds(
    viewer,
    rows.map((row) => row.id),
  );
  return { scope: { project, chosen }, active: groupActiveScope(rows, range, today), items };
}

/** One of the report's tables as a CSV file, reading only the rows that table needs. */
export async function buildCsv(viewer: Viewer, table: ReportTable, range: ReportRange, today: string, project: ReportProject): Promise<string> {
  assertCanSeeReports(viewer);
  switch (table) {
    case "delivered":
      return toCsv(deliveredTable(await deliveredTasks(viewer, range, project)));
    case "open":
      return toCsv(openTable(await openCommitments(viewer, range, today, project), today));
    case "contributions":
      return toCsv(contributionsTable(await contributionCounts(viewer, range, today, project)));
    case "scope":
      return toCsv(scopeTable(groupActiveScope(await activeScopeTasks(viewer, range, project), range, today)));
  }
}
