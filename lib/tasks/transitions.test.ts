// The status rules of docs/PLAN.md §5, checked without a database.
import { describe, expect, it } from "vitest";
import { closingResolvesMessage, commentWaitsMessage, fromCommentHint, reopenedBecause, reopeningMessage, resolvedByTaskNote, waitsForLabel } from "./comment-tasks";
import { phraseHistory, type HistoryRow } from "./history";
import { APPROVAL_NOTE_REQUIRED, MERGE_NEEDS_PARENT, needsInput, openCommentsMessage, planTransition, REASON_PROMPTS, SUMMARY_REQUIRED, type TaskState } from "./transitions";

const now = new Date("2026-10-15T12:00:00Z");
const task = (overrides: Partial<TaskState> = {}): TaskState => ({ status: "in_progress", startedAt: new Date("2026-10-01"), approverId: null, blockedReason: null, openComments: 0, parentTaskId: null, ...overrides });
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
    expect(["blocked", "awaiting_approval", "rejected", "deferred", "cancelled", "completed"].every((s) => needsInput(s as "blocked"))).toBe(true);
  });

  it("completing needs its sign-off words: the summary, or the approver's note", () => {
    expect(planTransition(task(), "completed", {}, now)).toEqual({ ok: false, error: SUMMARY_REQUIRED });
    expect(planTransition(task(), "completed", { summary: "   " }, now).ok).toBe(false);
    const awaiting = task({ status: "awaiting_approval", approverId: "morgan" });
    expect(planTransition(awaiting, "completed", {}, now, "approve")).toEqual({ ok: false, error: APPROVAL_NOTE_REQUIRED });
    // The approver's note stands as the summary.
    expect(planTransition(awaiting, "completed", { note: "Checked on staging" }, now, "approve")).toMatchObject({ ok: true, patch: { completionSummary: "Checked on staging" } });
  });

  it("deferring and cancelling close the task with a reason; leaving them is a reopen that clears it", () => {
    expect(planTransition(task(), "deferred", {}, now)).toEqual({ ok: false, error: REASON_PROMPTS.deferred });
    expect(planTransition(task(), "cancelled", { reason: " " }, now)).toEqual({ ok: false, error: REASON_PROMPTS.cancelled });
    const deferred = planTransition(task(), "deferred", { reason: "After the launch" }, now);
    expect(deferred).toMatchObject({ ok: true, patch: { status: "deferred", rejectionReason: "After the launch" }, activities: [{ kind: "deferred", note: "After the launch" }] });
    const cancelled = planTransition(task({ status: "blocked", blockedReason: "PO" }), "cancelled", { reason: "Superseded" }, now);
    expect(cancelled).toMatchObject({ ok: true, patch: { status: "cancelled", rejectionReason: "Superseded", blockedReason: null } });
    expect(kinds(cancelled)).toEqual(["unblocked", "cancelled"]);
    const reopened = planTransition(task({ status: "deferred" }), "not_started", {}, now);
    expect(reopened).toMatchObject({ ok: true, patch: { status: "not_started", rejectionReason: null } });
    expect(kinds(reopened)).toEqual(["reopened"]);
    // Closing a rejected task another way swaps the reason without a reopen.
    expect(kinds(planTransition(task({ status: "rejected" }), "cancelled", { reason: "Gone" }, now))).toEqual(["cancelled"]);
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
