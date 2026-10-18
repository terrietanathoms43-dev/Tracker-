import { cn } from "cn";
import Link from "next/link";
import { TeamChip } from "@/components/tasks/assignee-stack";
import { PanelEmpty } from "@/components/team/panel";
import { UserAvatar } from "@/components/user-avatar";
import { ORG_ROLE_LABELS } from "@/lib/constants";
import type { MemberDirectoryRow } from "@/lib/dal/teams";
import { tasksHref } from "@/lib/tasks/filters";
import { nameOf } from "@/lib/tasks/people";

// The roster: one row per member with their role, teams and the open work assigned to them directly. Roles are
// changed under Settings → Workspace; this page is for seeing who does what.

/** "2 open · 1 overdue" for a person; stakeholders and idle people say so in words. */
function Work({ row }: { row: MemberDirectoryRow }) {
  if (row.role === "stakeholder") return <span className="text-xs text-muted-foreground">Submits requests</span>;
  if (row.work.active === 0) return <span className="text-xs text-muted-foreground">Nothing open</span>;
  return (
    <span className="flex flex-wrap justify-end gap-x-2 text-xs tabular-nums">
      <span className="font-medium">{row.work.active} open</span>
      {row.work.blocked > 0 ? <span className="font-medium text-status-blocked-fg">{row.work.blocked} blocked</span> : null}
      {row.work.overdue > 0 ? <span className="font-medium text-status-blocked-fg">{row.work.overdue} overdue</span> : null}
    </span>
  );
}

export function MemberDirectory({ rows, viewerId }: { rows: MemberDirectoryRow[]; viewerId: string }) {
  if (rows.length === 0) return <PanelEmpty>Nobody is in this workspace yet.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const worker = row.role !== "stakeholder";
        return (
          <li key={row.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <UserAvatar name={row.name} email={row.email} image={row.image} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">
                {worker ? (
                  <Link href={tasksHref({ assignee: row.id })} className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" title="Their open tasks">
                    {nameOf(row)}
                  </Link>
                ) : (
                  nameOf(row)
                )}
                {row.id === viewerId ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {ORG_ROLE_LABELS[row.role]}
                <span className="hidden sm:inline"> · {row.email}</span>
              </p>
            </div>
            <Work row={row} />
            {row.teams.length > 0 ? (
              <div className={cn("col-span-2 col-start-2 flex flex-wrap gap-1")} aria-label="Teams">
                {row.teams.map((team) => (
                  <Link key={team.id} href={`/teams/${team.id}`} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <TeamChip name={team.name} />
                  </Link>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
