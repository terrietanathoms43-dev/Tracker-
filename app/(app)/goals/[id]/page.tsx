import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalStatusBadge, OwnerLabel, TargetLabel } from "@/components/goals/goal-parts";
import { GoalProjects } from "@/components/goals/goal-projects";
import { GoalStatusActions } from "@/components/goals/goal-status-actions";
import { PlanningHeader, PlanningSummary } from "@/components/goals/planning-header";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { PlanningTasks } from "@/components/projects/task-groups";
import { TeamChip } from "@/components/tasks/assignee-stack";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { activeGoalOptions, getGoal, ownerOptions } from "@/lib/dal/goals";
import { projectOptions, projectsForGoal } from "@/lib/dal/projects";
import { tasksForGoal } from "@/lib/dal/tasks";
import { teamOptions } from "@/lib/dal/teams";
import { canCreateTask, canManagePlanning } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /goals/[id]: one goal, its progress, and the projects and tasks that move it.

export const metadata: Metadata = { title: "Goal" };

/**
 * "How far along is this goal, and what work moves it?" Header and progress first, then the projects that roll up
 * into it, then its tasks (direct and through those projects). A foreign id, or a stakeholder, gets Not found.
 */
export default async function GoalPage(props: PageProps<"/goals/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const manage = canManagePlanning(viewer);
  // One round trip; nothing renders unless getGoal finds the goal in this workspace for a viewer who may read it.
  const [goal, projects, tasks, people, goalOptions, teams, allProjects] = await Promise.all([
    getGoal(viewer, id),
    projectsForGoal(viewer, id),
    tasksForGoal(viewer, id),
    manage ? ownerOptions(viewer) : [],
    manage ? activeGoalOptions(viewer) : [],
    manage ? teamOptions(viewer) : [],
    manage ? projectOptions(viewer) : [],
  ]);
  if (goal === null) notFound();
  const today = dayKey(new Date(), viewer.timezone);
  const active = goal.status === "active";

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={{ href: "/goals", label: "Goals" }}
        title={goal.title}
        actions={
          manage ? (
            <>
              <GoalDialog
                goal={{
                  id: goal.id,
                  title: goal.title,
                  description: goal.description,
                  successCriteria: goal.successCriteria,
                  ownerId: goal.owner?.id ?? null,
                  teamIds: goal.teams.map((team) => team.id),
                  projectIds: projects.map((project) => project.id),
                  targetDate: goal.targetDate,
                }}
                people={people}
                teams={teams}
                projects={allProjects}
                viewerId={viewer.userId}
              />
              <GoalStatusActions goalId={goal.id} status={goal.status} />
            </>
          ) : null
        }
        meta={
          <>
            <GoalStatusBadge status={goal.status} />
            <OwnerLabel owner={goal.owner} className="text-foreground" />
            {goal.targetDate ? <TargetLabel day={goal.targetDate} today={today} active={active} /> : null}
            {goal.teams.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <TeamChip name={team.name} />
              </Link>
            ))}
          </>
        }
      />
      {active && canCreateTask(viewer) ? <QuickAddTask today={today} defaults={{ goalId: goal.id }} /> : null}
      <div className="grid gap-8">
        <PlanningSummary successCriteria={goal.successCriteria} description={goal.description} progress={goal.progress} />
        <GoalProjects
          projects={projects}
          today={today}
          action={manage && active ? <ProjectDialog people={people} goals={goalOptions} viewerId={viewer.userId} goalId={goal.id} variant="outline" /> : null}
        />
        <PlanningTasks
          items={tasks}
          today={today}
          empty={active ? "No tasks serve this goal yet. Add one above, or put a project under it." : "No tasks served this goal."}
        />
      </div>
    </div>
  );
}
