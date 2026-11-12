import { calendarDaysBetween } from "@/lib/time";

// Report ranges are calendar days ("YYYY-MM-DD", both ends included) in the viewer's timezone. Pure, so the
// presets can be tested against any "today".

export type ReportRange = { from: string; to: string };

/** Rolling spans ending today, plus the year so far (docs/PLAN.md, 2026-11-01 log); anything else is Custom. */
export const RANGE_PRESETS = ["week", "month", "quarter", "half-year", "ytd"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  week: "Week",
  month: "Month",
  quarter: "3 months",
  "half-year": "6 months",
  ytd: "Year to date",
};

/** The calendar day `days` after (or before, when negative) `day`. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The last `days` calendar days, ending today. */
export function lastDays(days: number, today: string): ReportRange {
  return { from: shiftDay(today, -(days - 1)), to: today };
}

/** The range a preset means on `today`: the last 7 / 30 / 90 / 180 days, or from 1 January. */
export function presetRange(preset: RangePreset, today: string): ReportRange {
  switch (preset) {
    case "week":
      return lastDays(7, today);
    case "month":
      return lastDays(30, today);
    case "quarter":
      return lastDays(90, today);
    case "half-year":
      return lastDays(180, today);
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/**
 * Which preset a range is on `today`, if any (the controls highlight it). The first match wins; `among` keeps it to
 * the presets a view offers, so a range another view's preset made reads as Custom there.
 */
export function matchingPreset(range: ReportRange, today: string, among: readonly RangePreset[] = RANGE_PRESETS): RangePreset | null {
  return among.find((preset) => {
    const candidate = presetRange(preset, today);
    return candidate.from === range.from && candidate.to === range.to;
  }) ?? null;
}

// --- the Active scope's daily cadences ---------------------------------------------------------------------------

/**
 * The Active scope read every day (docs/PLAN.md, 2026-11-12 log): "daily" is since yesterday; "weekdays" is since
 * the last working day, so on a Monday (and over the weekend) the scope reads from Friday. The address carries the
 * cadence, not dates, so a bookmark rolls forward with the days.
 */
export const SCOPE_CADENCES = ["daily", "weekdays"] as const;
export type ScopeCadence = (typeof SCOPE_CADENCES)[number];

export const CADENCE_LABELS: Record<ScopeCadence, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
};

/**
 * The spans the Active scope offers beside Daily. Half a year or a year of closed work is a dump, not a scope, so
 * those two are left to Custom's Since there; the other views keep all five.
 */
export const SCOPE_PRESETS = ["week", "month", "quarter"] as const satisfies readonly RangePreset[];

/** The last working day (Monday to Friday) before `day`: the Friday, for a Saturday, a Sunday and a Monday. */
export function previousWorkingDay(day: string): string {
  let previous = shiftDay(day, -1);
  while ([0, 6].includes(new Date(`${previous}T00:00:00Z`).getUTCDay())) previous = shiftDay(previous, -1);
  return previous;
}

/** The range a cadence means on `today`: from yesterday, or from the last working day, up to today. */
export function cadenceRange(cadence: ScopeCadence, today: string): ReportRange {
  return { from: cadence === "weekdays" ? previousWorkingDay(today) : shiftDay(today, -1), to: today };
}

/** How many calendar days a range covers, both ends included. */
export function rangeLength(range: ReportRange): number {
  return calendarDaysBetween(range.from, range.to) + 1;
}

// --- the chart's window ------------------------------------------------------------------------------------------

/** How far past today the daily chart looks, so upcoming due dates and goal deadlines are in view. */
export const TIMELINE_LOOKAHEAD_DAYS = 14;

/** The most days the chart draws; a longer window keeps its most recent days (today is never cut off). */
export const TIMELINE_MAX_DAYS = 120;

/**
 * The days the chart draws for a range: the range itself, then the next TIMELINE_LOOKAHEAD_DAYS after today (or
 * after the range's end when that is later), trimmed from the left to TIMELINE_MAX_DAYS. Both ends included.
 */
export function timelineWindow(range: ReportRange, today: string): ReportRange {
  const to = shiftDay(range.to > today ? range.to : today, TIMELINE_LOOKAHEAD_DAYS);
  const earliest = shiftDay(to, -(TIMELINE_MAX_DAYS - 1));
  return { from: range.from > earliest ? range.from : earliest, to };
}

/** Every calendar day of a range, in order. */
export function daysOf(range: ReportRange): string[] {
  const days: string[] = [];
  for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) days.push(day);
  return days;
}
