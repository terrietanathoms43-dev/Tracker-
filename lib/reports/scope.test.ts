import { describe, expect, it } from "vitest";
import type { ReportTask } from "./data";
import { addedInCycle, groupActiveScope, SCOPE_GROUPS } from "./scope";

const range = { from: "2026-10-24", to: "2026-11-06" };
const today = "2026-11-06";

const base: ReportTask = {
  id: "t",
  title: "Task",
  status: "in_progress",
  priority: "normal",
  assignees: [],
  dueDate: null,
  completedDay: null,
  closedDay: null,
  createdDay: "2026-10-01",
  updatedAt: "2026-11-01T00:00:00.000Z",
  completionSummary: null,
  nextAction: null,
  blockedReason: null,
  blockedBy: null,
  rejectionReason: null,
  goalId: null,
  goalTitle: null,
  project: null,
  evidence: [],
};
const task = (id: string, over: Partial<ReportTask>): ReportTask => ({ ...base, ...over, id, title: over.title ?? id });
const done = (id: string, day: string, over: Partial<ReportTask> = {}): ReportTask => task(id, { status: "completed", completedDay: day, closedDay: day, ...over });

describe("groupActiveScope", () => {
  it("groups by status, problems first, closed-without-completing next and completed last, leaving empty groups out", () => {
    const scope = groupActiveScope(
      [
        done("done", "2026-11-02"),
        task("new", { status: "not_started" }),
        task("dropped", { status: "rejected", rejectionReason: "Out of scope", closedDay: "2026-11-01" }),
        task("parked", { status: "deferred", rejectionReason: "After the launch", closedDay: "2026-11-03" }),
        task("stuck", { status: "blocked" }),
        task("moving", { status: "in_progress" }),
        task("gone", { status: "cancelled", rejectionReason: "Superseded", closedDay: "2026-11-04" }),
      ],
      range,
      today,
    );
    expect(scope.groups.map((group) => group.status)).toEqual(["blocked", "in_progress", "not_started", "deferred", "rejected", "cancelled", "completed"]);
    expect(scope.groups.map((group) => group.label)).toEqual(["Blocked", "In progress", "Not started", "Deferred", "Rejected", "Cancelled", "Completed"]);
    expect(SCOPE_GROUPS).toHaveLength(9);
  });

  it("sorts open work soonest due first (undated last) and closed work newest first, titles breaking ties", () => {
    const scope = groupActiveScope(
      [
        task("b", { dueDate: null }),
        task("a", { dueDate: null }),
        task("later", { dueDate: "2026-11-20" }),
        task("soon", { dueDate: "2026-11-08" }),
        done("old", "2026-10-25"),
        done("fresh", "2026-11-05"),
        done("also fresh", "2026-11-05"),
        task("parked early", { status: "deferred", closedDay: "2026-10-26" }),
        task("parked late", { status: "deferred", closedDay: "2026-11-02" }),
      ],
      range,
      today,
    );
    expect(scope.groups[0].tasks.map((t) => t.id)).toEqual(["soon", "later", "a", "b"]);
    expect(scope.groups[1].tasks.map((t) => t.id)).toEqual(["parked late", "parked early"]);
    expect(scope.groups[2].tasks.map((t) => t.id)).toEqual(["also fresh", "fresh", "old"]);
  });

  it("counts the scope: not completed, overdue today, blocked, completed, and what the cycle added", () => {
    const scope = groupActiveScope(
      [
        task("late", { status: "in_progress", dueDate: "2026-11-05", createdDay: "2026-10-24" }),
        task("today", { status: "not_started", dueDate: "2026-11-06" }),
        task("stuck", { status: "blocked", dueDate: "2026-10-01" }),
        done("done", "2026-11-01", { createdDay: "2026-10-30" }),
      ],
      range,
      today,
    );
    expect(scope).toMatchObject({ total: 4, notCompleted: 3, overdue: 2, blocked: 1, completed: 1, added: 2 });
    expect(scope.range).toEqual(range);
  });

  it("keeps rejected, deferred and cancelled tasks as not completed, and never counts them overdue", () => {
    const scope = groupActiveScope(
      [
        task("no", { status: "rejected", dueDate: "2026-10-01", closedDay: "2026-10-30" }),
        task("later", { status: "deferred", dueDate: "2026-10-01", closedDay: "2026-10-30" }),
        task("never", { status: "cancelled", dueDate: "2026-10-01", closedDay: "2026-10-30" }),
        task("yes", { status: "not_started" }),
      ],
      range,
      today,
    );
    expect(scope).toMatchObject({ total: 4, notCompleted: 4, overdue: 0, completed: 0 });
    expect(scope.groups.map((group) => group.status)).toEqual(["not_started", "deferred", "rejected", "cancelled"]);
  });

  it("is empty when nothing is in scope", () => {
    expect(groupActiveScope([], range, today)).toEqual({ range, groups: [], total: 0, notCompleted: 0, overdue: 0, blocked: 0, completed: 0, added: 0 });
  });
});

describe("addedInCycle", () => {
  it("is true from the Since day on", () => {
    expect(addedInCycle({ createdDay: "2026-10-23" }, range)).toBe(false);
    expect(addedInCycle({ createdDay: "2026-10-24" }, range)).toBe(true);
    expect(addedInCycle({ createdDay: "2026-11-06" }, range)).toBe(true);
  });
});
