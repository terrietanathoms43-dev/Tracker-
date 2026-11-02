import { describe, expect, it } from "vitest";
import { expectedShare, isBehindPace, paceOf } from "./pace";

const today = "2026-11-01";

describe("expectedShare", () => {
  it("is the elapsed share of the line from start to target, clamped to 0..1", () => {
    expect(expectedShare("2026-10-02", "2026-12-01", today)).toBeCloseTo(0.5, 2);
    expect(expectedShare("2026-11-10", "2026-12-01", today)).toBe(0);
    expect(expectedShare("2026-09-01", "2026-10-01", today)).toBe(1);
  });

  it("has no line without a target, a start, or a target that is not after the start", () => {
    expect(expectedShare(null, "2026-12-01", today)).toBeNull();
    expect(expectedShare("2026-10-01", null, today)).toBeNull();
    expect(expectedShare("2026-10-01", "2026-10-01", today)).toBeNull();
  });
});

describe("paceOf", () => {
  it("is on pace within five points of the line, ahead or behind outside it", () => {
    const line = { start: "2026-10-02", target: "2026-12-01", today };
    expect(paceOf({ ...line, done: 5, total: 10 }).verdict).toBe("on_pace");
    expect(paceOf({ ...line, done: 2, total: 10 })).toMatchObject({ verdict: "behind", gapPoints: 30 });
    expect(paceOf({ ...line, done: 8, total: 10 })).toMatchObject({ verdict: "ahead", gapPoints: -30 });
  });

  it("says so when there is nothing to do, or no target to pace against", () => {
    expect(paceOf({ done: 0, total: 0, start: "2026-10-02", target: "2026-12-01", today }).verdict).toBe("nothing");
    expect(paceOf({ done: 3, total: 10, start: "2026-10-02", target: null, today })).toMatchObject({ verdict: "no_target", share: 0.3, expected: null });
  });

  it("forgives a brand-new project that has not started yet", () => {
    expect(isBehindPace({ done: 0, total: 6, start: "2026-10-31", target: "2026-11-30", today })).toBe(false);
  });

  it("never reports more than everything done", () => {
    expect(paceOf({ done: 12, total: 10, start: "2026-10-02", target: "2026-12-01", today }).share).toBe(1);
  });
});
