import "server-only";
import { and, asc, desc, eq, isNotNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { projects, taskActivity, taskAssignees, tasks, taskUpdates, teams } from "@/db/schema";
import { CLOSED_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { listWorkers } from "@/lib/dal/orgs";
import { assigneesJson, teamsJson } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import type { Assignees, Person, TeamRef } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";
import type { ReportRange } from "./range";

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

/** One worker's counts in the range (direct assignments). Counts only: the report never compares people. */
export type ContributionRow = { person: Person; completed: number; progressUpdates: number; blockersRaised: number };

/** One team's counts: what it delivered in the range and what it holds today. */
export type TeamReportRow = { team: TeamRef; members: number; completed: number; open: number; blocked: number; overdue: number };

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
      teams: teamsJson,
      evidence: sql<ReportTask["evidence"]>`coalesce((select json_agg(json_build_object('url', l.url, 'label', l.label) order by l.created_at) from task_links l where l.task_id = ${tasks.id}), '[]'::json)`,
    })
    .from(tasks)
    .leftJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.orgId, viewer.orgId)))
    .where(and(eq(tasks.orgId, viewer.orgId), where))
    .orderBy(...(order === "completed" ? [desc(tasks.completedAt)] : [sql`${tasks.dueDate} asc nulls last`, asc(tasks.title)]))
    .limit(1000);
  return rows.map(({ people, teams: teamRefs, completedAt, ...row }) => ({
    ...row,
    completedDay: completedAt ? dayKey(completedAt, viewer.timezone) : null,
    assignees: { people, teams: teamRefs },
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
 * Per current worker, in the range: tasks they were assigned to directly that were completed, progress updates
 * they wrote and blockers they raised. Everyone is listed, zeros included, alphabetically, so the order says
 * nothing about the numbers. A task with two people on it counts once for each.
 */
export async function contributionCounts(viewer: Viewer, range: ReportRange): Promise<ContributionRow[]> {
  const n = sql<number>`count(*)::int`;
  const [workers, completed, updates, blockers] = await Promise.all([
    listWorkers(viewer),
    db
      .select({ personId: taskAssignees.userId, n })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.status, "completed"), withinDays(tasks.completedAt, range, viewer.timezone)))
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
  const [completedBy, updatesBy, blockersBy] = [tally(completed), tally(updates), tally(blockers)];
  return workers
    .map((worker) => ({
      person: { id: worker.userId, name: worker.name, email: worker.email, image: worker.image },
      completed: completedBy.get(worker.userId) ?? 0,
      progressUpdates: updatesBy.get(worker.userId) ?? 0,
      blockersRaised: blockersBy.get(worker.userId) ?? 0,
    }))
    .sort((a, b) => (a.person.name ?? a.person.email ?? "").localeCompare(b.person.name ?? b.person.email ?? ""));
}

/**
 * Per team, by name: how many people are in it, the tasks it was assigned to that were completed in the range, and
 * what it holds as of today (open, blocked, overdue). Every team is listed, zeros included.
 */
export async function teamCounts(viewer: Viewer, range: ReportRange, today: string): Promise<TeamReportRow[]> {
  const inRange = withinDays(sql`t.completed_at`, range, viewer.timezone);
  const closed = sql.join(
    CLOSED.map((status) => sql`${status}`),
    sql`, `,
  );
  // Named with its table: in a select without joins Drizzle writes `${teams.id}` as a bare `"id"` inside raw SQL,
  // which would bind to the subquery's own table (see lib/dal/teams.ts).
  const teamId = sql`${teams}.${sql.identifier("id")}`;
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      members: sql<number>`(select count(*)::int from team_members m where m.team_id = ${teamId})`,
      completed: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${teamId} and t.status = 'completed' and ${inRange})`,
      open: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${teamId} and t.status not in (${closed}))`,
      blocked: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${teamId} and t.status = 'blocked')`,
      overdue: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${teamId} and t.status not in (${closed}) and t.due_date < ${today}::date)`,
    })
    .from(teams)
    .where(eq(teams.orgId, viewer.orgId))
    .orderBy(asc(teams.name));
  return rows.map(({ id, name, ...counts }) => ({ team: { id, name }, ...counts }));
}
