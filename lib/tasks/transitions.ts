import { CLOSED_WITHOUT_COMPLETION, type TaskActivityKind, type TaskStatus } from "@/lib/constants";

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
  /** The task it is attached to (sub-tasks, 2026-11-08 log): only such a task can be merged. */
  parentTaskId: string | null;
};

export type TransitionInput = {
  /** blocked / rejected / deferred / cancelled: required. */
  reason?: string | null;
  /** blocked: who or what could unblock it. */
  blockedBy?: string | null;
  /** awaiting_approval: required. */
  approverId?: string | null;
  /** completed: required (2026-11-07 log, "sign-off words"), except when approving, where the note is. */
  summary?: string | null;
  /** approve (required) / send back: the approver's note. */
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

/** What the forms and the server say when Completed is chosen without its summary. */
export const SUMMARY_REQUIRED = "Say what was done: a completion summary is required.";
/** What the forms and the server say when an approval comes without its note. */
export const APPROVAL_NOTE_REQUIRED = "Add a sign-off note: what you checked, or why it passes.";

/** The question a closed-without-completion status asks. */
export const REASON_PROMPTS: Record<"blocked" | "rejected" | "deferred" | "cancelled" | "merged", string> = {
  blocked: "Say what is blocking it.",
  rejected: "Give a reason for rejecting it.",
  deferred: "Say why it is deferred, and until when if you know.",
  cancelled: "Give a reason for cancelling it.",
  merged: "Say which task it was merged into.",
};

/** What a task that is not a sub-task hears when Merged is asked for. */
export const MERGE_NEEDS_PARENT = "Only a sub-task can be merged: attach it to the task it duplicates first.";

/** Whether a status asks for a reason (blocked, and the ways of closing a task without completing it; a merge names its parent). */
export const asksReason = (status: TaskStatus): status is "blocked" | "rejected" | "deferred" | "cancelled" | "merged" => status === "blocked" || CLOSED_WITHOUT_COMPLETION.includes(status);

/**
 * Plans a move from the task's status to `to`. Leaving a state undoes what it set (blocked clears the reason,
 * completed clears completed_at, a closed-without-completion status clears its reason) and leaves a trace in the
 * history; asking for the current status is a no-op. Completing (approving included) is refused while a comment
 * is still open, and without its sign-off words: the summary, or the approver's note.
 */
export function planTransition(task: TaskState, to: TaskStatus, input: TransitionInput, now: Date, via: TransitionVia = "status"): TransitionPlan {
  const from = task.status;
  if (via !== "status" && from !== "awaiting_approval") return { ok: false, error: "This task isn't waiting for approval." };
  if (from === to && to !== "awaiting_approval") return { ok: true, patch: {}, activities: [] };
  if (to === "completed" && task.openComments > 0) return { ok: false, error: openCommentsMessage(task.openComments) };

  if (to === "merged" && task.parentTaskId === null) return { ok: false, error: MERGE_NEEDS_PARENT };
  const reason = clean(input.reason);
  if (asksReason(to) && reason === null) return { ok: false, error: REASON_PROMPTS[to] };
  if (to === "awaiting_approval" && !input.approverId) return { ok: false, error: "Choose who approves it." };
  const summary = clean(input.summary);
  const note = clean(input.note);
  if (to === "completed" && via === "approve" && note === null) return { ok: false, error: APPROVAL_NOTE_REQUIRED };
  if (to === "completed" && via === "status" && summary === null) return { ok: false, error: SUMMARY_REQUIRED };

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
  if (CLOSED_WITHOUT_COMPLETION.includes(from)) {
    patch.rejectionReason = null;
    if (!CLOSED_WITHOUT_COMPLETION.includes(to) && to !== "completed") activities.push({ kind: "reopened", before: { status: from }, after: { status: to } });
  }
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
      patch.completedAt = now;
      // An approval's sign-off words are the approver's note; it stands as the summary too.
      patch.completionSummary = summary ?? note;
      if (via === "approve") activities.push({ kind: "approved", before: { status: from }, after: { status: to }, note });
      activities.push({ kind: "completed", before: { status: from }, after: { status: to }, note: summary ?? note });
      break;
    }
    case "rejected":
    case "deferred":
    case "cancelled":
    case "merged":
      patch.rejectionReason = reason;
      activities.push({ kind: to, before: { status: from }, after: { status: to }, note: reason });
      break;
    default:
      if (via === "send_back") {
        activities.push({ kind: "sent_back", before: { status: from }, after: { status: to }, note });
      } else if (activities.length === 0) {
        activities.push({ kind: "status_changed", before: { status: from }, after: { status: to } });
      }
  }
  return { ok: true, patch, activities };
}

/** Statuses whose change needs more than a click, so the row menu opens a small dialog for them. */
export function needsInput(to: TaskStatus): boolean {
  return asksReason(to) || to === "awaiting_approval" || to === "completed";
}
