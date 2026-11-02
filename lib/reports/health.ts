// How the report judges a goal or a project (docs/PLAN.md, 2026-11-01 log). Pure, so the rules are unit-tested and
// the health board, the verdict strip and the CSV all agree. Four verdicts, worst first:
//
//   delayed          the target date has passed and the work is not all done
//   at_risk          something is blocked, or a fifth or more of the work is overdue
//   needs_attention  some work is overdue, or the work is behind the pace its target date needs (lib/reports/pace.ts)
//   on_track         none of the above
//
// Counts only: nothing here is weighted or estimated.

export type HealthStatus = "delayed" | "at_risk" | "needs_attention" | "on_track";

/** Worst first: the order the health board lists rows in. */
export const HEALTH_ORDER: readonly HealthStatus[] = ["delayed", "at_risk", "needs_attention", "on_track"];

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  delayed: "Delayed",
  at_risk: "At risk",
  needs_attention: "Needs attention",
  on_track: "On track",
};

/** The verdicts that mean someone should step in (the ones the verdict strip counts). */
export const PROBLEM_HEALTH: readonly HealthStatus[] = ["delayed", "at_risk"];

export type HealthInput = {
  total: number;
  completed: number;
  blocked: number;
  overdue: number;
  /** "YYYY-MM-DD" or null when none was set. */
  targetDate: string | null;
  today: string;
  /** Behind the straight line from start to target (lib/reports/pace.ts); left out when there is no line. */
  behindPace?: boolean;
};

/** Share of the work that is overdue at or above which the whole thing is at risk. */
export const OVERDUE_SHARE_AT_RISK = 0.2;

/** The verdict for one goal or project, from its counts and its target date. */
export function healthOf(input: HealthInput): HealthStatus {
  const allDone = input.total > 0 && input.completed >= input.total;
  if (input.targetDate !== null && input.targetDate < input.today && !allDone) return "delayed";
  if (input.blocked > 0 || (input.total > 0 && input.overdue / input.total >= OVERDUE_SHARE_AT_RISK)) return "at_risk";
  if (input.overdue > 0 || input.behindPace === true) return "needs_attention";
  return "on_track";
}

export const isProblem = (health: HealthStatus): boolean => PROBLEM_HEALTH.includes(health);

/** Rows worst first; within a verdict the nearest target date first (undated last), then by name. */
export function sortByHealth<T extends { health: HealthStatus; targetDate: string | null }>(rows: readonly T[], nameOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const byHealth = HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health);
    if (byHealth !== 0) return byHealth;
    const byDate = (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31");
    if (byDate !== 0) return byDate;
    return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });
  });
}
