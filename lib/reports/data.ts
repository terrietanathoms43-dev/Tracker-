import "server-only";
import { and, asc, desc, eq, isNotNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { goals, projects, taskActivity, taskAssignees, tasks, taskUpdates } from "@/db/schema";
import { CLOSED_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { listWorkers } from "@/lib/dal/orgs";
import { assigneesJson, progressForGoals, progressForProjects } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import type { Assignees } from "@/lib/tasks/types";
import { addDays, calendarDaysBetween, dayKey } from "@/lib/time";
import { shiftDay, type ReportRange } from "./range";

// The rows behind /reports and its CSV exports. Every query is scoped to viewer.orgId in SQL and every number a
// report prints is a count of these rows: nothing is estimated, weighted or ranked. Callers check access first
// (lib/reports/build.ts).

/** A task as a report prints it. `completedDay` is the calendar day it was completed on, in the viewer's timezone. */
export type ReportTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: Assignees;
  dueDate: string | null;
  completedDay: string | null;
  completionSummary: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
  /** The goal it serves, directly or through its project. */
  goalId: string | null;
  evidence: { url: string; label: string | null }[];
};

/** One worker's counts in the range. Counts only: the report never compares people. */
export type ContributionRow = {
  person: { id: string; name: string | null; email: string | null; image: string | null };
  completed: number;
  deltaCompleted?: number;
  progressUpdates: number;
  blockersRaised: number;
};

export type TimelineGoalMarker = { id: string; title: string };

export type TimelineTaskSummary = {
  id: string;
  title: string;
  kind: "completed" | "blocked";
  isMine?: boolean;
};

export type TimelineDay = {
  date: string;
  completed: number;
  myCompleted: number;
  blockedRaised: number;
  goalDeadlines: TimelineGoalMarker[];
  tasks: TimelineTaskSummary[];
};

export type HealthStatus = "on_track" | "at_risk" | "needs_attention";

export type ProjectHealthRow = {
  id: string;
  name: string;
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
  targetDate: string | null;
  total: number;
  completed: number;
  blocked: number;
  overdue: number;
  pct: number;
  health: HealthStatus;
};

export type HealthBoard = {
  goals: GoalHealthRow[];
  projects: ProjectHealthRow[];
};

export type BlockedDurationStats = {
  averageDays: number;
  maxDays: number;
  currentlyBlocked: number;
};

// --- helpers ------------------------------------------------------------------------------------------------

const CLOSED = [...CLOSED_STATUSES];
const isOpen = notInArray(tasks.status, CLOSED);

/**
 * `column` falls on a calendar day from `range.from` to `range.to` (both included) in `timeZone`. Written as two
 * instant bounds rather than a cast of the column, so the indexes on created_at / completed_at still apply.
 */
function withinDays(column: AnyPgColumn | SQL, range: ReportRange, timeZone: string): SQL {
  return sql`${column} >= (${range.from}::date::timestamp at time zone ${timeZone}) and ${column} < ((${range.to}::date + 1)::timestamp at time zone ${timeZone})`;
}

const dueWithin = (range: ReportRange) => sql`${tasks.dueDate} between ${range.from}::date and ${range.to}::date`;
const overdueOn = (today: string) => sql`${tasks.dueDate} < ${today}::date`;

/** Tasks in the viewer's workspace matching `where`, with everything a report prints about them. */
async function reportTasks(viewer: Viewer, where: SQL, order: "completed" | "due"): Promise<ReportTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      completionSummary: tasks.completionSummary,
      nextAction: tasks.nextAction,
      blockedReason: tasks.blockedReason,
      blockedBy: tasks.blockedBy,
      goalId: sql<string | null>`coalesce(${tasks.goalId}, ${projects.goalId})`,
      people: assigneesJson,
      evidence: sql<ReportTask["evidence"]>`coalesce((select json_agg(json_build_object('url', l.url, 'label', l.label) order by l.created_at) from task_links l where l.task_id = ${tasks.id}), '[]'::json)`,
    })
    .from(tasks)
    .leftJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.orgId, viewer.orgId)))
    .where(and(eq(tasks.orgId, viewer.orgId), where))
    .orderBy(...(order === "completed" ? [desc(tasks.completedAt)] : [sql`${tasks.dueDate} asc nulls last`, asc(tasks.title)]))
    .limit(1000);
  return rows.map(({ people, completedAt, ...row }) => ({
    ...row,
    completedDay: completedAt ? dayKey(completedAt, viewer.timezone) : null,
    assignees: people,
  }));
}

// --- the sections ---------------------------------------------------------------------------------------------

/** Delivered: completed on a day in the range, newest first. */
export function deliveredTasks(viewer: Viewer, range: ReportRange): Promise<ReportTask[]> {
  return reportTasks(viewer, and(eq(tasks.status, "completed"), isNotNull(tasks.completedAt), withinDays(tasks.completedAt, range, viewer.timezone))!, "completed");
}

