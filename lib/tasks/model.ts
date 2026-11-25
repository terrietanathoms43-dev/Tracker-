import type { TaskStatusDef } from "@/lib/statuses";
import { calendarDaysBetween } from "@/lib/time";

// The task model (docs/PLAN.md, 2026-11-24 log; the client's "State × Phase × Timing" sheet). Every task is in one
// of sixteen boxes:
//
//   State    Open                          Closed
//   Phase    Not started · In progress     Completed · Incomplete
//   Timing   No due date · Early · Current · Late
//
// A status is only a name for a box: Not started and In progress are the open phases; Awaiting approval is open,
// in-progress work waiting on its approver; Blocked is a condition on open work that keeps its phase; Completed and
// Merged (a sub-task folded into its parent) are closed and completed; Rejected and Cancelled are closed and
// incomplete. Timing compares calendar days: for open work, today with the due date; for closed work, the day it
// closed with the due date it had then (the closure snapshot on the task row), so it never changes afterwards.
// Pure, so every box and every boundary is unit-testable; the Activity widget draws from it (lib/reports/data.ts).

export type LifeState = "open" | "closed";
export type OpenPhase = "not_started" | "in_progress";
export type ClosedPhase = "completed" | "incomplete";
export type TaskPhase = OpenPhase | ClosedPhase;

/** The date axis: no due date, due later than the reference day, due on it, or due before it. */
export type Timing = "none" | "early" | "current" | "late";

/** How close an open, dated task is to its deadline: the colour bands of the open side. */
export type OpenBand = "healthy" | "warm" | "at_risk" | "overdue";

/** Days left at which an open task stops being Healthy and is Warm, and stops being Warm and is At risk. */
export const HEALTHY_FROM_DAYS = 4;
export const WARM_FROM_DAYS = 2;

/**
 * Where an open task past its due date is drawn: on Today, carried along each day until it is closed ("the
 * strainer", the 2026-11-23 review), so nothing open is ever left behind Today. With `false` it stays on its due
 * date instead, which is what the sheet's Late box says. One switch, read by `blockDayOf`.
 */
export const OVERDUE_FOLLOWS_TODAY = true;

export const PHASE_LABELS: Record<TaskPhase, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  incomplete: "Incomplete",
};

export const BAND_LABELS: Record<OpenBand, string> = {
  healthy: "Healthy",
  warm: "Warm",
  at_risk: "At risk",
  overdue: "Overdue",
};

/** Whether a status is open or closed. Anything the catalog does not know (a row from before a migration) reads as open. */
export function lifeStateOf(status: TaskStatusDef): LifeState {
  return status.closed ? "closed" : "open";
}

/**
 * The phase a status stands for. Blocked keeps the phase the work was in, which `started` says (the task has a
 * started date); Awaiting approval is in-progress work.
 */
export function phaseOf(status: TaskStatusDef, started: boolean): TaskPhase {
  if (status.kind === "completed" || status.kind === "merged") return "completed";
  if (status.kind === "closed") return "incomplete";
  if (status.kind === "in_progress" || status.kind === "awaiting_approval") return "in_progress";
  if (status.kind === "open") return "not_started";
  return started ? "in_progress" : "not_started";
}

/** `due` against `reference` (today for open work, the closing day for closed work), by calendar day. */
export function timingOf(due: string | null, reference: string): Timing {
  if (due === null) return "none";
  if (reference < due) return "early";
  return reference === due ? "current" : "late";
}

/** Calendar days from today to the due date: 0 today, 1 tomorrow, negative once it has passed. */
export const daysLeft = (due: string, today: string): number => calendarDaysBetween(today, due);

/** The band of an open task with a due date: Healthy at 4 days or more, Warm at 3 or 2, At risk at 1 or 0, Overdue after. */
export function openBandOf(left: number): OpenBand {
  if (left < 0) return "overdue";
  if (left < WARM_FROM_DAYS) return "at_risk";
  return left < HEALTHY_FROM_DAYS ? "warm" : "healthy";
}

/**
 * How dark a block is drawn, 1 (lightest) to 4 (darkest): one base colour per kind of block, and the brightness says
 * the timing (the client's rule, 2026-11-24). Darker is later. Open work: Healthy 1, Warm 2, At risk 3, Overdue 4.
 * Closed work: closed early 1, on its due date 2, late 3. Without a due date there is no timing to show: 2, the
 * base colour, with the no-due-date mark beside it.
 */
export type Shade = 1 | 2 | 3 | 4;
export function shadeOf(state: LifeState, timing: Timing, band: OpenBand | null): Shade {
  if (timing === "none") return 2;
  if (state === "closed") return timing === "early" ? 1 : timing === "current" ? 2 : 3;
  return band === "healthy" ? 1 : band === "warm" ? 2 : band === "at_risk" ? 3 : 4;
}

/**
 * The calendar day a task's one block sits on. Closed: the day it closed, for good. Open with a due date: that date
 * (and Today once it has passed, while OVERDUE_FOLLOWS_TODAY). Open without one: Today, moving with it each day.
 */
export function blockDayOf(task: { state: LifeState; dueDate: string | null; closedDay: string | null }, today: string): string {
  if (task.state === "closed") return task.closedDay ?? today;
  if (task.dueDate === null) return today;
  return OVERDUE_FOLLOWS_TODAY && task.dueDate < today ? today : task.dueDate;
}

/**
 * What a task's block on the Activity widget is: the thing that picks its base colour and its mark. The two open
 * phases, Awaiting approval (open, in-progress work with its own colour, as everywhere in the app), and the four
 * ways of being closed. A blocked task is drawn as the phase it was in, with the blocked mark over it.
 */
export type BlockKind = "not_started" | "in_progress" | "awaiting_approval" | "completed" | "merged" | "rejected" | "cancelled";

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  merged: "Merged",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function blockKindOf(status: TaskStatusDef, started: boolean): BlockKind {
  if (status.kind === "completed" || status.kind === "merged" || status.kind === "awaiting_approval") return status.kind;
  // A closed-incomplete block keeps the cancelled mark only for Cancelled itself; every other such status reads as Rejected's.
  if (status.kind === "closed") return status.key === "cancelled" ? "cancelled" : "rejected";
  return phaseOf(status, started) === "in_progress" ? "in_progress" : "not_started";
}
