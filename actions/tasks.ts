"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { goals, projects, taskLinks, taskUpdates, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { listHistory } from "@/lib/dal/history";
import { findMembership, leaderIds } from "@/lib/dal/orgs";
import { getTaskBasics, listTasks, lockTask, searchTasks, taskFormOptions, taskPeople } from "@/lib/dal/tasks";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import {
  canApproveTask,
  canCreateTask,
  canEditTask,
  canReadTask,
  canRejectTask,
  canUpdateProgress,
  navFor,
  type NavKey,
  type TaskScope,
  type Viewer,
} from "@/lib/permissions";
import { defaultApproverFor } from "@/lib/tasks/approver";
import { parseFilters } from "@/lib/tasks/filters";
import { planTransition, type ActivityDraft, type TransitionInput, type TransitionVia } from "@/lib/tasks/transitions";
import type { HistoryPage, TaskFormOptions, TaskListItem, TaskPage, UpdateContext } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Every change to a task, and the reads its client components need. Each mutation follows the action skeleton
// (apex-architecture §4): zod → requireViewer → lock the row by id and workspace → permission → one transaction
// (state + task_activity + notices collected) → dispatch after commit → refresh() → ok(data, "Toast.").

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const httpUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Use a full http(s) link." })]).default("");
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const taskHref = (taskId: string) => `/tasks/${taskId}`;

/** Owners, approvers and handover targets are workers of this workspace (never a stakeholder, never an outsider). */
async function requireWorker(tx: Tx, orgId: string, userId: string, message: string): Promise<void> {
  const membership = await findMembership(tx, orgId, userId);
  if (membership === null || membership.role === "stakeholder") throw new GuardError("forbidden", message);
}

async function findProject(tx: Tx, orgId: string, projectId: string) {
  const [row] = await tx
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  if (!row) throw new GuardError("not_found", "That project doesn't exist, or you can't see it.");
  return row;
}

async function findGoal(tx: Tx, orgId: string, goalId: string) {
  const [row] = await tx.select({ id: goals.id, title: goals.title }).from(goals).where(and(eq(goals.id, goalId), eq(goals.orgId, orgId)));
  if (!row) throw new GuardError("not_found", "That goal doesn't exist, or you can't see it.");
  return row;
}

/** Adds an evidence link in the caller's transaction and returns its audit row (nothing for an empty url). */
async function insertLink(tx: Tx, taskId: string, userId: string, url: string, label: string, at: Date): Promise<ActivityDraft[]> {
  if (url === "") return [];
  const clean = label === "" ? null : label;
  await tx.insert(taskLinks).values({ taskId, url, label: clean, addedBy: userId, createdAt: at });
  return [{ kind: "link_added", after: { url, label: clean } }];
}

/** Who may move a task: finishing an approval is the approver's, rejecting needs edit rights, the rest is progress. */
function mayMove(viewer: Viewer, scope: TaskScope, from: TaskStatus, to: TaskStatus, via: TransitionVia): boolean {
  if (via !== "status" || (from === "awaiting_approval" && to === "completed")) return canApproveTask(viewer, scope);
  if (to === "rejected") return canRejectTask(viewer, scope);
  return canUpdateProgress(viewer, scope);
}

/** Who hears about a status change: the approver asked, the assignee decided on, the leaders of blocked work. */
async function noticesFor(
  tx: Tx,
  viewer: Viewer,
  task: { id: string; title: string; assigneeId: string | null },
  activities: ActivityDraft[],
  approverId: string | null,
  note: string | null,
): Promise<Notice[]> {
  const base = { orgId: viewer.orgId, actorId: viewer.userId, href: taskHref(task.id) };
  const out: Notice[] = [];
  for (const activity of activities) {
    const reason = typeof activity.note === "string" ? activity.note : null;
    if (activity.kind === "approval_requested" && approverId) out.push({ ...base, recipients: [approverId], kind: "approval_requested", title: `Approval needed: ${task.title}` });
    if (activity.kind === "approved" && task.assigneeId) out.push({ ...base, recipients: [task.assigneeId], kind: "approval_decided", title: `Approved: ${task.title}`, body: note });
    if (activity.kind === "sent_back" && task.assigneeId) out.push({ ...base, recipients: [task.assigneeId], kind: "approval_decided", title: `Sent back: ${task.title}`, body: note });
    // A rejection is a decision on someone's work (apex-ux flow D): it travels as an approval decision.
    if (activity.kind === "rejected" && task.assigneeId) out.push({ ...base, recipients: [task.assigneeId], kind: "approval_decided", title: `Rejected: ${task.title}`, body: reason });
    if (activity.kind === "blocked") {
      const leaders = await leaderIds(tx, viewer.orgId);
      if (leaders.length > 0) out.push({ ...base, recipients: leaders, kind: "blocked", title: `Blocked: ${task.title}`, body: reason });
    }
  }
  return out;
}

