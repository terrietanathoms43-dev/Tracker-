"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { cappedText, optionalLink, optionalText, requiredLink, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { notifications, taskLinks, taskUpdates, tasks } from "@/db/schema";
import { fail, GuardError, guardMessage, ok, runAction, type ActionResult } from "@/lib/action-result";
import { TASK_PRIORITIES, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { assignedNotice, chainForPlacement, startChain } from "@/lib/approvals/chain";
import { submitLocalTask } from "@/lib/approvals/submit";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, snapshotAssignment, validateAssignment } from "@/lib/dal/assignments";
import { findGoal } from "@/lib/dal/goals";
import { listHistory, lockComment } from "@/lib/dal/history";
import { findMembership, leaderIds } from "@/lib/dal/orgs";
import { findProject } from "@/lib/dal/projects";
import { applyGoalCloser, describeCloser, type CloserOutcome } from "@/lib/dal/goal-closers";
import { seriesAnchor, seriesHasLaterOccurrence } from "@/lib/dal/recurrence";
import { getTaskBasics, listTasks, lockTask, recentTasks, searchTasks, taskFormOptions, taskPeople } from "@/lib/dal/tasks";
import { captureProviderFor } from "@/lib/capture/availability";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import {
  canApproveTask,
  canCapture,
  canCreateTask,
  canDeleteTask,
  canEditTask,
  canReadTask,
  canRejectTask,
  canResolveComment,
  canUpdateProgress,
  isWorker,
  navFor,
  type NavKey,
  type TaskScope,
  type Viewer,
} from "@/lib/permissions";
import { projectScopeFor } from "@/lib/project-scope-server";
import { describeRecurrence, nextAfterFinishing, normalizeRecurrence, sameRecurrence, type Recurrence } from "@/lib/recurrence";
import { defaultApproverFor } from "@/lib/tasks/approver";
import { sameIds } from "@/lib/tasks/assignees";
import { parseFilters } from "@/lib/tasks/filters";
import { planTransition, type ActivityDraft, type TransitionInput, type TransitionVia } from "@/lib/tasks/transitions";
import type { HistoryPage, TaskFormOptions, TaskListItem, TaskPage, UpdateContext } from "@/lib/tasks/types";
import { dayKey, formatDay } from "@/lib/time";
import { requireViewer, requireViewerContext } from "@/lib/viewer";

// Every change to a task, and the reads its client components need. Each mutation follows the action skeleton
// (apex-architecture §4): zod → requireViewer → lock the row by id and workspace → permission → one transaction
// (state + task_activity + notices collected) → dispatch after commit → refresh() → ok(data, "Toast.").
// Assignment is a set of people (lib/dal/assignments.ts). A new task where sign-off applies starts local, its
// maker's alone until they send it on (lib/approvals/chain.ts, lib/approvals/submit.ts; a stakeholder's is a
// proposal at once); a repeating task makes its next occurrence when it is completed (lib/recurrence.ts).

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const idList = z.array(id).max(50).default([]);
const httpUrl = optionalLink();
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");
const clock = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time.")]).default("");
/** A repeat rule as the forms send it: null (or anything unreadable) means it doesn't repeat. */
const recurrenceInput = z.unknown().transform((value) => normalizeRecurrence(value)).default(null);

const taskHref = (taskId: string) => `/tasks/${taskId}`;

/** Approvers and handover targets are workers of this workspace (never a stakeholder, never an outsider). */
async function requireWorker(tx: Tx, orgId: string, userId: string, message: string): Promise<void> {
  const membership = await findMembership(tx, orgId, userId);
  if (membership === null || membership.role === "stakeholder") throw new GuardError("forbidden", message);
}

/**
 * Where a task sits in the funnel: a goal fixes the project (a task under a goal is in that goal's project); a
 * project alone is fine; neither is a standalone task. Archived projects and inactive goals take no new work.
 */
