import "server-only";
import { and, eq, ne, notInArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { taskUpdates, tasks } from "@/db/schema";
import { CLOSED_STATUSES, isClosedStatus, type ProposalStatus, type TaskStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { applyGoalRules } from "@/lib/dal/goal-achievement";
import { liveOnly, lockTask } from "@/lib/dal/tasks";
import type { Notice } from "@/lib/notify";
import { isLive, type Viewer } from "@/lib/permissions";
import { closerLabel } from "@/lib/tasks/closer";
import { reopenedBecause, reopenedByTaskNote, resolvedByTaskNote } from "@/lib/tasks/comment-tasks";
import { planTransition } from "@/lib/tasks/transitions";

// Tasks made from comments, and what a status change does to the comment a task was made from (docs/PLAN.md,
// 2026-11-11 log). A link, not a sub-task: the made task stands on its own. The comment waits for the live tasks made
// from it: closing the last open one (any closed status) resolves the comment, reopening one opens it again, and the
// task the comment is on, when it was completed, goes back to In progress (nothing completed stays completed over an
// open comment). Every action that changes a task's status calls `syncLinkedWork` after writing the task's own row.
//
// Locks go task the comment is on → comment, the order setCommentResolved takes them, so two people resolving and
// closing at once wait for each other instead of deadlocking. A made task is always newer than the task its comment
// is on, so the chain of reopened tasks only ever walks back in time and cannot loop.

/** The comment a task names as its source: a comment of this workspace, with the task it is on. Not locked. */
export async function findSourceComment(tx: Tx, orgId: string, commentId: string): Promise<{ id: string; taskId: string } | null> {
  const [row] = await tx
    .select({ id: taskUpdates.id, taskId: taskUpdates.taskId })
    .from(taskUpdates)
    .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
    .where(and(eq(taskUpdates.id, commentId), eq(taskUpdates.kind, "comment"), eq(tasks.orgId, orgId)));
  return row ?? null;
}

/**
 * The comment a task names as its source and the task it is on, both locked for the rest of the transaction (that
 * task first). Null when it is not a comment of this workspace any more.
 */
export async function lockSourceComment(tx: Tx, orgId: string, commentId: string) {
  const found = await findSourceComment(tx, orgId, commentId);
  if (found === null) return null;
  const commented = await lockTask(tx, orgId, found.taskId);
  if (commented === null) return null;
  const [comment] = await tx
    .select({ id: taskUpdates.id, taskId: taskUpdates.taskId, authorId: taskUpdates.authorId, body: taskUpdates.body, resolvedAt: taskUpdates.resolvedAt })
    .from(taskUpdates)
    .where(and(eq(taskUpdates.id, found.id), eq(taskUpdates.taskId, commented.task.id), eq(taskUpdates.kind, "comment")))
    .for("update");
  return comment === undefined ? null : { comment, commented };
}

/** The live tasks made from a comment that are still open (`exceptTaskId`: the one being closed right now). */
export async function openTasksFromComment(tx: Tx, orgId: string, commentId: string, exceptTaskId: string | null = null): Promise<{ id: string; title: string }[]> {
  return tx
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.sourceCommentId, commentId), liveOnly, notInArray(tasks.status, [...CLOSED_STATUSES]), exceptTaskId === null ? undefined : ne(tasks.id, exceptTaskId)))
    .orderBy(tasks.createdAt);
}

/** A task whose status change may touch the comment it was made from. */
export type LinkedTask = { id: string; title: string; status: TaskStatus; sourceCommentId: string | null; proposalStatus: ProposalStatus | null };

export type LinkedOutcome = {
  notices: Notice[];
  /** What this change did to the comment the task was made from: resolved it, opened it again, or left it waiting for another task. */
  comment: "resolved" | "reopened" | "waiting" | null;
  /** The completed tasks this change put back to In progress, and the goals that became active again with them. */
  reopened: { id: string; title: string }[];
  goals: { id: string; title: string }[];
};

const nothing = (): LinkedOutcome => ({ notices: [], comment: null, reopened: [], goals: [] });

/** Far more than any real chain of comments and the tasks made from them; a guard, not a rule. */
const MAX_DEPTH = 12;

/**
 * A completed task goes back to In progress because a comment on it is open again (`why` is kept in its history and
 * told to the people on it). The same rules as reopening it by hand: its completion is cleared and an achieved goal
 * above it is active again; and, since its own status changed, the comment it was made from (if any) opens again too.
 */
