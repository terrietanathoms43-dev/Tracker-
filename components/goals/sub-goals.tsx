import type { ReactNode } from "react";
import type { GoalListItem } from "@/lib/dal/goals";
import { GoalCard } from "./goal-parts";

// The Sub-goals section of a top-level goal's page: the steps the goal is split into, each with its own progress.
// Every sub-goal's tasks roll up into the parent's progress bar above.

/** The goal's sub-goals as cards, with `action` (New sub-goal) beside the heading. */
export function SubGoals({ goals, today, action, empty }: { goals: GoalListItem[]; today: string; action?: ReactNode; empty: ReactNode }) {
  return (
    <section aria-labelledby="sub-goals-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="sub-goals-heading" className="flex items-baseline gap-2 text-base font-semibold">
          Sub-goals
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{goals.length}</span>
        </h2>
        {action}
      </div>
      {goals.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-5 text-base text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} today={today} />
          ))}
        </ul>
      )}
    </section>
  );
}
