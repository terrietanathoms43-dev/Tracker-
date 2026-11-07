import "server-only";
import { and, asc, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Tx } from "@/db";
import { goals, tasks } from "@/db/schema";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, assignmentOf } from "@/lib/dal/assignments";
import { liveOnly } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import { describeRecurrence, missedOccurrences, type Recurrence } from "@/lib/recurrence";
import { calendarDaysBetween, dayKey } from "@/lib/time";

// Repeating tasks and goals, on the server (docs/PLAN.md, 2026-11-03 and 2026-11-04 logs). An occurrence is made
// when the one before it is finished (actions/tasks.ts, actions/goals.ts) and, since 2026-11-04, whenever its day
// comes round whether or not the one before was finished: `catchUpRecurrences` runs at the top of every work screen
// and writes the occurrences a series owes up to today, so five missed days show five overdue tasks to deal with
// in one batch. Nothing is ever doubled: one advisory lock per workspace, and only days after the latest occurrence.

/** How many occurrences one series may owe in one go; a series left for a year is capped, not exploded. */
const MAX_PER_SERIES = 60;

type SourceTask = {
  id: string;
  orgId: string;
  projectId: string | null;
  goalId: string | null;
  title: string;
  description: string | null;
  createdBy: string;
  priority: typeof tasks.$inferSelect.priority;
  dueTime: string | null;
  recurrence: Recurrence | null;
  seriesId: string | null;
};

/** The first due day of a series: the schedule's anchor, so "every 2 weeks" keeps its rhythm whoever finishes late. */
export async function seriesAnchor(tx: Tx, orgId: string, seriesId: string): Promise<string | null> {
  const [row] = await tx
    .select({ day: sql<string | null>`min(${tasks.dueDate})` })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.seriesId, seriesId)));
  return row?.day ?? null;
}

/** Whether the series already has an occurrence due after `due` (so finishing an old one never makes another next). */
export async function seriesHasLaterOccurrence(tx: Tx, orgId: string, seriesId: string, due: string | null): Promise<boolean> {
  if (due === null) return false;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.seriesId, seriesId), sql`${tasks.dueDate} > ${due}::date`));
  return (row?.n ?? 0) > 0;
}

/** One more occurrence of a repeating task: same title, people, project, goal and rule; due on `due`. Returns its id. */
export async function createTaskOccurrence(tx: Tx, actorId: string, source: SourceTask, assignment: string[], due: string, now: Date, note: string): Promise<string> {
  const rule = source.recurrence;
  const [created] = await tx
    .insert(tasks)
    .values({
      orgId: source.orgId,
      projectId: source.projectId,
      goalId: source.goalId,
      title: source.title,
      description: source.description,
      createdBy: source.createdBy,
      priority: source.priority,
      dueDate: due,
      dueTime: source.dueTime,
      recurrence: rule,
      seriesId: source.seriesId ?? source.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  await applyAssignment(tx, created.id, actorId, [], assignment, now);
  await recordActivity(tx, { orgId: source.orgId, taskId: created.id, actorId }, [{ kind: "created", after: { title: source.title, repeatOf: source.id }, note }], now);
  return created.id;
}

export type NextGoal = { id: string; targetDate: string; tasks: number };

type SourceGoal = {
  id: string;
  orgId: string;
  projectId: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  successCriteria: string | null;
  ownerId: string | null;
  targetDate: string | null;
  recurrence: Recurrence | null;
  seriesId: string | null;
  requiresApproval: boolean;
};

/**
 * The next occurrence of a repeating goal: same project, owner, criteria and rule, target on `targetDate`, and fresh
 * copies of the goal's own live tasks (each due the same number of days after the new target as before, the same
 * people, the "Everything completed" task included).
 */
export async function createGoalOccurrence(tx: Tx, actorId: string, goal: SourceGoal, targetDate: string, now: Date): Promise<NextGoal> {
  const shift = goal.targetDate ? calendarDaysBetween(goal.targetDate, targetDate) : 0;
  const [created] = await tx
    .insert(goals)
    .values({
      orgId: goal.orgId,
      projectId: goal.projectId,
      parentGoalId: goal.parentGoalId,
      title: goal.title,
      description: goal.description,
      successCriteria: goal.successCriteria,
      ownerId: goal.ownerId,
      targetDate,
      recurrence: goal.recurrence,
      seriesId: goal.seriesId ?? goal.id,
      requiresApproval: goal.requiresApproval,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: goals.id });
  const copies = await tx
    .select({ id: tasks.id, title: tasks.title, description: tasks.description, priority: tasks.priority, dueDate: tasks.dueDate, dueTime: tasks.dueTime, createdBy: tasks.createdBy })
    .from(tasks)
    .where(and(eq(tasks.orgId, goal.orgId), eq(tasks.goalId, goal.id), liveOnly, notInArray(tasks.status, ["rejected", "cancelled"])));
  for (const source of copies) {
    const [task] = await tx
      .insert(tasks)
      .values({
        orgId: goal.orgId,
        projectId: goal.projectId,
        goalId: created.id,
        title: source.title,
        description: source.description,
        createdBy: actorId,
        priority: source.priority,
        dueDate: source.dueDate ? dayKey(new Date(Date.parse(`${source.dueDate}T00:00:00Z`) + shift * 86_400_000), "UTC") : null,
        dueTime: source.dueTime,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tasks.id });
    await applyAssignment(tx, task.id, actorId, [], await assignmentOf(tx, source.id), now);
    await recordActivity(tx, { orgId: goal.orgId, taskId: task.id, actorId }, [{ kind: "created", after: { title: source.title, copiedFrom: source.id }, note: `Copied into the next occurrence of the goal “${goal.title}”.` }], now);
  }
  return { id: created.id, targetDate, tasks: copies.length };
}

/** The occurrences every repeating task series in the workspace owes up to today, written. */
async function catchUpTasks(tx: Tx, viewer: Viewer, today: string): Promise<number> {
  const rows = await tx
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      projectId: tasks.projectId,
      goalId: tasks.goalId,
      title: tasks.title,
      description: tasks.description,
      createdBy: tasks.createdBy,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
      recurrence: tasks.recurrence,
      seriesId: tasks.seriesId,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, viewer.orgId), isNotNull(tasks.seriesId), isNotNull(tasks.recurrence), isNotNull(tasks.dueDate), liveOnly))
    .orderBy(asc(tasks.seriesId), desc(tasks.dueDate));
  // The latest occurrence of each series carries the rule forward; its first occurrence anchors the rhythm.
  const latestBySeries = new Map<string, (typeof rows)[number]>();
  const anchorBySeries = new Map<string, string>();
  for (const row of rows) {
    const series = row.seriesId!;
    if (!latestBySeries.has(series)) latestBySeries.set(series, row);
    anchorBySeries.set(series, row.dueDate!);
  }
  let made = 0;
  for (const [series, latest] of latestBySeries) {
    const rule = latest.recurrence;
    if (!rule) continue;
    const owed = missedOccurrences(rule, anchorBySeries.get(series) ?? latest.dueDate!, latest.dueDate!, today, MAX_PER_SERIES);
    if (owed.length === 0) continue;
    const assignment = await assignmentOf(tx, latest.id);
    const now = new Date();
    for (const due of owed) {
      await createTaskOccurrence(tx, viewer.userId, latest, assignment, due, now, `Occurrence of a repeating task (${describeRecurrence(rule, due)}): its day came round.`);
      made += 1;
    }
  }
  return made;
}

