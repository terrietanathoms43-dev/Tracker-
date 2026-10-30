import { ApprovalStaging } from "@/components/tasks/approval-staging";
import { TaskList } from "@/components/tasks/task-list";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CountTiles } from "@/components/dashboard/count-tiles";
import { GoalProgressList } from "@/components/dashboard/goal-progress";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { WorkloadCompact } from "@/components/dashboard/workload";
import type { FeedEntry, GoalProgress } from "@/lib/dal/dashboard";
import type { ApprovalStagingTask } from "@/lib/dal/tasks";
import { tasksHref } from "@/lib/tasks/filters";
import type { TaskCounts, TaskListItem, WorkloadRow } from "@/lib/tasks/types";
import { PendingBanner } from "./pending-banner";
import { ResumePanel } from "./resume-panel";

// A leader's or admin's Home (apex-ux flow B): requests waiting on them, the counts, what needs a hand, who holds
// what, goals and recent decisions; then their own work, as a member's Home shows it.

/** How many attention rows Home shows; the task list has the rest. */
const ATTENTION_ROWS = 8;

export type LeaderHomeData = {
  pending: number;
  counts: TaskCounts;
  attention: TaskListItem[];
  workload: WorkloadRow[];
  feed: FeedEntry[];
  staging: ApprovalStagingTask[];
};

export function LeaderHome({
  data,
  days,
  resume,
  goals,
  today,
  now,
  timeZone,
}: {
  data: LeaderHomeData;
  days: number;
  resume: TaskListItem[];
  goals: GoalProgress[];
  today: string;
  now: Date;
  timeZone: string;
}) {
  return (
    <div className="grid gap-6">
      {data.pending > 0 ? <PendingBanner count={data.pending} /> : null}
      <CountTiles counts={data.counts} days={days} />

      {/* Supervisor Approval Staging Area: Eliminates hallucination before sign-off */}
      <ApprovalStaging tasks={data.staging} />

      <Panel title="Needs attention" count={data.attention.length} highlight href={tasksHref({})} hrefLabel="All open tasks">
        {data.attention.length === 0 ? (
          <PanelEmpty>Nothing is overdue, blocked, waiting on approval, unassigned or due soon.</PanelEmpty>
        ) : (
          <TaskList page={{ items: data.attention.slice(0, ATTENTION_ROWS), nextCursor: null }} today={today} showReason />
        )}
      </Panel>
      {/* Task rows need the full width; the shorter panels sit beside the feed. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid min-w-0 gap-6">
          <Panel title="Workload" href="/members" hrefLabel="Members">
            <WorkloadCompact rows={data.workload} />
          </Panel>
          <Panel title="Goals" href="/goals" hrefLabel="All goals">
            <GoalProgressList goals={goals} today={today} empty="No active goals yet. Goals and the work under them show up here." />
          </Panel>
        </div>
        <Panel title="Recent decisions and activity">
          <ActivityFeed items={data.feed} now={now} timeZone={timeZone} empty="No decisions or blockers yet. Completions, blockers, approvals and request decisions show up here." />
        </Panel>
      </div>
      <ResumePanel tasks={resume} today={today} />
    </div>
  );
}
