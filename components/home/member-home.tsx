import { ActivityFeed } from "@/components/team/activity-feed";
import { GoalProgressList } from "@/components/team/goal-progress";
import { Panel } from "@/components/team/panel";
import type { FeedEntry, GoalProgress } from "@/lib/dal/dashboard";
import type { TaskListItem } from "@/lib/tasks/types";
import { ResumePanel } from "./resume-panel";

// A member's Home (apex-ux flow A): where they stopped, the goals the work adds up to, and what changed lately.

export function MemberHome({
  resume,
  goals,
  feed,
  today,
  now,
  timeZone,
}: {
  resume: TaskListItem[];
  goals: GoalProgress[];
  feed: FeedEntry[];
  today: string;
  now: Date;
  timeZone: string;
}) {
  return (
    <div className="grid gap-6">
      <ResumePanel tasks={resume} today={today} />
      <Panel title="Goals" href="/goals" hrefLabel="All goals">
        <GoalProgressList goals={goals} today={today} strip empty="No active goals yet. Goals and the work under them show up here." />
      </Panel>
      <Panel title="Recent activity">
        <ActivityFeed items={feed} now={now} timeZone={timeZone} empty="Nothing important has happened yet. Completions, blockers and decisions show up here." />
      </Panel>
    </div>
  );
}