// --- create ---------------------------------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  assigneeId: z.string().max(64).default(""),
  projectId: z.string().max(64).default(""),
  goalId: z.string().max(64).default(""),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: day,
  nextAction: optionalText(1000),
  description: optionalText(10_000),
});

/** Creates a task. Only the title is required; the assignee hears about it when it isn't the creator. */
export async function createTask(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("tasks.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canCreateTask(viewer)) throw new GuardError("forbidden");
    const now = new Date();
    const taskId = await db.transaction(async (tx) => {
      if (data.assigneeId) await requireWorker(tx, viewer.orgId, data.assigneeId, "The assignee must be a member of this workspace.");
      if (data.projectId) {
        const project = await findProject(tx, viewer.orgId, data.projectId);
        if (project.status === "archived") throw new GuardError("forbidden", "That project is archived. Pick another one.");
      }
      if (data.goalId) await findGoal(tx, viewer.orgId, data.goalId);
      const [created] = await tx
        .insert(tasks)
        .values({
          orgId: viewer.orgId,
          projectId: data.projectId || null,
          goalId: data.goalId || null,
          title: data.title,
          description: data.description || null,
          assigneeId: data.assigneeId || null,
          createdBy: viewer.userId,
          priority: data.priority,
          dueDate: data.dueDate || null,
          nextAction: data.nextAction || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: tasks.id });
      const drafts: ActivityDraft[] = [{ kind: "created", after: { title: data.title } }];
      if (data.assigneeId && data.assigneeId !== viewer.userId) drafts.push({ kind: "assigned", after: { assigneeId: data.assigneeId } });
      await recordActivity(tx, { orgId: viewer.orgId, taskId: created.id, actorId: viewer.userId }, drafts, now);
      return created.id;
    });
    log.info("tasks.created", { orgId: viewer.orgId, taskId, by: viewer.userId });
    if (data.assigneeId && data.assigneeId !== viewer.userId) {
      await dispatch([
        {
          orgId: viewer.orgId,
          actorId: viewer.userId,
          recipients: [data.assigneeId],
          kind: "assigned",
          title: `New task for you: ${data.title}`,
          body: data.nextAction ? `First step: ${data.nextAction}` : null,
          href: taskHref(taskId),
        },
      ]);
    }
    refresh();
    return ok({ id: taskId }, "Task created.");
  });
}

// --- edit fields ------------------------------------------------------------------------------------------------

const editSchema = z.discriminatedUnion("field", [
  z.object({ taskId: id, field: z.literal("title"), value: z.string().trim().min(1, "A task needs a title.").max(200) }),
  z.object({ taskId: id, field: z.literal("description"), value: z.string().trim().max(10_000) }),
  z.object({ taskId: id, field: z.literal("priority"), value: z.enum(TASK_PRIORITIES) }),
  z.object({ taskId: id, field: z.literal("dueDate"), value: day }),
  z.object({ taskId: id, field: z.literal("assigneeId"), value: z.string().max(64) }),
  z.object({ taskId: id, field: z.literal("projectId"), value: z.string().max(64) }),
  z.object({ taskId: id, field: z.literal("goalId"), value: z.string().max(64) }),
]);

const EDIT_TOASTS: Record<z.infer<typeof editSchema>["field"], string> = {
  title: "Title saved.",
  description: "Description saved.",
  priority: "Priority changed.",
  dueDate: "Due date changed.",
  assigneeId: "Assignee changed.",
  projectId: "Project changed.",
  goalId: "Goal changed.",
};

