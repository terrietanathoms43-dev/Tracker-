"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { requestDecisions, requests, tasks, type RequestRow } from "@/db/schema";
import { GuardError, fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { REQUEST_DECISIONS, REQUEST_URGENCIES, TASK_PRIORITIES, type RequestDecision, type RequestStatus } from "@/lib/constants";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, responsibleIds, snapshotAssignment, validateAssignment } from "@/lib/dal/assignments";
import { lockRequest } from "@/lib/dal/requests";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import { canDecideRequest, canSubmitRequest, type Viewer } from "@/lib/permissions";
import { decisionProblem, DECISION_TOASTS, PRIORITY_FOR_URGENCY, STATUS_AFTER } from "@/lib/requests/decisions";
import { sameIds } from "@/lib/tasks/assignees";
import type { ActivityDraft } from "@/lib/tasks/transitions";
import { dayKey, formatDay } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Every change to a request. Each follows the action skeleton (apex-architecture §4): zod → requireViewer →
// permission → lock the row by id and workspace → one transaction (state + decision row + the task, when one is
// made) → notices dispatched after commit → refresh() → ok(data, "Toast.").

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const httpUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Use a full http(s) link." })]).default("");
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

// --- submit ---------------------------------------------------------------------------------------------------

const submitSchema = z.object({
  title: z.string().trim().min(1, "Say what you need in a few words.").max(200),
  description: optionalText(10_000),
  desiredOutcome: optionalText(2000),
  urgency: z.enum(REQUEST_URGENCIES).default("normal"),
  link: httpUrl,
});

/**
 * Anyone in the workspace may ask for something, stakeholders included. It waits as "new" until a leader decides;
 * nobody is notified (leaders see "requests waiting" on their Home instead).
 */
export async function submitRequest(input: z.input<typeof submitSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("requests.submit", submitSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canSubmitRequest(viewer)) throw new GuardError("forbidden");
    const [created] = await db
      .insert(requests)
      .values({
        orgId: viewer.orgId,
        title: data.title,
        description: data.description || null,
        desiredOutcome: data.desiredOutcome || null,
        urgency: data.urgency,
        link: data.link || null,
        requesterId: viewer.userId,
      })
      .returning({ id: requests.id });
    log.info("requests.submitted", { orgId: viewer.orgId, requestId: created.id, by: viewer.userId });
    refresh();
    return ok({ id: created.id }, "Request sent.");
  });
}

// --- decide -----------------------------------------------------------------------------------------------------

const taskFields = z.object({
  assigneeIds: z.array(id).max(50).default([]),
  teamIds: z.array(id).max(50).default([]),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: day,
});
type TaskFields = z.infer<typeof taskFields>;

const decideSchema = z
  .object({
    requestId: id,
    decision: z.enum(REQUEST_DECISIONS),
    reason: optionalText(1000),
    deferUntil: day,
    /** Approve only: create the task now, in the same transaction. Convert always creates one. */
    createTask: taskFields.optional(),
  })
  .refine((data) => data.decision !== "rejected" || data.reason !== "", {
    path: ["reason"],
    message: "Say why it's rejected. The requester sees this.",
  });

/** What the requester's notification says, by the decision that was made. */
const REQUESTER_TITLES: Record<RequestDecision, (title: string) => string> = {
  approved: (title) => `Your request was approved: ${title}`,
  deferred: (title) => `Your request was deferred: ${title}`,
  rejected: (title) => `Your request was rejected: ${title}`,
  converted: (title) => `Your request is now a task: ${title}`,
  reopened: (title) => `Your request was reopened: ${title}`,
};

/**
 * Inserts the task a request becomes, with its assignment and its "created" (and "assigned") history, in the
 * caller's transaction. Returns the task's id and everyone who should hear that it is theirs.
 */
