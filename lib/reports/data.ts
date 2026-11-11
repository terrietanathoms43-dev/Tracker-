import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { goals, projects, taskActivity, taskAssignees, tasks, taskUpdates } from "@/db/schema";
import { CLOSED_STATUSES, CLOSED_WITHOUT_COMPLETION, type ProjectStatus, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { pendingProposals, type ProposalListItem } from "@/lib/dal/approvals";
import { listWorkers } from "@/lib/dal/orgs";
import { approvalStagingTasks, assigneesJson, liveOnly, localOnly, progressForGoals, progressForProjects, taskLabelSql, type ApprovalStagingTask } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import type { Assignees } from "@/lib/tasks/types";
import { calendarDaysBetween, dayKey } from "@/lib/time";
import { healthOf, sortByHealth, type HealthStatus } from "./health";
import { isBehindPace, paceOf, STALLED_AFTER_DAYS, type Pace } from "./pace";
import type { ReportProject } from "./params";
import { daysOf, shiftDay, timelineWindow, type ReportRange } from "./range";

// The rows behind /reports and its CSV exports. Every query is scoped to viewer.orgId in SQL and every number a
// report prints is a count of these rows: nothing is estimated, weighted or ranked. Callers check access first
// (lib/reports/build.ts). A report is about live tasks only (proposals still waiting are not work yet; a local task
// is nobody's but its maker's) and may be about one project (`project`: an id, or "" for the whole workspace, the
// navigation's scope); every section narrows the same way, so its numbers always agree. The one exception is the
// activity widget on the My work view, which also draws the viewer's own local tasks (2026-11-06 log). The Active
// scope view's list (`activeScopeTasks`) takes every task not completed whatever the range, and only the range's
// first day bounds the completed ones.

/** A task as a report prints it. `completedDay` is the calendar day it was completed on, in the viewer's timezone. */
export type ReportTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: Assignees;
  dueDate: string | null;
  completedDay: string | null;
  /** The day it was closed, in the viewer's timezone: completed, or rejected / deferred / cancelled (from the history row that closed it). */
  closedDay: string | null;
  /** The calendar day it was created on, in the viewer's timezone: the Active scope view marks what a cycle added. */
  createdDay: string;
  /** When anything last changed on it (an ISO instant): a stalled task is one where that was a week or more ago. */
  updatedAt: string;
  completionSummary: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
  rejectionReason: string | null;
  /** The goal it serves. */
  goalId: string | null;
  goalTitle: string | null;
  project: { id: string; name: string } | null;
  evidence: { url: string; label: string | null }[];
};

/**
 * One worker, negative first: what is overdue or blocked on them now, what they have open at all (idle when
 * nothing), then what they completed in the range. Counts only: the report never compares people.
 */
export type ContributionRow = {
  person: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  /** Open tasks assigned to them that are past their due date today. */
  overdue: number;
  /** Tasks assigned to them that are blocked now. */
  blocked: number;
  /** Open tasks assigned to them now; zero means idle. */
  open: number;
  completed: number;
  deltaCompleted?: number;
};

/** A goal's deadline on the chart, coloured by the goal's health so an at-risk deadline stands out. */
export type TimelineGoalMarker = {
  id: string;
  title: string;
  health: HealthStatus;
};

/**
 * What a task did on a day: it was completed, it was blocked that day and still is (a blocker cleared since is not
 * drawn, 2026-11-11 log), it was due and is still open (overdue, drawn loud), or (today and later) it falls due.
 */
export type TimelineTaskKind = "completed" | "blocked" | "overdue" | "due";

export type TimelineTaskSummary = {
  id: string;
  title: string;
  kind: TimelineTaskKind;
  /** Assigned to the viewer (the My work view draws only these). */
  isMine: boolean;
  project: string | null;
};

export type TimelineDay = {
  date: string;
  completed: number;
  myCompleted: number;
  /** Tasks blocked that day that are still blocked now. */
  blocked: number;
  /** Open tasks that were due that day and still are: the chart's loudest mark. */
  overdue: number;
  myOverdue: number;
  /** Open tasks falling due that day (today and later). */
  due: number;
  myDue: number;
  goalDeadlines: TimelineGoalMarker[];
  /** Every task behind the counts, in the order the bar stacks them: completed, blocked, overdue, then due. */
  tasks: TimelineTaskSummary[];
  /** Everything that happened to a task that day (every history row: created, edited, status, comments, links…). */
  activity: number;
  /** After today: the look-ahead, drawn lighter. */
  future: boolean;
  /** Inside the report's range (the look-ahead and any gap up to today are not). */
  inRange: boolean;
};

