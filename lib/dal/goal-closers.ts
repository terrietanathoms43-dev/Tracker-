import "server-only";
import { and, asc, eq, or, type SQL } from "drizzle-orm";
import type { Tx } from "@/db";
import { notifications, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { isClosedStatus, type ProposalStatus, type TaskStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment } from "@/lib/dal/assignments";
import { findMembership } from "@/lib/dal/orgs";
import { commentsWaitingSql, openCommentsSql } from "@/lib/dal/tasks";
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
      sourceCommentId: tasks.sourceCommentId,
      proposalStatus: tasks.proposalStatus,
      openComments: openCommentsSql,
      commentsWaitingOnTasks: commentsWaitingSql,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, goalId), eq(tasks.goalCloser, true)))
    .orderBy(asc(tasks.createdAt))
    .for("update", { of: tasks });
}

/**
 * A closer whose status this module changed, as it was before: the caller hands it to `syncLinkedWork`
 * (lib/dal/comment-tasks.ts), like every other status change. A closer is never made from a comment, so that finds
 * nothing to do; the call keeps the rule "every status change syncs" without exceptions.
 */
export type ChangedCloser = { id: string; title: string; status: TaskStatus; sourceCommentId: string | null; proposalStatus: ProposalStatus | null; to: TaskStatus };

/**
 * A goal that is active again has its last step open again: its completed closer goes back to Not started, with a
 * history line saying why, and a goal that has none (its closer was removed on 2026-11-07, before they came back)
 * gets one now. `exceptTaskId` is the task whose own status change reopened the goal: the caller writes that row.
 * Returns the closers it reopened.
 */
export async function reopenGoalCloser(tx: Tx, actorId: string, goal: CloserGoal, now: Date, exceptTaskId: string | null = null): Promise<ChangedCloser[]> {
  const closers = await closersOf(tx, goal.orgId, goal.id);
  const changed: ChangedCloser[] = [];
  if (closers.length === 0) {
    await createGoalCloser(tx, goal, actorId, now, `Made when “${goal.title}” became active again: completing it marks the goal achieved.`);
    return changed;
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
    changed.push({ id: closer.id, title: closer.title, status: closer.status, sourceCommentId: closer.sourceCommentId, proposalStatus: closer.proposalStatus, to: "not_started" });
  }
  return changed;
}

/**
 * The goal page's Mark completed completes the goal's open closer with it, so the goal and its last step never
 * disagree. Whatever would stop the closer being completed by hand (an open comment) stops this too. Returns the
 * closers it completed.
 */
export async function completeGoalCloser(tx: Tx, actorId: string, goal: CloserGoal, now: Date): Promise<ChangedCloser[]> {
  const changed: ChangedCloser[] = [];
  for (const closer of await closersOf(tx, goal.orgId, goal.id)) {
    if (isClosedStatus(closer.status)) continue;
    const plan = planTransition(closer, "completed", { summary: `Completed with its goal: “${goal.title}” was marked completed.` }, now);
    if (!plan.ok) throw new GuardError("conflict", `“${closer.title}” is completed with the goal. ${plan.error}`);
    await tx
      .update(tasks)
      .set({ ...plan.patch, updatedAt: now })
      .where(eq(tasks.id, closer.id));
    await recordActivity(tx, { orgId: goal.orgId, taskId: closer.id, actorId }, plan.activities, now);
    changed.push({ id: closer.id, title: closer.title, status: closer.status, sourceCommentId: closer.sourceCommentId, proposalStatus: closer.proposalStatus, to: "completed" });
  }
  return changed;
}

/**
 * The generated task is marked by goalCloser. An older generated row may have lost that flag during a
 * previous data change; recognise only the exact built-in title AND description as a legacy fallback.
 * A user-written task merely named "Everything completed" must be kept with the other work.
 */
export function automaticGoalTask(): SQL {
  return or(
    eq(tasks.goalCloser, true),
    and(eq(tasks.title, CLOSER_TITLE), eq(tasks.description, CLOSER_DESCRIPTION)),
  )!;
}

/** A deleted goal takes only its automatically generated closer(s) with it. Returns how many went. */
export async function deleteGoalClosers(tx: Tx, orgId: string, goalId: string): Promise<number> {
  const gone = await tx
    .delete(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, goalId), automaticGoalTask()))
    .returning({ id: tasks.id });
  for (const row of gone) await tx.delete(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.href, `/tasks/${row.id}`)));
  return gone.length;
}
