import "server-only";
import type { Tx } from "@/db";
import { db } from "@/db";
import { taskApprovals } from "@/db/schema";
import { chainFor, currentStep, type ChainStep } from "@/lib/approvals/policy";
import { readPolicy } from "@/lib/dal/approvals";
import { leaderIds } from "@/lib/dal/orgs";
import type { Notice } from "@/lib/notify";
import type { Viewer } from "@/lib/permissions";

// The chain a new task gets, written onto it (docs/PLAN.md, 2026-11-03 log): shared by creating a task, sending a
// local task for sign-off (2026-11-06 log) and sending a declined proposal again. Server-only helpers, not actions.

const taskHref = (taskId: string) => `/tasks/${taskId}`;

/** Who hears that a step is theirs: the people it names, or every leader and admin when it names nobody. */
export async function stepRecipients(tx: Tx, orgId: string, step: { userIds: string[] }): Promise<string[]> {
  return step.userIds.length > 0 ? step.userIds : leaderIds(tx, orgId);
}

/**
 * Writes a proposal's chain (steps naming the proposer already signed), and returns the notice for whoever is up
 * first (none when every step was the proposer's own). The caller marks the task pending.
 */
export async function startChain(tx: Tx, viewer: Viewer, task: { id: string; title: string }, chain: ChainStep[], now: Date): Promise<Notice[]> {
  await tx.insert(taskApprovals).values(
    chain.map((step) => ({
      taskId: task.id,
      position: step.position,
      userId: step.userIds[0] ?? null,
      userIds: step.userIds,
      decision: step.autoSigned ? ("approved" as const) : null,
      decidedBy: step.autoSigned ? viewer.userId : null,
      decidedAt: step.autoSigned ? now : null,
      createdAt: now,
    })),
  );
  const next = currentStep(chain.map((step) => ({ position: step.position, userIds: step.userIds, decision: step.autoSigned ? ("approved" as const) : null })));
  if (next === null) return [];
  const recipients = await stepRecipients(tx, viewer.orgId, next);
  return [{ orgId: viewer.orgId, actorId: viewer.userId, recipients, kind: "proposal_waiting", title: `Proposal to sign off: ${task.title}`, body: `Step ${next.position} of ${chain.length}.`, href: taskHref(task.id) }];
}

/** The chain a task in this placement gets for this creator, read from the goal's and project's policies (null: it goes live). */
export async function chainForPlacement(handle: Tx | typeof db, viewer: Viewer, placement: { projectId: string | null; goalId: string | null }): Promise<ChainStep[] | null> {
  const [goalPolicy, projectPolicy] = await Promise.all([
    readPolicy(handle, viewer.orgId, placement.goalId ? { goalId: placement.goalId } : null),
    readPolicy(handle, viewer.orgId, placement.projectId ? { projectId: placement.projectId } : null),
  ]);
  return chainFor({ creatorId: viewer.userId, creatorRole: viewer.orgRole, goal: goalPolicy, project: projectPolicy });
}

/** "New task for you" / "Assigned to you" for everyone newly on a task; the actor never hears about their own change. */
export function assignedNotice(viewer: Viewer, task: { id: string; title: string; nextAction: string | null }, recipients: string[], fresh: boolean): Notice[] {
  if (recipients.length === 0) return [];
  return [
    {
      orgId: viewer.orgId,
      actorId: viewer.userId,
      recipients,
      kind: "assigned",
      title: `${fresh ? "New task for you" : "Assigned to you"}: ${task.title}`,
      body: task.nextAction ? `${fresh ? "First step" : "Next"}: ${task.nextAction}` : null,
      href: taskHref(task.id),
    },
  ];
}
