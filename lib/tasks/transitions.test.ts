// The status rules of docs/PLAN.md §5, checked without a database.
import { describe, expect, it } from "vitest";
import { closingResolvesMessage, commentWaitsMessage, fromCommentHint, reopenedBecause, reopeningMessage, resolvedByTaskNote, waitsForLabel } from "./comment-tasks";
import { classifyDueChange } from "./due-change";
import { phraseHistory, type HistoryRow } from "./history";
import { blockDayOf, blockKindOf, daysLeft, lifeStateOf, openBandOf, OVERDUE_FOLLOWS_TODAY, phaseOf, shadeOf, timingOf } from "./model";
import { APPROVAL_NOTE_REQUIRED, MERGE_NEEDS_PARENT, needsInput, openCommentsMessage, planTransition, REASON_PROMPTS, SUMMARY_REQUIRED, type TaskState } from "./transitions";

const now = new Date("2026-10-15T12:00:00Z");
const task = (overrides: Partial<TaskState> = {}): TaskState => ({ status: "in_progress", dueDate: null, startedAt: new Date("2026-10-01"), approverId: null, blockedReason: null, openComments: 0, parentTaskId: null, ...overrides });
const kinds = (plan: ReturnType<typeof planTransition>) => (plan.ok ? plan.activities.map((a) => a.kind) : plan.error);

