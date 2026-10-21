import type { Metadata } from "next";
import { InviteBanner } from "@/components/home/invite-banner";
import { LeaderHome, type LeaderHomeData } from "@/components/home/leader-home";
import { MemberHome } from "@/components/home/member-home";
import { NoWorkspaceHome } from "@/components/home/no-workspace-home";
import { StakeholderHome } from "@/components/home/stakeholder-home";
import { PageHeader } from "@/components/page-header";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { DEFAULT_TIMEZONE, ORG_ROLE_LABELS } from "@/lib/constants";
import { activeGoalProgress, teamFeed } from "@/lib/dal/dashboard";
import { listInvitationsForEmail } from "@/lib/dal/invitations";
import { getSetupState } from "@/lib/dal/orgs";
import { countPendingRequests, listRequests } from "@/lib/dal/requests";
import { attentionTasks, myWorkTasks, taskCounts, workload } from "@/lib/dal/tasks";
import { isAdmin, isLeader, isStakeholder, type Viewer } from "@/lib/permissions";
import { DEFAULT_PERIOD, periodStart } from "@/lib/team/period";
import { dayKey, greetingFor, safeTimeZone } from "@/lib/time";
import { getViewerContext, requireUser } from "@/lib/viewer";

// /home: the first screen, shaped by role (docs/PLAN.md §8, apex-ux §3). Members see their next steps; leaders and
// admins see the team's health above them; stakeholders see their requests. Without a workspace: how to get one.

export const metadata: Metadata = { title: "Home" };

const GOALS_SHOWN = 3;
const MEMBER_FEED_ROWS = 6;
const LEADER_FEED_ROWS = 8;

/** The reads only leaders and admins need, so a member's Home never runs them. Counts cover the last 30 days. */
async function loadLeaderData(viewer: Viewer, now: Date, today: string): Promise<LeaderHomeData> {
  const [pending, counts, attention, rows, feed] = await Promise.all([
    countPendingRequests(viewer),
    taskCounts(viewer, { today, since: periodStart(now, DEFAULT_PERIOD) }),
    attentionTasks(viewer, today),
    workload(viewer),
    teamFeed(viewer, LEADER_FEED_ROWS),
  ]);
  return { pending, counts, attention, workload: rows, feed };
}

/** "What needs me right now?", answered for the viewer's role. */
export default async function HomePage() {
  // Signed in first (a visitor is sent to /login); only then is the clock read, so the prerender never sees it.
  const user = await requireUser();
  const context = await getViewerContext();
  const now = new Date();

  if (context === null) {
    // Signed in, no workspace: the one screen that doesn't need one (docs/PLAN.md, 2026-10-18 log).
    const invitations = await listInvitationsForEmail(user.email);
    return (
      <NoWorkspaceHome
        firstName={(user.name ?? "").split(" ")[0] || null}
        email={user.email}
        invitations={invitations.map((invitation) => ({ ...invitation, expiresAt: invitation.expiresAt.toISOString() }))}
        now={now}
        timeZone={safeTimeZone(user.timezone ?? DEFAULT_TIMEZONE)}
      />
    );
  }

  const { viewer, org } = context;
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
      <QuickAddTask today={today} />
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
