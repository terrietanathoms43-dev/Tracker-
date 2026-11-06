import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { taskApprovals, tasks } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { assignedNotice, chainForPlacement, startChain } from "@/lib/approvals/chain";
import { recordActivity } from "@/lib/dal/activity";
import type { lockTask } from "@/lib/dal/tasks";
import type { Notice } from "@/lib/notify";
import { canSendLocalTask, isLocal, type Viewer } from "@/lib/permissions";

// Sending a local task on (docs/PLAN.md, 2026-11-06 log): where its goal or project still asks for sign-off it
// becomes a proposal and the chain starts; where none applies any more it is published, a live task at once. One
// helper, so the task page's button, the row menu and the Local section's bar all do exactly the same thing.

type Locked = NonNullable<Awaited<ReturnType<typeof lockTask>>>;

/**
 * Inside the caller's transaction: the chain is read afresh from the task's placement, the task leaves its local
 * state, the history says what happened, and the notices to send after the commit come back. `live` is whether it
 * was published rather than proposed.
 */
export async function submitLocalTask(tx: Tx, viewer: Viewer, locked: Locked, now: Date): Promise<{ live: boolean; notices: Notice[] }> {
  const { task, assignment, scope } = locked;
  if (!isLocal(task)) throw new GuardError("conflict", "This task isn't a local task any more.");
  if (!canSendLocalTask(viewer, scope)) throw new GuardError("forbidden", "Only the person who made a local task can send it on.");
  const chain = await chainForPlacement(tx, viewer, { projectId: task.projectId, goalId: task.goalId });
  await tx.delete(taskApprovals).where(eq(taskApprovals.taskId, task.id));
  if (chain === null) {
    await tx.update(tasks).set({ proposalStatus: null, updatedAt: now }).where(eq(tasks.id, task.id));
    await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "published", note: "No sign-off applies here, so it is a live task now." }], now);
    return { live: true, notices: assignedNotice(viewer, task, assignment, true) };
  }
  await tx.update(tasks).set({ proposalStatus: "pending", updatedAt: now }).where(eq(tasks.id, task.id));
  await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "proposal_sent", after: { steps: chain.length } }], now);
  const notices = await startChain(tx, viewer, task, chain, now);
  return { live: false, notices };
}
