import type { Metadata } from "next";
import { RelativeTime } from "@/components/relative-time";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";
import { InvitationsSection } from "@/components/settings/invitations-section";
import { MembersSection } from "@/components/settings/members-section";
import { WorkspaceForm, WorkspaceSummary } from "@/components/settings/workspace-form";
import { listPendingInvitations } from "@/lib/dal/invitations";
import { listMembers } from "@/lib/dal/orgs";
import { invitableRoles, isAdmin } from "@/lib/permissions";
import { formatShortDate, timeZoneOptions } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Workspace" };

/**
 * Settings → Workspace. Admins change the name and timezone, roles, invitations and can delete it; leaders
 * also invite people; everyone else reads who is here.
 */
export default async function WorkspaceSettingsPage() {
  const { viewer, org } = await requireViewerContext();
  const admin = isAdmin(viewer);
  const roles = invitableRoles(viewer);
  const [members, invitations] = await Promise.all([listMembers(viewer), roles.length > 0 ? listPendingInvitations(viewer) : Promise.resolve([])]);
  const now = new Date();
  const facts = [`${members.length} ${members.length === 1 ? "member" : "members"}`, org.timezone.replaceAll("_", " ")].join(" · ");

  return (
    <div className="grid gap-6">
      {admin ? (
        <WorkspaceForm name={org.name} timezone={org.timezone} zones={timeZoneOptions()} facts={facts} />
      ) : (
        <WorkspaceSummary name={org.name} facts={`${facts} · Only admins can change workspace settings.`} />
      )}

      <MembersSection
        orgName={org.name}
        viewerId={viewer.userId}
        canManage={admin}
        members={members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          image: member.image,
          role: member.role,
          joined: formatShortDate(member.joinedAt, viewer.timezone, true),
        }))}
      />

      {roles.length > 0 ? (
        <InvitationsSection
          roles={roles}
          invitations={invitations.map((invite) => ({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            invitedByName: invite.invitedByName,
            expired: invite.expiresAt <= now,
            expires: <RelativeTime date={invite.expiresAt} timeZone={viewer.timezone} now={now} />,
            canManage: admin || invite.invitedBy === viewer.userId,
          }))}
        />
      ) : null}

      {admin ? <DeleteWorkspace orgName={org.name} /> : null}
    </div>
  );
}
