import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@/components/dashboard/panel";
import { InviteDialog } from "@/components/members/invite-dialog";
import { MemberDirectory } from "@/components/members/member-directory";
import { PageHeader } from "@/components/page-header";
import { listPendingInvitations } from "@/lib/dal/invitations";
import { memberDirectory } from "@/lib/dal/members";
import { canSeeMembers, invitableRoles, isAdmin } from "@/lib/permissions";
import { requireViewerContext } from "@/lib/viewer";

// /members: who is in the workspace and what each person holds (docs/PLAN.md §8).

export const metadata: Metadata = { title: "Members" };

/** "Who is here, and who holds what?": every member with their role and open work; invite from here. */
export default async function MembersPage() {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeMembers(viewer)) redirect("/home");
  const roles = invitableRoles(viewer);
  const [members, invitations] = await Promise.all([memberDirectory(viewer), roles.length > 0 ? listPendingInvitations(viewer) : Promise.resolve([])]);
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <PageHeader
        title="Members"
        description={`${org.name} · ${count(members.length, "member")}${invitations.length > 0 ? ` · ${count(invitations.length, "invitation")} pending` : ""}`}
        action={roles.length > 0 ? <InviteDialog roles={roles} /> : null}
      />

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
    </>
  );
}
