import type { TaskActivityKind, TaskStatus } from "@/lib/constants";

// Status rules (docs/PLAN.md §5, apex-ux flow D) as one pure function: given the task's current state and
// the status asked for, the column changes and the activity rows to write. Every action that changes a
// status goes through it, so a row menu, the Update progress form and the approver's buttons never diverge.

export type TaskState = {
  status: TaskStatus;
  startedAt: Date | null;
  approverId: string | null;
  blockedReason: string | null;
  /** Comments nobody has resolved yet. While there are any, the task cannot be completed (2026-10-30 log). */
  openComments: number;
};

export type TransitionInput = {
  /** blocked / rejected: required. */
  reason?: string | null;
  /** blocked: who or what could unblock it. */
  blockedBy?: string | null;
  /** awaiting_approval: required. */
  approverId?: string | null;
  /** completed: optional summary. */
  summary?: string | null;
  /** approve / send back: the approver's note. */
  note?: string | null;
};

/** How the change was asked for: approve and send back are the approver's buttons on an awaiting task. */
export type TransitionVia = "status" | "approve" | "send_back";

export type TaskPatch = {
  status?: TaskStatus;
  startedAt?: Date;
  completedAt?: Date | null;
  completionSummary?: string | null;
  blockedReason?: string | null;
  blockedBy?: string | null;
  rejectionReason?: string | null;
  approverId?: string | null;
};

/** One task_activity row before it has an id, an actor or a time. */
export type ActivityDraft = {
  kind: TaskActivityKind;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string | null;
};

export type TransitionPlan = { ok: true; patch: TaskPatch; activities: ActivityDraft[] } | { ok: false; error: string };

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** Why a task with open comments can't be completed: the same words on the server and under the forms' Completed option. */
export function openCommentsMessage(count: number): string {
  return `Resolve the ${count} open ${count === 1 ? "comment" : "comments"} before completing this task.`;
}

/**
 * Plans a move from the task's status to `to`. Leaving a state undoes what it set (blocked clears the reason,
 * completed clears completed_at) and leaves a trace in the history; asking for the current status is a no-op.
 * Completing (approving included) is refused while a comment is still open.
 */
export function planTransition(task: TaskState, to: TaskStatus, input: TransitionInput, now: Date, via: TransitionVia = "status"): TransitionPlan {
  const from = task.status;
  if (via !== "status" && from !== "awaiting_approval") return { ok: false, error: "This task isn't waiting for approval." };
  if (from === to && to !== "awaiting_approval") return { ok: true, patch: {}, activities: [] };
  if (to === "completed" && task.openComments > 0) return { ok: false, error: openCommentsMessage(task.openComments) };

  const reason = clean(input.reason);
  if ((to === "blocked" || to === "rejected") && reason === null) {
    return { ok: false, error: to === "blocked" ? "Say what is blocking it." : "Give a reason for rejecting it." };
  }
  if (to === "awaiting_approval" && !input.approverId) return { ok: false, error: "Choose who approves it." };

  const patch: TaskPatch = { status: to };
  const activities: ActivityDraft[] = [];

  if (from === "blocked") {
    patch.blockedReason = null;
    patch.blockedBy = null;
    activities.push({ kind: "unblocked", before: { status: from, blockedReason: task.blockedReason }, after: { status: to } });
  }
  if (from === "completed") {
    patch.completedAt = null;
    patch.completionSummary = null;
    activities.push({ kind: "reopened", before: { status: from }, after: { status: to } });
  }
  if (from === "rejected") patch.rejectionReason = null;
  if (to === "in_progress" && task.startedAt === null) patch.startedAt = now;

  switch (to) {
    case "blocked":
      patch.blockedReason = reason;
      patch.blockedBy = clean(input.blockedBy);
      activities.push({ kind: "blocked", before: { status: from }, after: { status: to, blockedReason: reason, blockedBy: patch.blockedBy }, note: reason });
      break;
    case "awaiting_approval":
      if (from === to && task.approverId === input.approverId) return { ok: true, patch: {}, activities: [] };
      patch.approverId = input.approverId;
      activities.push({ kind: "approval_requested", before: { status: from }, after: { status: to, approverId: input.approverId } });
      break;
    case "completed": {
      const summary = clean(input.summary);
      patch.completedAt = now;
      patch.completionSummary = summary;
      if (via === "approve") activities.push({ kind: "approved", before: { status: from }, after: { status: to }, note: clean(input.note) });
      activities.push({ kind: "completed", before: { status: from }, after: { status: to }, note: summary });
      break;
    }
    case "rejected":
      patch.rejectionReason = reason;
      activities.push({ kind: "rejected", before: { status: from }, after: { status: to }, note: reason });
      break;
    default:
      if (via === "send_back") {
        activities.push({ kind: "sent_back", before: { status: from }, after: { status: to }, note: clean(input.note) });
      } else if (activities.length === 0) {
        activities.push({ kind: "status_changed", before: { status: from }, after: { status: to } });
      }
  }
  return { ok: true, patch, activities };
}

/** Statuses whose change needs more than a click, so the row menu opens a small dialog for them. */
export function needsInput(to: TaskStatus): boolean {
  return to === "blocked" || to === "awaiting_approval" || to === "rejected" || to === "completed";
}
