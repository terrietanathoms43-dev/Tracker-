import { InviteBanner } from "@/components/home/invite-banner";
import { LeaderHome, type LeaderHomeData } from "@/components/home/leader-home";
import { MemberHome } from "@/components/home/member-home";
import { StakeholderHome } from "@/components/home/stakeholder-home";
import { ViewTabs } from "@/components/home/view-tabs";
import { PageHeader } from "@/components/page-header";
import { ORG_ROLE_LABELS } from "@/lib/constants";
import { activeGoalProgress, teamFeed } from "@/lib/dal/dashboard";
import { getSetupState } from "@/lib/dal/orgs";
import { countPendingRequests, listRequests } from "@/lib/dal/requests";
import { attentionTasks, approvalStagingTasks, myWorkTasks, taskCounts, workload } from "@/lib/dal/tasks";
import type { HomeTabConfig } from "@/lib/home-tabs";
import type { Membership } from "@/lib/dal/orgs";
import { isAdmin, isLeader, isStakeholder, type Viewer } from "@/lib/permissions";
import { DEFAULT_PERIOD, periodStart } from "@/lib/dashboard/period";
import { dayKey, greetingFor } from "@/lib/time";
import type { SessionUser } from "@/lib/viewer";

// The Home tab of /home: the role-aware overview this screen always was — members see their next steps,
// leaders and admins see the team's health above them, stakeholders see their requests.

const GOALS_SHOWN = 3;
const MEMBER_FEED_ROWS = 6;
const LEADER_FEED_ROWS = 8;

/** The reads only leaders and admins need, so a member's Home never runs them. Counts cover the last 30 days. */
async function loadLeaderData(viewer: Viewer, now: Date, today: string): Promise<LeaderHomeData> {
  const [pending, counts, attention, rows, feed, staging] = await Promise.all([
    countPendingRequests(viewer),
    taskCounts(viewer, { today, since: periodStart(now, DEFAULT_PERIOD) }),
    attentionTasks(viewer, today),
    workload(viewer),
    teamFeed(viewer, LEADER_FEED_ROWS),
    approvalStagingTasks(viewer),
  ]);
  return { pending, counts, attention, workload: rows, feed, staging };
}

/** "What needs me right now?", answered for the viewer's role. */
export async function HomeView({ viewer, user, org, tabsConfig }: { viewer: Viewer; user: SessionUser; org: Membership; tabsConfig: HomeTabConfig }) {
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const firstName = (user.name ?? "").split(" ")[0] || null;
  const title = `${greetingFor(viewer.timezone, now)}${firstName ? `, ${firstName}` : ""}`;
  const timeZone = viewer.timezone;

  if (isStakeholder(viewer)) {
    const requests = await listRequests(viewer, { view: "all", mine: true }, 50);
    return <StakeholderHome title={title} requests={requests} now={now} today={today} timeZone={timeZone} />;
  }

  const leader = isLeader(viewer);
  const [resume, goals, leaderData, memberFeed, setup] = await Promise.all([
    myWorkTasks(viewer),
    activeGoalProgress(viewer, GOALS_SHOWN),
    leader ? loadLeaderData(viewer, now, today) : null,
    leader ? [] : teamFeed(viewer, MEMBER_FEED_ROWS),
    isAdmin(viewer) ? getSetupState(viewer) : null,
  ]);
  // An admin with nobody else in the workspace has no team to track yet: inviting people is the next step.
  const alone = setup !== null && setup.otherMembers === 0;

  return (
    <>
      <PageHeader title={title} description={`${org.name} · ${ORG_ROLE_LABELS[viewer.orgRole]}`} />
      <ViewTabs active="home" config={tabsConfig} />
      {alone ? (
        <div className="mb-6">
          <InviteBanner />
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
