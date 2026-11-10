import { Target } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalGraph } from "@/components/goals/goal-graph";
import { GoalViewTabs } from "@/components/goals/goal-view-tabs";
import { GoalsList } from "@/components/goals/goals-list";
import { ShowAllToggle } from "@/components/goals/show-all-toggle";
import { PageHeader } from "@/components/page-header";
import { goalLinksIn, listGoals, ownerOptions, parentGoalOptions } from "@/lib/dal/goals";
import { pinnedProjectIds, projectOptions } from "@/lib/dal/projects";
import { catchUpRecurrences } from "@/lib/dal/recurrence";
import { openTasksForGoals } from "@/lib/dal/tasks";
import { canCreatePlanning, canLinkGoals, canManagePlanning, isStakeholder } from "@/lib/permissions";
import { scopedProject } from "@/lib/project-scope-server";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /goals: what the team is working towards (docs/PLAN.md, 2026-11-03 log). Top down, soonest target first, each
// goal with its open tasks under it; or the branch view, a canvas of which goal leads into which. Narrowed to the
// navigation's project when one is chosen.

export const metadata: Metadata = { title: "Goals" };

/**
 * "How far along is each goal, and what moves it?": active goals first, then paused, then completed (hidden until
 * `?all=1` once there are any). Leaders and admins get New goal; everyone else reads; stakeholders read to sign
 * goals off.
 */
export default async function GoalsPage(props: PageProps<"/goals">) {
  const viewer = await requireViewer();
  await catchUpRecurrences(viewer);
  const [raw, scope] = await Promise.all([props.searchParams, scopedProject(viewer)]);
  const showAll = raw.all === "1";
  const view = raw.view === "branches" ? "branches" : "list";
  const manage = canManagePlanning(viewer);
  const create = canCreatePlanning(viewer);
  const project = scope?.id ?? "";
  // A workspace has a handful of goals: read them all once, so the toggle knows whether anything completed exists.
  const [goals, links, people, projects, parents, pinned] = await Promise.all([
    listGoals(viewer, { includeCompleted: true, project }),
    goalLinksIn(viewer, project),
    create ? ownerOptions(viewer) : [],
    create ? projectOptions(viewer) : [],
    create ? parentGoalOptions(viewer) : [],
    create ? pinnedProjectIds(viewer) : [],
  ]);
  const today = dayKey(new Date(), viewer.timezone);
  const completedCount = goals.filter((goal) => goal.status === "completed").length;
  const shown = showAll ? goals : goals.filter((goal) => goal.status !== "completed");
  const tasks = view === "list" ? await openTasksForGoals(viewer, shown.map((goal) => goal.id)) : new Map();
  const newGoal = (variant: "default" | "outline") =>
    create ? <GoalDialog people={people} projects={projects.map(({ id, name }) => ({ id, name }))} parents={parents} pinnedProjectIds={pinned} defaultProjectId={scope?.status === "active" ? scope.id : ""} viewerId={viewer.userId} today={today} variant={variant} /> : null;

  return (
    <>
      <PageHeader title="Goals" description={scope ? `What ${scope.name} is working towards, soonest first.` : "What the team is working towards, soonest first, and the tasks that move each goal."} action={newGoal("default")} />
      <div className="-mt-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <GoalViewTabs active={view} showAll={showAll} />
        {completedCount > 0 ? <ShowAllToggle path={view === "branches" ? "/goals?view=branches" : "/goals"} checked={showAll} label="Show completed" /> : null}
      </div>
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={scope ? `No goals in ${scope.name} yet` : "No goals yet"}
          description={create ? "Add the first one so tasks have something to roll up into. A goal lives in a project; the dialog can make the project too." : "When a leader adds one, you'll see here how far along it is."}
          action={newGoal("outline")}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Target} title="No active goals" description="Every goal is completed. Turn on Show completed to see them, or add the next one." action={newGoal("outline")} />
      ) : view === "branches" ? (
        <div className="grid gap-3">
          <GoalGraph goals={shown} links={links} today={today} showProject={scope === null} canEdit={canLinkGoals(viewer)} />
          <p className="text-[13px] text-muted-foreground">
            Solid arrows lead from one goal into the next; dashed ones go from a goal to its sub-goals.{" "}
            {manage ? "Drag the dot on a card onto another goal to say it leads there, and press the × on an arrow to take it away. A goal's page has the same under Connections." : ""}
          </p>
        </div>
      ) : (
        <GoalsList goals={shown} tasks={tasks} today={today} showProject={scope === null} readOnly={isStakeholder(viewer)} />
      )}
    </>
  );
}
