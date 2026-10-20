import { BarChart3, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/team/panel";
import { InviteDialog } from "@/components/teams/invite-dialog";
import { MemberDirectory } from "@/components/teams/member-directory";
import { TeamCards } from "@/components/teams/team-cards";
import { TeamDialog } from "@/components/teams/team-dialog";
import { Button } from "@/components/ui/button";
import { listPendingInvitations } from "@/lib/dal/invitations";
import { listTeams, memberDirectory } from "@/lib/dal/teams";
import { canManageTeams, canSeeMembers, invitableRoles, isAdmin } from "@/lib/permissions";
import { reportHref } from "@/lib/reports/params";
import { lastDays } from "@/lib/reports/range";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /members: who is in the workspace and how they are grouped (docs/PLAN.md §8, 2026-10-18 log).

export const metadata: Metadata = { title: "Members" };

/** "Who is here, which teams exist, and who holds what?": the teams first, then every member with their work. */
export default async function MembersPage() {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeMembers(viewer)) redirect("/home");
  const manage = canManageTeams(viewer);
  const roles = invitableRoles(viewer);
  const [members, teams, invitations] = await Promise.all([memberDirectory(viewer), listTeams(viewer), roles.length > 0 ? listPendingInvitations(viewer) : Promise.resolve([])]);
  const workers = members.filter((member) => member.role !== "stakeholder").map(({ id, name, email, image }) => ({ id, name, email, image }));
  const today = dayKey(new Date(), viewer.timezone);
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <PageHeader
        title="Members"
        description={`${org.name} · ${count(members.length, "member")} · ${count(teams.length, "team")}${invitations.length > 0 ? ` · ${count(invitations.length, "invitation")} pending` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={reportHref("/reports", lastDays(30, today))} title="The report for the last 30 days">
                <BarChart3 aria-hidden />
                Report
              </Link>
            </Button>
            {roles.length > 0 ? <InviteDialog roles={roles} /> : null}
          </div>
        }
      />

      <div className="grid gap-6">
        <Panel title="Teams" count={teams.length} aside={manage ? <TeamDialog people={workers} variant="outline" size="sm" /> : undefined}>
          <TeamCards
            teams={teams}
            empty={manage ? "No teams yet. A team is a group of members you can assign work to, like Design or Ops." : "No teams yet. A leader can create one and put you in it."}
          />
        </Panel>

        <Panel
          title="Members"
          count={members.length}
          aside={
            isAdmin(viewer) ? (
              <Link href="/settings/workspace#members" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                <Settings2 className="size-3.5" aria-hidden />
                Roles and invitations
              </Link>
            ) : undefined
          }
        >
          <MemberDirectory rows={members} viewerId={viewer.userId} />
        </Panel>
      </div>
    </>
  );
}