describe("status transitions (PLAN §5)", () => {
  it("blocking needs a reason and records who unblocks", () => {
    expect(planTransition(task(), "blocked", {}, now).ok).toBe(false);
    const plan = planTransition(task(), "blocked", { reason: " Waiting on Finance ", blockedBy: "Procurement" }, now);
    expect(plan).toMatchObject({ ok: true, patch: { status: "blocked", blockedReason: "Waiting on Finance", blockedBy: "Procurement" } });
    expect(kinds(plan)).toEqual(["blocked"]);
  });

  it("leaving blocked clears the reason and writes unblocked", () => {
    const plan = planTransition(task({ status: "blocked", blockedReason: "PO" }), "in_progress", {}, now);
    expect(plan).toMatchObject({ ok: true, patch: { blockedReason: null, blockedBy: null } });
    expect(kinds(plan)).toEqual(["unblocked"]);
  });

  it("asking for approval needs an approver", () => {
    expect(planTransition(task(), "awaiting_approval", {}, now).ok).toBe(false);
    expect(planTransition(task(), "awaiting_approval", { approverId: "morgan" }, now)).toMatchObject({ ok: true, patch: { approverId: "morgan" } });
    expect(kinds(planTransition(task(), "awaiting_approval", { approverId: "morgan" }, now))).toEqual(["approval_requested"]);
  });

  it("re-asking the same approver changes nothing; asking someone else re-requests", () => {
    const awaiting = task({ status: "awaiting_approval", approverId: "morgan" });
    expect(planTransition(awaiting, "awaiting_approval", { approverId: "morgan" }, now)).toEqual({ ok: true, patch: {}, activities: [] });
    expect(kinds(planTransition(awaiting, "awaiting_approval", { approverId: "avery" }, now))).toEqual(["approval_requested"]);
  });

  it("approving completes with both events; sending back returns to in progress with the note", () => {
    const awaiting = task({ status: "awaiting_approval", approverId: "morgan" });
    expect(kinds(planTransition(awaiting, "completed", { note: "Looks right" }, now, "approve"))).toEqual(["approved", "completed"]);
    const back = planTransition(awaiting, "in_progress", { note: "Add the dashboard link" }, now, "send_back");
    expect(back).toMatchObject({ ok: true, activities: [{ kind: "sent_back", note: "Add the dashboard link" }] });
  });

  it("approve and send back only work on a task that is waiting for approval", () => {
    expect(planTransition(task(), "completed", {}, now, "approve").ok).toBe(false);
    expect(planTransition(task(), "in_progress", {}, now, "send_back").ok).toBe(false);
  });

  it("completing sets completed_at; leaving completed is a reopen that clears it", () => {
    expect(planTransition(task(), "completed", { summary: "Done" }, now)).toMatchObject({ ok: true, patch: { completedAt: now, completionSummary: "Done" } });
    const reopened = planTransition(task({ status: "completed" }), "in_progress", {}, now);
    expect(reopened).toMatchObject({ ok: true, patch: { completedAt: null, completionSummary: null } });
    expect(kinds(reopened)).toEqual(["reopened"]);
  });

  it("rejecting needs a reason; leaving rejected clears it", () => {
    expect(planTransition(task(), "rejected", { reason: "  " }, now).ok).toBe(false);
    expect(planTransition(task(), "rejected", { reason: "Out of scope" }, now)).toMatchObject({ ok: true, patch: { rejectionReason: "Out of scope" } });
    expect(planTransition(task({ status: "rejected" }), "not_started", {}, now)).toMatchObject({ ok: true, patch: { rejectionReason: null } });
  });

  it("the first move to in progress sets started_at, later ones keep it", () => {
    expect(planTransition(task({ status: "not_started", startedAt: null }), "in_progress", {}, now)).toMatchObject({ ok: true, patch: { startedAt: now } });
    const again = planTransition(task({ status: "not_started" }), "in_progress", {}, now);
    expect(again.ok && "startedAt" in again.patch).toBe(false);
    expect(kinds(again)).toEqual(["status_changed"]);
  });

  it("refuses to complete, or approve, a task while a comment is open", () => {
    expect(planTransition(task({ openComments: 2 }), "completed", { summary: "Done" }, now)).toEqual({ ok: false, error: "Resolve the 2 open comments before completing this task." });
    expect(planTransition(task({ status: "awaiting_approval", approverId: "morgan", openComments: 1 }), "completed", { note: "Fine" }, now, "approve")).toEqual({ ok: false, error: "Resolve the 1 open comment before completing this task." });
    expect(planTransition(task({ openComments: 1 }), "completed", { summary: "Done" }, now).ok).toBe(false);
    expect(planTransition(task({ openComments: 0 }), "completed", { summary: "Done" }, now).ok).toBe(true);
    // Other moves are not held: a blocked or sent-back task with an open question is normal.
    expect(planTransition(task({ openComments: 3 }), "blocked", { reason: "Waiting" }, now).ok).toBe(true);
    expect(planTransition(task({ openComments: 3 }), "awaiting_approval", { approverId: "morgan" }, now).ok).toBe(true);
  });

  it("asking for the status it already has changes nothing", () => {
    expect(planTransition(task(), "in_progress", {}, now)).toEqual({ ok: true, patch: {}, activities: [] });
  });

  it("only the statuses that ask for something open a dialog", () => {
    expect(["not_started", "in_progress"].map((s) => needsInput(s as "in_progress"))).toEqual([false, false]);
    expect(["blocked", "awaiting_approval", "rejected", "cancelled", "completed"].every((s) => needsInput(s as "blocked"))).toBe(true);
  });

  it("completing needs its sign-off words: the summary, or the approver's note", () => {
    expect(planTransition(task(), "completed", {}, now)).toEqual({ ok: false, error: SUMMARY_REQUIRED });
    expect(planTransition(task(), "completed", { summary: "   " }, now).ok).toBe(false);
    const awaiting = task({ status: "awaiting_approval", approverId: "morgan" });
    expect(planTransition(awaiting, "completed", {}, now, "approve")).toEqual({ ok: false, error: APPROVAL_NOTE_REQUIRED });
    // The approver's note stands as the summary.
    expect(planTransition(awaiting, "completed", { note: "Checked on staging" }, now, "approve")).toMatchObject({ ok: true, patch: { completionSummary: "Checked on staging" } });
  });

  it("rejecting and cancelling close the task with a reason; leaving them is a reopen that clears it", () => {
    expect(planTransition(task(), "rejected", {}, now)).toEqual({ ok: false, error: REASON_PROMPTS.rejected });
    expect(planTransition(task(), "cancelled", { reason: " " }, now)).toEqual({ ok: false, error: REASON_PROMPTS.cancelled });
    const rejected = planTransition(task(), "rejected", { reason: "Out of scope" }, now);
    expect(rejected).toMatchObject({ ok: true, patch: { status: "rejected", rejectionReason: "Out of scope" }, activities: [{ kind: "rejected", note: "Out of scope" }] });
    const cancelled = planTransition(task({ status: "blocked", blockedReason: "PO" }), "cancelled", { reason: "Superseded" }, now);
    expect(cancelled).toMatchObject({ ok: true, patch: { status: "cancelled", rejectionReason: "Superseded", blockedReason: null } });
    expect(kinds(cancelled)).toEqual(["unblocked", "cancelled"]);
    const reopened = planTransition(task({ status: "rejected" }), "not_started", {}, now);
    expect(reopened).toMatchObject({ ok: true, patch: { status: "not_started", rejectionReason: null } });
    expect(kinds(reopened)).toEqual(["reopened"]);
    // Closing a rejected task another way swaps the reason without a reopen.
    expect(kinds(planTransition(task({ status: "rejected" }), "cancelled", { reason: "Gone" }, now))).toEqual(["cancelled"]);
  });

  it("closing a task keeps when it closed and the due date it had; reopening clears both (the closure snapshot)", () => {
    // Every way of closing writes the snapshot: the Activity widget reads early / on time / late from it for good.
    expect(planTransition(task({ dueDate: "2026-10-20" }), "completed", { summary: "Done" }, now)).toMatchObject({ ok: true, patch: { closedAt: now, dueDateAtClose: "2026-10-20" } });
    expect(planTransition(task({ dueDate: null }), "cancelled", { reason: "Gone" }, now)).toMatchObject({ ok: true, patch: { closedAt: now, dueDateAtClose: null } });
    expect(planTransition(task({ dueDate: "2026-10-01", parentTaskId: "parent" }), "merged", { reason: "Merged into Parent" }, now)).toMatchObject({ ok: true, patch: { closedAt: now, dueDateAtClose: "2026-10-01" } });
    // Closed another way, it is closed now, against the date it has now.
    expect(planTransition(task({ status: "rejected", dueDate: "2026-11-01" }), "cancelled", { reason: "Gone" }, now)).toMatchObject({ ok: true, patch: { closedAt: now, dueDateAtClose: "2026-11-01" } });
    // Open again: nothing is left of the closure. A move between open statuses never touches it.
    expect(planTransition(task({ status: "completed", dueDate: "2026-10-20" }), "in_progress", {}, now)).toMatchObject({ ok: true, patch: { closedAt: null, dueDateAtClose: null } });
    const started = planTransition(task({ status: "not_started", startedAt: null }), "in_progress", {}, now);
    expect(started.ok && "closedAt" in started.patch).toBe(false);
  });

  it("only a sub-task can be merged, and merging closes it with its parent as the reason", () => {
    expect(planTransition(task(), "merged", { reason: "Merged into X" }, now)).toEqual({ ok: false, error: MERGE_NEEDS_PARENT });
    const child = task({ parentTaskId: "parent" });
    expect(planTransition(child, "merged", {}, now)).toEqual({ ok: false, error: REASON_PROMPTS.merged });
    const merged = planTransition(child, "merged", { reason: "Merged into “Ship the status page”" }, now);
    expect(merged).toMatchObject({ ok: true, patch: { status: "merged", rejectionReason: "Merged into “Ship the status page”" }, activities: [{ kind: "merged" }] });
    expect(kinds(planTransition(task({ status: "merged", parentTaskId: "parent" }), "not_started", {}, now))).toEqual(["reopened"]);
    expect(needsInput("merged")).toBe(true);
  });
});

