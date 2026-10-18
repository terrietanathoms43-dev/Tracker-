import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanningHeader } from "@/components/goals/planning-header";
import { TaskList } from "@/components/tasks/task-list";
import { GoalProgressList } from "@/components/team/goal-progress";
import { Panel, PanelEmpty } from "@/components/team/panel";
import { DeleteTeamButton } from "@/components/teams/delete-team-button";
import { WorkCounts } from "@/components/teams/team-cards";
import { TeamDialog } from "@/components/teams/team-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { goalsForTeam } from "@/lib/dal/goals";
import { listWorkers } from "@/lib/dal/orgs";
import { openTasksForTeam } from "@/lib/dal/tasks";
import { getTeam } from "@/lib/dal/teams";
import { canManageTeams, isLeader } from "@/lib/permissions";
import { tasksHref } from "@/lib/tasks/filters";
import { nameOf } from "@/lib/tasks/people";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /teams/[id]: one team, what it is expected to deliver, and who is in it.

export const metadata: Metadata = { title: "Team" };

/** "What is this team on the hook for, and who is in it?" Open work first, then its goals, then the people. */
export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const manage = canManageTeams(viewer);
  // One round trip; nothing renders unless getTeam finds the team in this workspace (a foreign id is Not found).
  const [team, tasks, goals, workers] = await Promise.all([getTeam(viewer, id), openTasksForTeam(viewer, id), goalsForTeam(viewer, id), manage ? listWorkers(viewer) : []]);
  if (team === null) notFound();
  const today = dayKey(new Date(), viewer.timezone);
  const people = workers.map(({ userId, name, email, image }) => ({ id: userId, name, email, image }));

  return (
    <div className="mx-auto max-w-3xl">
      <PlanningHeader
        back={{ href: "/members", label: "Members" }}
        title={team.name}
        actions={
          manage ? (
            <>
              <TeamDialog team={{ id: team.id, name: team.name, description: team.description, memberIds: team.members.map((member) => member.id) }} people={people} />
              <DeleteTeamButton teamId={team.id} name={team.name} openTasks={team.work.active} />
            </>
          ) : null
        }
        meta={
          <>
            <span>
              {team.members.length} {team.members.length === 1 ? "member" : "members"}
            </span>
            <WorkCounts work={team.work} />
            {team.goals > 0 ? (
              <span>
                {team.goals} active {team.goals === 1 ? "goal" : "goals"}
              </span>
            ) : null}
          </>
        }
      />
      {team.description ? <p className="mb-6 max-w-prose text-sm text-muted-foreground">{team.description}</p> : null}

      <div className="grid gap-6">
        <Panel title="Open work" count={tasks.length} href={tasksHref({ team: team.id })} hrefLabel="All in Tasks">
          {tasks.length === 0 ? (
            <PanelEmpty>Nothing is assigned to {team.name} right now. Pick the team in a task&apos;s &quot;Assigned to&quot; and it shows up here, and in every member&apos;s My Work.</PanelEmpty>
          ) : (
            <TaskList page={{ items: tasks, nextCursor: null }} today={today} showReason={false} readOnly={!isLeader(viewer)} />
          )}
        </Panel>

        <Panel title="Goals" count={goals.length}>
          <GoalProgressList
            goals={goals.map((goal) => ({ id: goal.id, title: goal.title, targetDate: goal.targetDate, ...goal.progress }))}
            today={today}
            empty={`${team.name} owns no goal yet. A leader can name it on a goal.`}
          />
        </Panel>

        <Panel title="Members" count={team.members.length}>
          {team.members.length === 0 ? (
            <PanelEmpty>{manage ? "Nobody is in this team yet. Edit it to add people." : "Nobody is in this team yet."}</PanelEmpty>
          ) : (
            <ul className="divide-y">
              {team.members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <UserAvatar name={member.name} email={member.email} image={member.image} size="sm" />
                  <Link href={tasksHref({ assignee: member.id })} className="min-w-0 flex-1 truncate text-[13px] font-medium underline-offset-4 hover:underline" title="Their open tasks">
                    {nameOf(member)}
                    {member.id === viewer.userId ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
