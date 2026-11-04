import { addDays } from "@/lib/time";

// Repeating tasks and goals (docs/PLAN.md, 2026-11-03 log). A rule says how often something comes round; the
// next occurrence is always the first scheduled day strictly after a given day, so finishing late never schedules
// something in the past and finishing early never skips a turn. Pure, so the spawn rules are unit-tested.

export const RECURRENCE_UNITS = ["day", "week", "month"] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

export const RECURRENCE_UNIT_LABELS: Record<RecurrenceUnit, { one: string; many: string }> = {
  day: { one: "day", many: "days" },
  week: { one: "week", many: "weeks" },
  month: { one: "month", many: "months" },
};

/** How often: every `interval` units; weekly rules may name the weekdays (0 = Sunday … 6 = Saturday). */
export type Recurrence = {
  unit: RecurrenceUnit;
  interval: number;
  /** Week only: which days of the week; empty or missing means the anchor's weekday. */
  weekdays?: number[];
  /** "HH:MM" in the workspace's day; informational (overdue is still judged by the day). */
  time?: string;
  /** The last day an occurrence may fall on ("YYYY-MM-DD"); nothing is made after it (2026-11-04 log). */
  until?: string;
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MAX_INTERVAL = 52;

/** The weekday of a calendar day ("YYYY-MM-DD"), 0 = Sunday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Anything a form or the database hands over, checked into a sane rule or null. */
export function normalizeRecurrence(value: unknown): Recurrence | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const unit = (RECURRENCE_UNITS as readonly string[]).includes(String(raw.unit)) ? (raw.unit as RecurrenceUnit) : null;
  if (unit === null) return null;
  const interval = Number(raw.interval);
  const rule: Recurrence = { unit, interval: Number.isInteger(interval) && interval >= 1 ? Math.min(interval, MAX_INTERVAL) : 1 };
  if (unit === "week" && Array.isArray(raw.weekdays)) {
    const days = [...new Set(raw.weekdays.map((each) => Number(each)).filter((each) => Number.isInteger(each) && each >= 0 && each <= 6))].sort((a, b) => a - b);
    if (days.length > 0) rule.weekdays = days;
  }
  if (typeof raw.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) rule.time = raw.time;
  if (typeof raw.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.until) && !Number.isNaN(Date.parse(`${raw.until}T00:00:00Z`))) rule.until = raw.until;
  return rule;
}

/** Whether a day is still inside the rule's run (no end date means always). */
export function withinRule(rule: Recurrence, day: string): boolean {
  return rule.until === undefined || day <= rule.until;
}

/** The next scheduled day after `after`, or null when the rule has ended by then. */
export function nextOccurrenceWithin(rule: Recurrence, anchor: string, after: string): string | null {
  const next = nextOccurrence(rule, anchor, after);
  return withinRule(rule, next) ? next : null;
}

/**
 * Every scheduled day after `latest` that is already due (today or earlier) and inside the rule's run, oldest first,
 * at most `cap` of them: the occurrences a missed series owes (2026-11-04 log). Empty when nothing was missed.
 */
export function missedOccurrences(rule: Recurrence, anchor: string, latest: string, today: string, cap = 60): string[] {
  const out: string[] = [];
  let day = latest;
  while (out.length < cap) {
    const next = nextOccurrence(rule, anchor, day);
    if (next > today || !withinRule(rule, next)) break;
    out.push(next);
    day = next;
  }
  return out;
}

/** "Dec 31, 2026" for an end date. */
export function formatUntil(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The same calendar day `months` later; a 31st in a short month lands on that month's last day. */
function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The first scheduled day strictly after `after`, on a schedule anchored at `anchor` (the first due date of the
 * series). Daily: every `interval` days from the anchor. Weekly: the named weekdays (or the anchor's), in weeks that
 * are a multiple of `interval` weeks from the anchor's week. Monthly: the anchor's day of the month, every
 * `interval` months.
 */
export function nextOccurrence(rule: Recurrence, anchor: string, after: string): string {
  const interval = Math.max(1, rule.interval);
  if (rule.unit === "day") {
    let day = anchor;
    if (after >= anchor) {
      const elapsed = Math.floor((Date.parse(`${after}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000);
      day = addDays(anchor, Math.floor(elapsed / interval) * interval);
    }
    while (day <= after) day = addDays(day, interval);
    return day;
  }
  if (rule.unit === "week") {
    const weekdays = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(anchor)];
    // The anchor's week starts on its Sunday; candidate weeks are every `interval` weeks from there.
    const anchorWeekStart = addDays(anchor, -weekdayOf(anchor));
    let weekStart = anchorWeekStart;
    if (after > anchor) {
      const weeksElapsed = Math.floor((Date.parse(`${after}T00:00:00Z`) - Date.parse(`${anchorWeekStart}T00:00:00Z`)) / (7 * 86_400_000));
      weekStart = addDays(anchorWeekStart, Math.floor(weeksElapsed / interval) * interval * 7);
    }
    for (let guard = 0; guard < 400; guard++) {
      for (const weekday of weekdays) {
        const candidate = addDays(weekStart, weekday);
        if (candidate > after && candidate >= anchor) return candidate;
      }
      weekStart = addDays(weekStart, interval * 7);
    }
    return addDays(after, 1);
  }
  let day = anchor;
  for (let guard = 0; guard < 1200 && day <= after; guard++) day = addMonths(anchor, (guard + 1) * interval);
  return day;
}

/** "Every day at 8:00 AM", "Every week on Mon", "Every 2 weeks on Mon, Wed", "Every 3 months". */
export function describeRecurrence(rule: Recurrence, anchor?: string | null): string {
  const unit = RECURRENCE_UNIT_LABELS[rule.unit];
  let text = rule.interval === 1 ? `Every ${unit.one}` : `Every ${rule.interval} ${unit.many}`;
  if (rule.unit === "week") {
    const days = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : anchor ? [weekdayOf(anchor)] : [];
    if (days.length > 0) text += ` on ${days.map((day) => WEEKDAY_SHORT[day]).join(", ")}`;
  }
  if (rule.time) text += ` at ${formatTime(rule.time)}`;
  if (rule.until) text += ` until ${formatUntil(rule.until)}`;
  return text;
}

/** "08:00" → "8:00 AM". */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** Whether two rules say the same thing (so an edit that changes nothing leaves no history line). */
export function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Where the next occurrence of a finished repeating item goes: the first scheduled day after today or after its own
 * due day, whichever is later, or null once the rule has ended. Finishing early keeps the next turn; finishing late
 * never schedules into the past.
 */
export function nextAfterFinishing(rule: Recurrence, anchor: string | null, due: string | null, today: string): string | null {
  const base = anchor ?? due ?? today;
  const after = due !== null && due > today ? due : today;
  return nextOccurrenceWithin(rule, base, after);
}