async function resolvePlacement(tx: Tx, orgId: string, input: { projectId: string; goalId: string }): Promise<{ projectId: string | null; goalId: string | null }> {
  let projectId: string | null = input.projectId || null;
  let goalId: string | null = input.goalId || null;
  if (goalId) {
    const goal = await findGoal(tx, orgId, goalId);
    if (!goal) throw new GuardError("not_found", "That goal doesn't exist, or you can't see it.");
    if (goal.status !== "active") throw new GuardError("forbidden", "That goal isn't active. Pick another one.");
    projectId = goal.projectId;
  }
  if (projectId) {
    const project = await findProject(tx, orgId, projectId);
    if (!project) throw new GuardError("not_found", "That project doesn't exist, or you can't see it.");
    if (project.status === "archived") throw new GuardError("forbidden", "That project is archived. Pick another one.");
  } else {
    goalId = null;
  }
  return { projectId, goalId };
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

/** Who hears about a status change: the approver asked, the people on work decided on, the leaders of blocked work. */
async function noticesFor(
  tx: Tx,
  viewer: Viewer,
  task: { id: string; title: string },
  assignees: string[],
  activities: ActivityDraft[],
  approverId: string | null,
  note: string | null,
): Promise<Notice[]> {
  const base = { orgId: viewer.orgId, actorId: viewer.userId, href: taskHref(task.id) };
  const out: Notice[] = [];
  for (const activity of activities) {
    const reason = typeof activity.note === "string" ? activity.note : null;
    if (activity.kind === "approval_requested" && approverId) out.push({ ...base, recipients: [approverId], kind: "approval_requested", title: `Approval needed: ${task.title}` });
    if (activity.kind === "approved" && assignees.length > 0) out.push({ ...base, recipients: assignees, kind: "approval_decided", title: `Approved: ${task.title}`, body: note });
    if (activity.kind === "sent_back" && assignees.length > 0) out.push({ ...base, recipients: assignees, kind: "approval_decided", title: `Sent back: ${task.title}`, body: note });
    // A rejection is a decision on someone's work (apex-ux flow D): it travels as an approval decision.
    if (activity.kind === "rejected" && assignees.length > 0) out.push({ ...base, recipients: assignees, kind: "approval_decided", title: `Rejected: ${task.title}`, body: reason });
    if (activity.kind === "blocked") {
      const leaders = await leaderIds(tx, viewer.orgId);
      if (leaders.length > 0) out.push({ ...base, recipients: leaders, kind: "blocked", title: `Blocked: ${task.title}`, body: reason });
    }
  }
  return out;
}

// --- repeats: the next occurrence -------------------------------------------------------------------------------

type LockedTask = NonNullable<Awaited<ReturnType<typeof lockTask>>>["task"];

/**
 * When a repeating task is completed, the next occurrence is made in the same transaction: the same title, people,
 * project and goal, due on the next scheduled day after today (never in the past). Only the latest occurrence
 * makes one, so completing twice, or an old reopened copy, never doubles it. Returns the new due day, or null.
 */
async function spawnNextOccurrence(tx: Tx, viewer: Viewer, task: LockedTask, assignment: string[], now: Date): Promise<string | null> {
  const rule: Recurrence | null = task.recurrence ?? null;
  if (rule === null) return null;
  const seriesId = task.seriesId ?? task.id;
  // Only the latest occurrence makes the next one: a missed series is caught up by lib/dal/recurrence.ts instead.
  if (await seriesHasLaterOccurrence(tx, viewer.orgId, seriesId, task.dueDate)) return null;
  const today = dayKey(now, viewer.timezone);
  const anchor = (await seriesAnchor(tx, viewer.orgId, seriesId)) ?? task.dueDate;
  const due = nextAfterFinishing(rule, anchor, task.dueDate, today);
  if (due === null) return null;
  const [created] = await tx
    .insert(tasks)
    .values({
      orgId: viewer.orgId,
      projectId: task.projectId,
      goalId: task.goalId,
      title: task.title,
      description: task.description,
      createdBy: task.createdBy,
      priority: task.priority,
      dueDate: due,
      dueTime: task.dueTime,
      recurrence: rule,
      seriesId,
      goalCloser: task.goalCloser,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  await applyAssignment(tx, created.id, viewer.userId, [], assignment, now);
  await recordActivity(
    tx,
    { orgId: viewer.orgId, taskId: created.id, actorId: viewer.userId },
    [{ kind: "created", after: { title: task.title, repeatOf: task.id }, note: `Next occurrence of a repeating task (${describeRecurrence(rule, due)}).` }],
    now,
  );
  return due;
}

const withNextDue = (message: string, due: string | null, today: string) => (due ? `${message} The next one is due ${formatDay(due, today)}.` : message);

// --- create ---------------------------------------------------------------------------------------------------

const createSchema = z.object({
  title: requiredText(1, LIMITS.taskTitle, "Give the task a title."),
  assigneeIds: idList,
  projectId: z.string().max(64).default(""),
  goalId: z.string().max(64).default(""),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: day,
  dueTime: clock,
  recurrence: recurrenceInput,
  nextAction: optionalText(LIMITS.nextAction),
  description: optionalText(LIMITS.taskDescription),
});

/**
 * Creates a task. Only the title is required. A task in a goal is in that goal's project. Where the project or goal
 * requires sign-off, a worker's task starts local (2026-11-06 log): theirs alone, off the main board, until they send
 * it for sign-off; a stakeholder's is a proposal at once. Nobody is told they are on it until it is live. A repeat
 * rule needs a due date to count from.
 */
export async function createTask(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; proposal: boolean; local: boolean }>> {
  return runAction("tasks.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canCreateTask(viewer)) throw new GuardError("forbidden");
    if (data.recurrence !== null && data.dueDate === "") return fail("A repeating task needs a first due date.", { dueDate: ["Pick the first day it is due."] });
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx) => {
      const assignment = await validateAssignment(tx, viewer.orgId, data.assigneeIds);
      const placement = await resolvePlacement(tx, viewer.orgId, data);
      const chain = await chainForPlacement(tx, viewer, placement);
      // A worker's task under a sign-off rule starts local; a stakeholder's goes to the chain straight away.
      const local = chain !== null && isWorker(viewer);
      const proposal = chain !== null && !local;
      const [created] = await tx
        .insert(tasks)
        .values({
          orgId: viewer.orgId,
          projectId: placement.projectId,
          goalId: placement.goalId,
          title: data.title,
          description: data.description || null,
          createdBy: viewer.userId,
          priority: data.priority,
          dueDate: data.dueDate || null,
          dueTime: data.dueTime || null,
          recurrence: data.recurrence,
          proposalStatus: local ? "local" : proposal ? "pending" : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: tasks.id });
      if (data.recurrence !== null) await tx.update(tasks).set({ seriesId: created.id }).where(eq(tasks.id, created.id));
      await applyAssignment(tx, created.id, viewer.userId, [], assignment, now);
      const drafts: ActivityDraft[] = [{ kind: "created", after: { title: data.title, proposal, local } }];
      // Assigning work to yourself alone is not news worth a history line.
      const justMe = sameIds(assignment, [viewer.userId]);
      if (!justMe && assignment.length > 0) drafts.push({ kind: "assigned", after: await snapshotAssignment(tx, assignment) });
      await recordActivity(tx, { orgId: viewer.orgId, taskId: created.id, actorId: viewer.userId }, drafts, now);
      if (chain === null) notices.push(...assignedNotice(viewer, { id: created.id, title: data.title, nextAction: data.nextAction || null }, assignment, true));
      else if (proposal) notices.push(...(await startChain(tx, viewer, { id: created.id, title: data.title }, chain, now)));
      if (data.nextAction) await tx.update(tasks).set({ nextAction: data.nextAction }).where(eq(tasks.id, created.id));
      return { id: created.id, proposal, local };
    });
    log.info("tasks.created", { orgId: viewer.orgId, taskId: outcome.id, proposal: outcome.proposal, local: outcome.local, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(
      outcome,
      outcome.local ? "Saved as a local task: only you can see it until you send it for sign-off." : outcome.proposal ? "Proposed. It goes live once it is signed off." : "Task created.",
    );
  });
}

// --- assignees ------------------------------------------------------------------------------------------------

const assignSchema = z.object({ taskId: id, assigneeIds: idList });

/** Replaces who a task is assigned to. Everyone newly on it hears; the history keeps both sides. */
export async function setAssignees(input: z.input<typeof assignSchema>): Promise<ActionResult> {
  return runAction("tasks.assign", assignSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const changed = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, assignment: before, scope } = locked;
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden");
      const after = await validateAssignment(tx, viewer.orgId, data.assigneeIds);
      if (sameIds(before, after)) return false;
      await applyAssignment(tx, task.id, viewer.userId, before, after, now);
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
      const [beforeNames, afterNames] = await Promise.all([snapshotAssignment(tx, before), snapshotAssignment(tx, after)]);
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "assigned", before: beforeNames, after: afterNames }], now);
      // People on a proposal hear once it is approved, not before.
      if (task.proposalStatus === null || task.proposalStatus === "approved") notices.push(...assignedNotice(viewer, task, after.filter((userId) => !before.includes(userId)), false));
      return true;
    });
    if (!changed) return ok(undefined);
    log.info("tasks.assigned", { orgId: viewer.orgId, taskId: data.taskId, people: data.assigneeIds.length, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(undefined, "Assignees changed.");
  });
}

