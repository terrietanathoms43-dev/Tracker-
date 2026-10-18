import { cn } from "cn";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { AssigneeStack } from "@/components/tasks/assignee-stack";
import { PanelEmpty } from "@/components/team/panel";
import type { TeamListItem } from "@/lib/dal/teams";

// The teams of the workspace as cards: who is in each, what it holds, and a link to its page.

/** "3 open · 1 blocked · 2 overdue", trouble in the status colour; "Nothing open" when idle. */
export function WorkCounts({ work, className }: { work: TeamListItem["work"]; className?: string }) {
  if (work.active === 0) return <span className={cn("text-xs text-muted-foreground", className)}>Nothing open</span>;
  return (
    <span className={cn("flex flex-wrap gap-x-2 text-xs tabular-nums", className)}>
      <span className="font-medium">{work.active} open</span>
      {work.blocked > 0 ? <span className="font-medium text-status-blocked-fg">{work.blocked} blocked</span> : null}
      {work.overdue > 0 ? <span className="font-medium text-status-blocked-fg">{work.overdue} overdue</span> : null}
    </span>
  );
}

/** One team per card; the whole card opens the team page. */
export function TeamCards({ teams, empty }: { teams: TeamListItem[]; empty: string }) {
  if (teams.length === 0) return <PanelEmpty>{empty}</PanelEmpty>;
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => (
        <li key={team.id} className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
              <UsersRound className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/teams/${team.id}`}
                className="block truncate text-[13px] font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {team.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {team.members.length} {team.members.length === 1 ? "member" : "members"}
                {team.goals > 0 ? ` · ${team.goals} ${team.goals === 1 ? "goal" : "goals"}` : ""}
              </p>
            </div>
          </div>
          {team.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{team.description}</p> : null}
          <div className="mt-auto flex items-center justify-between gap-3">
            {team.members.length > 0 ? <AssigneeStack assignees={{ people: team.members, teams: [] }} /> : <span className="text-xs text-muted-foreground">No members yet</span>}
            <WorkCounts work={team.work} className="justify-end text-right" />
          </div>
        </li>
      ))}
    </ul>
  );
}
