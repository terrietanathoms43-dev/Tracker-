import { z } from "zod";
import { lastDays, type ReportRange } from "./range";

// The report's state lives in the URL (`/reports?from&to&cut`, `/reports/export?from&to&table`). These functions
// are the only translation between the address and what lib/reports/data.ts is asked for.

export const DEFAULT_RANGE_DAYS = 30;

export const REPORT_TABLES = ["delivered", "open", "contributions"] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

/** The three views of the report: what admins, leaders and members each open on first. */
export const REPORT_CUTS = ["exec", "leader", "member"] as const;
export type ReportCut = (typeof REPORT_CUTS)[number];

export const REPORT_CUT_LABELS: Record<ReportCut, string> = {
  exec: "Executive health",
  leader: "Workload",
  member: "My work",
};

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

const tableSchema = z.enum(REPORT_TABLES);

/** Which CSV the export route was asked for, or null when it isn't one of the three. */
export function parseReportTable(raw: Raw): ReportTable | null {
  const parsed = tableSchema.safeParse(one(raw, "table"));
  return parsed.success ? parsed.data : null;
}

const cutSchema = z.enum(REPORT_CUTS);

/** The view in the address, or `fallback` (the role's own) when it isn't one of the three. */
export function parseReportCut(raw: Raw, fallback: ReportCut): ReportCut {
  const parsed = cutSchema.safeParse(one(raw, "cut"));
  return parsed.success ? parsed.data : fallback;
}

/**
 * The address of the report page or one of its CSV exports. Both ends are always written, so a link is stable;
 * the page keeps its view (`cut`) across range changes.
 */
export function reportHref(base: "/reports" | "/reports/export", range: ReportRange, extra: { table?: ReportTable; cut?: ReportCut } = {}): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (extra.table) params.set("table", extra.table);
  if (extra.cut) params.set("cut", extra.cut);
  return `${base}?${params.toString()}`;
}