/** Open commitments: open work due in the range, or overdue today. Soonest due first. */
export function openCommitments(viewer: Viewer, range: ReportRange, today: string): Promise<ReportTask[]> {
  return reportTasks(viewer, and(isOpen, or(dueWithin(range), overdueOn(today)))!, "due");
}

/** Blocked and overdue, as of today: what a leader would step in on. */
export function blockedOrOverdue(viewer: Viewer, today: string): Promise<ReportTask[]> {
  return reportTasks(viewer, and(isOpen, or(eq(tasks.status, "blocked"), overdueOn(today)))!, "due");
}

/** Progress updates written in the range by anyone in the workspace (comments are not progress). */
export async function progressUpdateCount(viewer: Viewer, range: ReportRange): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskUpdates)
    .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
    .where(and(eq(tasks.orgId, viewer.orgId), eq(taskUpdates.kind, "progress"), withinDays(taskUpdates.createdAt, range, viewer.timezone)));
  return row?.n ?? 0;
}

type CountByPerson = { personId: string | null; n: number };
const tally = (rows: CountByPerson[]) => new Map(rows.map((row) => [row.personId, row.n]));

/**
 * Per current worker, in the range: tasks they were assigned to that were completed, progress updates they wrote
 * and blockers they raised. Everyone is listed, zeros included, alphabetically, so the order says nothing about the
 * numbers. A task with two people on it counts once for each.
 */
export async function contributionCounts(viewer: Viewer, range: ReportRange): Promise<ContributionRow[]> {
  const n = sql<number>`count(*)::int`;
  const span = Math.max(0, calendarDaysBetween(range.from, range.to));
  const priorTo = shiftDay(range.from, -1);
  const priorFrom = shiftDay(priorTo, -span);
  const priorRange: ReportRange = { from: priorFrom, to: priorTo };

  const [workers, completed, priorCompleted, updates, blockers] = await Promise.all([
    listWorkers(viewer),
    db
      .select({ personId: taskAssignees.userId, n })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.status, "completed"), withinDays(tasks.completedAt, range, viewer.timezone)))
      .groupBy(taskAssignees.userId),
    db
      .select({ personId: taskAssignees.userId, n })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.status, "completed"), withinDays(tasks.completedAt, priorRange, viewer.timezone)))
      .groupBy(taskAssignees.userId),
    db
      .select({ personId: taskUpdates.authorId, n })
      .from(taskUpdates)
      .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), eq(taskUpdates.kind, "progress"), withinDays(taskUpdates.createdAt, range, viewer.timezone)))
      .groupBy(taskUpdates.authorId),
    db
      .select({ personId: taskActivity.actorId, n })
      .from(taskActivity)
      .where(and(eq(taskActivity.orgId, viewer.orgId), eq(taskActivity.kind, "blocked"), withinDays(taskActivity.createdAt, range, viewer.timezone)))
      .groupBy(taskActivity.actorId),
  ]);
  const [completedBy, priorCompletedBy, updatesBy, blockersBy] = [tally(completed), tally(priorCompleted), tally(updates), tally(blockers)];
  return workers
    .map((worker) => {
      const cur = completedBy.get(worker.userId) ?? 0;
      const prior = priorCompletedBy.get(worker.userId) ?? 0;
      return {
        person: { id: worker.userId, name: worker.name, email: worker.email, image: worker.image },
        completed: cur,
        deltaCompleted: cur - prior,
        progressUpdates: updatesBy.get(worker.userId) ?? 0,
        blockersRaised: blockersBy.get(worker.userId) ?? 0,
      };
    })
    .sort((a, b) => (a.person.name ?? a.person.email ?? "").localeCompare(b.person.name ?? b.person.email ?? ""));
}

