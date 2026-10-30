import { formatDay } from "@/lib/time";

// The one rule sub-goals add (docs/PLAN.md, 2026-10-30 log): a sub-goal's target date can never be later than its
// parent's. Pure, so both directions (saving a sub-goal, moving a parent's date) are unit-tested without a database.
// Calendar days are "YYYY-MM-DD" strings and compare as strings.

/** Why a sub-goal can't have `subTarget` under a parent due on `parentTarget`, or null when it can. */
export function subGoalDeadlineProblem(parentTarget: string | null, subTarget: string | null, today: string): string | null {
  if (parentTarget === null || subTarget === null || subTarget <= parentTarget) return null;
  return `A sub-goal can't be due after its parent goal. Pick ${formatDay(parentTarget, today)} or earlier.`;
}

/** Why a parent goal can't move its target date to `parentTarget` given its sub-goals' dates, or null when it can. */
export function parentDeadlineProblem(parentTarget: string | null, subGoals: { title: string; targetDate: string | null }[], today: string): string | null {
  if (parentTarget === null) return null;
  const later = subGoals.filter((goal) => goal.targetDate !== null && goal.targetDate > parentTarget).sort((a, b) => b.targetDate!.localeCompare(a.targetDate!));
  if (later.length === 0) return null;
  const [latest] = later;
  return `The sub-goal “${latest.title}” is due ${formatDay(latest.targetDate!, today)}, after this date. Move it earlier first.`;
}