async function reopenCompleted(tx: Tx, viewer: Viewer, taskId: string, why: string, now: Date, depth: number): Promise<LinkedOutcome> {
  const out = nothing();
  const locked = await lockTask(tx, viewer.orgId, taskId);
  if (locked === null || locked.task.status !== "completed") return out;
  const { task, assignment } = locked;
  const plan = planTransition(task, "in_progress", {}, now);
  if (!plan.ok || plan.activities.length === 0) return out;
  const goal = await applyGoalRules(tx, viewer, task, "in_progress", now);
  await tx.update(tasks).set({ ...plan.patch, updatedAt: now }).where(eq(tasks.id, task.id));
  await recordActivity(
    tx,
    { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId },
    plan.activities.map((activity) => (activity.kind === "reopened" ? { ...activity, note: why } : activity)),
    now,
  );
  const title = task.goalCloser ? closerLabel(task.title, task.goalTitle) : task.title;
  out.reopened.push({ id: task.id, title });
  if (goal?.reopened) out.goals.push(goal.goal);
  const recipients = [...new Set([...assignment, task.createdBy])];
  out.notices.push({ orgId: viewer.orgId, actorId: viewer.userId, recipients, kind: "reopened", title: `In progress again: ${title}`, body: why, href: `/tasks/${task.id}` });
  const above = await syncLinkedWork(tx, viewer, task, "in_progress", now, depth + 1);
  out.notices.push(...above.notices);
  out.reopened.push(...above.reopened);
  out.goals.push(...above.goals);
  return out;
}

/**
 * What a task's change of status does to the comment it was made from. Closing it (any closed status) resolves that
 * comment, once no other live task made from it is open; the comment's author hears, unless they closed it
 * themselves. Reopening it opens the comment again, and puts the task the comment is on back to In progress when that
 * task was completed. Call it after the task's own row is written; a task made any other way, or one that is not
 * live work, is left alone.
 */
export async function syncLinkedWork(tx: Tx, viewer: Viewer, task: LinkedTask, to: TaskStatus, now: Date, depth = 0): Promise<LinkedOutcome> {
  const out = nothing();
  const closing = isClosedStatus(to) && !isClosedStatus(task.status);
  const opening = !isClosedStatus(to) && isClosedStatus(task.status);
  if ((!closing && !opening) || task.sourceCommentId === null || !isLive(task) || depth > MAX_DEPTH) return out;
  const linked = await lockSourceComment(tx, viewer.orgId, task.sourceCommentId);
  if (linked === null) return out;
  const { comment, commented } = linked;
  if (commented.task.id === task.id) return out;
  const href = `/tasks/${commented.task.id}`;

  if (closing && comment.resolvedAt === null) {
    if ((await openTasksFromComment(tx, viewer.orgId, comment.id, task.id)).length > 0) {
      out.comment = "waiting";
      return out;
    }
    const note = resolvedByTaskNote(task.title, to);
    await tx.update(taskUpdates).set({ resolvedAt: now, resolvedBy: viewer.userId }).where(eq(taskUpdates.id, comment.id));
    await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, commented.task.id));
    await recordActivity(tx, { orgId: viewer.orgId, taskId: commented.task.id, actorId: viewer.userId }, [{ kind: "comment_resolved", after: { commentId: comment.id, byTaskId: task.id }, note }], now);
    out.comment = "resolved";
    // The person who asked hears that their comment was dealt with (2026-11-07 log), unless they closed the task themselves.
    if (comment.authorId !== viewer.userId) {
      const on = commented.task.goalCloser ? closerLabel(commented.task.title, commented.task.goalTitle) : commented.task.title;
      out.notices.push({ orgId: viewer.orgId, actorId: viewer.userId, recipients: [comment.authorId], kind: "comment_resolved", title: `Your comment on ${on} was resolved`, body: note, href });
    }
    return out;
  }

  if (opening) {
    if (comment.resolvedAt !== null) {
      await tx.update(taskUpdates).set({ resolvedAt: null, resolvedBy: null }).where(eq(taskUpdates.id, comment.id));
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, commented.task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: commented.task.id, actorId: viewer.userId }, [{ kind: "comment_reopened", after: { commentId: comment.id, byTaskId: task.id }, note: reopenedByTaskNote(task.title) }], now);
      out.comment = "reopened";
    }
    // An open comment holds the task it is on: completed, it goes back to In progress.
    if (commented.task.status === "completed") {
      const above = await reopenCompleted(tx, viewer, commented.task.id, reopenedBecause(task.title), now, depth);
      out.notices.push(...above.notices);
      out.reopened.push(...above.reopened);
      out.goals.push(...above.goals);
    }
  }
  return out;
}

/** " The comment it was made from is resolved." and " “Ship the report” is in progress again.": what a toast adds. */
export function describeLinked(outcome: LinkedOutcome | null): string {
  if (outcome === null) return "";
  const comment =
    outcome.comment === "resolved"
      ? " The comment it was made from is resolved."
      : outcome.comment === "reopened"
        ? " The comment it was made from is open again."
        : outcome.comment === "waiting"
          ? " The comment it was made from still waits for another task."
          : "";
  const reopened = outcome.reopened.map((each) => ` “${each.title}” is in progress again.`).join("");
  const goals = outcome.goals.map((each) => ` “${each.title}” is active again.`).join("");
  return `${comment}${reopened}${goals}`;
}
