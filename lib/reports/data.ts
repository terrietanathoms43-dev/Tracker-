import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { goals, projects, taskActivity, taskAssignees, tasks, taskUpdates } from "@/db/schema";
import { CLOSED_STATUSES, COMPLETED_STATUSES, INCOMPLETE_STATUSES, type ProjectStatus, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { pendingProposals, type ProposalListItem } from "@/lib/dal/approvals";
import { listWorkers } from "@/lib/dal/orgs";
import { approvalStagingTasks, assigneesJson, liveOnly, progressForGoals, progressForProjects, taskLabelSql, type ApprovalStagingTask } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import { blockDayOf, blockKindOf, daysLeft, openBandOf, phaseOf, shadeOf, timingOf, type BlockKind, type LifeState, type OpenBand, type Shade, type TaskPhase, type Timing } from "@/lib/tasks/model";
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
// navigation's scope); every section narrows the same way, so its numbers always agree, the Activity widget and
// its activity line included (2026-11-24 log: until then the My work view also drew the viewer's local tasks and the
// line counted proposals). The Active scope view's list (`activeScopeTasks`) takes every task not completed whatever
// the range, and only the range's first day bounds the completed ones.

/** A task as a report prints it. `completedDay` is the calendar day it was completed on, in the viewer's timezone. */
export type ReportTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: Assignees;
  dueDate: string | null;
  completedDay: string | null;
  /** The day it was closed, in the viewer's timezone: completed, merged, rejected or cancelled (the closure snapshot on the task row). */
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
 * A task's one block on the Activity widget (2026-11-24 log; the task model, lib/tasks/model.ts). Every live task has
 * exactly one, placed by where it is in its life: a closed task on the day it closed, for good; an open task on its
 * due date, or on Today when it has none or the date has passed (it is carried along until it is closed). `kind`
 * picks the base colour and the mark, `shade` how dark it is drawn (the timing), and the two flags the marks drawn
 * over it. Nothing here is a second copy of a task: status, deadline and closure share the block.
 */
export type TimelineBlock = {
  id: string;
  title: string;
  kind: BlockKind;
  state: LifeState;
  phase: TaskPhase;
  /** Open: today against the due date. Closed: the closing day against the due date it had then. */
  timing: Timing;
  /** Open with a due date: how close the deadline is. Null for undated and closed work. */
  band: OpenBand | null;
  shade: Shade;
  /** Open: it has no due date now. Closed: it was closed without one (kept whatever is set afterwards). */
  undated: boolean;
  /** Open and blocked: the phase and the timing stay, the blocked mark is drawn over them. */
  blocked: boolean;
  /** Open: the due date now. Closed: the due date it was closed against. */
  dueDate: string | null;
  /**
   * The task has no due date now: the day panel warns while this is so. For closed work it can differ from
   * `undated`, which is history: a date added after closing clears the warning and never the block's mark.
   */
  noDueDateNow: boolean;
  /** Open with a due date: calendar days to it (0 today, negative once passed). */
  daysLeft: number | null;
  /** Closed: the day it closed, in the viewer's timezone. */
  closedDay: string | null;
  /** Assigned to the viewer (the My work view draws only these). */
  isMine: boolean;
  project: string | null;
};

export type TimelineDay = {
  date: string;
  /** The blocks on this day, in the order the column stacks them: closed work first, then open work, most pressing first. */
  blocks: TimelineBlock[];
  goalDeadlines: TimelineGoalMarker[];
  /** Everything that happened to a task that day (every history row: created, edited, status, comments, links…). */
  activity: number;
  /** After today: the look-ahead, drawn lighter. */
  future: boolean;
  /** Inside the report's range (the look-ahead and any gap up to today are not). */
  inRange: boolean;
};

/** Open tasks whose block falls on a day the chart does not draw: counted, so the widget can say so in words. */
export type TimelineOutside = { all: number; mine: number };

export type Timeline = {
  days: TimelineDay[];
  /** Open work due after the last day drawn, and open work placed before the first (only when Today itself is off the chart). */
  outside: { before: TimelineOutside; after: TimelineOutside };
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
/** Counts for the pace: everything but what was closed without being completed (rejected, cancelled). A merged sub-task is done work. */
const countsTowardsPace = notInArray(tasks.status, [...INCOMPLETE_STATUSES]);
const isDone = inArray(tasks.status, [...COMPLETED_STATUSES]);
/** `'completed', 'rejected', 'cancelled', 'merged'` for raw fragments. */
const closedList = sql.raw(CLOSED.map((status) => `'${status}'`).join(", "));
/**
 * When a task was closed: the closure snapshot on its row (2026-11-24 log). A row closed before the snapshot existed
 * and not yet backfilled (`npm run db:migrate-task-model`) falls back to its completion time, then to the history row
 * that put it in the status it is in.
 */
const closedAtSql = sql<Date | null>`(case when ${tasks.status} in (${closedList}) then coalesce(${tasks.closedAt}, ${tasks.completedAt}, (select max(a.created_at) from task_activity a where a.task_id = ${tasks}.id and a.after->>'status' = ${tasks}.status::text)) else null end)`;
/** The due date a closed task was closed against: the snapshot, or (not yet backfilled) the date it has now. */
const dueAtCloseSql = sql<string | null>`(case when ${tasks.closedAt} is null then ${tasks.dueDate} else ${tasks.dueDateAtClose} end)::text`;

/** The tasks the report is about: everything, or one project's (an undefined condition is dropped by `and`). */
function projectCondition(project: ReportProject): SQL | undefined {
  if (project === "" || project === "none") return project === "none" ? isNull(tasks.projectId) : undefined;
  return eq(tasks.projectId, project);
}

/** Whether the viewer is assigned to the task, in SQL. */
const mineSql = (viewer: Viewer) => sql<boolean>`exists (select 1 from task_assignees ta where ta.task_id = ${tasks}.id and ta.user_id = ${viewer.userId})`;

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
 * the last report): completed, merged, rejected or cancelled then; the range's end plays no part. Soonest due
 * first; lib/reports/scope.ts regroups the rows by status.
 */
export function activeScopeTasks(viewer: Viewer, range: ReportRange, project: ReportProject): Promise<ReportTask[]> {
  return reportTasks(viewer, project, or(isOpen, and(isNotNull(closedAtSql), onOrAfterDay(closedAtSql, range.from, viewer.timezone)))!, "due");
}

/**
 * Is the work as a whole on pace? The scope's tasks (rejected and cancelled ones aside; a merged sub-task is done) done against the share a straight line
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
        done: sql<number>`count(*) filter (where ${isDone})::int`,
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
 * The Activity widget's data (2026-11-24 log): one entry per calendar day of the chart's window (lib/reports/range.ts:
 * the range, then two weeks past today), holding each live task's one block on the day the task model puts it
 * (lib/tasks/model.ts `blockDayOf`), the goal deadlines with each goal's health, and `activity`, every history row
 * of every live task in scope that day: the chart's y axis. Open work is read as it stands now; closed work from its
 * closure snapshot, so a closed block never moves or changes shade. Proposals and local tasks are in none of it.
 */
export async function reportTimeline(viewer: Viewer, range: ReportRange, today: string, project: ReportProject): Promise<Timeline> {
  const window = timelineWindow(range, today);
  const past: ReportRange = {
    from: window.from,
    to: today < window.to ? today : window.to,
  };
  const scoped = projectCondition(project);
  const mine = mineSql(viewer);
  const closedDaySql = sql<string>`to_char(${closedAtSql} at time zone ${viewer.timezone}, 'YYYY-MM-DD')`;

  const [goalRows, openRows, closedRows, activityRows] = await Promise.all([
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
    // Every open task in scope, as it stands now: where its block goes is worked out below, from its due date and today.
    db
      .select({
        id: tasks.id,
        title: taskLabelSql,
        status: tasks.status,
        dueDate: tasks.dueDate,
        startedAt: tasks.startedAt,
        projectName: projects.name,
        isMine: mine,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, scoped, isOpen))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.title))
      .limit(5000),
    // Every task closed on a day the chart draws, with the due date it was closed against.
    db
      .select({
        id: tasks.id,
        title: taskLabelSql,
        status: tasks.status,
        closedDay: closedDaySql,
        dueDateAtClose: dueAtCloseSql,
        dueDate: tasks.dueDate,
        projectName: projects.name,
        isMine: mine,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, scoped, inArray(tasks.status, CLOSED), isNotNull(closedAtSql), withinDays(closedAtSql, past, viewer.timezone)))
      .orderBy(asc(closedAtSql), asc(tasks.title))
      .limit(5000),
    // The y axis: every history row of every live task in scope, by day (completed +1, comment +1, edit +1, …).
    db
      .select({
        day: sql<string>`to_char(${taskActivity.createdAt} at time zone ${viewer.timezone}, 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .where(and(eq(taskActivity.orgId, viewer.orgId), liveOnly, scoped, withinDays(taskActivity.createdAt, past, viewer.timezone)))
      .groupBy(sql`1`),
  ]);
  const goalProgress = await progressForGoals(
    viewer,
    goalRows.map((goal) => goal.id),
  );
  const activityByDay = new Map(activityRows.map((row) => [row.day, row.n]));

  const byDay = new Map<string, TimelineBlock[]>();
  const outside: Timeline["outside"] = { before: { all: 0, mine: 0 }, after: { all: 0, mine: 0 } };
  const place = (day: string, block: TimelineBlock) => {
    if (day < window.from || day > window.to) {
      const side = day < window.from ? outside.before : outside.after;
      side.all += 1;
      if (block.isMine) side.mine += 1;
      return;
    }
    const list = byDay.get(day) ?? [];
    list.push(block);
    byDay.set(day, list);
  };
  for (const row of openRows) {
    const started = row.startedAt !== null;
    const timing = timingOf(row.dueDate, today);
    const left = row.dueDate === null ? null : daysLeft(row.dueDate, today);
    const band = left === null ? null : openBandOf(left);
    place(blockDayOf({ state: "open", dueDate: row.dueDate, closedDay: null }, today), {
      id: row.id,
      title: row.title,
      kind: blockKindOf(row.status, started),
      state: "open",
      phase: phaseOf(row.status, started),
      timing,
      band,
      shade: shadeOf("open", timing, band),
      undated: row.dueDate === null,
      blocked: row.status === "blocked",
      dueDate: row.dueDate,
      noDueDateNow: row.dueDate === null,
      daysLeft: left,
      closedDay: null,
      isMine: row.isMine,
      project: row.projectName,
    });
  }
  for (const row of closedRows) {
    const timing = timingOf(row.dueDateAtClose, row.closedDay);
    place(row.closedDay, {
      id: row.id,
      title: row.title,
      kind: blockKindOf(row.status, true),
      state: "closed",
      phase: phaseOf(row.status, true),
      timing,
      band: null,
      shade: shadeOf("closed", timing, null),
      undated: row.dueDateAtClose === null,
      blocked: false,
      dueDate: row.dueDateAtClose,
      noDueDateNow: row.dueDate === null,
      daysLeft: null,
      closedDay: row.closedDay,
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

  // A column stacks from the axis up: what was closed that day (completed, merged, rejected, cancelled), then the
  // open work, the most pressing nearest the axis (overdue, at risk, warm, healthy) and the undated on top.
  const CLOSED_ORDER: Record<BlockKind, number> = { completed: 0, merged: 1, rejected: 2, cancelled: 3, not_started: 9, in_progress: 9, awaiting_approval: 9 };
  const rank = (block: TimelineBlock) => (block.state === "closed" ? CLOSED_ORDER[block.kind] : block.undated ? 20 : 10 + (4 - block.shade));
  const byRank = (a: TimelineBlock, b: TimelineBlock) => rank(a) - rank(b) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.title.localeCompare(b.title);
  const days = daysOf(window).map((date) => ({
    date,
    blocks: (byDay.get(date) ?? []).sort(byRank),
    goalDeadlines: goalsByDay.get(date) ?? [],
    activity: activityByDay.get(date) ?? 0,
    future: date > today,
    inRange: date >= range.from && date <= range.to,
  }));
  return { days, outside };
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