/** The occurrences every repeating goal series in the workspace owes up to today, written with their tasks. */
async function catchUpGoals(tx: Tx, viewer: Viewer, today: string): Promise<number> {
  const rows = await tx
    .select({
      id: goals.id,
      orgId: goals.orgId,
      projectId: goals.projectId,
      parentGoalId: goals.parentGoalId,
      title: goals.title,
      description: goals.description,
      successCriteria: goals.successCriteria,
      ownerId: goals.ownerId,
      targetDate: goals.targetDate,
      recurrence: goals.recurrence,
      seriesId: goals.seriesId,
      requiresApproval: goals.requiresApproval,
    })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), isNotNull(goals.seriesId), isNotNull(goals.recurrence), isNotNull(goals.targetDate)))
    .orderBy(asc(goals.seriesId), desc(goals.targetDate));
  const latestBySeries = new Map<string, (typeof rows)[number]>();
  const anchorBySeries = new Map<string, string>();
  for (const row of rows) {
    const series = row.seriesId!;
    if (!latestBySeries.has(series)) latestBySeries.set(series, row);
    anchorBySeries.set(series, row.targetDate!);
  }
  let made = 0;
  for (const [series, latest] of latestBySeries) {
    const rule = latest.recurrence;
    if (!rule) continue;
    const owed = missedOccurrences(rule, anchorBySeries.get(series) ?? latest.targetDate!, latest.targetDate!, today, MAX_PER_SERIES);
    let source = latest;
    for (const targetDate of owed) {
      const next = await createGoalOccurrence(tx, viewer.userId, source, targetDate, new Date());
      // The newest copy is what the next one copies, so the tasks stay in step with their goal.
      source = { ...source, id: next.id, targetDate };
      made += 1;
    }
  }
  return made;
}

/**
 * Writes every occurrence the workspace's repeating tasks and goals owe up to today. Once per request (React cache),
 * one workspace at a time (an advisory lock), and a no-op when nothing is owed, so it is cheap to call from every
 * work screen. Only workers trigger it: a stakeholder's screens read what is there.
 */
export const catchUpRecurrences = cache(async (viewer: Viewer): Promise<{ tasks: number; goals: number }> => {
  if (viewer.orgId === "" || viewer.orgRole === "stakeholder") return { tasks: 0, goals: 0 };
  const today = dayKey(new Date(), viewer.timezone);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${viewer.orgId}))`);
    const madeTasks = await catchUpTasks(tx, viewer, today);
    const madeGoals = await catchUpGoals(tx, viewer, today);
    return { tasks: madeTasks, goals: madeGoals };
  });
});
