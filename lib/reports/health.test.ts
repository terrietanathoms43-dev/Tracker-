import { describe, expect, it } from "vitest";
import { healthOf, sortByHealth } from "./health";

const today = "2026-11-01";

describe("healthOf", () => {
  it("is on track with nothing overdue, blocked or late", () => {
    expect(healthOf({ total: 5, completed: 2, blocked: 0, overdue: 0, targetDate: "2026-12-01", today })).toBe("on_track");
    expect(healthOf({ total: 0, completed: 0, blocked: 0, overdue: 0, targetDate: null, today })).toBe("on_track");
  });

  it("needs attention when some work is overdue, at risk when a fifth or more is", () => {
    expect(healthOf({ total: 10, completed: 3, blocked: 0, overdue: 1, targetDate: null, today })).toBe("needs_attention");
    expect(healthOf({ total: 10, completed: 3, blocked: 0, overdue: 2, targetDate: null, today })).toBe("at_risk");
  });

  it("needs attention when the work is behind the pace its target needs, even with nothing overdue", () => {
    expect(healthOf({ total: 10, completed: 1, blocked: 0, overdue: 0, targetDate: "2026-12-01", today, behindPace: true })).toBe("needs_attention");
    expect(healthOf({ total: 10, completed: 1, blocked: 0, overdue: 0, targetDate: "2026-12-01", today, behindPace: false })).toBe("on_track");
  });

  it("is at risk as soon as anything is blocked", () => {
    expect(healthOf({ total: 10, completed: 9, blocked: 1, overdue: 0, targetDate: "2027-01-01", today })).toBe("at_risk");
  });

  it("is delayed once the target date has passed with work still open, whatever else is true", () => {
    expect(healthOf({ total: 4, completed: 3, blocked: 0, overdue: 0, targetDate: "2026-10-31", today })).toBe("delayed");
    expect(healthOf({ total: 4, completed: 1, blocked: 2, overdue: 1, targetDate: "2026-10-31", today })).toBe("delayed");
    // No tasks at all and the date has gone: nothing was done, so it is late too.
    expect(healthOf({ total: 0, completed: 0, blocked: 0, overdue: 0, targetDate: "2026-10-31", today })).toBe("delayed");
  });

  it("is not delayed when the work was all done, or the date is today or later", () => {
    expect(healthOf({ total: 4, completed: 4, blocked: 0, overdue: 0, targetDate: "2026-10-31", today })).toBe("on_track");
    expect(healthOf({ total: 4, completed: 1, blocked: 0, overdue: 0, targetDate: today, today })).toBe("on_track");
  });
});

describe("sortByHealth", () => {
  it("lists the worst first, then the nearest date, then the name", () => {
    const rows = [
      { name: "Zeta", health: "on_track" as const, targetDate: "2026-11-10" },
      { name: "Beta", health: "at_risk" as const, targetDate: null },
      { name: "Alpha", health: "at_risk" as const, targetDate: "2026-12-01" },
      { name: "Late", health: "delayed" as const, targetDate: "2026-10-01" },
      { name: "Gamma", health: "needs_attention" as const, targetDate: "2026-11-05" },
    ];
    expect(sortByHealth(rows, (row) => row.name).map((row) => row.name)).toEqual(["Late", "Alpha", "Beta", "Gamma", "Zeta"]);
  });
});
