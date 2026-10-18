import { describe, expect, it } from "vitest";
import { parsePeriod, periodStart, teamHref } from "./period";

describe("parsePeriod", () => {
  it("accepts the three periods", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("30")).toBe(30);
    expect(parsePeriod("90")).toBe(90);
  });

  it("falls back to 30 days for anything else", () => {
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod("14")).toBe(30);
    expect(parsePeriod("abc")).toBe(30);
    expect(parsePeriod(["90", "7"])).toBe(90);
  });
});

describe("teamHref", () => {
  it("keeps the default out of the address", () => {
    expect(teamHref(30)).toBe("/team");
    expect(teamHref(7)).toBe("/team?days=7");
  });
});

describe("periodStart", () => {
  it("goes back whole days", () => {
    expect(periodStart(new Date("2026-10-17T12:00:00Z"), 7).toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
});
