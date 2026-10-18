import { z } from "zod";
import { lastDays, type ReportRange } from "./range";

// The report's state lives in the URL (`/reports?from&to`, `/reports/export?from&to&table`). These functions are
// the only translation between the address and what lib/reports/data.ts is asked for.

export const DEFAULT_RANGE_DAYS = 30;

export const REPORT_TABLES = ["delivered", "open", "contributions"] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

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

/** The address of the report page or one of its CSV exports. Both ends are always written, so a link is stable. */
export function reportHref(base: "/reports" | "/reports/export", range: ReportRange, table?: ReportTable): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (table) params.set("table", table);
  return `${base}?${params.toString()}`;
}