async function insertTaskFrom(tx: Tx, viewer: Viewer, request: RequestRow, fields: TaskFields, now: Date): Promise<{ taskId: string; responsible: string[] }> {
  const assignment = await validateAssignment(tx, viewer.orgId, { assigneeIds: fields.assigneeIds, teamIds: fields.teamIds });
  // The request's own words travel with the work, so whoever picks it up knows what was asked and why.
  const description = [request.description, request.desiredOutcome ? `Desired outcome: ${request.desiredOutcome}` : null].filter(Boolean).join("\n\n") || null;
  const [task] = await tx
    .insert(tasks)
    .values({
      orgId: viewer.orgId,
      requestId: request.id,
      title: request.title,
      description,
      createdBy: viewer.userId,
      priority: fields.priority,
      status: "not_started",
      dueDate: fields.dueDate || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  await applyAssignment(tx, task.id, viewer.userId, { assigneeIds: [], teamIds: [] }, assignment, now);
  // Same rule as createTask: assigning work to yourself alone is not news worth a history line.
  const drafts: ActivityDraft[] = [{ kind: "created", after: { title: request.title, fromRequest: request.id } }];
  const justMe = assignment.teamIds.length === 0 && sameIds(assignment.assigneeIds, [viewer.userId]);
  if (!justMe && (assignment.assigneeIds.length > 0 || assignment.teamIds.length > 0)) drafts.push({ kind: "assigned", after: await snapshotAssignment(tx, assignment) });
  await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, drafts, now);
  return { taskId: task.id, responsible: await responsibleIds(tx, task.id) };
}

/** The request's decision fields afterwards: who decided, when and why. Reopening clears them; it starts over. */
function decisionPatch(request: RequestRow, decision: RequestDecision, input: { reason: string; deferUntil: string; taskId: string | null }, viewerId: string, now: Date) {
  if (decision === "reopened") return { status: "new" as const, decidedAt: null, decidedBy: null, decisionReason: null, deferUntil: null, updatedAt: now };
  return {
    status: input.taskId ? ("converted" as const) : STATUS_AFTER[decision],
    decidedAt: now,
    decidedBy: viewerId,
    // Converting without a note keeps the approval's reason: it is still why the work is being done.
    decisionReason: input.reason || (decision === "converted" ? request.decisionReason : null),
    deferUntil: decision === "deferred" ? input.deferUntil || null : null,
    ...(input.taskId ? { convertedTaskId: input.taskId } : {}),
    updatedAt: now,
  };
}

/** Who hears about a decision: the requester, with the reason (and the task, once there is one); everyone the task is assigned to. */
function decisionNotices(
  viewer: Viewer,
  request: RequestRow,
  outcome: RequestDecision,
  input: { reason: string; deferUntil: string; today: string; taskId: string | null; responsible: string[] },
): Notice[] {
  const base = { orgId: viewer.orgId, actorId: viewer.userId };
  const revisit = outcome === "deferred" && input.deferUntil ? `Revisit on ${formatDay(input.deferUntil, input.today)}.` : null;
  const notices: Notice[] = [
    {
      ...base,
      recipients: [request.requesterId],
      kind: "request_decided",
      title: REQUESTER_TITLES[outcome](request.title),
      body: [input.reason || null, revisit].filter(Boolean).join(" ") || null,
      href: input.taskId ? `/tasks/${input.taskId}` : `/requests/${request.id}`,
    },
  ];
  if (input.taskId && input.responsible.length > 0) {
    notices.push({ ...base, recipients: input.responsible, kind: "assigned", title: `New task for you: ${request.title}`, body: request.desiredOutcome, href: `/tasks/${input.taskId}` });
  }
  return notices;
}

/**
 * Records a leader's decision on a request: approve (optionally creating the task now), defer (optional revisit date),
 * reject (reason required), convert to a task (approved requests), or reopen (deferred or rejected, back to new).
 * The request row is locked, the decision appended to its history, and any task created in the same transaction;
 * the requester hears the decision and its reason, and the assignee of a new task hears about it.
 */
export async function decideRequest(input: z.input<typeof decideSchema>): Promise<ActionResult<{ status: RequestStatus; taskId: string | null }>> {
  return runAction("requests.decide", decideSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canDecideRequest(viewer)) throw new GuardError("forbidden", "Only leaders and admins decide requests.");
    const today = dayKey(new Date(), viewer.timezone);
    if (data.decision === "deferred" && data.deferUntil !== "" && data.deferUntil <= today) {
      return fail("Pick a revisit date after today.", { deferUntil: ["Pick a revisit date after today."] });
    }
    const createsTask = data.decision === "converted" || (data.decision === "approved" && data.createTask !== undefined);
    const now = new Date();

    const { request, taskId, responsible } = await db.transaction(async (tx) => {
      const request = await lockRequest(tx, viewer.orgId, data.requestId);
      if (request === null) throw new GuardError("not_found");
      // A second leader deciding from a stale screen gets told what happened instead of overwriting it.
      const problem = decisionProblem(request.status, data.decision);
      if (problem !== null) throw new GuardError("conflict", problem);

      const fields: TaskFields = data.createTask ?? { assigneeIds: [], teamIds: [], priority: PRIORITY_FOR_URGENCY[request.urgency], dueDate: "" };
      const made = createsTask ? await insertTaskFrom(tx, viewer, request, fields, now) : null;
      const taskId = made?.taskId ?? null;
      await tx
        .update(requests)
        .set(decisionPatch(request, data.decision, { reason: data.reason, deferUntil: data.deferUntil, taskId }, viewer.userId, now))
        .where(eq(requests.id, request.id));
      // Approve + create now is two decisions in the history: approved (with the reason), then converted.
      const rows: { decision: RequestDecision; reason: string | null }[] = [{ decision: data.decision, reason: data.reason || null }];
      if (data.decision === "approved" && taskId) rows.push({ decision: "converted", reason: null });
      await tx.insert(requestDecisions).values(
        rows.map((row, index) => ({ requestId: request.id, deciderId: viewer.userId, ...row, createdAt: new Date(now.getTime() + index) })),
      );
      return { request, taskId, responsible: made?.responsible ?? [] };
    });

    const outcome: RequestDecision = taskId ? "converted" : data.decision;
    log.info("requests.decided", { orgId: viewer.orgId, requestId: request.id, decision: outcome, taskId, by: viewer.userId });
    await dispatch(decisionNotices(viewer, request, outcome, { reason: data.reason, deferUntil: data.deferUntil, today, taskId, responsible }));
    refresh();
    return ok({ status: STATUS_AFTER[outcome], taskId }, DECISION_TOASTS[outcome]);
  });
}
