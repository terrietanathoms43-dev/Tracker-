import { describe, expect, it } from "vitest";
import { closerDeleteMessage, closerHeldMessage, closerLabel, closerReadyMessage, closerRepeatMessage, closerStaysMessage, CLOSER_TITLE, taskLabel } from "./closer";

// The goal's "Everything completed" task is never named by that bare title (the client's review, 2026-11-09): every
// plain-text place uses these, so they are pinned here.
describe("a goal's closer, in words", () => {
  it("is named with its goal wherever no chip can be drawn", () => {
    expect(closerLabel(CLOSER_TITLE, "Ship onboarding")).toBe("Everything completed · Ship onboarding");
    expect(closerLabel("Sign off the launch", "Ship onboarding")).toBe("Sign off the launch · Ship onboarding");
  });

  it("falls back to the title when the goal is not known", () => {
    expect(closerLabel(CLOSER_TITLE, null)).toBe(CLOSER_TITLE);
    expect(closerLabel(CLOSER_TITLE, undefined)).toBe(CLOSER_TITLE);
  });

  it("labels a list row: only a closer carries its goal", () => {
    const goal = { title: "Ship onboarding" };
    expect(taskLabel({ title: CLOSER_TITLE, goalCloser: true, goal })).toBe("Everything completed · Ship onboarding");
    expect(taskLabel({ title: "Write the welcome email", goalCloser: false, goal })).toBe("Write the welcome email");
    expect(taskLabel({ title: CLOSER_TITLE, goalCloser: true, goal: null })).toBe(CLOSER_TITLE);
  });

  it("says how many other tasks it waits for, naming the goal", () => {
    expect(closerHeldMessage(1, "Ship onboarding")).toBe("Finish the other 1 task under “Ship onboarding” first: this one marks the goal achieved.");
    expect(closerHeldMessage(3, "Ship onboarding")).toBe("Finish the other 3 tasks under “Ship onboarding” first: this one marks the goal achieved.");
    expect(closerHeldMessage(2, null)).toBe("Finish the other 2 tasks under its goal first: this one marks the goal achieved.");
  });

  it("says what completing it does, and why it stays put", () => {
    expect(closerReadyMessage("Ship onboarding")).toBe("Completing this marks “Ship onboarding” achieved.");
    expect(closerStaysMessage("Ship onboarding")).toContain("stays with its goal");
    expect(closerDeleteMessage("Ship onboarding")).toContain("goes when the goal is deleted");
    expect(closerRepeatMessage("Ship onboarding")).toContain("set the repeat on the goal");
  });
});