export type { HealthStatus };

export type ProjectHealthRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  targetDate: string | null;
  total: number;
  completed: number;
  blocked: number;
  overdue: number;
  pct: number;
  health: HealthStatus;
};

export type GoalHealthRow = {
  id: string;
  title: string;
  parentGoalId: string | null;
  projectName: string;
  targetDate: string | null;
  total: number;
  completed: number;
  blocked: number;
  overdue: number;
  pct: number;
  health: HealthStatus;
};

/** Goals and projects, each judged (lib/reports/health.ts) and listed worst first. */
export type HealthBoard = {
  goals: GoalHealthRow[];
  projects: ProjectHealthRow[];
};

export type BlockedDurationStats = {
  averageDays: number;
  maxDays: number;
  currentlyBlocked: number;
};

/** What is waiting for someone to decide: tasks awaiting approval, and proposals nobody has signed off. */
export type PendingDecisions = {
  approvals: ApprovalStagingTask[];
  proposals: ProposalListItem[];
};

/** A project the report can be narrowed to. */
export type ReportProjectOption = {
  id: string;
  name: string;
  status: ProjectStatus;
};

// --- helpers ------------------------------------------------------------------------------------------------

const CLOSED = [...CLOSED_STATUSES];
const isOpen = notInArray(tasks.status, CLOSED);
/** Counts for the pace: everything but what was closed without being completed (rejected, deferred, cancelled). */
const countsTowardsPace = notInArray(tasks.status, [...CLOSED_WITHOUT_COMPLETION]);
/** `'rejected', 'deferred', 'cancelled'` for raw fragments. */
const closedWithoutCompletionList = sql.raw(CLOSED_WITHOUT_COMPLETION.map((status) => `'${status}'`).join(", "));
/**
 * When a task was closed: completed_at for a completed task; for one closed without completing, the time of the
 * history row that closed it (its latest, so a task closed, reopened and closed again counts from the last time).
 */
const closedAtSql = sql<Date | null>`(case
  when ${tasks.status} = 'completed' then ${tasks.completedAt}
  when ${tasks.status} in (${closedWithoutCompletionList}) then (select max(a.created_at) from task_activity a where a.task_id = ${tasks}.id and a.kind in (${closedWithoutCompletionList}))
  else null end)`;

/** The tasks the report is about: everything, or one project's (an undefined condition is dropped by `and`). */
function projectCondition(project: ReportProject): SQL | undefined {
  if (project === "" || project === "none") return project === "none" ? isNull(tasks.projectId) : undefined;
  return eq(tasks.projectId, project);
}

/** Whether the viewer is on the task (or it is their own local task), in SQL. */
const mineSql = (viewer: Viewer) => sql<boolean>`(exists (select 1 from task_assignees ta where ta.task_id = ${tasks}.id and ta.user_id = ${viewer.userId}) or ${localOnly(viewer)})`;

/** Not a local task: the activity axis counts every task on the main board, proposals included, never local ones. */
const notLocal = sql`${tasks.proposalStatus} is distinct from 'local'`;

/**
 * `column` falls on a calendar day from `range.from` to `range.to` (both included) in `timeZone`. Written as two
 * instant bounds rather than a cast of the column, so the indexes on created_at / completed_at still apply.
 */
function withinDays(column: AnyPgColumn | SQL, range: ReportRange, timeZone: string): SQL {
  return sql`${column} >= (${range.from}::date::timestamp at time zone ${timeZone}) and ${column} < ((${range.to}::date + 1)::timestamp at time zone ${timeZone})`;
}

/** `column` is on `day` or any later instant, in `timeZone` (the same instant bound as withinDays, with no end). */
const onOrAfterDay = (column: AnyPgColumn | SQL, day: string, timeZone: string): SQL => sql`${column} >= (${day}::date::timestamp at time zone ${timeZone})`;