/** One field at a time, from the task page's inline editors; each change leaves one audit row. */
export async function editTask(input: z.input<typeof editSchema>): Promise<ActionResult> {
  return runAction("tasks.edit", editSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const changed = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden");
      const value = data.value === "" ? null : data.value;
      const before = task[data.field] ?? null;
      if (before === value) return false;

      const short = (v: unknown) => (typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : v);
      let draft: ActivityDraft;
      if (data.field === "priority") draft = { kind: "priority_changed", before: { priority: before }, after: { priority: value } };
      else if (data.field === "dueDate") draft = { kind: "due_changed", before: { dueDate: before }, after: { dueDate: value } };
      else if (data.field === "assigneeId") {
        if (value !== null) await requireWorker(tx, viewer.orgId, value, "The assignee must be a member of this workspace.");
        draft = { kind: "assigned", before: { assigneeId: before }, after: { assigneeId: value } };
      } else if (data.field === "projectId") {
        // Names are kept in the audit row so the history still reads right after a rename.
        const project = value === null ? null : await findProject(tx, viewer.orgId, value);
        if (project?.status === "archived") throw new GuardError("forbidden", "That project is archived. Pick another one.");
        draft = { kind: "edited", before: { projectId: before }, after: { projectId: value, projectName: project?.name ?? null } };
      } else if (data.field === "goalId") {
        const goal = value === null ? null : await findGoal(tx, viewer.orgId, value);
        draft = { kind: "edited", before: { goalId: before }, after: { goalId: value, goalTitle: goal?.title ?? null } };
      } else draft = { kind: "edited", before: { [data.field]: short(before) }, after: { [data.field]: short(value) } };

      await tx.update(tasks).set({ [data.field]: value, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [draft], now);
      if (data.field === "assigneeId" && value !== null) {
        notices.push({
          orgId: viewer.orgId,
          actorId: viewer.userId,
          recipients: [value],
          kind: "assigned",
          title: `Assigned to you: ${task.title}`,
          body: task.nextAction ? `Next: ${task.nextAction}` : null,
          href: taskHref(task.id),
        });
      }
      return true;
    });
    if (!changed) return ok(undefined);
    log.info("tasks.edited", { orgId: viewer.orgId, taskId: data.taskId, field: data.field, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(undefined, EDIT_TOASTS[data.field]);
  });
}

// --- status ---------------------------------------------------------------------------------------------------

const statusSchema = z.object({
  taskId: id,
  status: z.enum(TASK_STATUSES),
  reason: optionalText(500),
  blockedBy: optionalText(200),
  approverId: z.string().max(64).default(""),
  summary: optionalText(2000),
  note: optionalText(1000),
  evidenceUrl: httpUrl,
  evidenceLabel: optionalText(120),
  via: z.enum(["status", "approve", "send_back"]).default("status"),
});

const STATUS_TOASTS: Partial<Record<TaskStatus, string>> = {
  completed: "Marked completed.",
  blocked: "Marked blocked.",
  awaiting_approval: "Sent for approval.",
  rejected: "Task rejected.",
};

/** The status menu, the small transition dialogs, Approve / Send back and Mark unblocked all land here. */
export async function changeStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return runAction("tasks.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      // Completing a task that waits for approval is approving it, whichever control asked.
      const via: TransitionVia = data.via === "status" && task.status === "awaiting_approval" && data.status === "completed" ? "approve" : data.via;
      if (!mayMove(viewer, scope, task.status, data.status, via)) throw new GuardError("forbidden");
      if (data.status === "awaiting_approval" && data.approverId) {
        await requireWorker(tx, viewer.orgId, data.approverId, "The approver must be a member of this workspace.");
        if (data.approverId === task.assigneeId) throw new GuardError("forbidden", "Choose someone other than the assignee to approve it.");
      }
      const transition: TransitionInput = { reason: data.reason, blockedBy: data.blockedBy, approverId: data.approverId || null, summary: data.summary, note: data.note };
      const plan = planTransition(task, data.status, transition, now, via);
      if (!plan.ok) return plan.error;
      if (plan.activities.length === 0) return null;
      const evidence = data.status === "completed" ? await insertLink(tx, task.id, viewer.userId, data.evidenceUrl, data.evidenceLabel, now) : [];
      await tx.update(tasks).set({ ...plan.patch, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [...plan.activities, ...evidence], now);
      notices.push(...(await noticesFor(tx, viewer, task, plan.activities, data.approverId || task.approverId, data.note || null)));
      return null;
    });
    if (outcome !== null) return fail(outcome);
    log.info("tasks.status_changed", { orgId: viewer.orgId, taskId: data.taskId, to: data.status, via: data.via, by: viewer.userId });
    await dispatch(notices);
    refresh();
    if (data.via === "approve") return ok(undefined, "Approved.");
    if (data.via === "send_back") return ok(undefined, "Sent back.");
    return ok(undefined, STATUS_TOASTS[data.status] ?? "Status changed.");
  });
}

