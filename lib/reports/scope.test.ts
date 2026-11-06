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
  createdDay: "2026-10-01",
  updatedAt: "2026-11-01T00:00:00.000Z",
  completionSummary: null,
  nextAction: null,
  blockedReason: null,
  blockedBy: null,
  goalId: null,
  goalTitle: null,
  project: null,
  evidence: [],
};
const task = (id: string, over: Partial<ReportTask>): ReportTask => ({ ...base, ...over, id, title: over.title ?? id });

describe("groupActiveScope", () => {
  it("groups by status, problems first and completed last, leaving empty groups out", () => {
    const scope = groupActiveScope(
      [task("done", { status: "completed", completedDay: "2026-11-02" }), task("new", { status: "not_started" }), task("stuck", { status: "blocked" }), task("moving", { status: "in_progress" })],
      range,
      today,
    );
    expect(scope.groups.map((group) => group.status)).toEqual(["blocked", "in_progress", "not_started", "completed"]);
    expect(scope.groups.map((group) => group.label)).toEqual(["Blocked", "In progress", "Not started", "Completed"]);
    expect(SCOPE_GROUPS).not.toContain("rejected");
  });

  it("sorts open work soonest due first (undated last) and completed work newest first, titles breaking ties", () => {
    const scope = groupActiveScope(
      [
        task("b", { dueDate: null }),
        task("a", { dueDate: null }),
        task("later", { dueDate: "2026-11-20" }),
        task("soon", { dueDate: "2026-11-08" }),
        task("old", { status: "completed", completedDay: "2026-10-25" }),
        task("fresh", { status: "completed", completedDay: "2026-11-05" }),
        task("also fresh", { status: "completed", completedDay: "2026-11-05" }),
      ],
      range,
      today,
    );
    expect(scope.groups[0].tasks.map((t) => t.id)).toEqual(["soon", "later", "a", "b"]);
    expect(scope.groups[1].tasks.map((t) => t.id)).toEqual(["also fresh", "fresh", "old"]);
  });

  it("counts the scope: open, overdue today, blocked, completed, and what the cycle added", () => {
    const scope = groupActiveScope(
      [
        task("late", { status: "in_progress", dueDate: "2026-11-05", createdDay: "2026-10-24" }),
        task("today", { status: "not_started", dueDate: "2026-11-06" }),
        task("stuck", { status: "blocked", dueDate: "2026-10-01" }),
        task("done", { status: "completed", completedDay: "2026-11-01", createdDay: "2026-10-30" }),
      ],
      range,
      today,
    );
    expect(scope).toMatchObject({ total: 4, open: 3, overdue: 2, blocked: 1, completed: 1, added: 2 });
    expect(scope.range).toEqual(range);
  });

  it("drops a rejected task, which is neither open nor done", () => {
    const scope = groupActiveScope([task("no", { status: "rejected" }), task("yes", { status: "not_started" })], range, today);
    expect(scope.total).toBe(1);
    expect(scope.groups.map((group) => group.status)).toEqual(["not_started"]);
  });

  it("is empty when nothing is in scope", () => {
    expect(groupActiveScope([], range, today)).toEqual({ range, groups: [], total: 0, open: 0, overdue: 0, blocked: 0, completed: 0, added: 0 });
  });
});

describe("addedInCycle", () => {
  it("is true from the range's first day on", () => {
    expect(addedInCycle({ createdDay: "2026-10-23" }, range)).toBe(false);
    expect(addedInCycle({ createdDay: "2026-10-24" }, range)).toBe(true);
    expect(addedInCycle({ createdDay: "2026-11-06" }, range)).toBe(true);
  });
});