const dueWithin = (range: ReportRange) => sql`${tasks.dueDate} between ${range.from}::date and ${range.to}::date`;
const overdueOn = (today: string) => sql`${tasks.dueDate} < ${today}::date`;

/** Tasks in the viewer's workspace matching `where`, with everything a report prints about them. */
async function reportTasks(viewer: Viewer, project: ReportProject, where: SQL, order: "completed" | "due" | "quiet"): Promise<ReportTask[]> {
  const orderBy = order === "completed" ? [desc(tasks.completedAt)] : order === "quiet" ? [asc(tasks.updatedAt)] : [sql`${tasks.dueDate} asc nulls last`, asc(tasks.title)];
  const rows = await db
    .select({
      id: tasks.id,
      title: taskLabelSql,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      closedAt: closedAtSql,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completionSummary: tasks.completionSummary,
      nextAction: tasks.nextAction,
      blockedReason: tasks.blockedReason,
      blockedBy: tasks.blockedBy,
      rejectionReason: tasks.rejectionReason,
      goalId: tasks.goalId,
      goalTitle: goals.title,
      projectId: projects.id,
      projectName: projects.name,
      people: assigneesJson,
      evidence: sql<ReportTask["evidence"]>`coalesce((select json_agg(json_build_object('url', l.url, 'label', l.label) order by l.created_at) from task_links l where l.task_id = ${tasks}.id), '[]'::json)`,
    })
    .from(tasks)
    .leftJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.orgId, viewer.orgId)))
    .leftJoin(goals, and(eq(goals.id, tasks.goalId), eq(goals.orgId, viewer.orgId)))
    .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, projectCondition(project), where))
    .orderBy(...orderBy)
    .limit(1000);
  return rows.map(({ people, completedAt, closedAt, createdAt, updatedAt, projectId, projectName, ...row }) => ({
    ...row,
    completedDay: completedAt ? dayKey(completedAt, viewer.timezone) : null,
    closedDay: closedAt ? dayKey(new Date(closedAt), viewer.timezone) : null,
    createdDay: dayKey(createdAt, viewer.timezone),
    updatedAt: updatedAt.toISOString(),
    project: projectId && projectName ? { id: projectId, name: projectName } : null,
    assignees: people,
  }));
}

// --- the scope ----------------------------------------------------------------------------------------------------

/** The project a report is narrowed to, or null for "" / an id this workspace doesn't have. */
export async function reportProject(viewer: Viewer, project: ReportProject): Promise<ReportProjectOption | null> {
  if (project === "" || project === "none") return null;
  const [row] = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.orgId, viewer.orgId), eq(projects.id, project)));
  return row ?? null;
}

// --- the sections ---------------------------------------------------------------------------------------------

/** Delivered: completed on a day in the range, newest first. */
export function deliveredTasks(viewer: Viewer, range: ReportRange, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, and(eq(tasks.status, "completed"), isNotNull(tasks.completedAt), withinDays(tasks.completedAt, range, viewer.timezone))!, "completed");
}

/** Open commitments: open work due in the range, or overdue today. Soonest due first. */
export function openCommitments(viewer: Viewer, range: ReportRange, today: string, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, and(isOpen, or(dueWithin(range), overdueOn(today)))!, "due");
}

/** Blocked and overdue, as of today: what a leader would step in on. */
export function blockedOrOverdue(viewer: Viewer, today: string, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, and(isOpen, or(eq(tasks.status, "blocked"), overdueOn(today)))!, "due");
}

/** Stalled: in progress, but nothing has changed on it for STALLED_AFTER_DAYS days. The quietest first. */
export function stalledTasks(viewer: Viewer, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, and(eq(tasks.status, "in_progress"), sql`${tasks.updatedAt} < now() - make_interval(days => ${STALLED_AFTER_DAYS}::int)`)!, "quiet");
}

/**
 * The active reporting scope (docs/PLAN.md, 2026-11-06 and 2026-11-07 logs): what the cycle was to work on. Every
 * live task still open, whatever its dates, plus every task closed on or after the range's first day (the day of
 * the last report): completed, or rejected, deferred or cancelled then; the range's end plays no part. Soonest due
 * first; lib/reports/scope.ts regroups the rows by status.
 */
export function activeScopeTasks(viewer: Viewer, range: ReportRange, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, or(isOpen, and(isNotNull(closedAtSql), onOrAfterDay(closedAtSql, range.from, viewer.timezone)))!, "due");
}

