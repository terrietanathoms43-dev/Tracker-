// The sub-goal deadline rule (docs/PLAN.md, 2026-10-30 log), checked both ways.
import { describe, expect, it } from "vitest";
import { parentDeadlineProblem, subGoalDeadlineProblem } from "./deadlines";

const TODAY = "2026-10-30";

describe("subGoalDeadlineProblem", () => {
  it("allows a sub-goal due on or before its parent, or when either side has no date", () => {
    expect(subGoalDeadlineProblem("2026-12-31", "2026-12-31", TODAY)).toBeNull();
    expect(subGoalDeadlineProblem("2026-12-31", "2026-11-15", TODAY)).toBeNull();
    expect(subGoalDeadlineProblem(null, "2027-03-01", TODAY)).toBeNull();
    expect(subGoalDeadlineProblem("2026-12-31", null, TODAY)).toBeNull();
  });

  it("refuses a sub-goal due after its parent and names the latest allowed day", () => {
    expect(subGoalDeadlineProblem("2026-12-31", "2027-01-01", TODAY)).toBe("A sub-goal can't be due after its parent goal. Pick Dec 31 or earlier.");
  });
});

describe("parentDeadlineProblem", () => {
  const subGoals = [
    { title: "Invite flow", targetDate: "2026-11-20" },
    { title: "First-task checklist", targetDate: "2026-12-05" },
    { title: "Undated", targetDate: null },
  ];

  it("allows a parent date on or after every sub-goal's date, or no date at all", () => {
    expect(parentDeadlineProblem("2026-12-05", subGoals, TODAY)).toBeNull();
    expect(parentDeadlineProblem("2027-01-01", subGoals, TODAY)).toBeNull();
    expect(parentDeadlineProblem(null, subGoals, TODAY)).toBeNull();
    expect(parentDeadlineProblem("2026-01-01", [], TODAY)).toBeNull();
  });

  it("refuses a parent date before a sub-goal's and names the latest one", () => {
    expect(parentDeadlineProblem("2026-11-30", subGoals, TODAY)).toBe("The sub-goal “First-task checklist” is due Dec 5, after this date. Move it earlier first.");
  });
});
