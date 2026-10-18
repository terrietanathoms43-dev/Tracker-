import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OwnerLabel, TargetLabel } from "@/components/goals/goal-parts";
import { PlanningHeader, PlanningSummary } from "@/components/goals/planning-header";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { GoalLink, ProjectStatusBadge } from "@/components/projects/project-parts";
import { ProjectStatusActions } from "@/components/projects/project-status-actions";
import { PlanningTasks } from "@/components/projects/task-groups";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { activeGoalOptions, ownerOptions } from "@/lib/dal/goals";
import { getProject } from "@/lib/dal/projects";
import { tasksForProject } from "@/lib/dal/tasks";
import { canCreateTask, canManagePlanning } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /projects/[id]: one project, its progress, and its tasks grouped by status.

export const metadata: Metadata = { title: "Project" };

/**
 * "Where is this project, and what's left in it?" Header and progress first, then its tasks by status with the
 * finished ones folded away. New task starts in this project while it is active. A foreign id, or a stakeholder,
 * gets Not found.
 */
export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const manage = canManagePlanning(viewer);
  // One round trip; nothing renders unless getProject finds it in this workspace for a viewer who may read it.
  const [project, tasks, people, goals] = await Promise.all([
    getProject(viewer, id),
    tasksForProject(viewer, id),
    manage ? ownerOptions(viewer) : [],
    manage ? activeGoalOptions(viewer) : [],
  ]);
  if (project === null) notFound();
  const today = dayKey(new Date(), viewer.timezone);
  const active = project.status === "active";

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={{ href: "/projects", label: "Projects" }}
        title={project.name}
        actions={
          manage ? (
            <>
              <ProjectDialog
                project={{ id: project.id, name: project.name, description: project.description, ownerId: project.owner?.id ?? null, goal: project.goal, targetDate: project.targetDate }}
                people={people}
                goals={goals}
                viewerId={viewer.userId}
              />
              <ProjectStatusActions projectId={project.id} status={project.status} />
            </>
          ) : null
        }
        meta={
          <>
            <ProjectStatusBadge status={project.status} />
            <OwnerLabel owner={project.owner} className="text-foreground" />
            {project.goal ? <GoalLink goal={project.goal} className="max-w-full" /> : null}
            {project.targetDate ? <TargetLabel day={project.targetDate} today={today} active={active} /> : null}
          </>
        }
      />
      <div className="grid gap-8">
        <div className="grid gap-3">
          {project.status === "archived" ? (
            <p className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <Archive className="size-4 shrink-0" aria-hidden />
              This project is archived. Its tasks stay readable.
            </p>
          ) : null}
          <PlanningSummary description={project.description} progress={project.progress} />
        </div>
        <PlanningTasks
          items={tasks}
          today={today}
          groupByStatus
          action={active && canCreateTask(viewer) ? <NewTaskButton defaults={{ projectId: project.id }} /> : null}
          empty={active ? "No tasks in this project yet. Add the first one with New task." : "No tasks in this project."}
        />
      </div>
    </div>
  );
}
