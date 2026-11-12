import { describe, expect, it } from "vitest";
import { cadenceRange, daysOf, matchingPreset, presetRange, previousWorkingDay, SCOPE_PRESETS, TIMELINE_LOOKAHEAD_DAYS, TIMELINE_MAX_DAYS, timelineWindow } from "./range";

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

// 2026-11-12 is a Thursday, so 2026-11-09 is a Monday and 2026-11-06 the Friday before it.
describe("the Active scope's daily cadences", () => {
  it("daily is since yesterday, whatever the day", () => {
    expect(cadenceRange("daily", "2026-11-12")).toEqual({ from: "2026-11-11", to: "2026-11-12" });
    expect(cadenceRange("daily", "2026-11-09")).toEqual({ from: "2026-11-08", to: "2026-11-09" });
    expect(cadenceRange("daily", "2026-01-01")).toEqual({ from: "2025-12-31", to: "2026-01-01" });
  });

  it("weekdays is since the last working day: a Monday reads from Friday, and so does the weekend", () => {
    expect(cadenceRange("weekdays", "2026-11-09")).toEqual({ from: "2026-11-06", to: "2026-11-09" });
    expect(cadenceRange("weekdays", "2026-11-08").from).toBe("2026-11-06");
    expect(cadenceRange("weekdays", "2026-11-07").from).toBe("2026-11-06");
    expect(cadenceRange("weekdays", "2026-11-10").from).toBe("2026-11-09");
    // From Tuesday to Saturday the two cadences are the same day.
    expect(cadenceRange("weekdays", "2026-11-12")).toEqual(cadenceRange("daily", "2026-11-12"));
    // A Monday at the start of a month reads from the Friday of the month before.
    expect(previousWorkingDay("2026-03-02")).toBe("2026-02-27");
  });

  it("the scope offers Week, Month and 3 months; a longer span, or a day or two, reads as Custom there", () => {
    const today = "2026-11-12";
    expect(matchingPreset(presetRange("month", today), today, SCOPE_PRESETS)).toBe("month");
    expect(matchingPreset(presetRange("half-year", today), today, SCOPE_PRESETS)).toBeNull();
    expect(matchingPreset(presetRange("half-year", today), today)).toBe("half-year");
    expect(matchingPreset(cadenceRange("daily", today), today, SCOPE_PRESETS)).toBeNull();
  });
});