describe("tasks made from comments (2026-11-11 log)", () => {
  it("the hold on completing says how many open comments wait on tasks, and keeps its old words when none do", () => {
    expect(openCommentsMessage(2)).toBe("Resolve the 2 open comments before completing this task.");
    expect(openCommentsMessage(1, 1)).toBe("Resolve the 1 open comment before completing this task. It waits for the task made from it: closing that task resolves it.");
    expect(openCommentsMessage(3, 1)).toContain("One of them waits for a task made from the comment");
    expect(openCommentsMessage(3, 2)).toContain("2 of them wait for a task made from the comment");
    expect(openCommentsMessage(2, 2)).toContain("Each waits for a task made from the comment");
    // The server refuses with the same words; cancelling, deferring and rejecting are not held.
    expect(planTransition(task({ openComments: 1, commentsWaitingOnTasks: 1 }), "completed", { summary: "Done" }, now)).toEqual({ ok: false, error: openCommentsMessage(1, 1) });
    expect(planTransition(task({ openComments: 1, commentsWaitingOnTasks: 1 }), "cancelled", { reason: "Not needed" }, now).ok).toBe(true);
  });

  it("names what a comment waits for, and what the forms say before the save", () => {
    expect(commentWaitsMessage(["Fix the export"])).toBe("This comment waits for “Fix the export”: it resolves itself when that task is closed.");
    expect(waitsForLabel(["A", "B"])).toBe("Waits for “A” and “B”");
    expect(waitsForLabel(["A", "B", "C"])).toBe("Waits for 3 tasks");
    expect(fromCommentHint("Ship the report")).toBe("Made from a comment on “Ship the report”: the comment stays open until this task is closed, then resolves itself.");
    const open = { resolved: false, taskTitle: "Ship the report" as string | null, taskStatus: "in_progress" as const, otherOpen: 0 };
    expect(closingResolvesMessage(open)).toBe("Closing this task resolves the comment it was made from on “Ship the report”.");
    expect(closingResolvesMessage({ ...open, otherOpen: 2 })).toContain("still waits for 2 other tasks");
    expect(closingResolvesMessage({ ...open, resolved: true })).toBeNull();
    // A viewer who may not read the task the comment is on is not told its title.
    expect(closingResolvesMessage({ ...open, taskTitle: null })).toBe("Closing this task resolves the comment it was made from.");
    expect(reopeningMessage({ ...open, resolved: true, taskStatus: "completed" })).toBe(
      "Reopening this task opens the comment it was made from on “Ship the report” again, and “Ship the report”, which is completed, goes back to In progress.",
    );
    expect(reopeningMessage(open)).toBeNull();
  });

  it("the history says what the link did", () => {
    expect(resolvedByTaskNote("Fix the export", "cancelled")).toBe("The task made from it, “Fix the export”, was cancelled.");
    expect(reopenedBecause("Fix the export")).toBe("A comment on it is open again: “Fix the export”, the task made from that comment, was reopened.");
    const row = (overrides: Partial<HistoryRow>): HistoryRow => ({
      type: "activity",
      id: "a1",
      created_at: now,
      kind: "created",
      body: null,
      next_action: null,
      blocker: null,
      before: null,
      after: null,
      note: null,
      resolved_at: null,
      resolved_by_name: null,
      actor_id: "u1",
      actor_name: "Jordan Dev",
      actor_email: null,
      actor_image: null,
      before_assignee: null,
      after_assignee: null,
      approver_name: null,
      ...overrides,
    });
    expect(phraseHistory(row({ after: { title: "Fix the export", fromCommentId: "c1", fromTaskId: "t1" } }), "UTC", now).phrase).toBe("made the task from a comment");
    expect(phraseHistory(row({ kind: "comment_resolved", after: { commentId: "c1", byTaskId: "t2" } }), "UTC", now).phrase).toBe("resolved a comment by closing the task made from it");
    const comment = phraseHistory(row({ type: "comment", kind: null, body: "The export drops a row", linked: [{ id: "t2", title: "Fix the export", status: "in_progress" }] }), "UTC", now);
    expect(comment.tasks).toEqual([{ id: "t2", title: "Fix the export", status: "in_progress" }]);
    expect(phraseHistory(row({ kind: "completed" }), "UTC", now).tasks).toEqual([]);
  });
});

