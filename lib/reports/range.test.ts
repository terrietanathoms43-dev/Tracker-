import { describe, expect, it } from "vitest";
import { lastDays, matchingPreset, presetRange, rangeLength, shiftDay } from "./range";

// 2026-10-17 is a Saturday.
const today = "2026-10-17";

describe("shiftDay", () => {
  it("crosses month and year ends", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("presetRange", () => {
  it("this week starts on Monday", () => {
    expect(presetRange("this-week", today)).toEqual({ from: "2026-10-12", to: today });
    expect(presetRange("this-week", "2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-12" });
    expect(presetRange("this-week", "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("last 7 and last 30 days end today and include it", () => {
    expect(presetRange("last-7", today)).toEqual({ from: "2026-10-11", to: today });
    expect(presetRange("last-30", today)).toEqual({ from: "2026-09-18", to: today });
    expect(rangeLength(presetRange("last-30", today))).toBe(30);
  });

  it("this month and last month", () => {
    expect(presetRange("this-month", today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last-month", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("last-month", "2024-03-31")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("matchingPreset", () => {
  it("recognises a preset and ignores custom ranges", () => {
    expect(matchingPreset(lastDays(30, today), today)).toBe("last-30");
    expect(matchingPreset({ from: "2026-09-01", to: "2026-09-30" }, today)).toBe("last-month");
    expect(matchingPreset({ from: "2026-09-02", to: "2026-09-30" }, today)).toBeNull();
  });
});
