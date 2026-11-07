// The status rules of docs/PLAN.md §5, checked without a database.
import { describe, expect, it } from "vitest";
import { APPROVAL_NOTE_REQUIRED, needsInput, planTransition, REASON_PROMPTS, SUMMARY_REQUIRED, type TaskState } from "./transitions";

const now = new Date("2026-10-15T12:00:00Z");
const task = (overrides: Partial<TaskState> = {}): TaskState => ({ status: "in_progress", startedAt: new Date("2026-10-01"), approverId: null, blockedReason: null, openComments: 0, ...overrides });
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
});
