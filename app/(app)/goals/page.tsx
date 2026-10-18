import { Target } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalCard } from "@/components/goals/goal-parts";
import { ShowAllToggle } from "@/components/goals/show-all-toggle";
import { PageHeader } from "@/components/page-header";
import { listGoals, ownerOptions } from "@/lib/dal/goals";
import { teamOptions } from "@/lib/dal/teams";
import { canManagePlanning, canReadPlanning } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /goals: what the team is working towards, and how far along each goal is.

export const metadata: Metadata = { title: "Goals" };

/**
 * "How far along is each goal?": active goals first, then paused, then achieved (hidden until `?all=1` once there
 * are any). Leaders and admins get New goal; members read; stakeholders don't see goals at all.
 */
export default async function GoalsPage(props: PageProps<"/goals">) {
  const viewer = await requireViewer();
  if (!canReadPlanning(viewer)) redirect("/home");
  const showAll = (await props.searchParams).all === "1";
  const manage = canManagePlanning(viewer);
  // A workspace has a handful of goals: read them all once, so the toggle knows whether anything achieved exists.
  const [goals, people, teams] = await Promise.all([listGoals(viewer, { includeAchieved: true }), manage ? ownerOptions(viewer) : [], manage ? teamOptions(viewer) : []]);
  const today = dayKey(new Date(), viewer.timezone);
  const achievedCount = goals.filter((goal) => goal.status === "achieved").length;
  const shown = showAll ? goals : goals.filter((goal) => goal.status !== "achieved");
  const newGoal = (variant: "default" | "outline") => (manage ? <GoalDialog people={people} teams={teams} viewerId={viewer.userId} variant={variant} /> : null);

  return (
    <>
      <PageHeader title="Goals" description="What the team is working towards, and how far along each one is." action={newGoal("default")} />
      {achievedCount > 0 ? (
        <div className="-mt-3 mb-3 flex justify-end">
          <ShowAllToggle path="/goals" checked={showAll} label="Show achieved" />
        </div>
      ) : null}
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description={manage ? "Add the first one so projects and tasks have something to roll up into." : "When a leader adds one, you'll see here how far along it is."}
          action={newGoal("outline")}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Target} title="No active goals" description="Every goal is achieved. Turn on Show achieved to see them, or add the next one." action={newGoal("outline")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((goal) => (
            <GoalCard key={goal.id} goal={goal} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}
