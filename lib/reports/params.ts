import { z } from "zod";
import type { OrgRole } from "@/lib/constants";
import { lastDays, type ReportRange } from "./range";

// The report's state lives in the URL (`/reports?from&to&cut&project`, `/reports/export?from&to&table&project`).
// These functions are the only translation between the address and what lib/reports/data.ts is asked for.

export const DEFAULT_RANGE_DAYS = 30;

export const REPORT_TABLES = ["delivered", "open", "contributions", "scope"] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

/** The four views of the report: what admins, leaders and members each open on first, and the active reporting scope. */
export const REPORT_CUTS = ["exec", "leader", "member", "scope"] as const;
export type ReportCut = (typeof REPORT_CUTS)[number];

export const REPORT_CUT_LABELS: Record<ReportCut, string> = {
  exec: "Executive health",
  leader: "Workload",
  member: "My work",
  scope: "Active scope",
};

/**
 * The views a role may open, in tab order (docs/PLAN.md, 2026-11-04 and 2026-11-06 logs): admins and leaders switch
 * between all four; a member gets their own work and the active scope; a stakeholder the Executive view and the
 * active scope. The scope is the report meeting's shared baseline, so everyone who sees Reports has it.
 */
export function reportCutsFor(role: OrgRole): ReportCut[] {
  switch (role) {
    case "admin":
    case "leader":
      return ["exec", "leader", "member", "scope"];
    case "member":
      return ["member", "scope"];
    case "stakeholder":
      return ["exec", "scope"];
  }
}

/** The view a role lands on: admins and stakeholders the Executive view, leaders Workload, members My work. */
export function defaultReportCut(role: OrgRole): ReportCut {
  switch (role) {
    case "admin":
    case "stakeholder":
      return "exec";
    case "leader":
      return "leader";
    case "member":
      return "member";
  }
}

/**
 * Which project the report is about: "" is the whole workspace, "none" is work in no project, anything else a
 * project id (the same convention as the task filters, lib/tasks/filters.ts).
 */
export type ReportProject = string;

type Raw = Record<string, string | string[] | undefined>;

const one = (raw: Raw, key: string): string => {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

/** A real calendar day: zod's ISO date checks the format and the day of the month (no Feb 30). */
const calendarDay = z.iso.date();

/**
 * The range in the address. Missing or invalid ends fall back to the last 30 days ending today (or ending at
 * `to` when only `to` is given); a reversed range is put the right way round.
 */
export function parseReportRange(raw: Raw, today: string): ReportRange {
  const from = calendarDay.safeParse(one(raw, "from"));
  const to = calendarDay.safeParse(one(raw, "to"));
  const end = to.success ? to.data : today;
  const start = from.success ? from.data : lastDays(DEFAULT_RANGE_DAYS, end).from;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/** The project in the address: an id, "none", or "" for everything. Anything else is ignored, never queried. */
export function parseReportProject(raw: Raw): ReportProject {
  const value = one(raw, "project");
  return /^[\w-]{1,64}$/.test(value) ? value : "";
}

const tableSchema = z.enum(REPORT_TABLES);

/** Which CSV the export route was asked for, or null when it isn't one of the four. */
export function parseReportTable(raw: Raw): ReportTable | null {
  const parsed = tableSchema.safeParse(one(raw, "table"));
  return parsed.success ? parsed.data : null;
}

const cutSchema = z.enum(REPORT_CUTS);

/** The view in the address when it is one the viewer may open (`allowed`), else `fallback` (the role's own). */
export function parseReportCut(raw: Raw, fallback: ReportCut, allowed: readonly ReportCut[] = REPORT_CUTS): ReportCut {
  const parsed = cutSchema.safeParse(one(raw, "cut"));
  return parsed.success && allowed.includes(parsed.data) ? parsed.data : fallback;
}

/**
 * The address of the report page or one of its CSV exports. Both ends are always written, so a link is stable;
 * the page keeps its view (`cut`) and its project across range changes.
 */
export function reportHref(
  base: "/reports" | "/reports/export",
  range: ReportRange,
  extra: { table?: ReportTable; cut?: ReportCut; project?: ReportProject } = {},
): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (extra.table) params.set("table", extra.table);
  if (extra.cut) params.set("cut", extra.cut);
  if (extra.project) params.set("project", extra.project);
  return `${base}?${params.toString()}`;
}
