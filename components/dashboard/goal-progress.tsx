import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";
import type { GoalProgress } from "@/lib/dal/dashboard";
import { formatDay } from "@/lib/time";
import { PanelEmpty } from "./panel";

// Active goals as counts with a bar: completed / total tasks under each goal. The gold fill is one of the
// places PLAN §9 allows the highlight colour.

/** A strip has as many columns as goals, up to three, so two goals never leave an empty third. */
const STRIP_COLUMNS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

/** "Target Oct 30 · 1 blocked · 2 overdue" plus any extra fact the caller adds (Reports: completed in range). */
function metaLine(goal: GoalProgress, today: string, note?: string): string {
  return [
    goal.targetDate ? `Target ${formatDay(goal.targetDate, today)}` : null,
    goal.blocked > 0 ? `${goal.blocked} blocked` : null,
    goal.overdue > 0 ? `${goal.overdue} overdue` : null,
    goal.total === 0 ? "No tasks yet" : null,
    note ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One row per goal, linking to its page. `notes` adds a fact per goal id to the meta line; `strip` lays the goals
 * side by side from `sm` up (Home's top three) instead of stacking them.
 */
export function GoalProgressList({
  goals,
  today,
  notes = {},
  strip = false,
  empty = "No active goals yet.",
}: {
  goals: GoalProgress[];
  today: string;
  notes?: Record<string, string>;
  strip?: boolean;
  empty?: ReactNode;
}) {
  if (goals.length === 0) return <PanelEmpty>{empty}</PanelEmpty>;
  return (
    <ul className={strip ? cn("grid divide-y sm:divide-x sm:divide-y-0", STRIP_COLUMNS[Math.min(goals.length, 3)]) : "divide-y"}>
      {goals.map((goal) => {
        const meta = metaLine(goal, today, notes[goal.id]);
        const filled = goal.total === 0 ? 0 : (goal.completed / goal.total) * 100;
        return (
          <li key={goal.id}>
            <Link href={`/goals/${goal.id}`} className="block px-4 py-3 transition-colors hover:bg-accent/60">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{goal.title}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {goal.completed}/{goal.total}
                  <span className="sr-only"> tasks completed</span>
                </span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-highlight" style={{ width: `${filled}%` }} />
              </span>
              {meta ? <span className="mt-1.5 block truncate text-[13px] text-muted-foreground">{meta}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