describe("the task model: state, phase, timing (2026-11-24 log)", () => {
  const today = "2026-11-24";

  it("every status is a box: open or closed, and one of two phases", () => {
    expect((["not_started", "in_progress", "awaiting_approval", "blocked"] as const).map(lifeStateOf)).toEqual(["open", "open", "open", "open"]);
    expect((["completed", "merged", "rejected", "cancelled"] as const).map(lifeStateOf)).toEqual(["closed", "closed", "closed", "closed"]);
    expect(phaseOf("not_started", false)).toBe("not_started");
    expect(phaseOf("in_progress", true)).toBe("in_progress");
    // Awaiting approval is in-progress work; Blocked keeps the phase the work was in.
    expect(phaseOf("awaiting_approval", true)).toBe("in_progress");
    expect([phaseOf("blocked", false), phaseOf("blocked", true)]).toEqual(["not_started", "in_progress"]);
    // Merged is how a sub-task is completed; rejected and cancelled are closed incomplete.
    expect([phaseOf("completed", true), phaseOf("merged", true)]).toEqual(["completed", "completed"]);
    expect([phaseOf("rejected", true), phaseOf("cancelled", false)]).toEqual(["incomplete", "incomplete"]);
    expect([blockKindOf("blocked", true), blockKindOf("blocked", false), blockKindOf("awaiting_approval", true), blockKindOf("merged", true)]).toEqual(["in_progress", "not_started", "awaiting_approval", "merged"]);
  });

  it("timing compares calendar days: before the due date is early, on it current, after it late", () => {
    expect(timingOf(null, today)).toBe("none");
    expect(timingOf("2026-11-25", today)).toBe("early");
    expect(timingOf("2026-11-24", today)).toBe("current");
    expect(timingOf("2026-11-23", today)).toBe("late");
  });

  it("open work changes band at 4 → 3 days, 2 → 1 day and once the due date has passed", () => {
    const band = (due: string) => openBandOf(daysLeft(due, today));
    expect([band("2026-12-10"), band("2026-11-28")]).toEqual(["healthy", "healthy"]);
    expect([band("2026-11-27"), band("2026-11-26")]).toEqual(["warm", "warm"]);
    // Due tomorrow and due today are the same band; due today is not overdue.
    expect([band("2026-11-25"), band("2026-11-24")]).toEqual(["at_risk", "at_risk"]);
    expect([band("2026-11-23"), band("2026-10-01")]).toEqual(["overdue", "overdue"]);
  });

  it("brightness is the timing: darker is later, and no due date is the base colour", () => {
    expect((["healthy", "warm", "at_risk", "overdue"] as const).map((band) => shadeOf("open", band === "overdue" ? "late" : "early", band))).toEqual([1, 2, 3, 4]);
    expect((["early", "current", "late"] as const).map((timing) => shadeOf("closed", timing, null))).toEqual([1, 2, 3]);
    expect([shadeOf("open", "none", null), shadeOf("closed", "none", null)]).toEqual([2, 2]);
  });

  it("a block sits on the day its task's life puts it: closure day, due date, or Today", () => {
    // Closed: the day it closed, whatever its due date says now.
    expect(blockDayOf({ state: "closed", dueDate: "2026-12-01", closedDay: "2026-11-10" }, today)).toBe("2026-11-10");
    // Open with a date ahead (or today): that date. Open without one: Today.
    expect(blockDayOf({ state: "open", dueDate: "2026-11-30", closedDay: null }, today)).toBe("2026-11-30");
    expect(blockDayOf({ state: "open", dueDate: today, closedDay: null }, today)).toBe(today);
    expect(blockDayOf({ state: "open", dueDate: null, closedDay: null }, today)).toBe(today);
    // Open and overdue: carried along on Today until it is closed, so nothing open is left behind it.
    expect(blockDayOf({ state: "open", dueDate: "2026-11-01", closedDay: null }, today)).toBe(OVERDUE_FOLLOWS_TODAY ? today : "2026-11-01");
  });

  it("a due-date change is named for what it does, and a deferral needs a future date", () => {
    expect(classifyDueChange("2026-11-30", "2026-11-30", today)).toBeNull();
    expect(classifyDueChange(null, "2026-11-30", today)).toBe("scheduled");
    expect(classifyDueChange("2026-11-30", null, today)).toBe("due_removed");
    expect(classifyDueChange("2026-11-30", "2026-12-05", today)).toBe("deferred");
    // Earlier is brought forward even when both days are still ahead.
    expect(classifyDueChange("2026-12-05", "2026-11-30", today)).toBe("brought_forward");
    // Later, but not to a day ahead of today: a correction, not a deferral.
    expect(classifyDueChange("2026-11-10", "2026-11-20", today)).toBe("due_changed");
    expect(classifyDueChange("2026-11-10", today, today)).toBe("due_changed");
  });

  it("history says what a date change did, who approved it, and still reads the old Deferred status", () => {
    const row = (overrides: Partial<HistoryRow>): HistoryRow => ({ type: "activity", id: "a1", created_at: now, kind: "created", body: null, next_action: null, blocker: null, before: null, after: null, note: null, resolved_at: null, resolved_by_name: null, actor_id: "u1", actor_name: "Avery Admin", actor_email: null, actor_image: null, before_assignee: null, after_assignee: null, approver_name: null, ...overrides });
    expect(phraseHistory(row({ kind: "deferred", before: { dueDate: "2026-10-20" }, after: { dueDate: "2026-10-27" } }), "UTC", now)).toMatchObject({ phrase: "deferred it", change: { before: "Oct 20", after: "Oct 27" } });
    expect(phraseHistory(row({ kind: "scheduled", before: { dueDate: null }, after: { dueDate: "2026-10-27", approved: true } }), "UTC", now)).toMatchObject({ phrase: "approved a date change: scheduled it", change: { before: "No date" } });
    expect(phraseHistory(row({ kind: "due_change_requested", before: { dueDate: "2026-10-20" }, after: { dueDate: "2026-10-27", change: "deferred" } }), "UTC", now).phrase).toBe("asked for a date change (deferred)");
    expect(phraseHistory(row({ kind: "due_change_declined", after: { dueDate: null, change: "due_removed", withdrawn: true } }), "UTC", now).phrase).toBe("withdrew the date change");
    // A row from when Deferred was a status carries no dates, and a reopen from it still names it.
    expect(phraseHistory(row({ kind: "deferred", before: { status: "in_progress" }, after: { status: "deferred" } }), "UTC", now)).toMatchObject({ phrase: "deferred it", change: null });
    expect(phraseHistory(row({ kind: "reopened", before: { status: "deferred" }, after: { status: "not_started" } }), "UTC", now).change).toEqual({ before: "Deferred", after: "Not started" });
  });
});
