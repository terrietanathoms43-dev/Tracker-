import { Archive, AudioLines, Target } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalSettingsDialog } from "@/components/approvals/approval-settings-dialog";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalCard, OwnerLabel, TargetLabel } from "@/components/goals/goal-parts";
import { PlanningHeader, PlanningSummary } from "@/components/goals/planning-header";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ApprovalBadge, ProjectStatusBadge } from "@/components/projects/project-parts";
import { ProjectStatusActions } from "@/components/projects/project-status-actions";
import { PlanningTasks } from "@/components/projects/task-groups";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { SelectionProvider } from "@/components/tasks/selection";
import { Button } from "@/components/ui/button";
import { captureProviderFor } from "@/lib/capture/availability";
import { approvalSettings } from "@/lib/dal/approvals";
import { listGoals, ownerOptions } from "@/lib/dal/goals";
import { getProject } from "@/lib/dal/projects";
import { tasksForProject } from "@/lib/dal/tasks";
import { canCapture, canCreateTask, canManagePlanning, isLeader, isStakeholder } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /projects/[id]: one project, its progress, the goals inside it, and its tasks grouped by status.

export const metadata: Metadata = { title: "Project" };

/**
 * "Where is this project, and what's left in it?" Header and progress first, then its goals (New goal starts in
 * this project), then its tasks by status with the finished ones folded away. New task starts in this project while
 * it is active. A foreign id gets Not found.
 */
export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const { viewer, user } = await requireViewerContext();
  const manage = canManagePlanning(viewer);
  const capture = canCapture(viewer) && captureProviderFor(user.email) !== null;
  // One round trip; nothing renders unless getProject finds it in this workspace for a viewer who may read it.
  const [project, goals, tasks, people] = await Promise.all([
    getProject(viewer, id),
    listGoals(viewer, { includeCompleted: true, project: id, topLevelOnly: true }),
    tasksForProject(viewer, id),
    manage ? ownerOptions(viewer) : [],
  ]);
  if (project === null) notFound();
  const settings = manage ? await approvalSettings(viewer, { projectId: project.id }) : null;
  const today = dayKey(new Date(), viewer.timezone);
  const active = project.status === "active";
  const openGoals = goals.filter((goal) => goal.status !== "completed");
  const doneGoals = goals.filter((goal) => goal.status === "completed");
  const newGoal = manage && active ? <GoalDialog people={people} projects={[{ id: project.id, name: project.name }]} defaultProjectId={project.id} viewerId={viewer.userId} today={today} variant="outline" size="sm" /> : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={{ href: "/home?view=projects", label: "Projects" }}
        title={project.name}
        actions={
          manage ? (
            <>
              {capture && active ? (
                <Button asChild variant="outline">
                  <Link href={`/capture?project=${project.id}`}>
                    <AudioLines aria-hidden />
                    From a meeting
                  </Link>
                </Button>
              ) : null}
              <ProjectDialog project={{ id: project.id, name: project.name, description: project.description, ownerId: project.owner?.id ?? null, targetDate: project.targetDate }} people={people} viewerId={viewer.userId} />
              {settings ? <ApprovalSettingsDialog scope={{ projectId: project.id }} settings={settings} people={people} what="this project" /> : null}
              <ProjectStatusActions projectId={project.id} status={project.status} />
            </>
          ) : null
        }
        meta={
          <>
            <ProjectStatusBadge status={project.status} />
            <OwnerLabel owner={project.owner} className="text-foreground" />
            {project.targetDate ? <TargetLabel day={project.targetDate} today={today} active={active} /> : null}
            {project.requiresApproval ? <ApprovalBadge /> : null}
          </>
        }
      />
      {active && canCreateTask(viewer) ? <QuickAddTask today={today} defaults={{ projectId: project.id }} /> : null}
      <div className="grid gap-8">
        <div className="grid gap-3">
          {project.status === "archived" ? (
            <p className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-base text-muted-foreground">
              <Archive className="size-4 shrink-0" aria-hidden />
              This project is archived. Its goals and tasks stay readable.
            </p>
          ) : null}
          <PlanningSummary description={project.description} progress={project.progress} />
        </div>
        <section aria-labelledby="project-goals-heading" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="project-goals-heading" className="flex items-baseline gap-2 text-base font-semibold">
              Goals
              <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{goals.length}</span>
            </h2>
            {newGoal}
          </div>
          {goals.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed bg-card px-4 py-5 text-base text-muted-foreground">
              <Target className="size-4 shrink-0" aria-hidden />
              {manage && active ? "No goals yet. A goal says what this project is for; its tasks roll up into it." : "No goals in this project yet."}
            </p>
          ) : (
            <div className="grid gap-3">
              <ul className="grid gap-3 sm:grid-cols-2">
                {openGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} today={today} />
                ))}
              </ul>
              {doneGoals.length > 0 ? (
                <details className="group min-w-0">
                  <summary className="w-fit cursor-pointer list-none rounded-md px-0.5 text-[13px] font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show {doneGoals.length} completed</span>
                    <span className="hidden group-open:inline">Hide {doneGoals.length} completed</span>
                  </summary>
                  <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                    {doneGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} today={today} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </section>
        <SelectionProvider enabled={!isStakeholder(viewer)} canDelete={isLeader(viewer)}>
          <PlanningTasks items={tasks} today={today} groupByStatus readOnly={isStakeholder(viewer)} empty={active ? "No tasks in this project yet. Add the first one above." : "No tasks in this project."} />
        </SelectionProvider>
      </div>
    </div>
  );
}
