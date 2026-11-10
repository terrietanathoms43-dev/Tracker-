import { describe, expect, it } from "vitest";
import { describeSubTasks, nestSubTasks } from "./sub-tasks";
import type { TaskListItem } from "./types";

const item = (id: string, parent: string | null = null): TaskListItem => ({
  id,
  title: id,
  description: null,
  status: "not_started",
  priority: "normal",
  dueDate: null,
  dueTime: null,
  repeats: null,
  nextAction: null,
  latestProgress: null,
  assignees: [],
  project: null,
  goal: null,
  parent: parent === null ? null : { id: parent, title: parent },
  subTasks: 0,
  proposal: null,
  needsSignOff: false,
  goalCloser: false,
  canDelete: false,
  updatedAt: "2026-11-08T00:00:00.000Z",
});

describe("nestSubTasks", () => {
  it("puts children right under their parent, in list order, and leaves plain rows alone", () => {
    const rows = nestSubTasks([item("b", "a"), item("a"), item("c"), item("d", "a"), item("e", "c")]);
    expect(rows.map((row) => `${row.task.id}${row.nested ? "*" : ""}`)).toEqual(["a", "b*", "d*", "c", "e*"]);
  });

  it("keeps a child whose parent is not on the page where it was, not nested", () => {
    const rows = nestSubTasks([item("x", "missing"), item("a")]);
    expect(rows.map((row) => [row.task.id, row.nested])).toEqual([
      ["x", false],
      ["a", false],
    ]);
  });

  it("is the identity for a list without sub-tasks", () => {
    expect(nestSubTasks([item("a"), item("b")]).map((row) => row.task.id)).toEqual(["a", "b"]);
    expect(nestSubTasks([])).toEqual([]);
  });

  it("counts in words", () => {
    expect(describeSubTasks(1)).toBe("1 sub-task");
    expect(describeSubTasks(3)).toBe("3 sub-tasks");
  });
});
