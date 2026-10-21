import { DEFAULT_TIMEZONE } from "@/lib/constants";

// Instants are stored in UTC and shown in the viewer's timezone (user override, else the org's).
// Due dates are plain calendar days ("YYYY-MM-DD") and are never shifted by a timezone.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** Every IANA zone the runtime knows, for the timezone picker. */
export function timeZoneOptions(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

/** "just now", "5 minutes ago", "yesterday", "in 3 days", "Mar 4". */
export function formatRelative(date: Date, now: Date, timeZone: string): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return "just now";
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), "hour");
  const days = calendarDaysBetween(dayKey(now, timeZone), dayKey(date, timeZone));
  if (Math.abs(days) < 7) return relative.format(days, "day");
  return formatShortDate(date, timeZone, dayKey(date, timeZone).slice(0, 4) !== dayKey(now, timeZone).slice(0, 4));
}

/** "Oct 15, 2026, 3:04 PM" in the given zone: the tooltip behind every relative time. */
export function formatAbsolute(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatShortDate(date: Date, timeZone: string, withYear = false): string {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in a timezone. */
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from one calendar day to another (positive when `to` is later). */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** A due date relative to today: "Today", "Tomorrow", "2 days overdue", "Oct 20". */
export function formatDue(due: string, today: string): { text: string; overdue: boolean } {
  const days = calendarDaysBetween(today, due);
  if (days < 0) return { text: days === -1 ? "Yesterday" : `${-days} days overdue`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days < 7) return { text: relative.format(days, "day"), overdue: false };
  const [year, month, day] = due.split("-").map(Number);
  const sameYear = today.slice(0, 4) === due.slice(0, 4);
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return { text: formatter.format(new Date(Date.UTC(year, month - 1, day))), overdue: false };
}

/** A calendar day as "Oct 20" (with the year when it isn't this year's). */
export function formatDay(day: string, today: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in the viewer's timezone. */
export function greetingFor(timeZone: string, now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** The calendar day `days` after (or before) `day`: addDays("2026-10-31", 1) is "2026-11-01". */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
