import { describe, expect, it } from "vitest";
import { rateLimitHit } from "./rate-limit";

describe("rateLimitHit", () => {
  it("lets the first `max` hits through and refuses the next", () => {
    const now = 1_000_000;
    expect(rateLimitHit("a", 2, 60_000, now)).toBe(false);
    expect(rateLimitHit("a", 2, 60_000, now)).toBe(false);
    expect(rateLimitHit("a", 2, 60_000, now)).toBe(true);
  });

  it("opens again once the window slides past", () => {
    const now = 1_000_000;
    rateLimitHit("b", 2, 60_000, now);
    rateLimitHit("b", 2, 60_000, now);
    expect(rateLimitHit("b", 2, 60_000, now)).toBe(true);
    expect(rateLimitHit("b", 2, 60_000, now + 61_000)).toBe(false);
  });

  it("keeps keys independent", () => {
    const now = 1_000_000;
    rateLimitHit("c", 1, 60_000, now);
    expect(rateLimitHit("c", 1, 60_000, now)).toBe(true);
    expect(rateLimitHit("d", 1, 60_000, now)).toBe(false);
  });
});
