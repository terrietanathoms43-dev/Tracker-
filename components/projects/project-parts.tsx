import { cn } from "cn";
import { Archive, CheckCircle2, Target } from "lucide-react";
import Link from "next/link";
import { OwnerLabel, TargetLabel } from "@/components/goals/goal-parts";
import { ProgressBar } from "@/components/goals/progress-bar";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/constants";
import type { ProjectListItem } from "@/lib/dal/projects";

// Small server-rendered pieces of the project screens: the status badge, the goal link and the project card.

const BADGE = "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap";

/** Completed or Archived; an active project needs no badge, so it renders nothing. */
export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  if (status === "active") return null;
  const completed = status === "completed";
  const Icon = completed ? CheckCircle2 : Archive;
  return (
    <span className={cn(BADGE, completed ? "bg-status-completed-bg text-status-completed-fg" : "bg-status-rejected-bg text-status-rejected-fg", className)}>
      <Icon className="size-3.5" aria-hidden />
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

/** The goal a project rolls up into, as a link. `relative` lifts it above a card's stretched link so it stays clickable. */
export function GoalLink({ goal, className }: { goal: { id: string; title: string }; className?: string }) {
  return (
    <Link
      href={`/goals/${goal.id}`}
      className={cn("relative inline-flex min-w-0 items-center gap-1 rounded-sm hover:text-foreground hover:underline", className)}
    >
      <Target className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Goal: </span>
      <span className="truncate">{goal.title}</span>
    </Link>
  );
}

/**
 * One project as a card: name (the whole card is the link), owner, goal, target, status and progress. A goal's own
 * page passes `showGoal={false}`, since every card there serves that goal.
 */
export function ProjectCard({ project, today, showGoal = true }: { project: ProjectListItem; today: string; showGoal?: boolean }) {
  return (
    <li className="relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/projects/${project.id}`}
          className="min-w-0 text-base leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {project.name}
        </Link>
        <ProjectStatusBadge status={project.status} className="shrink-0" />
      </div>
      {showGoal && project.goal ? (
        <div className="mt-1 flex min-w-0 text-[13px] text-muted-foreground">
          <GoalLink goal={project.goal} className="max-w-full" />
        </div>
      ) : null}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <OwnerLabel owner={project.owner} />
        {project.targetDate ? (
          <>
            <span aria-hidden>·</span>
            <TargetLabel day={project.targetDate} today={today} active={project.status === "active"} />
          </>
        ) : null}
      </div>
      <ProgressBar {...project.progress} className="mt-auto pt-4" />
    </li>
  );
}