// --- update progress --------------------------------------------------------------------------------------------

const progressSchema = z
  .object({
    taskId: id,
    progress: z.string().trim().min(1, "Say what you got done.").max(4000),
    nextAction: optionalText(1000),
    blocked: z.boolean().default(false),
    blockedReason: optionalText(500),
    blockedBy: optionalText(200),
    evidenceUrl: httpUrl,
    evidenceLabel: optionalText(120),
    handOverTo: z.string().max(64).default(""),
    markAs: z.enum(["", "in_progress", "awaiting_approval", "completed"]).default(""),
    approverId: z.string().max(64).default(""),
    summary: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.markAs !== "completed" && value.nextAction === "") ctx.addIssue({ code: "custom", path: ["nextAction"], message: "Say what happens next." });
    if (value.blocked && value.blockedReason === "") ctx.addIssue({ code: "custom", path: ["blockedReason"], message: "Say what is blocking it." });
    if (value.blocked && value.markAs !== "") ctx.addIssue({ code: "custom", path: ["markAs"], message: "A blocked task can't also be completed or sent for approval." });
    if (value.markAs === "awaiting_approval" && value.approverId === "") ctx.addIssue({ code: "custom", path: ["approverId"], message: "Choose who approves it." });
  });

/**
 * The signature action (docs/BRIEF.md §6): what got done, what happens next, and optionally a blocker, evidence,
 * a handover and a new status, written in one transaction (the update row, the task's denormalised latest
 * progress and next action, the audit rows) with the notices sent after it commits.
 */
