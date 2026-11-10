import "server-only";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { goals, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { CLOSED_STATUSES, isClosedStatus, type TaskStatus } from "@/lib/constants";
import { reopenGoalCloser } from "@/lib/dal/goal-closers";
import { createGoalOccurrence, type NextGoal } from "@/lib/dal/recurrence";
import { liveOnly } from "@/lib/dal/tasks";
import type { Notice } from "@/lib/notify";
import type { Viewer } from "@/lib/permissions";
import { nextAfterFinishing } from "@/lib/recurrence";
import { closerHeldMessage } from "@/lib/tasks/closer";
import { dayKey } from "@/lib/time";

// How a goal and the tasks under it move together (docs/PLAN.md, 2026-11-07 and 2026-11-09 logs). Every goal has an
// "Everything completed" task (its closer, lib/dal/goal-closers.ts) and that task is the goal's last step: it cannot
// be completed while another task under the goal (sub-goals included) is open, and completing it marks the goal
// achieved there and then, making the next occurrence of a repeating goal. The rule underneath is the 2026-11-07 one,
// "a goal is achieved when the last open task under it is completed": with a closer that last task is always the
// closer, and a goal whose closer was closed another way is still achieved by whichever task is completed last.
// Open work under an achieved goal makes it active again (a task reopened under it, added to it or moved into it),
// and its closer opens again with it, so the goal always ends with that step. The goal page's own Mark completed is
// refused while any other task is open, and completes the closer with the goal.

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/**
 * Open live tasks under a goal and its sub-goals: what stands between the goal and being achieved. `exceptId` leaves
 * one task out (the one being completed); `exceptOwnCloser` leaves out the goal's own closer (the goal page's Mark
 * completed completes that one itself).
 */
export async function openTasksUnderGoal(tx: Tx, orgId: string, goalId: string, exceptId: string | null = null, exceptOwnCloser = false): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        liveOnly,
        notInArray(tasks.status, [...CLOSED_STATUSES]),
        exceptId === null ? undefined : ne(tasks.id, exceptId),
        exceptOwnCloser ? sql`not (${tasks.goalCloser} and ${tasks.goalId} = ${goalId})` : undefined,
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
  createdBy: goals.createdBy,
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
  /** Who hears that the goal was achieved: its owner and whoever made it (lib/notify.ts leaves the actor out). */
  notify: string[];
};

/** Whether a later occurrence of a repeating goal already exists: only the latest one makes the next. */
async function hasLaterOccurrence(tx: Tx, goal: LockedGoal): Promise<boolean> {
  if (goal.targetDate === null) return false;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(goals)
    .where(and(eq(goals.orgId, goal.orgId), eq(goals.seriesId, goal.seriesId ?? goal.id), ne(goals.id, goal.id), sql`${goals.targetDate} > ${goal.targetDate}::date`));
  return (row?.n ?? 0) > 0;
}

/**
 * Marks an active goal achieved: completed now, by the viewer, and the next occurrence of a repeating goal made
 * (once: a goal reopened and achieved a second time never makes a second next one).
 */
async function achieve(tx: Tx, viewer: Viewer, goal: LockedGoal, now: Date): Promise<GoalOutcome> {
  await tx.update(goals).set({ status: "completed", completedAt: now, completedBy: viewer.userId, updatedAt: now }).where(eq(goals.id, goal.id));
  const today = dayKey(now, viewer.timezone);
  const targetDate = goal.recurrence && !(await hasLaterOccurrence(tx, goal)) ? nextAfterFinishing(goal.recurrence, goal.targetDate, goal.targetDate, today) : null;
  const next = targetDate ? await createGoalOccurrence(tx, viewer.userId, { ...goal, recurrence: goal.recurrence ?? null }, targetDate, now) : null;
  const notify = [...new Set([goal.ownerId, goal.createdBy])].filter((userId): userId is string => userId !== null);
  return { goal: { id: goal.id, title: goal.title }, achieved: true, reopened: false, next, notify };
}

/**
 * An achieved goal becomes active again (there is open work under it), and its closer opens again with it.
 * `exceptTaskId`: the task whose own reopening caused this, whose row the caller writes.
 */
