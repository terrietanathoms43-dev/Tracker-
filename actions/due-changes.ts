"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { taskDueChanges, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { recordActivity } from "@/lib/dal/activity";
import { hasPendingDueChange, lockDueChange } from "@/lib/dal/due-changes";
import { adminIds } from "@/lib/dal/orgs";
import { lockTask } from "@/lib/dal/tasks";
import { LIMITS } from "@/lib/limits";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import { canEditTask, canReadTask, isAdmin, isLive } from "@/lib/permissions";
import { optionalText, requiredText } from "@/lib/sanitize";
import { closerLabel } from "@/lib/tasks/closer";
import { classifyDueChange, DUE_CHANGE_ALREADY_WAITING, DUE_CHANGE_LABELS, DUE_CHANGE_REASON_REQUIRED, DUE_CHANGE_STALE, type DueChangeKind } from "@/lib/tasks/due-change";
import { dayKey, formatDay } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Changing an existing task's due date (docs/PLAN.md, 2026-11-24 log; lib/tasks/due-change.ts). The date a task is
// made with is part of making it; after that the date changes only here, with a reason, and takes effect only when
// an admin approves it. An admin's own change is approved as it is made. A task that is not live yet (a local task,
// a proposal) is not official work: its maker's change applies at once, reason kept. Each change is named for what
// it does (Scheduled, Deferred, Brought forward, Due date removed, Due date changed), and the name is the kind of the
// history row that records it. A change never touches the status, and never a closed task's closure snapshot.

const id = z.string().min(1).max(64);
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const REPEAT_NEEDS_DATE = "This task repeats, so it needs a due date. Stop the repeat first.";

/** "Nov 20 → Nov 27", "No date → Nov 27": the change as a toast shows it. */
const arrow = (from: string | null, to: string | null, today: string) => `${from ? formatDay(from, today) : "No date"} → ${to ? formatDay(to, today) : "No date"}`;
/** The same in plain words, for a notice and its email: "Nov 20 to Nov 27", "to Nov 27", "was Nov 20". */
const span = (from: string | null, to: string | null, today: string) => (from === null ? `to ${formatDay(to ?? today, today)}` : to === null ? `was ${formatDay(from, today)}` : `${formatDay(from, today)} to ${formatDay(to, today)}`);

const requestSchema = z.object({
  taskId: id,
  /** The date asked for; "" clears it. */
  dueDate: day,
  reason: requiredText(1, LIMITS.dueChangeReason, DUE_CHANGE_REASON_REQUIRED),
});

/**
 * Asks for a task's due date to change. An admin's request takes effect at once; anyone else's waits for an admin
 * and the task keeps its date until then. One request per task waits at a time.
 */
export async function requestDueChange(input: z.input<typeof requestSchema>): Promise<ActionResult<{ applied: boolean }>> {
  return runAction("tasks.due_change.request", requestSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const today = dayKey(now, viewer.timezone);
    const to = data.dueDate === "" ? null : data.dueDate;
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { kind: DueChangeKind; from: string | null; applied: boolean } | null> => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden");
      const from = task.dueDate;
      const kind = classifyDueChange(from, to, today);
      if (kind === null) return null;
      if (to === null && task.recurrence) return { error: REPEAT_NEEDS_DATE };
      if (await hasPendingDueChange(tx, viewer.orgId, task.id)) return { error: DUE_CHANGE_ALREADY_WAITING };

      const title = task.goalCloser ? closerLabel(task.title, task.goalTitle) : task.title;
      // An admin decides these, so an admin's own is decided; work that is not live yet is its maker's to date.
      const applied = isAdmin(viewer) || !isLive(scope);
      await tx.insert(taskDueChanges).values({
        orgId: viewer.orgId,
        taskId: task.id,
        requestedBy: viewer.userId,
        kind,
        fromDate: from,
        toDate: to,
        reason: data.reason,
        status: applied ? "approved" : "pending",
        decidedBy: applied ? viewer.userId : null,
        decidedAt: applied ? now : null,
        createdAt: now,
      });
      if (applied) {
        await tx.update(tasks).set({ dueDate: to, updatedAt: now }).where(eq(tasks.id, task.id));
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind, before: { dueDate: from }, after: { dueDate: to }, note: data.reason }], now);
      } else {
        await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "due_change_requested", before: { dueDate: from }, after: { dueDate: to, change: kind }, note: data.reason }], now);
        const admins = await adminIds(tx, viewer.orgId);
        if (admins.length > 0) {
          notices.push({
            orgId: viewer.orgId,
            actorId: viewer.userId,
            recipients: admins,
            kind: "due_change_requested",
            title: `Date change to approve: ${title}`,
            body: `${DUE_CHANGE_LABELS[kind]} (${span(from, to, today)}). ${data.reason}`,
            href: `/tasks/${task.id}`,
          });
        }
      }
      return { kind, from, applied };
    });
    if (outcome === null) return ok({ applied: false });
    if ("error" in outcome) return fail(outcome.error);
    log.info("tasks.due_change.requested", { orgId: viewer.orgId, taskId: data.taskId, kind: outcome.kind, applied: outcome.applied, by: viewer.userId });
    await dispatch(notices);
    refresh();
    const change = `${DUE_CHANGE_LABELS[outcome.kind]}: ${arrow(outcome.from, to, today)}.`;
    return ok({ applied: outcome.applied }, outcome.applied ? change : `Sent to an admin for approval. The due date stays as it is until then. (${change})`);
  });
}

