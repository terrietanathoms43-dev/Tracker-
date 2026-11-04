import "server-only";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { goals, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { CLOSED_STATUSES, type TaskStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment } from "@/lib/dal/assignments";
import { findMembership } from "@/lib/dal/orgs";
import { createGoalOccurrence, type NextGoal } from "@/lib/dal/recurrence";
import { liveOnly } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import { nextAfterFinishing } from "@/lib/recurrence";
import { dayKey } from "@/lib/time";

// "Everything completed" (docs/PLAN.md, 2026-11-04 log): every goal gets one task that stands for the goal being
// achieved. It can only be completed once every other task under the goal (sub-goals included) is done, and
// completing it marks the goal achieved, in the same transaction; reopening it reopens the goal. So finishing a
// goal feels like finishing its last task, and the goal's own Mark completed button is only the manager's shortcut.

export const CLOSER_TITLE = "Everything completed";
export const CLOSER_DESCRIPTION = "Complete this last, once every other task under the goal is done: it marks the goal achieved.";

/** Writes a goal's "Everything completed" task, assigned to the goal's owner when they work here. */
export async function createGoalCloser(
  tx: Tx,
  input: { orgId: string; goalId: string; projectId: string; ownerId: string | null; targetDate: string | null; createdBy: string },
  now: Date,
): Promise<string> {
  const [created] = await tx
    .insert(tasks)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      goalId: input.goalId,
      title: CLOSER_TITLE,
      description: CLOSER_DESCRIPTION,
      createdBy: input.createdBy,
      dueDate: input.targetDate,
      goalCloser: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  const owner = input.ownerId ? await findMembership(tx, input.orgId, input.ownerId) : null;
  const assignment = owner !== null && owner.role !== "stakeholder" ? [input.ownerId!] : [];
  await applyAssignment(tx, created.id, input.createdBy, [], assignment, now);
  await recordActivity(tx, { orgId: input.orgId, taskId: created.id, actorId: input.createdBy }, [{ kind: "created", after: { title: CLOSER_TITLE, goalCloser: true }, note: "Made with the goal: completing it marks the goal achieved." }], now);
  return created.id;
}

/** Open live tasks under a goal and its sub-goals, `exceptId` aside: what stands between the closer and the goal. */
export async function openTasksUnderGoal(tx: Tx, orgId: string, goalId: string, exceptId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        liveOnly,
        notInArray(tasks.status, [...CLOSED_STATUSES]),
        ne(tasks.id, exceptId),
        sql`${tasks.goalId} in (select g.id from goals g where g.id = ${goalId} or g.parent_goal_id = ${goalId})`,
      ),
    );
  return row?.n ?? 0;
}

export type CloserOutcome = { goal: { id: string; title: string }; achieved: boolean; next: NextGoal | null };

/**
 * What a status change of a closer task does to its goal. Completing it with other tasks still open is refused
 * with the count; completing it last marks the goal achieved (and makes the next occurrence of a repeating goal);
 * reopening it makes the goal active again. Null for any other task.
 */
export async function applyGoalCloser(tx: Tx, viewer: Viewer, task: { id: string; goalId: string | null; goalCloser: boolean; status: TaskStatus }, to: TaskStatus, now: Date): Promise<CloserOutcome | null> {
  if (!task.goalCloser || task.goalId === null) return null;
  const completing = to === "completed" && task.status !== "completed";
  const reopening = task.status === "completed" && to !== "completed";
  if (!completing && !reopening) return null;
  const [goal] = await tx
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
      status: goals.status,
    })
    .from(goals)
    .where(and(eq(goals.id, task.goalId), eq(goals.orgId, viewer.orgId)))
    .for("update");
  if (!goal) return null;
  if (completing) {
    const open = await openTasksUnderGoal(tx, viewer.orgId, goal.id, task.id);
    if (open > 0) throw new GuardError("conflict", `Finish the other ${open} ${open === 1 ? "task" : "tasks"} under “${goal.title}” first: this one marks the goal achieved.`);
    if (goal.status === "completed") return { goal: { id: goal.id, title: goal.title }, achieved: false, next: null };
    await tx.update(goals).set({ status: "completed", completedAt: now, completedBy: viewer.userId, updatedAt: now }).where(eq(goals.id, goal.id));
    const today = dayKey(now, viewer.timezone);
    const targetDate = goal.recurrence ? nextAfterFinishing(goal.recurrence, goal.targetDate, goal.targetDate, today) : null;
    const next = targetDate ? await createGoalOccurrence(tx, viewer.userId, { ...goal, recurrence: goal.recurrence ?? null }, targetDate, now) : null;
    return { goal: { id: goal.id, title: goal.title }, achieved: true, next };
  }
  if (goal.status === "completed") await tx.update(goals).set({ status: "active", completedAt: null, completedBy: null, updatedAt: now }).where(eq(goals.id, goal.id));
  return { goal: { id: goal.id, title: goal.title }, achieved: false, next: null };
}

/** "“Ship onboarding” is achieved." plus the next occurrence, to add to a toast. */
export function describeCloser(outcome: CloserOutcome | null, today: string, formatDay: (day: string, today: string) => string): string {
  if (outcome === null || !outcome.achieved) return "";
  const next = outcome.next ? ` The next one is due ${formatDay(outcome.next.targetDate, today)}${outcome.next.tasks > 0 ? ` with ${outcome.next.tasks} ${outcome.next.tasks === 1 ? "task" : "tasks"} copied over` : ""}.` : "";
  return ` “${outcome.goal.title}” is achieved.${next}`;
}