// --- edit fields ------------------------------------------------------------------------------------------------

const editSchema = z.discriminatedUnion("field", [
  z.object({ taskId: id, field: z.literal("title"), value: requiredText(1, LIMITS.taskTitle, "A task needs a title.") }),
  z.object({ taskId: id, field: z.literal("description"), value: cappedText(LIMITS.taskDescription) }),
  z.object({ taskId: id, field: z.literal("priority"), value: z.enum(TASK_PRIORITIES) }),
  z.object({ taskId: id, field: z.literal("dueDate"), value: day }),
  z.object({ taskId: id, field: z.literal("dueTime"), value: clock }),
  z.object({ taskId: id, field: z.literal("projectId"), value: z.string().max(64) }),
  z.object({ taskId: id, field: z.literal("goalId"), value: z.string().max(64) }),
  z.object({ taskId: id, field: z.literal("recurrence"), value: recurrenceInput }),
]);

const EDIT_TOASTS: Record<z.infer<typeof editSchema>["field"], string> = {
  title: "Title saved.",
  description: "Description saved.",
  priority: "Priority changed.",
  dueDate: "Due date changed.",
  dueTime: "Due time changed.",
  projectId: "Project changed.",
  goalId: "Goal changed.",
  recurrence: "Repeat changed.",
};

/**
 * One field at a time, from the task page's inline editors; each change leaves one audit row. Picking a goal puts
 * the task in that goal's project; picking a project the goal isn't in takes the goal off.
 */
export async function editTask(input: z.input<typeof editSchema>): Promise<ActionResult> {
  return runAction("tasks.edit", editSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const changed = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, scope } = locked;
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden");

      const short = (v: unknown) => (typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : v);
      let draft: ActivityDraft;
      let patch: Partial<typeof task> = {};
      if (data.field === "recurrence") {
        const before = task.recurrence ?? null;
        if (sameRecurrence(before, data.value)) return false;
        if (data.value !== null && task.dueDate === null) throw new GuardError("forbidden", "Set a due date first: a repeating task counts from its first due day.");
        patch = { recurrence: data.value, seriesId: data.value === null ? task.seriesId : (task.seriesId ?? task.id) };
        draft = { kind: "edited", before: { recurrence: before ? describeRecurrence(before, task.dueDate) : null }, after: { recurrence: data.value ? describeRecurrence(data.value, task.dueDate) : null } };
      } else if (data.field === "goalId") {
        const value = data.value === "" ? null : data.value;
        if ((task.goalId ?? null) === value) return false;
        const placement = await resolvePlacement(tx, viewer.orgId, { projectId: task.projectId ?? "", goalId: value ?? "" });
        const goal = value === null ? null : await findGoal(tx, viewer.orgId, value);
        patch = { goalId: placement.goalId, projectId: value === null ? task.projectId : placement.projectId, goalCloser: false };
        draft = { kind: "edited", before: { goalId: task.goalId }, after: { goalId: value, goalTitle: goal?.title ?? null } };
      } else if (data.field === "projectId") {
        const value = data.value === "" ? null : data.value;
        if ((task.projectId ?? null) === value) return false;
        // Names are kept in the audit row so the history still reads right after a rename.
        const project = value === null ? null : await findProject(tx, viewer.orgId, value);
        if (value !== null && !project) throw new GuardError("not_found", "That project doesn't exist, or you can't see it.");
        if (project?.status === "archived") throw new GuardError("forbidden", "That project is archived. Pick another one.");
        const goal = task.goalId ? await findGoal(tx, viewer.orgId, task.goalId) : null;
        const keepGoal = goal !== null && goal.projectId === value;
        patch = { projectId: value, goalId: keepGoal ? task.goalId : null, goalCloser: keepGoal ? task.goalCloser : false };
        draft = { kind: "edited", before: { projectId: task.projectId }, after: { projectId: value, projectName: project?.name ?? null } };
      } else {
        const value = data.value === "" ? null : data.value;
        const before = task[data.field] ?? null;
        if (before === value) return false;
        patch = { [data.field]: value };
        if (data.field === "priority") draft = { kind: "priority_changed", before: { priority: before }, after: { priority: value } };
        else if (data.field === "dueDate") {
          if (value === null && task.recurrence) throw new GuardError("forbidden", "This task repeats, so it needs a due date. Stop the repeat first.");
          draft = { kind: "due_changed", before: { dueDate: before }, after: { dueDate: value } };
        } else draft = { kind: "edited", before: { [data.field]: short(before) }, after: { [data.field]: short(value) } };
      }

      await tx
        .update(tasks)
        .set({ ...patch, updatedAt: now })
        .where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [draft], now);
      return true;
    });
    if (!changed) return ok(undefined);
    log.info("tasks.edited", { orgId: viewer.orgId, taskId: data.taskId, field: data.field, by: viewer.userId });
    refresh();
    return ok(undefined, EDIT_TOASTS[data.field]);
  });
}