const decideSchema = z.object({
  changeId: id,
  decision: z.enum(["approved", "declined"]),
  /** Declining needs a note (the person who asked reads it); approving may carry one. */
  note: optionalText(LIMITS.dueChangeReason),
});

/** An admin's decision on a waiting change: approved, the task takes the new date; declined, it keeps the one it has. */
export async function decideDueChange(input: z.input<typeof decideSchema>): Promise<ActionResult> {
  return runAction("tasks.due_change.decide", decideSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!isAdmin(viewer)) throw new GuardError("forbidden", "Only an admin can decide a due-date change.");
    if (data.decision === "declined" && data.note === "") return fail("Say why it is declined: the person who asked reads it.", { note: ["Add a note."] });
    const now = new Date();
    const today = dayKey(now, viewer.timezone);
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { kind: DueChangeKind; from: string | null; to: string | null; taskId: string }> => {
      const change = await lockDueChange(tx, viewer.orgId, data.changeId);
      if (change === null) throw new GuardError("not_found");
      if (change.status !== "pending") return { error: "This date change was already decided or withdrawn." };
      const locked = await lockTask(tx, viewer.orgId, change.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task } = locked;
      const title = task.goalCloser ? closerLabel(task.title, task.goalTitle) : task.title;
      const base = { orgId: viewer.orgId, actorId: viewer.userId, recipients: [change.requestedBy], kind: "due_change_decided" as const, href: `/tasks/${task.id}` };

      if (data.decision === "declined") {
        await tx.update(taskDueChanges).set({ status: "declined", decidedBy: viewer.userId, decidedAt: now, decisionNote: data.note }).where(eq(taskDueChanges.id, change.id));
        await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "due_change_declined", before: { dueDate: change.fromDate }, after: { dueDate: change.toDate, change: change.kind }, note: data.note }], now);
        notices.push({ ...base, title: `Date change declined: ${title}`, body: data.note });
        return { kind: change.kind, from: change.fromDate, to: change.toDate, taskId: task.id };
      }

      // Approved against the date it was asked against: if the task has moved since, the question is a different one.
      if (task.dueDate !== change.fromDate) return { error: DUE_CHANGE_STALE };
      if (change.toDate === null && task.recurrence) return { error: REPEAT_NEEDS_DATE };
      await tx
        .update(taskDueChanges)
        .set({ status: "approved", decidedBy: viewer.userId, decidedAt: now, decisionNote: data.note || null })
        .where(eq(taskDueChanges.id, change.id));
      await tx.update(tasks).set({ dueDate: change.toDate, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(
        tx,
        { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId },
        [{ kind: change.kind, before: { dueDate: change.fromDate }, after: { dueDate: change.toDate, approved: true, requestedBy: change.requestedBy }, note: change.reason }],
        now,
      );
      notices.push({ ...base, title: `Date change approved: ${title}`, body: `${DUE_CHANGE_LABELS[change.kind]} (${span(change.fromDate, change.toDate, today)}).${data.note ? ` ${data.note}` : ""}` });
      return { kind: change.kind, from: change.fromDate, to: change.toDate, taskId: task.id };
    });
    if ("error" in outcome) return fail(outcome.error);
    log.info("tasks.due_change.decided", { orgId: viewer.orgId, taskId: outcome.taskId, changeId: data.changeId, decision: data.decision, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(undefined, data.decision === "approved" ? `Approved. ${DUE_CHANGE_LABELS[outcome.kind]}: ${arrow(outcome.from, outcome.to, today)}.` : "Declined. The due date stays as it was.");
  });
}

const withdrawSchema = z.object({ changeId: id });

/** Takes back a change that is still waiting: whoever asked for it, or anyone who may edit the task. */
export async function withdrawDueChange(input: z.input<typeof withdrawSchema>): Promise<ActionResult> {
  return runAction("tasks.due_change.withdraw", withdrawSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { taskId: string }> => {
      const change = await lockDueChange(tx, viewer.orgId, data.changeId);
      if (change === null) throw new GuardError("not_found");
      if (change.status !== "pending") return { error: "This date change was already decided or withdrawn." };
      const locked = await lockTask(tx, viewer.orgId, change.taskId);
      if (locked === null) throw new GuardError("not_found");
      if (!canReadTask(viewer, locked.scope)) throw new GuardError("not_found");
      if (change.requestedBy !== viewer.userId && !canEditTask(viewer, locked.scope)) throw new GuardError("forbidden");
      await tx.update(taskDueChanges).set({ status: "withdrawn", decidedBy: viewer.userId, decidedAt: now }).where(eq(taskDueChanges.id, change.id));
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, change.taskId));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: change.taskId, actorId: viewer.userId }, [{ kind: "due_change_declined", before: { dueDate: change.fromDate }, after: { dueDate: change.toDate, change: change.kind, withdrawn: true } }], now);
      return { taskId: change.taskId };
    });
    if ("error" in outcome) return fail(outcome.error);
    log.info("tasks.due_change.withdrawn", { orgId: viewer.orgId, taskId: outcome.taskId, changeId: data.changeId, by: viewer.userId });
    refresh();
    return ok(undefined, "Date change withdrawn.");
  });
}
