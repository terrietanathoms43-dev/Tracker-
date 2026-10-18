import { calendarDaysBetween } from "@/lib/time";

// Report ranges are calendar days ("YYYY-MM-DD", both ends included) in the viewer's timezone. Pure, so the
// presets can be tested against any "today".

export type ReportRange = { from: string; to: string };

export const RANGE_PRESETS = ["this-week", "last-7", "last-30", "this-month", "last-month"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  "this-week": "This week",
  "last-7": "Last 7 days",
  "last-30": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
};

const pad = (n: number) => String(n).padStart(2, "0");

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

/** The range a preset means on `today`. Weeks start on Monday. */
export function presetRange(preset: RangePreset, today: string): ReportRange {
  const [year, month] = today.split("-").map(Number);
  switch (preset) {
    case "this-week": {
      const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: shiftDay(today, -sinceMonday), to: today };
    }
    case "last-7":
      return lastDays(7, today);
    case "last-30":
      return lastDays(30, today);
    case "this-month":
      return { from: `${year}-${pad(month)}-01`, to: today };
    case "last-month": {
      const firstOfThisMonth = `${year}-${pad(month)}-01`;
      const lastOfPrevious = shiftDay(firstOfThisMonth, -1);
      return { from: `${lastOfPrevious.slice(0, 7)}-01`, to: lastOfPrevious };
    }
  }
}

/** Which preset a range is on `today`, if any (the controls highlight it). The first match wins. */
export function matchingPreset(range: ReportRange, today: string): RangePreset | null {
  return RANGE_PRESETS.find((preset) => {
    const candidate = presetRange(preset, today);
    return candidate.from === range.from && candidate.to === range.to;
  }) ?? null;
}

/** How many calendar days a range covers, both ends included. */
export function rangeLength(range: ReportRange): number {
  return calendarDaysBetween(range.from, range.to) + 1;
}
