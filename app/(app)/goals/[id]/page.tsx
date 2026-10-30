import { GitBranch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalStatusBadge, OwnerLabel, TargetLabel } from "@/components/goals/goal-parts";
import { GoalProjects } from "@/components/goals/goal-projects";
import { GoalStatusActions } from "@/components/goals/goal-status-actions";
import { PlanningHeader, PlanningSummary } from "@/components/goals/planning-header";
import { SubGoals } from "@/components/goals/sub-goals";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { PlanningTasks } from "@/components/projects/task-groups";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { activeGoalOptions, getGoal, ownerOptions, parentGoalOptions, subGoalsOf } from "@/lib/dal/goals";
import { projectOptions, projectsForGoal } from "@/lib/dal/projects";
import { tasksForGoal } from "@/lib/dal/tasks";
import { canCreateTask, canManagePlanning } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /goals/[id]: one goal, its progress, and the sub-goals, projects and tasks that move it.

export const metadata: Metadata = { title: "Goal" };

/**
 * "How far along is this goal, and what work moves it?" Header and progress first, then (for a top-level goal) its
 * sub-goals, then the projects that roll up into it, then its tasks: direct, through those projects, and through its
 * sub-goals. A sub-goal's page points back at its parent. A foreign id, or a stakeholder, gets Not found.
 */
export default async function GoalPage(props: PageProps<"/goals/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const manage = canManagePlanning(viewer);
  // One round trip; nothing renders unless getGoal finds the goal in this workspace for a viewer who may read it.
  const [goal, subGoals, projects, tasks, people, goalOptions, allProjects, parents] = await Promise.all([
    getGoal(viewer, id),
    subGoalsOf(viewer, id),
    projectsForGoal(viewer, id),
    tasksForGoal(viewer, id),
    manage ? ownerOptions(viewer) : [],
    manage ? activeGoalOptions(viewer) : [],
    manage ? projectOptions(viewer) : [],
    manage ? parentGoalOptions(viewer) : [],
  ]);
  if (goal === null) notFound();
  const today = dayKey(new Date(), viewer.timezone);
  const active = goal.status === "active";
  const topLevel = goal.parent === null;

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={goal.parent ? { href: `/goals/${goal.parent.id}`, label: goal.parent.title } : { href: "/goals", label: "Goals" }}
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
                  parentGoalId: goal.parent?.id ?? null,
                  projectIds: projects.map((project) => project.id),
                  targetDate: goal.targetDate,
                  subGoals: goal.subGoals,
                }}
                people={people}
                projects={allProjects}
                parents={parents}
                viewerId={viewer.userId}
                today={today}
              />
              <GoalStatusActions goalId={goal.id} status={goal.status} />
            </>
          ) : null
        }
        meta={
          <>
            <GoalStatusBadge status={goal.status} />
            {goal.parent ? (
              <Link href={`/goals/${goal.parent.id}`} className="inline-flex items-center gap-1 rounded-sm text-foreground underline-offset-4 hover:underline">
                <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="sr-only">Part of the goal </span>
                {goal.parent.title}
              </Link>
            ) : null}
            <OwnerLabel owner={goal.owner} className="text-foreground" />
            {goal.targetDate ? <TargetLabel day={goal.targetDate} today={today} active={active} /> : null}
          </>
        }
      />
      {active && canCreateTask(viewer) ? <QuickAddTask today={today} defaults={{ goalId: goal.id }} /> : null}
      <div className="grid gap-8">
        <PlanningSummary successCriteria={goal.successCriteria} description={goal.description} progress={goal.progress} />
        {topLevel ? (
          <SubGoals
            goals={subGoals}
            today={today}
            action={
              manage && active ? (
                <GoalDialog people={people} parent={{ id: goal.id, title: goal.title, targetDate: goal.targetDate }} viewerId={viewer.userId} today={today} variant="outline" />
              ) : null
            }
            empty={
              manage && active
                ? "No sub-goals yet. Split a big goal into steps, each with its own target on or before this goal's."
                : "This goal has no sub-goals."
            }
          />
        ) : null}
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
