import { GitBranch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalSettingsDialog } from "@/components/approvals/approval-settings-dialog";
import { GoalPastTargetStrip } from "@/components/goals/goal-alerts";
import { GoalConnections } from "@/components/goals/goal-connections";
import { GoalDeleteDialog } from "@/components/goals/goal-delete-dialog";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalStatusBadge, isPastTarget, OwnerLabel, RepeatLabel, TargetLabel } from "@/components/goals/goal-parts";
import { GoalStatusActions } from "@/components/goals/goal-status-actions";
import { PlanningHeader, PlanningSummary } from "@/components/goals/planning-header";
import { SubGoals } from "@/components/goals/sub-goals";
import { PlanningTasks } from "@/components/projects/task-groups";
import { CloserHome } from "@/components/tasks/closer-chip";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { SelectionProvider } from "@/components/tasks/selection";
import { approvalSettings } from "@/lib/dal/approvals";
import { connectionsOf, getGoal, listGoals, ownerOptions, parentGoalOptions, subGoalsOf } from "@/lib/dal/goals";
import { pinnedProjectIds, projectOptions } from "@/lib/dal/projects";
import { catchUpRecurrences } from "@/lib/dal/recurrence";
import { tasksForGoal } from "@/lib/dal/tasks";
import { canCompleteGoal, canCreateTask, canManagePlanning, isLeader, isStakeholder } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /goals/[id]: one goal, its progress, its place among the other goals, and the sub-goals and tasks that move it.

export const metadata: Metadata = { title: "Goal" };

/**
 * "How far along is this goal, and what work moves it?" Header and progress first (a goal past its target shouts
 * until someone marks it completed), then (for a top-level goal) its sub-goals, its connections, then its tasks:
 * direct and through its sub-goals. A sub-goal's page points back at its parent. A foreign id gets Not found.
 */
export default async function GoalPage(props: PageProps<"/goals/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  await catchUpRecurrences(viewer);
  const manage = canManagePlanning(viewer);
  // One round trip; nothing renders unless getGoal finds the goal in this workspace for a viewer who may read it.
  const [goal, subGoals, tasks, connections, people, projects, parents, allGoals, pinned] = await Promise.all([
    getGoal(viewer, id),
    subGoalsOf(viewer, id),
    tasksForGoal(viewer, id),
    connectionsOf(viewer, id),
    manage ? ownerOptions(viewer) : [],
    manage ? projectOptions(viewer) : [],
    manage ? parentGoalOptions(viewer) : [],
    manage ? listGoals(viewer, { includeCompleted: false, topLevelOnly: true }) : [],
    manage ? pinnedProjectIds(viewer) : [],
  ]);
  if (goal === null) notFound();
  const settings = manage ? await approvalSettings(viewer, { goalId: goal.id }) : null;
  const today = dayKey(new Date(), viewer.timezone);
  const active = goal.status === "active";
  const topLevel = goal.parent === null;
  const late = isPastTarget(goal, today);
  const statusActions = <GoalStatusActions goalId={goal.id} status={goal.status} canComplete={canCompleteGoal(viewer)} canManage={manage} loud={late} />;
  const editDialog = manage ? (
    <GoalDialog
      goal={{
        id: goal.id,
        title: goal.title,
        description: goal.description,
        successCriteria: goal.successCriteria,
        ownerId: goal.owner?.id ?? null,
        projectId: goal.project.id,
        parentGoalId: goal.parent?.id ?? null,
        targetDate: goal.targetDate,
        recurrence: goal.recurrence,
        subGoals: goal.subGoals,
      }}
      people={people}
      projects={projects.map(({ id: projectId, name }) => ({ id: projectId, name }))}
      parents={parents}
      pinnedProjectIds={pinned}
      viewerId={viewer.userId}
      today={today}
    />
  ) : null;
  const deleteDialog = manage ? (
    <GoalDeleteDialog goal={{ id: goal.id, title: goal.title, projectId: goal.project.id, projectName: goal.project.name, tasks: tasks.filter((task) => task.goal?.id === goal.id && !task.goalCloser).length, subGoals: goal.subGoals }} />
  ) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={goal.parent ? { href: `/goals/${goal.parent.id}`, label: goal.parent.title } : { href: `/projects/${goal.project.id}`, label: goal.project.name }}
        title={goal.title}
        actions={
          <>
            {editDialog}
            {manage && settings ? <ApprovalSettingsDialog scope={{ goalId: goal.id }} settings={settings} people={people} what="this goal" /> : null}
            {late ? null : statusActions}
            {deleteDialog}
          </>
        }
        meta={
          <>
            <GoalStatusBadge status={goal.status} />
            <Link href={`/projects/${goal.project.id}`} className="rounded-sm text-foreground underline-offset-4 hover:underline">
              {goal.project.name}
            </Link>
            {goal.parent ? (
              <Link href={`/goals/${goal.parent.id}`} className="inline-flex items-center gap-1 rounded-sm text-foreground underline-offset-4 hover:underline">
                <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="sr-only">Part of the goal </span>
                {goal.parent.title}
              </Link>
            ) : null}
            <OwnerLabel owner={goal.owner} className="text-foreground" />
            {goal.targetDate ? <TargetLabel day={goal.targetDate} today={today} active={active} /> : null}
            <RepeatLabel repeats={goal.repeats} />
          </>
        }
      />
      {late && goal.targetDate ? <GoalPastTargetStrip targetDate={goal.targetDate} today={today} actions={statusActions} /> : null}
      {active && canCreateTask(viewer) ? <QuickAddTask today={today} defaults={{ projectId: goal.project.id, goalId: goal.id }} /> : null}
      <div className="grid gap-8">
        <PlanningSummary successCriteria={goal.successCriteria} description={goal.description} progress={goal.progress} />
        {topLevel ? (
          <SubGoals
            goals={subGoals}
            today={today}
            action={
              manage && active ? (
                <GoalDialog people={people} parent={{ id: goal.id, title: goal.title, targetDate: goal.targetDate, projectId: goal.project.id }} viewerId={viewer.userId} today={today} variant="outline" />
              ) : null
            }
            empty={manage && active ? "No sub-goals yet. Split a big goal into steps, each with its own target on or before this goal's." : "This goal has no sub-goals."}
          />
        ) : null}
        <GoalConnections
          goalId={goal.id}
          comesAfter={connections.comesAfter}
          leadsTo={connections.leadsTo}
          choices={allGoals.map((each) => ({ id: each.id, title: each.title, projectName: each.project.name }))}
          canEdit={manage}
        />
        <SelectionProvider enabled={!isStakeholder(viewer)} canDelete={isLeader(viewer)}>
          <CloserHome goalId={goal.id}>
            <PlanningTasks items={tasks} today={today} readOnly={isStakeholder(viewer)} empty={active ? "No tasks serve this goal yet. Add one above." : "No tasks served this goal."} />
          </CloserHome>
        </SelectionProvider>
      </div>
    </div>
  );
}