export async function updateProgress(input: z.input<typeof progressSchema>): Promise<ActionResult> {
  return runAction("tasks.progress", progressSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!canUpdateProgress(viewer, scope)) throw new GuardError("forbidden");

      // The status the update leaves the task in: blocked if ticked, else the "Mark as" choice; un-ticking
      // "I'm blocked" on a blocked task unblocks it.
      let target: TaskStatus | null = null;
      if (data.blocked) target = task.status === "blocked" ? null : "blocked";
      else if (data.markAs !== "") target = data.markAs;
      else if (task.status === "blocked") target = "in_progress";

      const drafts: ActivityDraft[] = [{ kind: "progress_updated", after: { progress: data.progress.slice(0, 500), nextAction: data.nextAction || null } }];
      let patch: Record<string, unknown> = {};
      if (target !== null) {
        const via: TransitionVia = task.status === "awaiting_approval" && target === "completed" ? "approve" : "status";
        if (!mayMove(viewer, scope, task.status, target, via)) throw new GuardError("forbidden", "Only the approver can complete a task that is waiting for approval.");
        if (target === "awaiting_approval") {
          await requireWorker(tx, viewer.orgId, data.approverId, "The approver must be a member of this workspace.");
          const assignee = data.handOverTo || task.assigneeId;
          if (data.approverId === assignee) throw new GuardError("forbidden", "Choose someone other than the assignee to approve it.");
        }
        const plan = planTransition(task, target, { reason: data.blockedReason, blockedBy: data.blockedBy, approverId: data.approverId || null, summary: data.summary }, now, via);
        if (!plan.ok) return plan.error;
        patch = plan.patch;
        drafts.push(...plan.activities);
      } else if (data.blocked && (data.blockedReason !== task.blockedReason || (data.blockedBy || null) !== task.blockedBy)) {
        patch = { blockedReason: data.blockedReason, blockedBy: data.blockedBy || null };
      }

      let assigneeId = task.assigneeId;
      if (data.handOverTo !== "" && data.handOverTo !== task.assigneeId) {
        await requireWorker(tx, viewer.orgId, data.handOverTo, "You can only hand over to a member of this workspace.");
        drafts.push({ kind: "handed_over", before: { assigneeId: task.assigneeId }, after: { assigneeId: data.handOverTo } });
        assigneeId = data.handOverTo;
        notices.push({
          orgId: viewer.orgId,
          actorId: viewer.userId,
          recipients: [data.handOverTo],
          kind: "handover",
          title: `Handed over to you: ${task.title}`,
          body: data.nextAction ? `Next: ${data.nextAction}` : data.progress.slice(0, 200),
          href: taskHref(task.id),
        });
      }
      notices.push(...(await noticesFor(tx, viewer, { id: task.id, title: task.title, assigneeId }, drafts, data.approverId || task.approverId, null)));
      drafts.push(...(await insertLink(tx, task.id, viewer.userId, data.evidenceUrl, data.evidenceLabel, now)));

      await tx.insert(taskUpdates).values({
        taskId: task.id,
        authorId: viewer.userId,
        kind: "progress",
        body: data.progress,
        nextAction: data.nextAction || null,
        blocker: data.blocked ? data.blockedReason : null,
        createdAt: now,
      });
      await tx
        .update(tasks)
        .set({ ...patch, latestProgress: data.progress, nextAction: data.nextAction || null, assigneeId, updatedAt: now })
        .where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
      return null;
    });
    if (outcome !== null) return fail(outcome);
    log.info("tasks.progress_updated", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId, markAs: data.markAs || null, blocked: data.blocked });
    await dispatch(notices);
    refresh();
    return ok(undefined, "Update saved.");
  });
}

// --- comments and evidence ----------------------------------------------------------------------------------------

const commentSchema = z.object({ taskId: id, body: z.string().trim().min(1, "Write a comment first.").max(4000) });

/** A comment joins the task's timeline; the assignee and the creator hear about it when someone else wrote it. */
export async function addComment(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  return runAction("tasks.comment", commentSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notice = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!canUpdateProgress(viewer, scope)) throw new GuardError("forbidden");
      await tx.insert(taskUpdates).values({ taskId: task.id, authorId: viewer.userId, kind: "comment", body: data.body, createdAt: now });
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "commented", after: { excerpt: data.body.slice(0, 200) } }], now);
      const recipients = [task.assigneeId, task.createdBy].filter((userId): userId is string => userId !== null && userId !== viewer.userId);
      const out: Notice = { orgId: viewer.orgId, actorId: viewer.userId, recipients, kind: "commented", title: `New comment on ${task.title}`, body: data.body.slice(0, 200), href: taskHref(task.id) };
      return out;
    });
    log.info("tasks.commented", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    await dispatch([notice]);
    refresh();
    return ok(undefined, "Comment added.");
  });
}

const linkSchema = z.object({
  taskId: id,
  url: z.url({ protocol: /^https?$/, error: "Use a full http(s) link." }),
  label: optionalText(120),
});

/** Evidence on its own (outside an update): anyone who may update progress may add a link. */
export async function addLink(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  return runAction("tasks.link_add", linkSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      if (!canUpdateProgress(viewer, locked.scope)) throw new GuardError("forbidden");
      const drafts = await insertLink(tx, locked.task.id, viewer.userId, data.url, data.label, now);
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, locked.task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: locked.task.id, actorId: viewer.userId }, drafts, now);
    });
    log.info("tasks.link_added", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    refresh();
    return ok(undefined, "Link added.");
  });
}

const removeLinkSchema = z.object({ taskId: id, linkId: id });

