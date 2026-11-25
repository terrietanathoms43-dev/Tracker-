// A change to an existing task's due date (docs/PLAN.md, 2026-11-24 log). The date a task is made with is part of
// making it; every change after that is an action: it carries a reason, takes effect only when an admin approves it
// (an admin's own change is approved as it is made), and is named for what it does. Deferred is one of those names,
// a deadline moved later to a future date: it is never a status, and it never changes whether the task is open, in
// progress or closed. Pure, so the names can be tested against any "today".

export const DUE_CHANGE_KINDS = ["scheduled", "deferred", "brought_forward", "due_removed", "due_changed"] as const;
export type DueChangeKind = (typeof DUE_CHANGE_KINDS)[number];

export const DUE_CHANGE_STATUSES = ["pending", "approved", "declined", "withdrawn"] as const;
export type DueChangeStatus = (typeof DUE_CHANGE_STATUSES)[number];

export const DUE_CHANGE_LABELS: Record<DueChangeKind, string> = {
  scheduled: "Scheduled",
  deferred: "Deferred",
  brought_forward: "Brought forward",
  due_removed: "Due date removed",
  due_changed: "Due date changed",
};

/** What the label means, for the form that asks for the reason. */
export const DUE_CHANGE_HINTS: Record<DueChangeKind, string> = {
  scheduled: "A first due date for a task that had none.",
  deferred: "The deadline moves later, to a day still ahead.",
  brought_forward: "The deadline moves earlier.",
  due_removed: "The task goes back to having no due date.",
  due_changed: "The deadline moves to another day that is not ahead of today.",
};

/**
 * What a change from `from` to `to` is, or null when nothing changes. Scheduled: the first date. Due date removed:
 * the date is cleared. Brought forward: an earlier day, even when both are still ahead. Deferred: a later day that
 * is still in the future. A later day that is today or already past is a plain correction ("Due date changed"):
 * a deferral needs a future date.
 */
export function classifyDueChange(from: string | null, to: string | null, today: string): DueChangeKind | null {
  if (from === to) return null;
  if (to === null) return "due_removed";
  if (from === null) return "scheduled";
  if (to < from) return "brought_forward";
  return to > today ? "deferred" : "due_changed";
}

/** What the forms and the server say when a change comes without its reason. */
export const DUE_CHANGE_REASON_REQUIRED = "Say why the date is changing: every due-date change needs a reason.";
/** What a second request hears while one is still waiting. */
export const DUE_CHANGE_ALREADY_WAITING = "A date change for this task is already waiting for an admin. Withdraw it first, or wait for the decision.";
/** What a decision hears when the task's date moved after the request was made. */
export const DUE_CHANGE_STALE = "The task's due date changed after this was asked for, so it no longer applies. Ask again from the task.";