// --- status ---------------------------------------------------------------------------------------------------

const statusSchema = z.object({
  taskId: id,
  status: z.enum(TASK_STATUSES),
  reason: optionalText(LIMITS.blockedReason),
  blockedBy: optionalText(LIMITS.blockedBy),
  approverId: z.string().max(64).default(""),
  summary: optionalText(LIMITS.completionSummary),
  note: optionalText(LIMITS.sendBackNote),
  evidenceUrl: httpUrl,
  evidenceLabel: optionalText(LIMITS.evidenceLabel),
  via: z.enum(["status", "approve", "send_back"]).default("status"),
});

const STATUS_TOASTS: Partial<Record<TaskStatus, string>> = {
  completed: "Marked completed.",
  blocked: "Marked blocked.",
  awaiting_approval: "Sent for approval.",
  rejected: "Task rejected.",
};

const APPROVER_IS_ASSIGNEE = "Choose someone other than the people assigned to approve it.";

/** The status menu, the small transition dialogs, Approve / Send back and Mark unblocked all land here. */
export async function changeStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return runAction("tasks.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { nextDue: string | null; closer: CloserOutcome | null } | null> => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, assignment, scope } = locked;
      // Completing a task that waits for approval is approving it, whichever control asked.
      const via: TransitionVia = data.via === "status" && task.status === "awaiting_approval" && data.status === "completed" ? "approve" : data.via;
      if (!mayMove(viewer, scope, task.status, data.status, via)) throw new GuardError("forbidden");
      if (data.status === "awaiting_approval" && data.approverId) {
        await requireWorker(tx, viewer.orgId, data.approverId, "The approver must be a member of this workspace.");
        if (assignment.includes(data.approverId)) throw new GuardError("forbidden", APPROVER_IS_ASSIGNEE);
      }
      const transition: TransitionInput = { reason: data.reason, blockedBy: data.blockedBy, approverId: data.approverId || null, summary: data.summary, note: data.note };
      const plan = planTransition(task, data.status, transition, now, via);
      if (!plan.ok) return { error: plan.error };
      if (plan.activities.length === 0) return null;
      // The goal's "Everything completed" task: refused while other tasks are open; achieves the goal when done last.
      const closer = await applyGoalCloser(tx, viewer, task, data.status, now);
      const evidence = data.status === "completed" ? await insertLink(tx, task.id, viewer.userId, data.evidenceUrl, data.evidenceLabel, now) : [];
      await tx.update(tasks).set({ ...plan.patch, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [...plan.activities, ...evidence], now);
      notices.push(...(await noticesFor(tx, viewer, task, assignment, plan.activities, data.approverId || task.approverId, data.note || null)));
      const nextDue = data.status === "completed" ? await spawnNextOccurrence(tx, viewer, task, assignment, now) : null;
      return { nextDue, closer };
    });
    if (outcome !== null && "error" in outcome) return fail(outcome.error);
    log.info("tasks.status_changed", { orgId: viewer.orgId, taskId: data.taskId, to: data.status, via: data.via, by: viewer.userId });
    await dispatch(notices);
    refresh();
    const today = dayKey(now, viewer.timezone);
    const nextDue = outcome?.nextDue ?? null;
    const achieved = describeCloser(outcome?.closer ?? null, today, formatDay);
    if (data.via === "approve") return ok(undefined, withNextDue("Approved.", nextDue, today) + achieved);
    if (data.via === "send_back") return ok(undefined, "Sent back.");
    return ok(undefined, withNextDue(STATUS_TOASTS[data.status] ?? "Status changed.", nextDue, today) + achieved);
  });
}

// --- update progress --------------------------------------------------------------------------------------------

