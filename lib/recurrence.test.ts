import { describe, expect, it } from "vitest";
import { describeRecurrence, missedOccurrences, nextAfterFinishing, nextOccurrence, nextOccurrenceWithin, normalizeRecurrence } from "./recurrence";

// The repeat rules (docs/PLAN.md, 2026-11-03 log): the next occurrence is always strictly after the day asked for.

describe("nextOccurrence", () => {
  it("daily: the next day, then every day", () => {
    expect(nextOccurrence({ unit: "day", interval: 1 }, "2026-11-03", "2026-11-03")).toBe("2026-11-04");
    expect(nextOccurrence({ unit: "day", interval: 1 }, "2026-11-03", "2026-11-10")).toBe("2026-11-11");
  });
  it("every 3 days stays on the anchor's grid", () => {
    expect(nextOccurrence({ unit: "day", interval: 3 }, "2026-11-01", "2026-11-01")).toBe("2026-11-04");
    expect(nextOccurrence({ unit: "day", interval: 3 }, "2026-11-01", "2026-11-05")).toBe("2026-11-07");
  });
  it("before the anchor, the anchor itself comes first", () => {
    expect(nextOccurrence({ unit: "day", interval: 1 }, "2026-11-10", "2026-11-03")).toBe("2026-11-10");
  });
  it("weekly on the anchor's weekday", () => {
    // 2026-11-02 is a Monday.
    expect(nextOccurrence({ unit: "week", interval: 1 }, "2026-11-02", "2026-11-02")).toBe("2026-11-09");
    expect(nextOccurrence({ unit: "week", interval: 1 }, "2026-11-02", "2026-11-05")).toBe("2026-11-09");
  });
  it("weekly on named weekdays", () => {
    const rule = { unit: "week" as const, interval: 1, weekdays: [1, 3] };
    expect(nextOccurrence(rule, "2026-11-02", "2026-11-02")).toBe("2026-11-04");
    expect(nextOccurrence(rule, "2026-11-02", "2026-11-04")).toBe("2026-11-09");
  });
  it("every 2 weeks skips a week", () => {
    expect(nextOccurrence({ unit: "week", interval: 2 }, "2026-11-02", "2026-11-02")).toBe("2026-11-16");
    expect(nextOccurrence({ unit: "week", interval: 2 }, "2026-11-02", "2026-11-17")).toBe("2026-11-30");
  });
  it("monthly keeps the day of the month and clamps short months", () => {
    expect(nextOccurrence({ unit: "month", interval: 1 }, "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence({ unit: "month", interval: 1 }, "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence({ unit: "month", interval: 2 }, "2026-11-15", "2026-11-15")).toBe("2027-01-15");
  });
});

describe("nextAfterFinishing", () => {
  it("finishing on the day schedules the next turn", () => {
    expect(nextAfterFinishing({ unit: "day", interval: 1 }, "2026-11-03", "2026-11-03", "2026-11-03")).toBe("2026-11-04");
  });
  it("finishing late never schedules into the past", () => {
    expect(nextAfterFinishing({ unit: "day", interval: 1 }, "2026-11-01", "2026-11-01", "2026-11-05")).toBe("2026-11-06");
  });
  it("finishing early keeps the next turn after the due day", () => {
    expect(nextAfterFinishing({ unit: "week", interval: 1 }, "2026-11-09", "2026-11-09", "2026-11-05")).toBe("2026-11-16");
  });
});

describe("normalizeRecurrence", () => {
  it("drops nonsense and caps the interval", () => {
    expect(normalizeRecurrence(null)).toBeNull();
    expect(normalizeRecurrence({ unit: "year" })).toBeNull();
    expect(normalizeRecurrence({ unit: "day", interval: 0 })).toEqual({ unit: "day", interval: 1 });
    expect(normalizeRecurrence({ unit: "day", interval: 999 })).toEqual({ unit: "day", interval: 52 });
  });
  it("keeps weekdays and a valid time only", () => {
    expect(normalizeRecurrence({ unit: "week", interval: 1, weekdays: [3, 1, 9, 1], time: "08:00" })).toEqual({ unit: "week", interval: 1, weekdays: [1, 3], time: "08:00" });
    expect(normalizeRecurrence({ unit: "day", interval: 1, time: "8am" })).toEqual({ unit: "day", interval: 1 });
  });
});

describe("describeRecurrence", () => {
  it("reads like a sentence", () => {
    expect(describeRecurrence({ unit: "day", interval: 1, time: "08:00" })).toBe("Every day at 8:00 AM");
    expect(describeRecurrence({ unit: "week", interval: 2, weekdays: [1, 3] })).toBe("Every 2 weeks on Mon, Wed");
    expect(describeRecurrence({ unit: "week", interval: 1 }, "2026-11-02")).toBe("Every week on Mon");
    expect(describeRecurrence({ unit: "month", interval: 3 })).toBe("Every 3 months");
  });
});

describe("an end date", () => {
  it("is kept when valid, stops the next occurrence, and reads in the description", () => {
    expect(normalizeRecurrence({ unit: "day", interval: 1, until: "2026-12-31" })).toEqual({ unit: "day", interval: 1, until: "2026-12-31" });
    expect(normalizeRecurrence({ unit: "day", interval: 1, until: "soon" })).toEqual({ unit: "day", interval: 1 });
    expect(nextOccurrenceWithin({ unit: "day", interval: 1, until: "2026-11-05" }, "2026-11-01", "2026-11-04")).toBe("2026-11-05");
    expect(nextOccurrenceWithin({ unit: "day", interval: 1, until: "2026-11-05" }, "2026-11-01", "2026-11-05")).toBeNull();
    expect(nextAfterFinishing({ unit: "week", interval: 1, until: "2026-11-10" }, "2026-11-04", "2026-11-04", "2026-11-04")).toBeNull();
    expect(describeRecurrence({ unit: "day", interval: 1, until: "2026-12-31" })).toBe("Every day until Dec 31, 2026");
  });
});

describe("missedOccurrences", () => {
  it("lists every scheduled day after the latest one up to today, oldest first", () => {
    expect(missedOccurrences({ unit: "day", interval: 1 }, "2026-11-01", "2026-11-01", "2026-11-06")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  it("is empty when nothing is owed, and stops at the end date and the cap", () => {
    expect(missedOccurrences({ unit: "day", interval: 1 }, "2026-11-01", "2026-11-06", "2026-11-06")).toEqual([]);
    expect(missedOccurrences({ unit: "day", interval: 1, until: "2026-11-03" }, "2026-11-01", "2026-11-01", "2026-11-06")).toEqual(["2026-11-02", "2026-11-03"]);
    expect(missedOccurrences({ unit: "day", interval: 1 }, "2026-01-01", "2026-01-01", "2026-12-31", 3)).toHaveLength(3);
  });
  it("keeps the series' rhythm from its first day", () => {
    expect(missedOccurrences({ unit: "week", interval: 2, weekdays: [1] }, "2026-11-02", "2026-11-02", "2026-12-01")).toEqual(["2026-11-16", "2026-11-30"]);
  });
});
