import { describe, expect, it } from "vitest";
import { clusterGroups, describeGroupCount, groupRows, groupRuns } from "./groups";
import { describeSubTasks, nestSubTasks } from "./sub-tasks";
import type { TaskGroupRef, TaskListItem } from "./types";

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
  group: null,
  fromComment: false,
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

// Groups (2026-11-11 log) are the other way rows are rearranged: equals pulled together inside one border, with
// their sub-tasks. Kept here, beside the nesting they are built on (lib/tasks/groups.ts).
describe("groupRows", () => {
  const group = (id: string, size = 2): TaskGroupRef => ({ id, name: null, size });
  const grouped = (id: string, g: TaskGroupRef, parent: string | null = null): TaskListItem => ({ ...item(id, parent), group: g });
  /** The drawn order as text: `[a b]` is one group's border, `>` marks a nested sub-task. */
  const drawn = (items: TaskListItem[], nest = true) =>
    groupRows(items, nest)
      .map((entry) => (entry.type === "row" ? `${entry.row.nested ? ">" : ""}${entry.row.task.id}` : `[${entry.rows.map((row) => `${row.nested ? ">" : ""}${row.task.id}`).join(" ")}]`))
      .join(" ");

  it("leaves a list without groups in its own order", () => {
    expect(drawn([item("a"), item("b"), item("c")])).toBe("a b c");
  });

  it("pulls a group's tasks together at the place of the first, keeping their order, and keeps two groups apart", () => {
    const g = group("g", 3);
    const h = group("h");
    expect(drawn([item("a"), grouped("b", g), item("c"), grouped("d", g), item("e"), grouped("f", g)])).toBe("a [b d f] c e");
    expect(drawn([grouped("a", g), grouped("b", h), grouped("c", g), grouped("d", h)])).toBe("[a c] [b d]");
  });

  it("draws a task whose group has nobody else on the page as a plain row", () => {
    expect(drawn([item("a"), grouped("b", group("g", 4)), item("c")])).toBe("a b c");
  });

  it("brings a grouped parent's sub-tasks into the border, and counts the group's tasks without them", () => {
    const g = group("g", 5);
    const items = [grouped("p", g), item("x"), grouped("q", g), item("k", "p")];
    expect(drawn(items)).toBe("[p >k q] x");
    const [entry] = groupRows(items);
    expect(entry.type === "group" ? entry.shown : null).toBe(2);
    expect(describeGroupCount(2, 5)).toBe("2 of 5 tasks here");
    expect(describeGroupCount(3, 3)).toBe("3 tasks");
  });

  it("keeps rows flat when asked not to nest, and still groups them", () => {
    const g = group("g");
    expect(drawn([item("k", "p"), grouped("p", g), grouped("q", g)], false)).toBe("k [p q]");
  });

  it("puts a board column's group members next to one another, as runs", () => {
    const g = group("g");
    const column = [grouped("a", g), item("b"), grouped("c", g), item("d")];
    expect(clusterGroups(column).map((each) => each.id)).toEqual(["a", "c", "b", "d"]);
    expect(groupRuns(clusterGroups(column)).map((run) => run.items.map((each) => each.id).join(""))).toEqual(["ac", "b", "d"]);
  });
});