const progressSchema = z
  .object({
    taskId: id,
    progress: requiredText(1, LIMITS.progressNote, "Say what you got done."),
    nextAction: optionalText(LIMITS.nextAction),
    /** The status the update leaves the task in; "" keeps it as it is. The one set of statuses, as everywhere. */
    status: z.enum(["", ...TASK_STATUSES]).default(""),
    reason: optionalText(LIMITS.blockedReason),
    blockedBy: optionalText(LIMITS.blockedBy),
    evidenceUrl: httpUrl,
    evidenceLabel: optionalText(LIMITS.evidenceLabel),
    handOverTo: z.string().max(64).default(""),
    approverId: z.string().max(64).default(""),
    summary: optionalText(LIMITS.completionSummary),
  })
  .superRefine((value, ctx) => {
    const closing = value.status === "completed" || value.status === "rejected";
    if (!closing && value.nextAction === "") ctx.addIssue({ code: "custom", path: ["nextAction"], message: "Say what happens next." });
    if (value.status === "blocked" && value.reason === "") ctx.addIssue({ code: "custom", path: ["reason"], message: "Say what is blocking it." });
    if (value.status === "rejected" && value.reason === "") ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for rejecting it." });
    if (value.status === "awaiting_approval" && value.approverId === "") ctx.addIssue({ code: "custom", path: ["approverId"], message: "Choose who approves it." });
  });

/**
 * The signature action (docs/BRIEF.md §6): what got done, what happens next, and optionally evidence, a handover
 * and a new status (the same six statuses as everywhere else), written in one transaction (the update row, the
 * task's denormalised latest progress and next action, the audit rows) with the notices sent after it commits.
 * A handover makes the chosen person the task's only person. Completing a repeating task makes the next one.
 */
export async function updateProgress(input: z.input<typeof progressSchema>): Promise<ActionResult> {
  return runAction("tasks.progress", progressSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { nextDue: string | null; closer: CloserOutcome | null }> => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, assignment, scope } = locked;
      if (!canUpdateProgress(viewer, scope)) throw new GuardError("forbidden");

      // The people on the task after this update: the handover target alone, or whoever is on it now.
      const handingOver = data.handOverTo !== "" && !sameIds(assignment, [data.handOverTo]);
      const after = handingOver ? [data.handOverTo] : assignment;

      // The status the update leaves the task in: what was picked, or no change.
      const target: TaskStatus | null = data.status === "" || data.status === task.status ? null : data.status;

      const drafts: ActivityDraft[] = [{ kind: "progress_updated", after: { progress: data.progress.slice(0, 500), nextAction: data.nextAction || null } }];
      let patch: Record<string, unknown> = {};
      let closer: CloserOutcome | null = null;
      if (target !== null) {
        const via: TransitionVia = task.status === "awaiting_approval" && target === "completed" ? "approve" : "status";
        if (!mayMove(viewer, scope, task.status, target, via)) {
          throw new GuardError("forbidden", target === "rejected" ? "Only people who may edit this task can reject it." : "Only the approver can complete a task that is waiting for approval.");
        }
        if (target === "awaiting_approval") {
          await requireWorker(tx, viewer.orgId, data.approverId, "The approver must be a member of this workspace.");
          if (after.includes(data.approverId)) throw new GuardError("forbidden", APPROVER_IS_ASSIGNEE);
        }
        const plan = planTransition(task, target, { reason: data.reason, blockedBy: data.blockedBy, approverId: data.approverId || null, summary: data.summary }, now, via);
        if (!plan.ok) return { error: plan.error };
        closer = await applyGoalCloser(tx, viewer, task, target, now);
        patch = plan.patch;
        drafts.push(...plan.activities);
      } else if (task.status === "blocked" && data.status === "blocked" && (data.reason !== task.blockedReason || (data.blockedBy || null) !== task.blockedBy)) {
        // Still blocked, with the reason brought up to date.
        patch = { blockedReason: data.reason, blockedBy: data.blockedBy || null };
      }

      if (handingOver) {
        await requireWorker(tx, viewer.orgId, data.handOverTo, "You can only hand over to a member of this workspace.");
        const [beforeNames, afterNames] = await Promise.all([snapshotAssignment(tx, assignment), snapshotAssignment(tx, after)]);
        drafts.push({ kind: "handed_over", before: beforeNames, after: afterNames });
        await applyAssignment(tx, task.id, viewer.userId, assignment, after, now);
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
      notices.push(...(await noticesFor(tx, viewer, task, after, drafts, data.approverId || task.approverId, null)));
      drafts.push(...(await insertLink(tx, task.id, viewer.userId, data.evidenceUrl, data.evidenceLabel, now)));

      await tx.insert(taskUpdates).values({
        taskId: task.id,
        authorId: viewer.userId,
        kind: "progress",
        body: data.progress,
        nextAction: data.nextAction || null,
        blocker: data.status === "blocked" ? data.reason : null,
        createdAt: now,
      });
      await tx
        .update(tasks)
        .set({ ...patch, latestProgress: data.progress, nextAction: data.nextAction || null, updatedAt: now })
        .where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
      const nextDue = target === "completed" ? await spawnNextOccurrence(tx, viewer, task, after, now) : null;
      return { nextDue, closer };
    });
    if ("error" in outcome) return fail(outcome.error);
    log.info("tasks.progress_updated", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId, status: data.status || null });
    await dispatch(notices);
    refresh();
    const today = dayKey(now, viewer.timezone);
    return ok(undefined, withNextDue("Update saved.", outcome.nextDue, today) + describeCloser(outcome.closer, today, formatDay));
  });
}

// --- comments and evidence ----------------------------------------------------------------------------------------

const commentSchema = z.object({ taskId: id, body: requiredText(1, LIMITS.comment, "Write a comment first.") });

