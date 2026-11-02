import { calendarDaysBetween } from "@/lib/time";

// "Is the project as a whole on pace?" (docs/PLAN.md, 2026-11-01 log). A target date and a start day draw a
// straight line from nothing done to everything done; where today falls on that line is the share that should be
// done by now. The share actually done is compared with it. Pure, so the thermometer and the health verdicts
// are unit-tested against fixed days.

export type PaceVerdict = "ahead" | "on_pace" | "behind" | "no_target" | "nothing";

export type PaceInput = {
  done: number;
  total: number;
  /** The first day of the work: the project's creation, or the oldest task's. */
  start: string | null;
  target: string | null;
  today: string;
};

export type Pace = {
  done: number;
  total: number;
  /** 0 to 1: the share of the work completed. */
  share: number;
  /** 0 to 1: the share the target date expects by today, or null without a target. */
  expected: number | null;
  verdict: PaceVerdict;
  /** Percentage points behind (positive) or ahead (negative) of the expected share. */
  gapPoints: number;
  start: string | null;
  target: string | null;
};

/** How far off the line a project may be and still count as on pace, as a share of the work. */
export const PACE_TOLERANCE = 0.05;

/** In-progress work nobody has touched for this many days is stalled. */
export const STALLED_AFTER_DAYS = 7;

/** The share that should be done by `today` on a straight line from `start` to `target`; null when there is no line. */
export function expectedShare(start: string | null, target: string | null, today: string): number | null {
  if (start === null || target === null || target <= start) return null;
  const span = calendarDaysBetween(start, target);
  const elapsed = calendarDaysBetween(start, today);
  return Math.min(1, Math.max(0, elapsed / span));
}

/** The pace of a body of work, judged with PACE_TOLERANCE. Nothing to do yet reads as "nothing"; no target as "no_target". */
export function paceOf(input: PaceInput): Pace {
  const share = input.total > 0 ? Math.min(1, input.done / input.total) : 0;
  const expected = expectedShare(input.start, input.target, input.today);
  const base = { done: input.done, total: input.total, share, expected, start: input.start, target: input.target };
  if (input.total === 0) return { ...base, verdict: "nothing", gapPoints: 0 };
  if (expected === null) return { ...base, verdict: "no_target", gapPoints: 0 };
  const gap = expected - share;
  const gapPoints = Math.round(gap * 100);
  const verdict: PaceVerdict = gap > PACE_TOLERANCE ? "behind" : gap < -PACE_TOLERANCE ? "ahead" : "on_pace";
  return { ...base, verdict, gapPoints };
}

/** Whether the work is behind the line its target date needs: what the health verdicts look at. */
export function isBehindPace(input: PaceInput): boolean {
  return paceOf(input).verdict === "behind";
}
