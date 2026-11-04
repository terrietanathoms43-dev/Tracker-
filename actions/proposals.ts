"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { taskApprovals, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { APPROVAL_DECISIONS } from "@/lib/constants";
import { canDecideStep, currentStep } from "@/lib/approvals/policy";
import { lockTaskApprovals } from "@/lib/dal/approvals";
import { recordActivity } from "@/lib/dal/activity";
import { lockTask } from "@/lib/dal/tasks";
import { LIMITS } from "@/lib/limits";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import { canEditTask, isOpenProposal } from "@/lib/permissions";
import { optionalText } from "@/lib/sanitize";
import type { ActivityDraft } from "@/lib/tasks/transitions";
import { requireViewer } from "@/lib/viewer";
import { chainForPlacement, startChain, stepRecipients } from "./tasks";

// Proposals (docs/PLAN.md, 2026-11-03 log): a task that waits for its sign-off chain. Each step is decided by the
// person it names (or an admin; any leader when it names nobody). The last signature makes the task live; a
// decline sends it back to the proposer with a note, who may change it and send it again.

const id = z.string().min(1).max(64);
const taskHref = (taskId: string) => `/tasks/${taskId}`;

const decideSchema = z
  .object({
    taskId: id,
    decision: z.enum(APPROVAL_DECISIONS),
    note: optionalText(LIMITS.approvalNote),
    /** The task's `updatedAt` the decider looked at: a decision on a task that changed since is refused (2026-11-04 log). */
    seen: z.string().max(40).default(""),
  })
  .refine((data) => data.decision !== "declined" || data.note !== "", { path: ["note"], message: "Say why, so the proposer can change it." });

/** Signs or declines the step that is up on a pending proposal. */
export async function decideProposal(input: z.input<typeof decideSchema>): Promise<ActionResult<{ live: boolean }>> {
  return runAction("proposals.decide", decideSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { live: boolean }> => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, assignment } = locked;
      if (task.proposalStatus !== "pending") return { error: "This proposal isn't waiting for sign-off any more." };
      if (data.seen !== "" && task.updatedAt.toISOString() !== data.seen) return { error: "This proposal changed since you opened it. Read it again, then decide." };
      const steps = await lockTaskApprovals(tx, task.id);
      const step = currentStep(steps);
      if (step === null) return { error: "Every step of this proposal is already decided." };
      if (!canDecideStep(viewer, step)) throw new GuardError("forbidden", "This step isn't yours to sign off.");

      await tx
        .update(taskApprovals)
        .set({ decision: data.decision, decidedBy: viewer.userId, decidedAt: now, note: data.note || null })
        .where(eq(taskApprovals.id, step.id));
      const base = { orgId: viewer.orgId, actorId: viewer.userId, href: taskHref(task.id) };
      const drafts: ActivityDraft[] = [];
      if (data.decision === "declined") {
        await tx.update(tasks).set({ proposalStatus: "declined", updatedAt: now }).where(eq(tasks.id, task.id));
        drafts.push({ kind: "proposal_declined", after: { step: step.position }, note: data.note });
        notices.push({ ...base, recipients: [task.createdBy], kind: "proposal_decided", title: `Declined: ${task.title}`, body: data.note });
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
        return { live: false };
      }
      drafts.push({ kind: "proposal_signed", after: { step: String(step.position) }, note: data.note || null });
      const remaining = steps.map((each) => (each.id === step.id ? { ...each, decision: "approved" as const } : each));
      const next = currentStep(remaining);
      if (next === null) {
        await tx.update(tasks).set({ proposalStatus: "approved", updatedAt: now }).where(eq(tasks.id, task.id));
        drafts.push({ kind: "proposal_approved", after: { steps: steps.length } });
        notices.push({ ...base, recipients: [task.createdBy], kind: "proposal_decided", title: `Approved: ${task.title}`, body: data.note || "It is a live task now." });
        if (assignment.length > 0) notices.push({ ...base, recipients: assignment, kind: "assigned", title: `New task for you: ${task.title}`, body: task.nextAction ? `First step: ${task.nextAction}` : null });
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
        return { live: true };
      }
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
      const recipients = await stepRecipients(tx, viewer.orgId, next);
      notices.push({ ...base, recipients, kind: "proposal_waiting", title: `Proposal to sign off: ${task.title}`, body: `Step ${next.position} of ${steps.length}.` });
      return { live: false };
    });
    if ("error" in outcome) return fail(outcome.error);
    log.info("proposals.decided", { orgId: viewer.orgId, taskId: data.taskId, decision: data.decision, live: outcome.live, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(outcome, data.decision === "declined" ? "Declined. The proposer has your note." : outcome.live ? "Approved. It is a live task now." : "Signed off. It waits for the next person.");
  });
}

const resubmitSchema = z.object({ taskId: id });

/** Sends a declined proposal through its chain again, after the proposer has changed it. The chain is read afresh. */
export async function resubmitProposal(input: z.input<typeof resubmitSchema>): Promise<ActionResult> {
  return runAction("proposals.resubmit", resubmitSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<string | null> => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!isOpenProposal(task) || task.proposalStatus !== "declined") return "Only a declined proposal can be sent again.";
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden");
      await tx.delete(taskApprovals).where(eq(taskApprovals.taskId, task.id));
      const chain = await chainForPlacement(tx, { ...viewer, userId: task.createdBy, orgRole: viewer.orgRole }, { projectId: task.projectId, goalId: task.goalId });
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "proposal_resubmitted" }], now);
      if (chain === null) {
        // The rule that made it a proposal is gone: it is live now.
        await tx.update(tasks).set({ proposalStatus: "approved", updatedAt: now }).where(eq(tasks.id, task.id));
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "proposal_approved", note: "No sign-off is required here any more." }], new Date(now.getTime() + 1));
        return null;
      }
      await tx.update(tasks).set({ proposalStatus: "pending", updatedAt: now }).where(eq(tasks.id, task.id));
      notices.push(...(await startChain(tx, viewer, task, chain, now)));
      return null;
    });
    if (outcome !== null) return fail(outcome);
    log.info("proposals.resubmitted", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(undefined, "Sent for sign-off again.");
  });
}