/** Removes an evidence link: people who may edit the task, or whoever added the link. The removal is audited. */
export async function removeLink(input: z.input<typeof removeLinkSchema>): Promise<ActionResult> {
  return runAction("tasks.link_remove", removeLinkSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const [link] = await tx
        .select({ id: taskLinks.id, url: taskLinks.url, label: taskLinks.label, addedBy: taskLinks.addedBy })
        .from(taskLinks)
        .where(and(eq(taskLinks.id, data.linkId), eq(taskLinks.taskId, locked.task.id)));
      if (!link) throw new GuardError("not_found");
      if (!canEditTask(viewer, locked.scope) && !(link.addedBy === viewer.userId && canUpdateProgress(viewer, locked.scope))) throw new GuardError("forbidden");
      await tx.delete(taskLinks).where(eq(taskLinks.id, link.id));
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, locked.task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: locked.task.id, actorId: viewer.userId }, [{ kind: "link_removed", before: { url: link.url, label: link.label } }], now);
    });
    log.info("tasks.link_removed", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    refresh();
    return ok(undefined, "Link removed.");
  });
}

// --- reads for client components ----------------------------------------------------------------------------------

const moreSchema = z.object({ query: z.record(z.string(), z.string()), cursor: id });

/** The next page of the task list for the same filters (the list's "Load more"). */
export async function loadMoreTasks(input: z.input<typeof moreSchema>): Promise<ActionResult<TaskPage>> {
  return runAction("tasks.more", moreSchema, input, async ({ query, cursor }) => {
    const viewer = await requireViewer();
    return ok(await listTasks(viewer, parseFilters(query), { today: dayKey(new Date(), viewer.timezone), cursor }));
  });
}

const historySchema = z.object({ taskId: id, cursor: id });

/** Earlier entries of a task's comments and history. */
export async function loadHistory(input: z.input<typeof historySchema>): Promise<ActionResult<HistoryPage>> {
  return runAction("tasks.history", historySchema, input, async ({ taskId, cursor }) => {
    const viewer = await requireViewer();
    const task = await getTaskBasics(viewer, taskId);
    if (task === null || !canReadTask(viewer, task.scope)) throw new GuardError("not_found");
    return ok(await listHistory(viewer, taskId, cursor));
  });
}

const searchSchema = z.object({ q: z.string().max(100) });

/** Task titles for the command palette. */
export async function paletteSearch(input: z.input<typeof searchSchema>): Promise<ActionResult<TaskListItem[]>> {
  return runAction("tasks.search", searchSchema, input, async ({ q }) => {
    const viewer = await requireViewer();
    return ok(await searchTasks(viewer, q));
  });
}

/** What the palette may offer this viewer: their navigation, and whether they can create tasks. */
export async function getPaletteContext(): Promise<ActionResult<{ nav: NavKey[]; canCreate: boolean }>> {
  return runAction("tasks.palette_context", z.object({}), {}, async () => {
    const viewer = await requireViewer();
    return ok({ nav: navFor(viewer), canCreate: canCreateTask(viewer) });
  });
}

/** The New task form's pickers. Stakeholders ask for work through requests instead. */
export async function getTaskFormOptions(): Promise<ActionResult<TaskFormOptions>> {
  return runAction("tasks.form_options", z.object({}), {}, async () => {
    const viewer = await requireViewer();
    if (!canCreateTask(viewer)) throw new GuardError("forbidden", "Only people who work in this workspace can create tasks. Submit a request instead.");
    return ok(await taskFormOptions(viewer));
  });
}

/** What the Update progress dialog and the status dialogs need about one task. */
export async function getUpdateContext(input: { taskId: string }): Promise<ActionResult<UpdateContext>> {
  return runAction("tasks.update_context", z.object({ taskId: id }), input, async ({ taskId }) => {
    const viewer = await requireViewer();
    const [task, people] = await Promise.all([getTaskBasics(viewer, taskId), taskPeople(viewer)]);
    if (task === null || !canReadTask(viewer, task.scope)) throw new GuardError("not_found");
    return ok({
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        assigneeId: task.assigneeId,
        nextAction: task.nextAction,
        blockedReason: task.blockedReason,
        blockedBy: task.blockedBy,
      },
      people,
      defaultApprover: defaultApproverFor(people, task.approverId, task.assigneeId),
      abilities: {
        edit: canEditTask(viewer, task.scope),
        progress: canUpdateProgress(viewer, task.scope),
        approve: canApproveTask(viewer, task.scope),
        reject: canRejectTask(viewer, task.scope),
      },
    });
  });
}