/**
 * Is the work as a whole on pace? The scope's tasks (rejected ones aside) done against the share a straight line
 * from the start to the target date expects by today (lib/reports/pace.ts). For one project the line runs from
 * its creation to its target date (or, without one, its latest goal's); for the whole workspace, from the oldest
 * task to the latest top-level goal's target date.
 */
export async function reportPace(viewer: Viewer, today: string, project: ReportProject): Promise<Pace> {
  const scopedGoals = project !== "" && project !== "none" ? eq(goals.projectId, project) : undefined;
  const [[counts], [chosen], [goal]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*) filter (where ${countsTowardsPace})::int`,
        done: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
        first: sql<Date | null>`min(${tasks.createdAt})`,
      })
      .from(tasks)
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, projectCondition(project))),
    project !== "" && project !== "none"
      ? db
          .select({
            createdAt: projects.createdAt,
            targetDate: projects.targetDate,
          })
          .from(projects)
          .where(and(eq(projects.orgId, viewer.orgId), eq(projects.id, project)))
      : Promise.resolve([] as { createdAt: Date; targetDate: string | null }[]),
    db
      .select({
        targetDate: sql<string | null>`max(${goals.targetDate})::text`,
      })
      .from(goals)
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), isNull(goals.parentGoalId), scopedGoals)),
  ]);
  const firstTask = counts?.first ? dayKey(new Date(counts.first), viewer.timezone) : null;
  const projectStart = chosen ? dayKey(chosen.createdAt, viewer.timezone) : null;
  const start = [firstTask, projectStart].filter((day): day is string => day !== null).sort()[0] ?? null;
  const target = chosen ? (chosen.targetDate ?? goal?.targetDate ?? null) : (goal?.targetDate ?? null);
  return paceOf({
    done: counts?.done ?? 0,
    total: counts?.total ?? 0,
    start,
    target,
    today,
  });
}

/** Progress updates written in the range by anyone in the workspace (comments are not progress). */
export async function progressUpdateCount(viewer: Viewer, range: ReportRange, project: ReportProject): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskUpdates)
    .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
    .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, projectCondition(project), eq(taskUpdates.kind, "progress"), withinDays(taskUpdates.createdAt, range, viewer.timezone)));
  return row?.n ?? 0;
}

type CountByPerson = { personId: string | null; n: number };
const tally = (rows: CountByPerson[]) => new Map(rows.map((row) => [row.personId, row.n]));

/**
 * Per current worker, negative first (docs/PLAN.md, 2026-11-01 log): open tasks on them that are overdue today,
 * tasks on them that are blocked now, what they have open at all, then the tasks they were assigned to that were
 * completed in the range (and the change against the range before). Everyone is listed, zeros included, worst
 * first (overdue, then blocked, then idle, then by name). A task with two people on it counts once for each.
 */
export async function contributionCounts(viewer: Viewer, range: ReportRange, today: string, project: ReportProject): Promise<ContributionRow[]> {
  const n = sql<number>`count(*)::int`;
  const span = Math.max(0, calendarDaysBetween(range.from, range.to));
  const priorTo = shiftDay(range.from, -1);
  const priorFrom = shiftDay(priorTo, -span);
  const priorRange: ReportRange = { from: priorFrom, to: priorTo };
  const scoped = projectCondition(project);

  const [workers, completed, priorCompleted, load] = await Promise.all([
    listWorkers(viewer),
    db
      .select({ personId: taskAssignees.userId, n })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, scoped, eq(tasks.status, "completed"), withinDays(tasks.completedAt, range, viewer.timezone)))
      .groupBy(taskAssignees.userId),
    db
      .select({ personId: taskAssignees.userId, n })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, scoped, eq(tasks.status, "completed"), withinDays(tasks.completedAt, priorRange, viewer.timezone)))
      .groupBy(taskAssignees.userId),
    db
      .select({
        personId: taskAssignees.userId,
        open: n,
        overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today}::date)::int`,
        blocked: sql<number>`count(*) filter (where ${tasks.status} = 'blocked')::int`,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, scoped, isOpen))
      .groupBy(taskAssignees.userId),
  ]);
  const [completedBy, priorCompletedBy] = [tally(completed), tally(priorCompleted)];
  const loadBy = new Map(load.map((row) => [row.personId, row]));
  const nameOf = (row: ContributionRow) => row.person.name ?? row.person.email ?? "";
  return workers
    .map((worker): ContributionRow => {
      const cur = completedBy.get(worker.userId) ?? 0;
      const prior = priorCompletedBy.get(worker.userId) ?? 0;
      const current = loadBy.get(worker.userId);
      return {
        person: {
          id: worker.userId,
          name: worker.name,
          email: worker.email,
          image: worker.image,
        },
        overdue: current?.overdue ?? 0,
        blocked: current?.blocked ?? 0,
        open: current?.open ?? 0,
        completed: cur,
        deltaCompleted: cur - prior,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.blocked - a.blocked || Number(a.open > 0) - Number(b.open > 0) || nameOf(a).localeCompare(nameOf(b)));
}

// --- the daily chart ----------------------------------------------------------------------------------------------

/** The goals whose deadlines the chart marks: every active one, or, for one project, the goals in it. */
function goalMarkerCondition(project: ReportProject): SQL | undefined {
  if (project === "" || project === "none") return undefined;
  return eq(goals.projectId, project);
}

/**
 * One entry per calendar day of the chart's window (lib/reports/range.ts: the range, then two weeks past today):
 * what was completed, what was blocked that day and still is, what was due and is still open (overdue), what falls due from
 * today on, and the goal deadlines with each goal's health, with the tasks behind each count so a bar can be split
 * into them. `activity` is every history row of every task in scope that day: the chart's y axis. With
 * `includeLocal` (the My work view) the viewer's own local tasks count too; otherwise local tasks are left out.
 */
export async function reportTimeline(viewer: Viewer, range: ReportRange, today: string, project: ReportProject, options: { includeLocal?: boolean } = {}): Promise<TimelineDay[]> {
  const window = timelineWindow(range, today);
  const past: ReportRange = {
    from: window.from,
    to: today < window.to ? today : window.to,
  };
  const scoped = projectCondition(project);
  const mine = mineSql(viewer);
  const taskScope = options.includeLocal ? or(liveOnly, localOnly(viewer)) : liveOnly;
  const activityScope = options.includeLocal ? or(notLocal, localOnly(viewer)) : notLocal;

  const [goalRows, completedRows, blockerRows, dueRows, activityRows] = await Promise.all([
    db
      .select({
        id: goals.id,
        title: goals.title,
        targetDate: goals.targetDate,
        createdAt: goals.createdAt,
      })
      .from(goals)
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), isNotNull(goals.targetDate), goalMarkerCondition(project)))
      .orderBy(asc(goals.title)),
    db
      .select({
        id: tasks.id,
        title: taskLabelSql,
        completedAt: tasks.completedAt,
        projectName: projects.name,
        isMine: mine,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.orgId, viewer.orgId), taskScope, scoped, eq(tasks.status, "completed"), isNotNull(tasks.completedAt), withinDays(tasks.completedAt, past, viewer.timezone)))
      .orderBy(asc(tasks.completedAt)),
    db
      .select({
        day: sql<string>`to_char(${taskActivity.createdAt} at time zone ${viewer.timezone}, 'YYYY-MM-DD')`,
        taskId: taskActivity.taskId,
        taskTitle: taskLabelSql,
        projectName: projects.name,
        isMine: mine,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      // A blocker is drawn while it stands (2026-11-11 log): the tasks blocked right now, each on the day its latest
      // blocker was raised. One cleared since (the task unblocked, completed or closed) is history: it still counts
      // in that day's activity and leaves the bars, so finished work never reads as blocked.
      .where(
        and(
          eq(taskActivity.orgId, viewer.orgId),
          taskScope,
          scoped,
          eq(taskActivity.kind, "blocked"),
          eq(tasks.status, "blocked"),
          sql`not exists (select 1 from task_activity later where later.task_id = ${taskActivity}.task_id and later.kind = 'blocked' and later.created_at > ${taskActivity}.created_at)`,
          withinDays(taskActivity.createdAt, past, viewer.timezone),
        ),
      )
      .orderBy(asc(taskActivity.createdAt)),
    // Every open task due anywhere in the window: before today it is overdue, from today on it is due.
    db
      .select({
        id: tasks.id,
        title: taskLabelSql,
        dueDate: tasks.dueDate,
        projectName: projects.name,
        isMine: mine,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.orgId, viewer.orgId), taskScope, scoped, isOpen, dueWithin(window)))
      .orderBy(asc(tasks.dueDate), asc(tasks.title)),
    // The y axis: every history row of every task in scope, by day (completed +1, comment +1, edit +1, …).
    db
      .select({
        day: sql<string>`to_char(${taskActivity.createdAt} at time zone ${viewer.timezone}, 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .where(and(eq(taskActivity.orgId, viewer.orgId), activityScope, scoped, withinDays(taskActivity.createdAt, past, viewer.timezone)))
      .groupBy(sql`1`),
  ]);
  const goalProgress = await progressForGoals(
    viewer,
    goalRows.map((goal) => goal.id),
  );
  const activityByDay = new Map(activityRows.map((row) => [row.day, row.n]));

  const byDay = new Map<string, TimelineTaskSummary[]>();
  const add = (day: string, task: TimelineTaskSummary) => {
    const list = byDay.get(day) ?? [];
    list.push(task);
    byDay.set(day, list);
  };
  for (const row of completedRows) {
    if (row.completedAt)
      add(dayKey(row.completedAt, viewer.timezone), {
        id: row.id,
        title: row.title,
        kind: "completed",
        isMine: row.isMine,
        project: row.projectName,
      });
  }
  for (const row of blockerRows)
    add(row.day, {
      id: row.taskId,
      title: row.taskTitle,
      kind: "blocked",
      isMine: row.isMine,
      project: row.projectName,
    });
  for (const row of dueRows) {
    if (row.dueDate)
      add(row.dueDate, {
        id: row.id,
        title: row.title,
        kind: row.dueDate < today ? "overdue" : "due",
        isMine: row.isMine,
        project: row.projectName,
      });
  }

  const goalsByDay = new Map<string, TimelineGoalMarker[]>();
  for (const goal of goalRows) {
    if (goal.targetDate === null || goal.targetDate < window.from || goal.targetDate > window.to) continue;
    const progress = goalProgress.get(goal.id) ?? {
      total: 0,
      completed: 0,
      blocked: 0,
      overdue: 0,
    };
    const behindPace = isBehindPace({
      done: progress.completed,
      total: progress.total,
      start: dayKey(goal.createdAt, viewer.timezone),
      target: goal.targetDate,
      today,
    });
    const list = goalsByDay.get(goal.targetDate) ?? [];
    list.push({
      id: goal.id,
      title: goal.title,
      health: healthOf({
        ...progress,
        targetDate: goal.targetDate,
        today,
        behindPace,
      }),
    });
    goalsByDay.set(goal.targetDate, list);
  }

  const ORDER: Record<TimelineTaskKind, number> = {
    completed: 0,
    blocked: 1,
    overdue: 2,
    due: 3,
  };
  return daysOf(window).map((date) => {
    const dayTasks = (byDay.get(date) ?? []).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
    const count = (kind: TimelineTaskKind, onlyMine = false) => dayTasks.filter((task) => task.kind === kind && (!onlyMine || task.isMine)).length;
    return {
      date,
      completed: count("completed"),
      myCompleted: count("completed", true),
      blocked: count("blocked"),
      overdue: count("overdue"),
      myOverdue: count("overdue", true),
      due: count("due"),
      myDue: count("due", true),
      goalDeadlines: goalsByDay.get(date) ?? [],
      tasks: dayTasks,
      activity: activityByDay.get(date) ?? 0,
      future: date > today,
      inRange: date >= range.from && date <= range.to,
    };
  });
}

// --- blocked duration, health, decisions ---------------------------------------------------------------------------

/** Average and maximum days currently blocked tasks have sat blocked. */
export async function blockedDurationStats(viewer: Viewer, project: ReportProject): Promise<BlockedDurationStats> {
  const rows = await db
    .select({ id: tasks.id, updatedAt: tasks.updatedAt })
    .from(tasks)
    .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, projectCondition(project), eq(tasks.status, "blocked")));

  if (rows.length === 0) return { averageDays: 0, maxDays: 0, currentlyBlocked: 0 };

  const now = Date.now();
  const durations = rows.map((row) => Math.max(0, (now - row.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const sum = durations.reduce((acc, d) => acc + d, 0);
  return {
    averageDays: Math.round((sum / durations.length) * 10) / 10,
    maxDays: Math.round(Math.max(...durations) * 10) / 10,
    currentlyBlocked: rows.length,
  };
}

/**
 * The health board: every active project and every active top-level goal judged by lib/reports/health.ts and
 * listed worst first. Narrowed to a project, it shows that project (whatever its status) and the goals inside it.
 */
export async function projectAndGoalHealth(viewer: Viewer, today: string, project: ReportProject): Promise<HealthBoard> {
  const one = project !== "" && project !== "none";
  const projectWhere = project === "none" ? sql`false` : one ? eq(projects.id, project) : eq(projects.status, "active");
  const activeProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      targetDate: projects.targetDate,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.orgId, viewer.orgId), projectWhere))
    .orderBy(sql`${projects.targetDate} asc nulls last`, asc(projects.name));

  const goalWhere = project === "none" ? sql`false` : and(eq(goals.status, "active"), isNull(goals.parentGoalId), one ? eq(goals.projectId, project) : undefined)!;
  const activeGoals = await db
    .select({
      id: goals.id,
      title: goals.title,
      parentGoalId: goals.parentGoalId,
      targetDate: goals.targetDate,
      createdAt: goals.createdAt,
      projectName: projects.name,
    })
    .from(goals)
    .innerJoin(projects, eq(projects.id, goals.projectId))
    .where(and(eq(goals.orgId, viewer.orgId), goalWhere))
    .orderBy(sql`${goals.targetDate} asc nulls last`, asc(goals.title));

  const [goalProgress, projectProgress] = await Promise.all([
    progressForGoals(
      viewer,
      activeGoals.map((goal) => goal.id),
    ),
    progressForProjects(
      viewer,
      activeProjects.map((row) => row.id),
    ),
  ]);
  const EMPTY = { total: 0, completed: 0, blocked: 0, overdue: 0 };
  const pctOf = (completed: number, total: number) => (total > 0 ? Math.round((completed / total) * 100) : 0);
  /** Behind the line from its creation to its target date (lib/reports/pace.ts). */
  const behind = (createdAt: Date, targetDate: string | null, progress: { completed: number; total: number }) =>
    isBehindPace({
      done: progress.completed,
      total: progress.total,
      start: dayKey(createdAt, viewer.timezone),
      target: targetDate,
      today,
    });

  const goalRows: GoalHealthRow[] = activeGoals.map((goal) => {
    const progress = goalProgress.get(goal.id) ?? EMPTY;
    return {
      id: goal.id,
      title: goal.title,
      parentGoalId: goal.parentGoalId,
      projectName: goal.projectName,
      targetDate: goal.targetDate,
      ...progress,
      pct: pctOf(progress.completed, progress.total),
      health: healthOf({
        ...progress,
        targetDate: goal.targetDate,
        today,
        behindPace: behind(goal.createdAt, goal.targetDate, progress),
      }),
    };
  });
  const projectRows: ProjectHealthRow[] = activeProjects.map((row) => {
    const progress = projectProgress.get(row.id) ?? EMPTY;
    // A project marked completed or archived is settled whatever its tasks say; chosen by name, it reads as on track.
    const health =
      row.status === "active"
        ? healthOf({
            ...progress,
            targetDate: row.targetDate,
            today,
            behindPace: behind(row.createdAt, row.targetDate, progress),
          })
        : "on_track";
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      targetDate: row.targetDate,
      ...progress,
      pct: pctOf(progress.completed, progress.total),
      health,
    };
  });

  return {
    goals: sortByHealth(goalRows, (row) => row.title),
    projects: sortByHealth(projectRows, (row) => row.name),
  };
}

/**
 * What is waiting on a decision: tasks awaiting approval (the same list as a leader's Home, narrowed to the project)
 * and the proposals still waiting for a signature, oldest first.
 */
export async function pendingDecisions(viewer: Viewer, project: ReportProject): Promise<PendingDecisions> {
  const scope = project === "none" ? "" : project;
  const [approvals, proposals] = await Promise.all([approvalStagingTasks(viewer, scope), pendingProposals(viewer, scope)]);
  return { approvals, proposals };
}