async function reopen(tx: Tx, viewer: Viewer, goal: LockedGoal, now: Date, exceptTaskId: string | null): Promise<GoalOutcome> {
  await tx.update(goals).set({ status: "active", completedAt: null, completedBy: null, updatedAt: now }).where(eq(goals.id, goal.id));
  await reopenGoalCloser(tx, viewer.userId, goal, now, exceptTaskId);
  return { goal: { id: goal.id, title: goal.title }, achieved: false, reopened: true, next: null, notify: [] };
}

/**
 * What a task's status change does to its goal, and to that goal's parent when it is a sub-goal. Completing the
 * goal's closer is refused while another task under the goal is open, and achieves the goal otherwise; any task
 * completed last under an active goal achieves it the same way (a goal whose closer was closed without completing
 * it), then the parent too, when nothing is left open under it. Reopening a task under an achieved goal makes the
 * goal (and an achieved parent) active again. Null when the task has no goal or nothing changes. Call it before the
 * task row itself is updated: it counts the other tasks.
 */
export async function applyGoalRules(tx: Tx, viewer: Viewer, task: { id: string; goalId: string | null; status: TaskStatus; goalCloser: boolean }, to: TaskStatus, now: Date): Promise<GoalOutcome | null> {
  if (task.goalId === null) return null;
  const completing = to === "completed" && task.status !== "completed";
  const opening = !isClosedStatus(to) && isClosedStatus(task.status);
  if (!completing && !opening) return null;
  const goal = await lockGoal(tx, viewer.orgId, task.goalId);
  if (goal === null) return null;
  if (completing) {
    const others = goal.status === "active" || task.goalCloser ? await openTasksUnderGoal(tx, viewer.orgId, goal.id, task.id) : null;
    // The closer is the goal's last step: it waits for everything else under the goal.
    if (task.goalCloser && others !== null && others > 0) throw new GuardError("conflict", closerHeldMessage(others, goal.title));
    const outcome = goal.status === "active" && others === 0 ? await achieve(tx, viewer, goal, now) : null;
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
  const outcome = goal.status === "completed" ? await reopen(tx, viewer, goal, now, task.id) : null;
  if (goal.parentGoalId !== null) {
    const parent = await lockGoal(tx, viewer.orgId, goal.parentGoalId);
    if (parent !== null && parent.status === "completed") await reopen(tx, viewer, parent, now, task.id);
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
  const outcome = goal.status === "completed" ? await reopen(tx, viewer, goal, now, null) : null;
  if (goal.parentGoalId !== null) {
    const parent = await lockGoal(tx, viewer.orgId, goal.parentGoalId);
    if (parent !== null && parent.status === "completed") await reopen(tx, viewer, parent, now, null);
  }
  return outcome?.goal ?? null;
}

/** The goal page's own Mark completed: refused while any task under the goal is open, its own closer aside (it is completed with the goal). */
export async function assertNoOpenTasks(tx: Tx, orgId: string, goal: { id: string; title: string }): Promise<void> {
  const open = await openTasksUnderGoal(tx, orgId, goal.id, null, true);
  if (open > 0) throw new GuardError("conflict", openTasksMessage(open, goal.title));
}

/** What the owner and the maker of a goal hear when it is achieved: nothing for whoever achieved it themselves. */
export function goalAchievedNotice(viewer: Viewer, goal: { id: string; title: string }, recipients: (string | null)[]): Notice[] {
  const people = [...new Set(recipients)].filter((userId): userId is string => userId !== null && userId !== viewer.userId);
  if (people.length === 0) return [];
  return [{ orgId: viewer.orgId, actorId: viewer.userId, recipients: people, kind: "goal_achieved", title: `Goal achieved: ${goal.title}`, href: `/goals/${goal.id}` }];
}

/** " “Ship onboarding” is achieved." (plus the next occurrence) or " “Ship onboarding” is active again.", to add to a toast. */
export function describeGoalOutcome(outcome: GoalOutcome | null, today: string, formatDay: (day: string, today: string) => string): string {
  if (outcome === null) return "";
  if (outcome.reopened) return ` “${outcome.goal.title}” is active again.`;
  if (!outcome.achieved) return "";
  const next = outcome.next ? ` The next one is due ${formatDay(outcome.next.targetDate, today)}${outcome.next.tasks > 0 ? ` with ${plural(outcome.next.tasks, "task")} copied over` : ""}.` : "";
  return ` “${outcome.goal.title}” is achieved.${next}`;
}
