import { cn } from "cn";
import { ArrowRight, GitBranch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { TaskList } from "@/components/tasks/task-list";
import type { GoalListItem } from "@/lib/dal/goals";
import type { TaskListItem } from "@/lib/tasks/types";
import { GoalStatusBadge, isPastTarget, OwnerLabel, RepeatLabel, SubGoalCount, TargetLabel } from "./goal-parts";
import { ProgressBar } from "./progress-bar";

// The Goals page's list view (docs/PLAN.md, 2026-11-03 log): top down, soonest target first, each goal with its
// open tasks right under it and its sub-goals nested, so the page reads as the plan it is.

/** How many open tasks a goal shows before "N more". */
const TASKS_SHOWN = 5;

function GoalBlock({ goal, tasks, today, showProject, nested = false, readOnly }: { goal: GoalListItem; tasks: TaskListItem[]; today: string; showProject: boolean; nested?: boolean; readOnly: boolean }) {
  const late = isPastTarget(goal, today);
  const shown = tasks.slice(0, TASKS_SHOWN);
  const more = tasks.length - shown.length;
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", late && "border-status-blocked-dot/50", nested && "border-dashed")} data-goal-block={goal.id} data-past-target={late || undefined}>
      <div className={cn("px-4 py-3", late && "bg-status-blocked-bg/40")}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-2">
              {nested ? <GitBranch className="size-4 shrink-0 text-muted-foreground" aria-label="Sub-goal" role="img" /> : null}
              <Link href={`/goals/${goal.id}`} className="text-base leading-snug font-semibold underline-offset-4 hover:underline">
                {goal.title}
              </Link>
              <GoalStatusBadge status={goal.status} />
              {goal.requiresApproval ? <ShieldCheck className="size-3.5 text-status-awaiting-fg" aria-label="New tasks need sign-off" role="img" /> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              {showProject ? (
                <>
                  <Link href={`/projects/${goal.project.id}`} className="truncate text-foreground underline-offset-4 hover:underline">
                    {goal.project.name}
                  </Link>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <OwnerLabel owner={goal.owner} />
              {goal.targetDate ? (
                <>
                  <span aria-hidden>·</span>
                  <TargetLabel day={goal.targetDate} today={today} active={goal.status === "active"} />
                </>
              ) : null}
              {goal.repeats ? (
                <>
                  <span aria-hidden>·</span>
                  <RepeatLabel repeats={goal.repeats} />
                </>
              ) : null}
              {goal.subGoals > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <SubGoalCount count={goal.subGoals} />
                </>
              ) : null}
            </div>
            {late ? <p className="mt-1.5 text-[13px] font-medium text-status-blocked-fg">Past its target and not marked completed. Mark it completed or move the date.</p> : null}
          </div>
          <ProgressBar {...goal.progress} className="w-full sm:w-56" />
        </div>
      </div>
      {shown.length > 0 ? (
        <div className="border-t">
          <TaskList page={{ items: shown, nextCursor: null }} today={today} showReason={false} readOnly={readOnly} />
          {more > 0 ? (
            <Link href={`/goals/${goal.id}`} className="flex items-center justify-center gap-1.5 border-t px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {more} more open {more === 1 ? "task" : "tasks"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : goal.status === "active" ? (
        <p className="border-t px-4 py-2.5 text-[13px] text-muted-foreground">No open tasks under this goal.</p>
      ) : null}
    </div>
  );
}

/** Top-level goals in the order given, each with its open tasks, its sub-goals nested with theirs. */
export function GoalsList({ goals, tasks, today, showProject, readOnly }: { goals: GoalListItem[]; tasks: Map<string, TaskListItem[]>; today: string; showProject: boolean; readOnly: boolean }) {
  const top = goals.filter((goal) => goal.parent === null);
  const children = (parentId: string) => goals.filter((goal) => goal.parent?.id === parentId);
  // A sub-goal whose parent is outside the list (completed and hidden) still shows, on its own.
  const orphans = goals.filter((goal) => goal.parent !== null && !goals.some((each) => each.id === goal.parent!.id));
  return (
    <div className="grid gap-4">
      {[...top, ...orphans].map((goal) => (
        <div key={goal.id} className="grid gap-2">
          <GoalBlock goal={goal} tasks={tasks.get(goal.id) ?? []} today={today} showProject={showProject} readOnly={readOnly} />
          {children(goal.id).length > 0 ? (
            <div className="grid gap-2 pl-4 sm:pl-8">
              {children(goal.id).map((child) => (
                <GoalBlock key={child.id} goal={child} tasks={tasks.get(child.id) ?? []} today={today} showProject={false} nested readOnly={readOnly} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
