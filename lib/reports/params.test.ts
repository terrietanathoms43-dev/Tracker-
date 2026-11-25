import { describe, expect, it } from "vitest";
import { defaultReportCut, parseReportCadence, parseReportCut, parseReportProject, parseReportRange, reportCutsFor, reportHref } from "./params";

describe("parseReportProject", () => {
  it("takes an id or none, and drops anything else", () => {
    expect(parseReportProject({ project: "a1b2-c3" })).toBe("a1b2-c3");
    expect(parseReportProject({ project: "none" })).toBe("none");
    expect(parseReportProject({})).toBe("");
    expect(parseReportProject({ project: "" })).toBe("");
    expect(parseReportProject({ project: "x'; drop table tasks; --" })).toBe("");
    expect(parseReportProject({ project: ["first", "second"] })).toBe("first");
  });
});

describe("reportHref", () => {
  const range = { from: "2026-10-03", to: "2026-11-01" };

  it("writes both ends and keeps the view and the project", () => {
    expect(reportHref("/reports", range, { cut: "exec", project: "p1" })).toBe("/reports?from=2026-10-03&to=2026-11-01&cut=exec&project=p1");
  });

  it("leaves an unscoped report's address short", () => {
    expect(reportHref("/reports", range, { cut: "leader", project: "" })).toBe("/reports?from=2026-10-03&to=2026-11-01&cut=leader");
    expect(reportHref("/reports/export", range, { table: "open", project: "none" })).toBe("/reports/export?from=2026-10-03&to=2026-11-01&table=open&project=none");
  });

  it("round-trips through the parsers", () => {
    const href = reportHref("/reports", range, { project: "p1" });
    const raw = Object.fromEntries(new URL(`http://x${href}`).searchParams);
    expect(parseReportRange(raw, "2026-11-01")).toEqual(range);
    expect(parseReportProject(raw)).toBe("p1");
  });
});

describe("the views by role", () => {
  it("gives every role the Active scope beside its own view, leaders and admins all four", () => {
    expect(reportCutsFor("admin")).toEqual(["exec", "leader", "member", "scope"]);
    expect(reportCutsFor("leader")).toEqual(["exec", "leader", "member", "scope"]);
    expect(reportCutsFor("member")).toEqual(["member", "scope"]);
    expect(reportCutsFor("stakeholder")).toEqual(["exec", "scope"]);
  });

  it("lands each role on its own view", () => {
    expect(defaultReportCut("admin")).toBe("exec");
    expect(defaultReportCut("leader")).toBe("leader");
    expect(defaultReportCut("member")).toBe("member");
    expect(defaultReportCut("stakeholder")).toBe("exec");
  });

  it("takes the view in the address only when the role may open it", () => {
    const member = reportCutsFor("member");
    expect(parseReportCut({ cut: "scope" }, "member", member)).toBe("scope");
    expect(parseReportCut({ cut: "leader" }, "member", member)).toBe("member");
    expect(parseReportCut({ cut: "exec" }, "member", member)).toBe("member");
    expect(parseReportCut({ cut: "scope" }, "exec", reportCutsFor("stakeholder"))).toBe("scope");
    expect(parseReportCut({ cut: "nonsense" }, "exec")).toBe("exec");
    expect(parseReportCut({}, "leader")).toBe("leader");
  });
});

describe("the Active scope's cadence in the address", () => {
  it("is read on the Active scope only, and only when it is one of the two", () => {
    expect(parseReportCadence({ cadence: "weekdays" }, "scope")).toBe("weekdays");
    expect(parseReportCadence({ cadence: "daily" }, "scope")).toBe("daily");
    expect(parseReportCadence({ cadence: "hourly" }, "scope")).toBeNull();
    expect(parseReportCadence({}, "scope")).toBeNull();
    expect(parseReportCadence({ cadence: "daily" }, "exec")).toBeNull();
  });

  it("is written in place of the dates, so the link is right tomorrow too", () => {
    expect(reportHref("/reports", null, { cut: "scope", cadence: "weekdays", project: "p1" })).toBe("/reports?cadence=weekdays&cut=scope&project=p1");
    expect(reportHref("/reports", { from: "2026-11-11", to: "2026-11-12" }, { cut: "scope", cadence: "daily" })).toBe("/reports?cadence=daily&cut=scope");
  });

  it("a link with neither dates nor a cadence opens the view on its default", () => {
    expect(reportHref("/reports", null, { cut: "exec" })).toBe("/reports?cut=exec");
    expect(reportHref("/reports", null)).toBe("/reports");
    expect(parseReportRange({}, "2026-11-12")).toEqual({ from: "2026-10-14", to: "2026-11-12" });
  });
});
