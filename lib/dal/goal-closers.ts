import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { notifications, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { isClosedStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment } from "@/lib/dal/assignments";
import { findMembership } from "@/lib/dal/orgs";
import { openCommentsSql } from "@/lib/dal/tasks";
import { CLOSER_DESCRIPTION, CLOSER_TITLE } from "@/lib/tasks/closer";
import { planTransition } from "@/lib/tasks/transitions";

// The goal's "Everything completed" task as a row (docs/PLAN.md, 2026-11-04 and 2026-11-09 logs): every goal is made
// with one (`tasks.goal_closer`), assigned to the goal's owner. It is the goal's last step: lib/dal/goal-achievement.ts
// refuses to complete it while other tasks under the goal are open and marks the goal achieved when it is completed.
// This module only writes the row and keeps it in step with its goal: open while the goal is active, completed with
// a goal marked completed by hand, gone with a deleted goal.

/** What a closer needs to know about its goal. */
export type CloserGoal = { id: string; orgId: string; projectId: string; ownerId: string | null; targetDate: string | null; title: string };

/** Writes a goal's "Everything completed" task, due on the goal's target, assigned to its owner when they work here. */
export async function createGoalCloser(
  tx: Tx,
  goal: Omit<CloserGoal, "title">,
  actorId: string,
  now: Date,
  note = "Made with the goal: completing it marks the goal achieved.",
): Promise<string> {
  const [created] = await tx
    .insert(tasks)
    .values({
      orgId: goal.orgId,
      projectId: goal.projectId,
      goalId: goal.id,
      title: CLOSER_TITLE,
      description: CLOSER_DESCRIPTION,
      createdBy: actorId,
      dueDate: goal.targetDate,
      goalCloser: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  const owner = goal.ownerId ? await findMembership(tx, goal.orgId, goal.ownerId) : null;
  const assignment = goal.ownerId !== null && owner !== null && owner.role !== "stakeholder" ? [goal.ownerId] : [];
  await applyAssignment(tx, created.id, actorId, [], assignment, now);
  await recordActivity(tx, { orgId: goal.orgId, taskId: created.id, actorId }, [{ kind: "created", after: { title: CLOSER_TITLE, goalCloser: true }, note }], now);
  return created.id;
}

/** The goal's closer rows, locked: one, unless old data left none (or a copy left two). */
function closersOf(tx: Tx, orgId: string, goalId: string) {
  return tx
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      startedAt: tasks.startedAt,
      approverId: tasks.approverId,
      blockedReason: tasks.blockedReason,
      parentTaskId: tasks.parentTaskId,
      openComments: openCommentsSql,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, goalId), eq(tasks.goalCloser, true)))
    .orderBy(asc(tasks.createdAt))
    .for("update", { of: tasks });
}

/**
 * A goal that is active again has its last step open again: its completed closer goes back to Not started, with a
 * history line saying why, and a goal that has none (its closer was removed on 2026-11-07, before they came back)
 * gets one now. `exceptTaskId` is the task whose own status change reopened the goal: the caller writes that row.
 */
export async function reopenGoalCloser(tx: Tx, actorId: string, goal: CloserGoal, now: Date, exceptTaskId: string | null = null): Promise<void> {
  const closers = await closersOf(tx, goal.orgId, goal.id);
  if (closers.length === 0) {
    await createGoalCloser(tx, goal, actorId, now, `Made when “${goal.title}” became active again: completing it marks the goal achieved.`);
    return;
  }
  for (const closer of closers) {
    if (closer.id === exceptTaskId || closer.status !== "completed") continue;
    const plan = planTransition(closer, "not_started", {}, now);
    if (!plan.ok) continue;
    await tx
      .update(tasks)
      .set({ ...plan.patch, updatedAt: now })
      .where(eq(tasks.id, closer.id));
    const note = `Open again with its goal: “${goal.title}” is active again.`;
    await recordActivity(tx, { orgId: goal.orgId, taskId: closer.id, actorId }, plan.activities.map((activity) => (activity.kind === "reopened" ? { ...activity, note } : activity)), now);
  }
}

/**
 * The goal page's Mark completed completes the goal's open closer with it, so the goal and its last step never
 * disagree. Whatever would stop the closer being completed by hand (an open comment) stops this too.
 */
export async function completeGoalCloser(tx: Tx, actorId: string, goal: CloserGoal, now: Date): Promise<void> {
  for (const closer of await closersOf(tx, goal.orgId, goal.id)) {
    if (isClosedStatus(closer.status)) continue;
    const plan = planTransition(closer, "completed", { summary: `Completed with its goal: “${goal.title}” was marked completed.` }, now);
    if (!plan.ok) throw new GuardError("conflict", `“${closer.title}” is completed with the goal. ${plan.error}`);
    await tx
      .update(tasks)
      .set({ ...plan.patch, updatedAt: now })
      .where(eq(tasks.id, closer.id));
    await recordActivity(tx, { orgId: goal.orgId, taskId: closer.id, actorId }, plan.activities, now);
  }
}

/** A deleted goal takes its closer with it: the task means nothing without the goal. Returns how many went. */
export async function deleteGoalClosers(tx: Tx, orgId: string, goalId: string): Promise<number> {
  const gone = await tx
    .delete(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, goalId), eq(tasks.goalCloser, true)))
    .returning({ id: tasks.id });
  for (const row of gone) await tx.delete(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.href, `/tasks/${row.id}`)));
  return gone.length;
}