/** A comment joins the task's timeline (open until someone resolves it); the people on the task and its creator hear about it. */
export async function addComment(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  return runAction("tasks.comment", commentSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const notice = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task, assignment, scope } = locked;
      if (!canUpdateProgress(viewer, scope)) throw new GuardError("forbidden");
      await tx.insert(taskUpdates).values({ taskId: task.id, authorId: viewer.userId, kind: "comment", body: data.body, createdAt: now });
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "commented", after: { excerpt: data.body.slice(0, 200) } }], now);
      const recipients = [...new Set([...assignment, task.createdBy])].filter((userId) => userId !== viewer.userId);
      const out: Notice = { orgId: viewer.orgId, actorId: viewer.userId, recipients, kind: "commented", title: `New comment on ${task.title}`, body: data.body.slice(0, 200), href: taskHref(task.id) };
      return out;
    });
    log.info("tasks.commented", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    await dispatch([notice]);
    refresh();
    return ok(undefined, "Comment added.");
  });
}

const resolveSchema = z.object({ taskId: id, commentId: id, resolved: z.boolean() });

/**
 * Marks a comment resolved, or open again. A task can't be completed while a comment is open (lib/tasks/transitions.ts),
 * so this is how a question on a task gets closed off. Anyone who may work on the task may do it; the audit trail
 * keeps who and when.
 */
export async function setCommentResolved(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  return runAction("tasks.comment_resolve", resolveSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const changed = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      if (!canResolveComment(viewer, locked.scope)) throw new GuardError("forbidden");
      const comment = await lockComment(tx, locked.task.id, data.commentId);
      if (comment === null) throw new GuardError("not_found", "That comment doesn't exist, or you can't see it.");
      if ((comment.resolvedAt !== null) === data.resolved) return false;
      await tx
        .update(taskUpdates)
        .set({ resolvedAt: data.resolved ? now : null, resolvedBy: data.resolved ? viewer.userId : null })
        .where(eq(taskUpdates.id, comment.id));
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, locked.task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: locked.task.id, actorId: viewer.userId }, [{ kind: data.resolved ? "comment_resolved" : "comment_reopened", after: { commentId: comment.id } }], now);
      return true;
    });
    if (!changed) return ok(undefined);
    log.info("tasks.comment_resolved", { orgId: viewer.orgId, taskId: data.taskId, commentId: data.commentId, resolved: data.resolved, by: viewer.userId });
    refresh();
    return ok(undefined, data.resolved ? "Comment resolved." : "Comment reopened.");
  });
}

