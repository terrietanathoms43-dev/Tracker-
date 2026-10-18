import { describe, expect, it } from "vitest";
import { parseReportRange, parseReportTable, reportHref } from "./params";

const today = "2026-10-17";

describe("parseReportRange", () => {
  it("defaults to the last 30 days", () => {
    expect(parseReportRange({}, today)).toEqual({ from: "2026-09-18", to: today });
  });

  it("reads both ends", () => {
    expect(parseReportRange({ from: "2026-09-01", to: "2026-09-30" }, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("puts a reversed range the right way round", () => {
    expect(parseReportRange({ from: "2026-09-30", to: "2026-09-01" }, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("ignores days that do not exist or are not days", () => {
    expect(parseReportRange({ from: "2026-02-30", to: "2026-13-01" }, today)).toEqual({ from: "2026-09-18", to: today });
    expect(parseReportRange({ from: "yesterday", to: "2026-10-01'; drop table tasks" }, today)).toEqual({ from: "2026-09-18", to: today });
  });

  it("fills a missing end from the other one", () => {
    expect(parseReportRange({ to: "2026-06-30" }, today)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(parseReportRange({ from: "2026-10-01" }, today)).toEqual({ from: "2026-10-01", to: today });
  });
});

describe("parseReportTable", () => {
  it("accepts the three tables only", () => {
    expect(parseReportTable({ table: "delivered" })).toBe("delivered");
    expect(parseReportTable({ table: "contributions" })).toBe("contributions");
    expect(parseReportTable({ table: "everything" })).toBeNull();
    expect(parseReportTable({})).toBeNull();
  });
});

describe("reportHref", () => {
  it("writes both ends and the table", () => {
    expect(reportHref("/reports", { from: "2026-09-01", to: "2026-09-30" })).toBe("/reports?from=2026-09-01&to=2026-09-30");
    expect(reportHref("/reports/export", { from: "2026-09-01", to: "2026-09-30" }, "open")).toBe("/reports/export?from=2026-09-01&to=2026-09-30&table=open");
  });
});
