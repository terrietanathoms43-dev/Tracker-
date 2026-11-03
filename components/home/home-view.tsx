import { GoalsPastTargetBanner } from "@/components/goals/goal-alerts";
import { InviteBanner } from "@/components/home/invite-banner";
import { LeaderHome, type LeaderHomeData } from "@/components/home/leader-home";
import { MemberHome } from "@/components/home/member-home";
import { StakeholderHome } from "@/components/home/stakeholder-home";
import { ViewTabs } from "@/components/home/view-tabs";
import { PageHeader } from "@/components/page-header";
import { ORG_ROLE_LABELS } from "@/lib/constants";
import { countProposalsWaitingFor, listProposals } from "@/lib/dal/approvals";
import { activeGoalProgress, teamFeed } from "@/lib/dal/dashboard";
import { goalsPastTarget } from "@/lib/dal/goals";
import { getSetupState } from "@/lib/dal/orgs";
import { attentionTasks, approvalStagingTasks, myWorkTasks, taskCounts, workload } from "@/lib/dal/tasks";
import type { HomeTabConfig } from "@/lib/home-tabs";
import type { Membership } from "@/lib/dal/orgs";
import { canCompleteGoal, isAdmin, isLeader, isStakeholder, type Viewer } from "@/lib/permissions";
import type { ScopedProject } from "@/lib/project-scope-server";
import { DEFAULT_PERIOD, periodStart } from "@/lib/dashboard/period";
import { dayKey, greetingFor } from "@/lib/time";
import type { SessionUser } from "@/lib/viewer";

// The Home tab of /home: the role-aware overview this screen always was — members see their next steps,
// leaders and admins see the team's health above them, stakeholders see their proposals and the goals they sign
// off. Everything is narrowed to the navigation's project when one is chosen.

const GOALS_SHOWN = 3;
const MEMBER_FEED_ROWS = 6;
const LEADER_FEED_ROWS = 8;

/** The reads only leaders and admins need, so a member's Home never runs them. Counts cover the last 30 days. */
async function loadLeaderData(viewer: Viewer, now: Date, today: string, project: string): Promise<LeaderHomeData> {
  const [proposals, counts, attention, rows, feed, staging] = await Promise.all([
    countProposalsWaitingFor(viewer, project),
    taskCounts(viewer, { today, since: periodStart(now, DEFAULT_PERIOD), project }),
    attentionTasks(viewer, today, 50, project),
    workload(viewer, project),
    teamFeed(viewer, LEADER_FEED_ROWS, project),
    approvalStagingTasks(viewer, project),
  ]);
  return { proposals, counts, attention, workload: rows, feed, staging };
}

/** "What needs me right now?", answered for the viewer's role. */
export async function HomeView({ viewer, user, org, tabsConfig, scope }: { viewer: Viewer; user: SessionUser; org: Membership; tabsConfig: HomeTabConfig; scope: ScopedProject | null }) {
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const firstName = (user.name ?? "").split(" ")[0] || null;
  const title = `${greetingFor(viewer.timezone, now)}${firstName ? `, ${firstName}` : ""}`;
  const timeZone = viewer.timezone;
  const project = scope?.id ?? "";
  const description = `${org.name} · ${ORG_ROLE_LABELS[viewer.orgRole]}${scope ? ` · ${scope.name}` : ""}`;

  if (isStakeholder(viewer)) {
    const [proposals, lateGoals] = await Promise.all([listProposals(viewer, { project }), goalsPastTarget(viewer, today, project)]);
    return <StakeholderHome title={title} description={description} proposals={proposals} lateGoals={lateGoals} now={now} today={today} timeZone={timeZone} scope={scope} />;
  }

  const leader = isLeader(viewer);
  const [resume, goals, lateGoals, leaderData, memberFeed, setup] = await Promise.all([
    myWorkTasks(viewer, project),
    activeGoalProgress(viewer, GOALS_SHOWN, project),
    goalsPastTarget(viewer, today, project),
    leader ? loadLeaderData(viewer, now, today, project) : null,
    leader ? [] : teamFeed(viewer, MEMBER_FEED_ROWS, project),
    isAdmin(viewer) ? getSetupState(viewer) : null,
  ]);
  // An admin with nobody else in the workspace has no team to track yet: inviting people is the next step.
  const alone = setup !== null && setup.otherMembers === 0;

  return (
    <>
      <PageHeader title={title} description={description} />
      <ViewTabs active="home" config={tabsConfig} />
      {alone ? (
        <div className="mb-6">
          <InviteBanner />
        </div>
      ) : null}
      {lateGoals.length > 0 ? (
        <div className="mb-6">
          <GoalsPastTargetBanner goals={lateGoals} today={today} canComplete={canCompleteGoal(viewer)} />
        </div>
      ) : null}
      {leaderData ? (
        <LeaderHome data={leaderData} days={DEFAULT_PERIOD} resume={resume} goals={goals} today={today} now={now} timeZone={timeZone} />
      ) : (
        <MemberHome resume={resume} goals={goals} feed={memberFeed} today={today} now={now} timeZone={timeZone} />
      )}
    </>
  );
}
