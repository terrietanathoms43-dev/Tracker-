import { cn } from "cn";
import { CheckCircle2, CirclePause, GitBranch, Repeat, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/constants";
import type { GoalListItem } from "@/lib/dal/goals";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";
import { formatDay } from "@/lib/time";
import { ProgressBar } from "./progress-bar";

// Small server-rendered pieces of the goal screens: the status badge, the owner and target labels (projects reuse
// both), and the card the goals list and a goal's sub-goals are made of.

const BADGE = "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap";

/** Completed or Paused; an active goal needs no badge, so it renders nothing. */
export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  if (status === "active") return null;
  const completed = status === "completed";
  const Icon = completed ? CheckCircle2 : CirclePause;
  return (
    <span className={cn(BADGE, completed ? "bg-status-completed-bg text-status-completed-fg" : "bg-status-not-started-bg text-status-not-started-fg", className)}>
      <Icon className="size-3.5" aria-hidden />
      {GOAL_STATUS_LABELS[status]}
    </span>
  );
}

/** "2 sub-goals": how many steps a goal is split into. */
export function SubGoalCount({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", className)}>
      <GitBranch className="size-3.5" aria-hidden />
      {count} {count === 1 ? "sub-goal" : "sub-goals"}
    </span>
  );
}

/** "Every week on Mon" with the repeat glyph. */
export function RepeatLabel({ repeats, className }: { repeats: string | null; className?: string }) {
  if (!repeats) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Repeat className="size-3.5" aria-hidden />
      {repeats}
    </span>
  );
}

/** Avatar and name; a dashed circle and "No owner" when nobody owns it (apex-ux §8: never a blank). */
export function OwnerLabel({ owner, className }: { owner: Person | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {owner ? (
        <UserAvatar name={owner.name} email={owner.email} image={owner.image} size="sm" className="size-5" />
      ) : (
        <span className="size-5 shrink-0 rounded-full border border-dashed" aria-hidden />
      )}
      <span className="truncate">{owner ? nameOf(owner) : "No owner"}</span>
    </span>
  );
}

/** Active, with a target date that has passed: the goal shouts until someone marks it completed or moves the date. */
export const isPastTarget = (goal: { status: GoalStatus; targetDate: string | null }, today: string) => goal.status === "active" && goal.targetDate !== null && goal.targetDate < today;

/**
 * "Target Nov 30". While the goal or project is still `active` and the day has passed it says so in words and in
 * the overdue colour ("Target passed Oct 1"); finished work keeps its date quietly.
 */
export function TargetLabel({ day, today, active, className }: { day: string; today: string; active: boolean; className?: string }) {
  const late = active && day < today;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", late && "font-medium text-status-blocked-fg", className)}>
      {late ? "Target passed" : "Target"} {formatDay(day, today)}
    </span>
  );
}

/**
 * One goal in a grid of cards (a goal's sub-goals, Reports): title (the whole card is the link), project, owner,
 * target, repeat, sub-goal count, status and progress. A goal past its target wears the overdue colour.
 */
export function GoalCard({ goal, today, showProject = false }: { goal: GoalListItem; today: string; showProject?: boolean }) {
  const late = isPastTarget(goal, today);
  return (
    <li className={cn("relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40", late && "border-status-blocked-dot/50 bg-status-blocked-bg/30")} data-goal-card={goal.id} data-past-target={late || undefined}>
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/goals/${goal.id}`}
          className="min-w-0 text-base leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {goal.title}
        </Link>
        <GoalStatusBadge status={goal.status} className="shrink-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        {showProject ? (
          <>
            <span className="truncate text-foreground">{goal.project.name}</span>
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
        {goal.requiresApproval ? <ShieldCheck className="size-3.5 text-status-awaiting-fg" aria-label="New tasks need sign-off" role="img" /> : null}
      </div>
      {late ? <p className="mt-2 text-[13px] font-medium text-status-blocked-fg">Past its target and not marked completed.</p> : null}
      <ProgressBar {...goal.progress} className="mt-auto pt-4" />
    </li>
  );
}
