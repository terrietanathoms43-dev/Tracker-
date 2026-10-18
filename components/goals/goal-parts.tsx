import { cn } from "cn";
import { CheckCircle2, CirclePause } from "lucide-react";
import Link from "next/link";
import { TeamChip } from "@/components/tasks/assignee-stack";
import { UserAvatar } from "@/components/user-avatar";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/constants";
import type { GoalListItem } from "@/lib/dal/goals";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";
import { formatDay } from "@/lib/time";
import { ProgressBar } from "./progress-bar";

// Small server-rendered pieces of the goal screens: the status badge, the owner and target labels (projects reuse
// both), and the card the goals list is made of.

const BADGE = "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap";

/** Achieved or Paused; an active goal needs no badge, so it renders nothing. */
export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  if (status === "active") return null;
  const achieved = status === "achieved";
  const Icon = achieved ? CheckCircle2 : CirclePause;
  return (
    <span className={cn(BADGE, achieved ? "bg-status-completed-bg text-status-completed-fg" : "bg-status-not-started-bg text-status-not-started-fg", className)}>
      <Icon className="size-3.5" aria-hidden />
      {GOAL_STATUS_LABELS[status]}
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

/** One goal in the list: title (the whole card is the link), owner, target, status and progress. */
export function GoalCard({ goal, today }: { goal: GoalListItem; today: string }) {
  return (
    <li className="relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/goals/${goal.id}`}
          className="min-w-0 text-sm leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {goal.title}
        </Link>
        <GoalStatusBadge status={goal.status} className="shrink-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <OwnerLabel owner={goal.owner} />
        {goal.targetDate ? (
          <>
            <span aria-hidden>·</span>
            <TargetLabel day={goal.targetDate} today={today} active={goal.status === "active"} />
          </>
        ) : null}
        {goal.teams.map((team) => (
          <TeamChip key={team.id} name={team.name} className="relative" />
        ))}
      </div>
      <ProgressBar {...goal.progress} className="mt-auto pt-4" />
    </li>
  );
}