/** Daily timeline over the range: completions, personal completions, blockers, and goal deadline markers. */
export async function reportTimeline(viewer: Viewer, range: ReportRange, delivered: ReportTask[]): Promise<TimelineDay[]> {
  const span = Math.max(0, calendarDaysBetween(range.from, range.to));
  const daysCount = Math.min(span + 1, 120);
  const days: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    days.push(addDays(range.from, i));
  }

  const [goalRows, blockerRows] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate })
      .from(goals)
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), isNotNull(goals.targetDate))),
    db
      .select({
        day: sql<string>`to_char(${taskActivity.createdAt} at time zone ${viewer.timezone}, 'YYYY-MM-DD')`,
        taskId: taskActivity.taskId,
        taskTitle: tasks.title,
      })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .where(and(eq(taskActivity.orgId, viewer.orgId), eq(taskActivity.kind, "blocked"), withinDays(taskActivity.createdAt, range, viewer.timezone))),
  ]);

  const goalsByDay = new Map<string, TimelineGoalMarker[]>();
  for (const g of goalRows) {
    if (g.targetDate && g.targetDate >= range.from && g.targetDate <= range.to) {
      const list = goalsByDay.get(g.targetDate) ?? [];
      list.push({ id: g.id, title: g.title });
      goalsByDay.set(g.targetDate, list);
    }
  }

  const blockersByDay = new Map<string, number>();
  const tasksByDay = new Map<string, TimelineTaskSummary[]>();

  for (const b of blockerRows) {
    blockersByDay.set(b.day, (blockersByDay.get(b.day) ?? 0) + 1);
    const list = tasksByDay.get(b.day) ?? [];
    list.push({ id: b.taskId, title: b.taskTitle, kind: "blocked" });
    tasksByDay.set(b.day, list);
  }

  const deliveredByDay = new Map<string, number>();
  const myDeliveredByDay = new Map<string, number>();
  for (const t of delivered) {
    if (t.completedDay) {
      deliveredByDay.set(t.completedDay, (deliveredByDay.get(t.completedDay) ?? 0) + 1);
      const isMine = t.assignees.some((p) => p.id === viewer.userId);
      if (isMine) {
        myDeliveredByDay.set(t.completedDay, (myDeliveredByDay.get(t.completedDay) ?? 0) + 1);
      }
      const list = tasksByDay.get(t.completedDay) ?? [];
      list.push({ id: t.id, title: t.title, kind: "completed", isMine });
      tasksByDay.set(t.completedDay, list);
    }
  }

  return days.map((date) => ({
    date,
    completed: deliveredByDay.get(date) ?? 0,
    myCompleted: myDeliveredByDay.get(date) ?? 0,
    blockedRaised: blockersByDay.get(date) ?? 0,
    goalDeadlines: goalsByDay.get(date) ?? [],
    tasks: tasksByDay.get(date) ?? [],
  }));
}

/** Average and maximum days currently blocked tasks have sat blocked. */
export async function blockedDurationStats(viewer: Viewer): Promise<BlockedDurationStats> {
  const rows = await db
    .select({
      id: tasks.id,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.status, "blocked")));

  if (rows.length === 0) {
    return { averageDays: 0, maxDays: 0, currentlyBlocked: 0 };
  }

  const now = Date.now();
  const durations = rows.map((r) => Math.max(0, (now - r.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const averageDays = Math.round((sum / durations.length) * 10) / 10;
  const maxDays = Math.round(Math.max(...durations) * 10) / 10;

  return {
    averageDays,
    maxDays,
    currentlyBlocked: rows.length,
  };
}

/** Executive health board: sparkbars and status indicators for all active top-level goals and active projects. */
export async function projectAndGoalHealth(viewer: Viewer): Promise<HealthBoard> {
  const [activeGoals, activeProjects] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate })
      .from(goals)
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), sql`${goals.parentGoalId} is null`))
      .orderBy(sql`${goals.targetDate} asc nulls last`, asc(goals.title)),
    db
      .select({ id: projects.id, name: projects.name, targetDate: projects.targetDate })
      .from(projects)
      .where(and(eq(projects.orgId, viewer.orgId), eq(projects.status, "active")))
      .orderBy(sql`${projects.targetDate} asc nulls last`, asc(projects.name)),
  ]);

  const [goalProgressMap, projectProgressMap] = await Promise.all([
    progressForGoals(viewer, activeGoals.map((g) => g.id)),
    progressForProjects(viewer, activeProjects.map((p) => p.id)),
  ]);

  function calculateHealth(total: number, completed: number, blocked: number, overdue: number): HealthStatus {
    if (blocked > 0 || (total > 0 && overdue / total >= 0.2)) return "at_risk";
    if (overdue > 0) return "needs_attention";
    return "on_track";
  }

  const goalHealth: GoalHealthRow[] = activeGoals.map((g) => {
    const prog = goalProgressMap.get(g.id) ?? { total: 0, completed: 0, blocked: 0, overdue: 0 };
    const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    return {
      id: g.id,
      title: g.title,
      targetDate: g.targetDate,
      total: prog.total,
      completed: prog.completed,
      blocked: prog.blocked,
      overdue: prog.overdue,
      pct,
      health: calculateHealth(prog.total, prog.completed, prog.blocked, prog.overdue),
    };
  });

  const projectHealth: ProjectHealthRow[] = activeProjects.map((p) => {
    const prog = projectProgressMap.get(p.id) ?? { total: 0, completed: 0, blocked: 0, overdue: 0 };
    const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      targetDate: p.targetDate,
      total: prog.total,
      completed: prog.completed,
      blocked: prog.blocked,
      overdue: prog.overdue,
      pct,
      health: calculateHealth(prog.total, prog.completed, prog.blocked, prog.overdue),
    };
  });

  return { goals: goalHealth, projects: projectHealth };
}
