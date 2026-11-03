import { CalendarX2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { GoalRef } from "@/lib/dal/goals";
import { calendarDaysBetween, formatDay } from "@/lib/time";

// A goal past its target date that nobody has marked completed shouts (docs/PLAN.md, 2026-11-03 log): a red strip
// on its own page, and a red banner on Home that lists the goals and leads to them.

/** Home's banner: how many goals are past their target, naming the first few. */
export function GoalsPastTargetBanner({ goals, today, canComplete }: { goals: GoalRef[]; today: string; canComplete: boolean }) {
  if (goals.length === 0) return null;
  const named = goals.slice(0, 3);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-status-blocked-dot/40 bg-status-blocked-bg px-4 py-3 text-status-blocked-fg" role="alert" data-goals-past-target={goals.length}>
      <CalendarX2 className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          {goals.length === 1 ? "1 goal is past its target date and not marked completed." : `${goals.length} goals are past their target date and not marked completed.`}
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {named.map((goal) => (
            <li key={goal.id}>
              <Link href={`/goals/${goal.id}`} className="underline-offset-4 hover:underline">
                {goal.title}
              </Link>
              {goal.targetDate ? <span className="opacity-80"> · {formatDay(goal.targetDate, today)}</span> : null}
            </li>
          ))}
          {goals.length > named.length ? (
            <li>
              <Link href="/goals" className="underline-offset-4 hover:underline">
                and {goals.length - named.length} more
              </Link>
            </li>
          ) : null}
        </ul>
        <p className="mt-1 text-[13px] opacity-80">{canComplete ? "Mark each one completed, or move its target date." : "A leader, admin or stakeholder marks a goal completed; a leader can move its date."}</p>
      </div>
    </div>
  );
}

/** The goal page's strip: how late it is, and the buttons to settle it (`actions`: Mark completed, Edit). */
export function GoalPastTargetStrip({ targetDate, today, actions }: { targetDate: string; today: string; actions: ReactNode }) {
  const days = calendarDaysBetween(targetDate, today);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-status-blocked-dot/40 bg-status-blocked-bg px-4 py-3 text-status-blocked-fg" role="alert" data-goal-past-target>
      <CalendarX2 className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-base font-semibold">
          Target passed {days === 1 ? "yesterday" : `${days} days ago`} ({formatDay(targetDate, today)}) and this goal is not marked completed.
        </p>
        <p className="text-[13px] opacity-80">Mark it completed if the work is done, or move the target date if it isn&apos;t.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
