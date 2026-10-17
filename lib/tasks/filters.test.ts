// The task list's URL state: what goes in, what comes back out, and what gets dropped.
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filtersToParams, isFiltered, parseFilters, parseView, tasksHref, type TaskFilters } from "./filters";

describe("task list URL state", () => {
  it("round-trips through the URL", () => {
    const filters: TaskFilters = {
      ...DEFAULT_FILTERS,
      q: "backup",
      status: ["blocked", "in_progress"],
      assignee: "me",
      project: "p-1",
      goal: "g-1",
      due: "overdue",
      closed: true,
      sort: "due",
    };
    expect(parseFilters(Object.fromEntries(filtersToParams(filters)))).toEqual(filters);
  });

  it("drops anything it does not recognise", () => {
    const parsed = parseFilters({ status: "blocked,bogus,blocked", priority: "huge", due: "someday", sort: "random", assignee: "x'; drop", project: "a b", closed: "yes" });
    expect(parsed).toEqual({ ...DEFAULT_FILTERS, status: ["blocked"] });
  });

  it("takes the first value when a key repeats, and caps the search", () => {
    expect(parseFilters({ priority: ["high", "low"], q: "x".repeat(300) })).toMatchObject({ priority: "high", q: "x".repeat(100) });
  });

  it("keeps the defaults out of the URL", () => {
    expect(tasksHref({})).toBe("/tasks");
    expect(tasksHref({ assignee: "me", status: ["completed"], sort: "updated" })).toBe("/tasks?status=completed&assignee=me&sort=updated");
  });

  it("keeps the board view in the address and reads it back", () => {
    expect(tasksHref({ priority: "urgent" }, "board")).toBe("/tasks?priority=urgent&view=board");
    expect(parseView({ view: "board" })).toBe("board");
    expect(parseView({ view: "kanban" })).toBe("list");
  });

  it("does not count the sort order as a filter", () => {
    expect(isFiltered({ ...DEFAULT_FILTERS, sort: "created" })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, closed: true })).toBe(true);
  });
});
