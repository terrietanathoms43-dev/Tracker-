import { describe, expect, it } from "vitest";
import { daysOf, TIMELINE_LOOKAHEAD_DAYS, TIMELINE_MAX_DAYS, timelineWindow } from "./range";

describe("timelineWindow", () => {
  it("runs from the range's start to two weeks past today", () => {
    expect(timelineWindow({ from: "2026-10-03", to: "2026-11-01" }, "2026-11-01")).toEqual({ from: "2026-10-03", to: "2026-11-15" });
  });

  it("looks ahead from today even when the range ended earlier", () => {
    expect(timelineWindow({ from: "2026-10-01", to: "2026-10-31" }, "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-11-15" });
  });

  it("looks ahead from the range's end when that is after today", () => {
    expect(timelineWindow({ from: "2026-11-01", to: "2026-11-20" }, "2026-11-01").to).toBe("2026-12-04");
  });

  it("keeps the most recent days of a window that is too long, so today is never cut off", () => {
    const window = timelineWindow({ from: "2026-01-01", to: "2026-11-01" }, "2026-11-01");
    expect(daysOf(window)).toHaveLength(TIMELINE_MAX_DAYS);
    expect(window.to).toBe("2026-11-15");
    expect(daysOf(window)).toContain("2026-11-01");
  });

  it("lists every day of the window in order", () => {
    const days = daysOf(timelineWindow({ from: "2026-11-01", to: "2026-11-01" }, "2026-11-01"));
    expect(days).toHaveLength(TIMELINE_LOOKAHEAD_DAYS + 1);
    expect(days[0]).toBe("2026-11-01");
    expect(days.at(-1)).toBe("2026-11-15");
  });
});