const linkSchema = z.object({
  taskId: id,
  url: requiredLink(),
  label: optionalText(LIMITS.evidenceLabel),
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

/** The next page of the task list for the same filters (the list's "Load more"); the project comes from the navigation's scope. */
export async function loadMoreTasks(input: z.input<typeof moreSchema>): Promise<ActionResult<TaskPage>> {
  return runAction("tasks.more", moreSchema, input, async ({ query, cursor }) => {
    const viewer = await requireViewer();
    const project = await projectScopeFor(viewer);
    return ok(await listTasks(viewer, parseFilters(query, project), { today: dayKey(new Date(), viewer.timezone), cursor }));
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

const searchSchema = z.object({ q: z.string().max(LIMITS.search) });

/** Tasks for the command palette: a title and description search, or the most recently touched ones when nothing is typed. */
export async function paletteSearch(input: z.input<typeof searchSchema>): Promise<ActionResult<TaskListItem[]>> {
  return runAction("tasks.search", searchSchema, input, async ({ q }) => {
    const viewer = await requireViewer();
    return ok(q.trim() === "" ? await recentTasks(viewer) : await searchTasks(viewer, q));
  });
}

/** Whether this person gets "From a meeting": the role allows it and the server has an engine for them. */
const offersCapture = (viewer: Viewer, email: string | null) => canCapture(viewer) && captureProviderFor(email) !== null;

/** What the palette may offer this viewer: their navigation, whether they can create tasks, and capture. */
export async function getPaletteContext(): Promise<ActionResult<{ nav: NavKey[]; canCreate: boolean; canCapture: boolean; worker: boolean }>> {
  return runAction("tasks.palette_context", z.object({}), {}, async () => {
    const { viewer, user } = await requireViewerContext();
    return ok({ nav: navFor(viewer), canCreate: canCreateTask(viewer), canCapture: offersCapture(viewer, user.email), worker: viewer.orgRole !== "stakeholder" });
  });
}

/** The New task form's pickers. */
export async function getTaskFormOptions(): Promise<ActionResult<TaskFormOptions>> {
  return runAction("tasks.form_options", z.object({}), {}, async () => {
    const { viewer, user } = await requireViewerContext();
    if (!canCreateTask(viewer)) throw new GuardError("forbidden");
    return ok({ ...(await taskFormOptions(viewer)), canCapture: offersCapture(viewer, user.email) });
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
        assigneeIds: task.assigneeIds,
        nextAction: task.nextAction,
        blockedReason: task.blockedReason,
        blockedBy: task.blockedBy,
        openComments: task.openComments,
        repeats: task.recurrence ? describeRecurrence(task.recurrence, task.dueDate) : null,
      },
      people,
      defaultApprover: defaultApproverFor(people, task.approverId, task.assigneeIds),
      abilities: {
        edit: canEditTask(viewer, task.scope),
        progress: canUpdateProgress(viewer, task.scope),
        approve: canApproveTask(viewer, task.scope),
        reject: canRejectTask(viewer, task.scope),
        decideProposal: false,
      },
    });
  });
}

// --- delete ----------------------------------------------------------------------------------------------------

const deleteSchema = z.object({ taskId: id });

/** Removes the task and everything hanging off it (assignees, updates, links, history — all cascade). A proposer may withdraw their own open proposal; a maker their local task. */
export async function deleteTask(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  return runAction("tasks.delete", deleteSchema, input, async (data) => {
    const viewer = await requireViewer();
    const was = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      if (!canDeleteTask(viewer, locked.scope)) throw new GuardError("forbidden", "Only leaders and admins can delete tasks.");
      await tx.delete(tasks).where(and(eq(tasks.id, data.taskId), eq(tasks.orgId, viewer.orgId)));
      await tx.delete(notifications).where(and(eq(notifications.orgId, viewer.orgId), eq(notifications.href, `/tasks/${data.taskId}`)));
      return locked.task.proposalStatus;
    });
    log.info("tasks.deleted", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    refresh();
    return ok(undefined, was === "pending" || was === "declined" ? "Proposal withdrawn." : was === "local" ? "Local task deleted." : "Task deleted.");
  });
}

// --- several tasks at once (docs/PLAN.md, 2026-11-04 log) ---------------------------------------------------------

const bulkIds = z.array(id).min(1, "Pick at least one task.").max(100, "Pick at most 100 tasks at a time.");

export type BulkOutcome = { done: number; failed: { id: string; title: string; error: string }[] };
type Locked = NonNullable<Awaited<ReturnType<typeof lockTask>>>;

/**
 * Runs `each` for every task in a transaction of its own, so one refusal never undoes the others. A refusal is
 * named with the task's title and the reason, in the words the task's own page would use.
 */
async function runBulk(viewer: Viewer, taskIds: string[], each: (tx: Tx, locked: Locked) => Promise<Notice[]>): Promise<{ outcome: BulkOutcome; notices: Notice[] }> {
  const outcome: BulkOutcome = { done: 0, failed: [] };
  const notices: Notice[] = [];
  for (const taskId of [...new Set(taskIds)]) {
    let title = "A task";
    try {
      notices.push(
        ...(await db.transaction(async (tx) => {
          const locked = await lockTask(tx, viewer.orgId, taskId);
          if (locked === null) throw new GuardError("not_found", "That task doesn't exist, or you can't see it.");
          title = locked.task.title;
          return each(tx, locked);
        })),
      );
      outcome.done += 1;
    } catch (error) {
      if (!(error instanceof GuardError)) throw error;
      outcome.failed.push({ id: taskId, title, error: guardMessage(error) });
    }
  }
  return { outcome, notices };
}

/** "3 tasks marked completed. 1 couldn't: “Fix the digest” (Resolve the 2 open comments…)." Nothing done is a failure. */
function bulkResult<T extends BulkOutcome>(outcome: T, did: string, headline?: string): ActionResult<T> {
  const head = outcome.done > 0 ? (headline ?? `${outcome.done} ${outcome.done === 1 ? "task" : "tasks"} ${did}.`) : "";
  if (outcome.failed.length === 0) return ok(outcome, head);
  const tail = `${outcome.failed.length} couldn't: ${outcome.failed.map((each) => `“${each.title}” (${each.error})`).join("; ")}`;
  if (outcome.done === 0) return fail(`Nothing changed. ${tail}`);
  return ok(outcome, `${head} ${tail}`);
}

const bulkStatusSchema = z.object({
  taskIds: bulkIds,
  status: z.enum(TASK_STATUSES),
  reason: optionalText(LIMITS.blockedReason),
  blockedBy: optionalText(LIMITS.blockedBy),
  approverId: z.string().max(64).default(""),
  summary: optionalText(LIMITS.completionSummary),
});

/** The same status change as the row menu makes, for every ticked task, with one reason / approver / summary. */
export async function bulkChangeStatus(input: z.input<typeof bulkStatusSchema>): Promise<ActionResult<BulkOutcome>> {
  return runAction("tasks.bulk_status", bulkStatusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const { outcome, notices } = await runBulk(viewer, data.taskIds, async (tx, { task, assignment, scope }) => {
      const via: TransitionVia = task.status === "awaiting_approval" && data.status === "completed" ? "approve" : "status";
      if (!mayMove(viewer, scope, task.status, data.status, via)) throw new GuardError("forbidden", "you can't change its status");
      if (data.status === "awaiting_approval" && data.approverId) {
        await requireWorker(tx, viewer.orgId, data.approverId, "The approver must be a member of this workspace.");
        if (assignment.includes(data.approverId)) throw new GuardError("forbidden", "the approver is assigned to it");
      }
      const plan = planTransition(task, data.status, { reason: data.reason, blockedBy: data.blockedBy, approverId: data.approverId || null, summary: data.summary }, now, via);
      if (!plan.ok) throw new GuardError("conflict", plan.error);
      if (plan.activities.length === 0) return [];
      await applyGoalCloser(tx, viewer, task, data.status, now);
      await tx.update(tasks).set({ ...plan.patch, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, plan.activities, now);
      const sent = await noticesFor(tx, viewer, task, assignment, plan.activities, data.approverId || task.approverId, null);
      if (data.status === "completed") await spawnNextOccurrence(tx, viewer, task, assignment, now);
      return sent;
    });
    log.info("tasks.bulk_status", { orgId: viewer.orgId, to: data.status, done: outcome.done, failed: outcome.failed.length, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return bulkResult(outcome, `marked ${TASK_STATUS_LABELS[data.status].toLowerCase()}`);
  });
}

const bulkAssignSchema = z.object({ taskIds: bulkIds, assigneeIds: idList, mode: z.enum(["replace", "add"]).default("replace") });

/** Puts these people on every ticked task (replacing whoever is on it, or adding to them). */
export async function bulkAssign(input: z.input<typeof bulkAssignSchema>): Promise<ActionResult<BulkOutcome>> {
  return runAction("tasks.bulk_assign", bulkAssignSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const { outcome, notices } = await runBulk(viewer, data.taskIds, async (tx, { task, assignment: before, scope }) => {
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden", "you can't edit it");
      const wanted = data.mode === "add" ? [...new Set([...before, ...data.assigneeIds])] : data.assigneeIds;
      const after = await validateAssignment(tx, viewer.orgId, wanted);
      if (sameIds(before, after)) return [];
      await applyAssignment(tx, task.id, viewer.userId, before, after, now);
      await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.id));
      const [beforeNames, afterNames] = await Promise.all([snapshotAssignment(tx, before), snapshotAssignment(tx, after)]);
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "assigned", before: beforeNames, after: afterNames }], now);
      return task.proposalStatus === null || task.proposalStatus === "approved" ? assignedNotice(viewer, task, after.filter((userId) => !before.includes(userId)), false) : [];
    });
    log.info("tasks.bulk_assign", { orgId: viewer.orgId, mode: data.mode, people: data.assigneeIds.length, done: outcome.done, failed: outcome.failed.length, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return bulkResult(outcome, data.mode === "add" ? "given more people" : data.assigneeIds.length === 0 ? "unassigned" : "assigned");
  });
}

