import { cn } from "cn";
import { Archive, CheckCircle2, ShieldCheck, Target } from "lucide-react";
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

/** "3 goals": how many active goals sit under the project. */
export function GoalCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", className)}>
      <Target className="size-3.5 shrink-0" aria-hidden />
      {count} {count === 1 ? "goal" : "goals"}
    </span>
  );
}

/** A small badge on projects whose new tasks wait for sign-off. */
export function ApprovalBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-status-awaiting-bg px-1.5 py-0.5 text-[12px] font-medium text-status-awaiting-fg", className)}>
      <ShieldCheck className="size-3" aria-hidden />
      Sign-off
    </span>
  );
}

/** One project as a card: name (the whole card is the link), owner, goals, target, status and progress. */
export function ProjectCard({ project, today }: { project: ProjectListItem; today: string }) {
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
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <OwnerLabel owner={project.owner} />
        <span aria-hidden>·</span>
        <GoalCount count={project.goals} />
        {project.requiresApproval ? <ApprovalBadge /> : null}
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
