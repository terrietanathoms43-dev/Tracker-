"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { cappedText, optionalLink, optionalText, requiredLink, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { notifications, taskApprovals, taskLinks, taskUpdates, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { chainFor, currentStep, type ChainStep } from "@/lib/approvals/policy";
import { lockTaskApprovals, readPolicy } from "@/lib/dal/approvals";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, snapshotAssignment, validateAssignment } from "@/lib/dal/assignments";
import { findGoal } from "@/lib/dal/goals";
import { listHistory, lockComment } from "@/lib/dal/history";
import { findMembership, leaderIds } from "@/lib/dal/orgs";
import { findProject } from "@/lib/dal/projects";
import { getTaskBasics, listTasks, lockTask, recentTasks, searchTasks, seriesHasOpenTask, taskFormOptions, taskPeople } from "@/lib/dal/tasks";
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
// Assignment is a set of people (lib/dal/assignments.ts). A new task may be a proposal (lib/approvals/policy.ts);
// a repeating task makes its next occurrence when it is completed (lib/recurrence.ts).

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

/** "New task for you" / "Assigned to you" for everyone newly on a task; the actor never hears about their own change. */
function assignedNotice(viewer: Viewer, task: { id: string; title: string; nextAction: string | null }, recipients: string[], fresh: boolean): Notice[] {
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

// --- proposals: the chain a new task gets -----------------------------------------------------------------------

/** Who hears that a step is theirs: the person it names, or every leader and admin when it names nobody. */
export async function stepRecipients(tx: Tx, orgId: string, step: { userId: string | null }): Promise<string[]> {
  return step.userId ? [step.userId] : leaderIds(tx, orgId);
}

/**
 * Writes a proposal's chain (steps naming the proposer already signed), marks the task pending and returns the
 * notice for whoever is up first. Null chain: the task is live and nothing is written.
 */
export async function startChain(tx: Tx, viewer: Viewer, task: { id: string; title: string }, chain: ChainStep[], now: Date): Promise<Notice[]> {
  await tx.insert(taskApprovals).values(
    chain.map((step) => ({
      taskId: task.id,
      position: step.position,
      userId: step.userId,
      decision: step.autoSigned ? ("approved" as const) : null,
      decidedBy: step.autoSigned ? viewer.userId : null,
      decidedAt: step.autoSigned ? now : null,
      createdAt: now,
    })),
  );
  const next = currentStep(chain.map((step) => ({ position: step.position, userId: step.userId, decision: step.autoSigned ? ("approved" as const) : null })));
  if (next === null) return [];
  const recipients = await stepRecipients(tx, viewer.orgId, next);
  return [{ orgId: viewer.orgId, actorId: viewer.userId, recipients, kind: "proposal_waiting", title: `Proposal to sign off: ${task.title}`, body: `Step ${next.position} of ${chain.length}.`, href: taskHref(task.id) }];
}

/** The chain a task in this placement gets for this creator, read from the goal's and project's policies. */
export async function chainForPlacement(tx: Tx, viewer: Viewer, placement: { projectId: string | null; goalId: string | null }): Promise<ChainStep[] | null> {
  const [goalPolicy, projectPolicy] = await Promise.all([
    readPolicy(tx, viewer.orgId, placement.goalId ? { goalId: placement.goalId } : null),
    readPolicy(tx, viewer.orgId, placement.projectId ? { projectId: placement.projectId } : null),
  ]);
  return chainFor({ creatorId: viewer.userId, creatorRole: viewer.orgRole, goal: goalPolicy, project: projectPolicy });
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
  if (await seriesHasOpenTask(tx, viewer.orgId, seriesId, task.id)) return null;
  const today = dayKey(now, viewer.timezone);
  const due = nextAfterFinishing(rule, task.dueDate, task.dueDate, today);
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
 * requires sign-off (or the creator is a stakeholder) the task is a proposal: nobody is assigned anything until it is
 * approved. A repeat rule needs a due date to count from.
 */
export async function createTask(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; proposal: boolean }>> {
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
          proposalStatus: chain === null ? null : "pending",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: tasks.id });
      if (data.recurrence !== null) await tx.update(tasks).set({ seriesId: created.id }).where(eq(tasks.id, created.id));
      await applyAssignment(tx, created.id, viewer.userId, [], assignment, now);
      const drafts: ActivityDraft[] = [{ kind: "created", after: { title: data.title, proposal: chain !== null } }];
      // Assigning work to yourself alone is not news worth a history line.
      const justMe = sameIds(assignment, [viewer.userId]);
      if (!justMe && assignment.length > 0) drafts.push({ kind: "assigned", after: await snapshotAssignment(tx, assignment) });
      await recordActivity(tx, { orgId: viewer.orgId, taskId: created.id, actorId: viewer.userId }, drafts, now);
      if (chain === null) notices.push(...assignedNotice(viewer, { id: created.id, title: data.title, nextAction: data.nextAction || null }, assignment, true));
      else notices.push(...(await startChain(tx, viewer, { id: created.id, title: data.title }, chain, now)));
      if (data.nextAction) await tx.update(tasks).set({ nextAction: data.nextAction }).where(eq(tasks.id, created.id));
      return { id: created.id, proposal: chain !== null };
    });
    log.info("tasks.created", { orgId: viewer.orgId, taskId: outcome.id, proposal: outcome.proposal, by: viewer.userId });
    await dispatch(notices);
    refresh();
    return ok(outcome, outcome.proposal ? "Proposed. It goes live once it is signed off." : "Task created.");
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
        patch = { goalId: placement.goalId, projectId: value === null ? task.projectId : placement.projectId };
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
        patch = { projectId: value, goalId: keepGoal ? task.goalId : null };
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
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { nextDue: string | null } | null> => {
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
      const evidence = data.status === "completed" ? await insertLink(tx, task.id, viewer.userId, data.evidenceUrl, data.evidenceLabel, now) : [];
      await tx.update(tasks).set({ ...plan.patch, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [...plan.activities, ...evidence], now);
      notices.push(...(await noticesFor(tx, viewer, task, assignment, plan.activities, data.approverId || task.approverId, data.note || null)));
      const nextDue = data.status === "completed" ? await spawnNextOccurrence(tx, viewer, task, assignment, now) : null;
      return { nextDue };
    });
    if (outcome !== null && "error" in outcome) return fail(outcome.error);
    log.info("tasks.status_changed", { orgId: viewer.orgId, taskId: data.taskId, to: data.status, via: data.via, by: viewer.userId });
    await dispatch(notices);
    refresh();
    const today = dayKey(now, viewer.timezone);
    const nextDue = outcome?.nextDue ?? null;
    if (data.via === "approve") return ok(undefined, withNextDue("Approved.", nextDue, today));
    if (data.via === "send_back") return ok(undefined, "Sent back.");
    return ok(undefined, withNextDue(STATUS_TOASTS[data.status] ?? "Status changed.", nextDue, today));
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
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { nextDue: string | null }> => {
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
      return { nextDue };
    });
    if ("error" in outcome) return fail(outcome.error);
    log.info("tasks.progress_updated", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId, status: data.status || null });
    await dispatch(notices);
    refresh();
    return ok(undefined, withNextDue("Update saved.", outcome.nextDue, dayKey(now, viewer.timezone)));
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

/** Removes the task and everything hanging off it (assignees, updates, links, history — all cascade). A proposer may withdraw their own open proposal. */
export async function deleteTask(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  return runAction("tasks.delete", deleteSchema, input, async (data) => {
    const viewer = await requireViewer();
    const proposal = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      if (!canDeleteTask(viewer, locked.scope)) throw new GuardError("forbidden", "Only leaders and admins can delete tasks.");
      await tx.delete(tasks).where(and(eq(tasks.id, data.taskId), eq(tasks.orgId, viewer.orgId)));
      await tx.delete(notifications).where(and(eq(notifications.orgId, viewer.orgId), eq(notifications.href, `/tasks/${data.taskId}`)));
      return locked.task.proposalStatus === "pending" || locked.task.proposalStatus === "declined";
    });
    log.info("tasks.deleted", { orgId: viewer.orgId, taskId: data.taskId, by: viewer.userId });
    refresh();
    return ok(undefined, proposal ? "Proposal withdrawn." : "Task deleted.");
  });
}

/** Re-exported for the proposals action, which continues a chain this file started. */
export { lockTaskApprovals };
