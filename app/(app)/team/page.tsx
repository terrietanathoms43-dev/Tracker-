import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { ActivityFeed } from "@/components/team/activity-feed";
import { CountTiles } from "@/components/team/count-tiles";
import { GoalProgressList } from "@/components/team/goal-progress";
import { Panel, PanelEmpty } from "@/components/team/panel";
import { PeriodPicker } from "@/components/team/period-picker";
import { Workload } from "@/components/team/workload";
import { Button } from "@/components/ui/button";
import { listWorkers } from "@/lib/dal/orgs";
import { attentionTasks, taskCounts, workload } from "@/lib/dal/tasks";
import { activeGoalProgress, teamFeed } from "@/lib/dal/team";
import { canSeeTeam, isLeader } from "@/lib/permissions";
import { reportHref } from "@/lib/reports/params";
import { lastDays } from "@/lib/reports/range";
import { tasksHref } from "@/lib/tasks/filters";
import { parsePeriod, periodStart } from "@/lib/team/period";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /team: the leader's 60-second read of the workspace (docs/PLAN.md §8, apex-ux flow B).

export const metadata: Metadata = { title: "Team" };

/** How many attention rows show before "All open tasks". */
const ATTENTION_SHOWN = 10;

/** "Is the team on track and where do I intervene?": counts, what needs a hand, who holds what, goals, what changed. */
export default async function TeamPage(props: PageProps<"/team">) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeTeam(viewer)) redirect("/home");
  const days = parsePeriod((await props.searchParams).days);
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const since = periodStart(now, days);
  const [workers, counts, attention, rows, goals, feed] = await Promise.all([
    listWorkers(viewer),
    taskCounts(viewer, { today, since }),
    attentionTasks(viewer, today),
    workload(viewer),
    activeGoalProgress(viewer),
    teamFeed(viewer, 12, since),
  ]);
  // Members read the same page; the row menus are for the people who manage the work (PLAN §3).
  const readOnly = !isLeader(viewer);

  return (
    <>
      <PageHeader
        title="Team"
        description={`${org.name} · ${workers.length} ${workers.length === 1 ? "member" : "members"}`}
        action={
          <div className="flex items-center gap-2">
            <PeriodPicker days={days} />
            <Button asChild variant="outline" size="sm">
              <Link href={reportHref("/reports", lastDays(days, today))} title={`The report for the last ${days} days`}>
                <BarChart3 aria-hidden />
                Report
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6">
        <CountTiles counts={counts} days={days} />

        <Panel title="Needs attention" count={attention.length} highlight href={tasksHref({})} hrefLabel="All open tasks">
          {attention.length === 0 ? (
            <PanelEmpty>Nothing is overdue, blocked, waiting on approval, unassigned or due soon.</PanelEmpty>
          ) : (
            <TaskList page={{ items: attention.slice(0, ATTENTION_SHOWN), nextCursor: null }} today={today} showReason readOnly={readOnly} />
          )}
        </Panel>

        {/* Task rows need the full width; the shorter panels share a row with the feed. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid min-w-0 gap-6">
            <Panel title="Workload" href={tasksHref({}, "board")} hrefLabel="Board">
              <Workload rows={rows} today={today} />
            </Panel>
            <Panel title="Goals" href="/goals" hrefLabel="All goals">
              <GoalProgressList goals={goals} today={today} empty="No active goals yet. Goals and the work under them show up here." />
            </Panel>
          </div>
          <Panel title="Recent important activity">
            <ActivityFeed items={feed} now={now} timeZone={viewer.timezone} empty={`No decisions or blockers in the last ${days} days.`} />
          </Panel>
        </div>
      </div>
    </>
  );
}