const bulkMoveSchema = z.object({ taskIds: bulkIds, projectId: z.string().max(64).default(""), goalId: z.string().max(64).default("") });

/** Puts every ticked task in a project and, if given, a goal; neither makes them standalone tasks. */
export async function bulkMove(input: z.input<typeof bulkMoveSchema>): Promise<ActionResult<BulkOutcome>> {
  return runAction("tasks.bulk_move", bulkMoveSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const { outcome, notices } = await runBulk(viewer, data.taskIds, async (tx, { task, scope }) => {
      if (!canEditTask(viewer, scope)) throw new GuardError("forbidden", "you can't edit it");
      const placement = await resolvePlacement(tx, viewer.orgId, data);
      if ((task.projectId ?? null) === placement.projectId && (task.goalId ?? null) === placement.goalId) return [];
      const project = placement.projectId ? await findProject(tx, viewer.orgId, placement.projectId) : null;
      const goal = placement.goalId ? await findGoal(tx, viewer.orgId, placement.goalId) : null;
      await tx.update(tasks).set({ projectId: placement.projectId, goalId: placement.goalId, goalCloser: task.goalCloser && placement.goalId === task.goalId, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(
        tx,
        { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId },
        [{ kind: "edited", before: { projectId: task.projectId, goalId: task.goalId }, after: { projectId: placement.projectId, projectName: project?.name ?? null, goalId: placement.goalId, goalTitle: goal?.title ?? null } }],
        now,
      );
      return [];
    });
    log.info("tasks.bulk_move", { orgId: viewer.orgId, projectId: data.projectId || null, goalId: data.goalId || null, done: outcome.done, failed: outcome.failed.length, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return bulkResult(outcome, data.projectId || data.goalId ? "moved" : "made standalone");
  });
}

const bulkSendSchema = z.object({ taskIds: bulkIds });

/**
 * Sends every ticked local task on (docs/PLAN.md, 2026-11-06 log): for sign-off where its goal or project still asks
 * for it, published at once where none applies any more. Each in its own transaction; the toast says how many went
 * each way, and names the ones that couldn't (someone else's, or not local any more).
 */
export async function bulkSendLocal(input: z.input<typeof bulkSendSchema>): Promise<ActionResult<BulkOutcome & { sent: number; published: number }>> {
  return runAction("tasks.bulk_send", bulkSendSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    let published = 0;
    const { outcome, notices } = await runBulk(viewer, data.taskIds, async (tx, locked) => {
      const result = await submitLocalTask(tx, viewer, locked, now);
      if (result.live) published += 1;
      return result.notices;
    });
    const sent = outcome.done - published;
    log.info("tasks.bulk_send", { orgId: viewer.orgId, sent, published, failed: outcome.failed.length, by: viewer.userId });
    await dispatch(notices);
    refresh();
    const parts = [sent > 0 ? `${sent} ${sent === 1 ? "task" : "tasks"} sent for sign-off` : null, published > 0 ? `${published} ${published === 1 ? "task" : "tasks"} published` : null].filter(Boolean);
    return bulkResult({ ...outcome, sent, published }, "sent on", parts.length > 0 ? `${parts.join(", ")}.` : undefined);
  });
}

const bulkDeleteSchema = z.object({ taskIds: bulkIds });

/** Deletes every ticked task the person may delete (leaders and admins; a proposer their own open proposal). */
export async function bulkDelete(input: z.input<typeof bulkDeleteSchema>): Promise<ActionResult<BulkOutcome>> {
  return runAction("tasks.bulk_delete", bulkDeleteSchema, input, async (data) => {
    const viewer = await requireViewer();
    const { outcome } = await runBulk(viewer, data.taskIds, async (tx, { task, scope }) => {
      if (!canDeleteTask(viewer, scope)) throw new GuardError("forbidden", "only leaders and admins delete tasks");
      await tx.delete(tasks).where(and(eq(tasks.id, task.id), eq(tasks.orgId, viewer.orgId)));
      await tx.delete(notifications).where(and(eq(notifications.orgId, viewer.orgId), eq(notifications.href, `/tasks/${task.id}`)));
      return [];
    });
    log.info("tasks.bulk_delete", { orgId: viewer.orgId, done: outcome.done, failed: outcome.failed.length, by: viewer.userId });
    refresh();
    return bulkResult(outcome, "deleted");
  });
}
