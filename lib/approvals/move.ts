import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { taskApprovals, tasks } from "@/db/schema";
import { chainForPlacement, startChain } from "@/lib/approvals/chain";
import { recordActivity } from "@/lib/dal/activity";
import { findMembership } from "@/lib/dal/orgs";
import type { Notice } from "@/lib/notify";
import { isClosedStatus, type ProposalStatus, type TaskStatus } from "@/lib/constants";
import { isLive, type Viewer } from "@/lib/permissions";

// Moving a live task under sign-off (docs/PLAN.md, 2026-11-07 log). A task made where no sign-off applied (no
// project, or a project without it) and then moved into a project or goal that asks for sign-off used to arrive
// there live, skipping the queue. Now it becomes its maker's local task again, exactly as if it had been made there:
// off the main board, theirs to send for sign-off; a stakeholder's task goes straight to the chain, as theirs always
// do. Completed and otherwise closed tasks just move: there is nothing left to sign off.

type MovedTask = { id: string; title: string; createdBy: string; proposalStatus: ProposalStatus | null; status: TaskStatus; nextAction: string | null };

export type RegateOutcome = {
  /** What the task became: a local task of its maker, or a pending proposal. */
  became: "local" | "proposal";
  /** Who made it, for the toast when someone else moved it. */
  makerId: string;
  notices: Notice[];
};

/**
 * Inside the caller's transaction, once the task's new placement is known and written: if sign-off applies there
 * for the task's maker, the task leaves the main board again. Returns what happened, or null when the task stays
 * live (no sign-off there, the maker skips the queue, or the task is closed or not live to begin with).
 */
export async function regateMovedTask(tx: Tx, viewer: Viewer, task: MovedTask, placement: { projectId: string | null; goalId: string | null }, now: Date): Promise<RegateOutcome | null> {
  if (!isLive(task) || isClosedStatus(task.status)) return null;
  // The chain is the maker's: the person who proposes the work is the one sign-off is about.
  const maker = await findMembership(tx, viewer.orgId, task.createdBy);
  const makerId = maker === null ? viewer.userId : task.createdBy;
  const makerRole = maker === null ? viewer.orgRole : maker.role;
  const chain = await chainForPlacement(tx, { ...viewer, userId: makerId, orgRole: makerRole }, placement);
  if (chain === null) return null;
  await tx.delete(taskApprovals).where(eq(taskApprovals.taskId, task.id));
  if (makerRole === "stakeholder") {
    await tx.update(tasks).set({ proposalStatus: "pending", updatedAt: now }).where(eq(tasks.id, task.id));
    await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "proposal_sent", after: { steps: chain.length }, note: "Sign-off applies where it moved, so it is a proposal again." }], now);
    const notices = await startChain(tx, { ...viewer, userId: makerId, orgRole: makerRole }, task, chain, now);
    return { became: "proposal", makerId, notices };
  }
  await tx.update(tasks).set({ proposalStatus: "local", updatedAt: now }).where(eq(tasks.id, task.id));
  await recordActivity(
    tx,
    { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId },
    [{ kind: "edited", after: { local: true }, note: "Sign-off applies where it moved, so it is a local task again until its maker sends it for sign-off." }],
    now,
  );
  return { became: "local", makerId, notices: [] };
}

/** The words a move's toast adds when the task left the main board. */
export function describeRegate(outcome: RegateOutcome | null, viewer: Viewer, makerName: string | null): string {
  if (outcome === null) return "";
  if (outcome.became === "proposal") return " Sign-off applies there, so it is a proposal again and waits for its first signature.";
  return outcome.makerId === viewer.userId
    ? " Sign-off applies there, so it is your local task again: send it for sign-off when it is ready."
    : ` Sign-off applies there, so it is ${makerName ?? "its maker"}'s local task again until they send it for sign-off.`;
}
