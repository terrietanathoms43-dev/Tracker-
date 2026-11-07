import "server-only";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { goals, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { CLOSED_STATUSES, isClosedStatus, type TaskStatus } from "@/lib/constants";
import { createGoalOccurrence, type NextGoal } from "@/lib/dal/recurrence";
import { liveOnly } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import { nextAfterFinishing } from "@/lib/recurrence";
import { dayKey } from "@/lib/time";

// Goals and their tasks are one thing (docs/PLAN.md, 2026-11-07 log; it replaces the "Everything completed" task of
// 2026-11-04): a goal is achieved the moment the last open task under it (sub-goals included) is completed, and it
// cannot be marked completed by hand while any task under it is open. A task added to an achieved goal, moved into
// it, or reopened under it makes the goal active again. Completing the last task of a repeating goal makes the next
// occurrence, tasks included, as the goal's own Mark completed did.

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** Open live tasks under a goal and its sub-goals, `exceptId` aside: what stands between the goal and being achieved. */
export async function openTasksUnderGoal(tx: Tx, orgId: string, goalId: string, exceptId: string | null = null): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        liveOnly,
        notInArray(tasks.status, [...CLOSED_STATUSES]),
        exceptId === null ? undefined : ne(tasks.id, exceptId),
        sql`${tasks.goalId} in (select g.id from goals g where g.id = ${goalId} or g.parent_goal_id = ${goalId})`,
      ),
    );
  return row?.n ?? 0;
}

/** What the goal page says when Mark completed is asked for while tasks are open. */
export function openTasksMessage(open: number, title: string): string {
  return `Finish the ${plural(open, "open task")} under “${title}” first, or close them another way: a goal is achieved when its tasks are done.`;
}

const goalColumns = {
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
  status: goals.status,
};

async function lockGoal(tx: Tx, orgId: string, goalId: string) {
  const [goal] = await tx
    .select(goalColumns)
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, orgId)))
    .for("update");
  return goal ?? null;
}

type LockedGoal = NonNullable<Awaited<ReturnType<typeof lockGoal>>>;

export type GoalOutcome = {
  goal: { id: string; title: string };
  /** The goal was marked achieved by this change. */
  achieved: boolean;
  /** The goal was achieved and is active again because of this change. */
  reopened: boolean;
  /** The next occurrence of a repeating goal, when achieving it made one. */
  next: NextGoal | null;
};

/** Marks an active goal achieved: completed now, by the viewer, and the next occurrence of a repeating goal made. */
async function achieve(tx: Tx, viewer: Viewer, goal: LockedGoal, now: Date): Promise<GoalOutcome> {
  await tx.update(goals).set({ status: "completed", completedAt: now, completedBy: viewer.userId, updatedAt: now }).where(eq(goals.id, goal.id));
  const today = dayKey(now, viewer.timezone);
  const targetDate = goal.recurrence ? nextAfterFinishing(goal.recurrence, goal.targetDate, goal.targetDate, today) : null;
  const next = targetDate ? await createGoalOccurrence(tx, viewer.userId, { ...goal, recurrence: goal.recurrence ?? null }, targetDate, now) : null;
  return { goal: { id: goal.id, title: goal.title }, achieved: true, reopened: false, next };
}

/** An achieved goal becomes active again (there is open work under it). */
async function reopen(tx: Tx, goal: LockedGoal, now: Date): Promise<GoalOutcome> {
  await tx.update(goals).set({ status: "active", completedAt: null, completedBy: null, updatedAt: now }).where(eq(goals.id, goal.id));
  return { goal: { id: goal.id, title: goal.title }, achieved: false, reopened: true, next: null };
}

/**
 * What a task's status change does to its goal, and to that goal's parent when it is a sub-goal. Completing the
 * last open task under an active goal achieves it (then the parent too, when nothing is left open under it);
 * reopening a task under an achieved goal makes the goal (and an achieved parent) active again. Null when the
 * task has no goal or nothing changes. Call it before the task row itself is updated: it counts the other tasks.
 */
export async function applyGoalRules(tx: Tx, viewer: Viewer, task: { id: string; goalId: string | null; status: TaskStatus }, to: TaskStatus, now: Date): Promise<GoalOutcome | null> {
  if (task.goalId === null) return null;
  const completing = to === "completed" && task.status !== "completed";
  const opening = !isClosedStatus(to) && isClosedStatus(task.status);
  if (!completing && !opening) return null;
  const goal = await lockGoal(tx, viewer.orgId, task.goalId);
  if (goal === null) return null;
  if (completing) {
    const outcome = goal.status === "active" && (await openTasksUnderGoal(tx, viewer.orgId, goal.id, task.id)) === 0 ? await achieve(tx, viewer, goal, now) : null;
    // A sub-goal achieved may have been the last open thing under its parent.
    if (goal.parentGoalId !== null) {
      const parent = await lockGoal(tx, viewer.orgId, goal.parentGoalId);
      if (parent !== null && parent.status === "active" && (await openTasksUnderGoal(tx, viewer.orgId, parent.id, task.id)) === 0) {
        const above = await achieve(tx, viewer, parent, now);
        return outcome ?? above;
      }
    }
    return outcome;
  }
  const outcome = goal.status === "completed" ? await reopen(tx, goal, now) : null;
  if (goal.parentGoalId !== null) {
    const parent = await lockGoal(tx, viewer.orgId, goal.parentGoalId);
    if (parent !== null && parent.status === "completed") await reopen(tx, parent, now);
  }
  return outcome;
}

/**
 * When a task is added to a goal, or moved under one: an achieved goal (and its achieved parent) is active again,
 * because there is open work under it now. Returns the goal made active, or null when nothing changed.
 */
export async function reopenGoalForNewWork(tx: Tx, viewer: Viewer, goalId: string, now: Date): Promise<{ id: string; title: string } | null> {
  const goal = await lockGoal(tx, viewer.orgId, goalId);
  if (goal === null) return null;
  const outcome = goal.status === "completed" ? await reopen(tx, goal, now) : null;
  if (goal.parentGoalId !== null) {
    const parent = await lockGoal(tx, viewer.orgId, goal.parentGoalId);
    if (parent !== null && parent.status === "completed") await reopen(tx, parent, now);
  }
  return outcome?.goal ?? null;
}

/** The goal page's own Mark completed: refused while any task under the goal is open. */
export async function assertNoOpenTasks(tx: Tx, orgId: string, goal: { id: string; title: string }): Promise<void> {
  const open = await openTasksUnderGoal(tx, orgId, goal.id);
  if (open > 0) throw new GuardError("conflict", openTasksMessage(open, goal.title));
}

/** " “Ship onboarding” is achieved." (plus the next occurrence) or " “Ship onboarding” is active again.", to add to a toast. */
export function describeGoalOutcome(outcome: GoalOutcome | null, today: string, formatDay: (day: string, today: string) => string): string {
  if (outcome === null) return "";
  if (outcome.reopened) return ` “${outcome.goal.title}” is active again.`;
  if (!outcome.achieved) return "";
  const next = outcome.next ? ` The next one is due ${formatDay(outcome.next.targetDate, today)}${outcome.next.tasks > 0 ? ` with ${plural(outcome.next.tasks, "task")} copied over` : ""}.` : "";
  return ` “${outcome.goal.title}” is achieved.${next}`;
}
