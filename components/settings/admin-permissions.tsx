import { Check } from "lucide-react";
import { PermissionToggleForm } from "@/components/settings/permission-toggle-form";
import { ORG_ROLES, type OrgRole } from "@/lib/constants";
import {
  canApproveTask,
  canCompleteGoal,
  canCreatePlanning,
  canCreateTask,
  canDeleteTask,
  canEditTask,
  canInvite,
  canManageOrg,
  canUpdateProgress,
  type PermissionToggles,
  type TaskScope,
  type Viewer,
} from "@/lib/permissions";
import { Section } from "./section";

// Admins: the workspace's permission matrix — who may do what, computed by the same predicates the actions
// call — and the switches that loosen three of the rules for this workspace. A cell is the predicate's own
// answer, so the matrix can never drift from what the app actually enforces.

const ROLE_LABELS: Record<OrgRole, string> = { member: "Member", leader: "Leader", admin: "Admin", stakeholder: "Stakeholder" };

const viewer = (role: OrgRole, toggles: PermissionToggles): Viewer => ({ userId: "me", orgId: "x", orgRole: role, timezone: "UTC", toggles });
const task = (createdBy: string): TaskScope => ({ orgId: "x", assigneeIds: [], createdBy, approverId: null, proposalStatus: null });

const CAPABILITIES: { label: string; check: (viewer: Viewer) => boolean }[] = [
  { label: "Add tasks", check: canCreateTask },
  { label: "Update progress and comment", check: (v) => canUpdateProgress(v, task("other")) },
  { label: "Edit and assign tasks", check: (v) => canEditTask(v, task("other")) },
  { label: "Delete a task they created", check: (v) => canDeleteTask(v, task("me")) },
  { label: "Create projects and goals", check: canCreatePlanning },
  { label: "Approve and send back tasks", check: (v) => canApproveTask(v, task("other")) },
  { label: "Complete goals", check: canCompleteGoal },
  { label: "Invite people", check: (v) => canInvite(v, "member") },
  { label: "Workspace settings", check: canManageOrg },
];

export function PermissionsCard({ overrides }: { overrides: PermissionToggles }) {
  return (
    <Section id="permissions" title="Roles and permissions" description="Who may do what in this workspace. The switches below loosen three rules for everyone; the rest are fixed.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-4 py-2.5 font-medium sm:px-5">Capability</th>
              {ORG_ROLES.map((role) => (
                <th key={role} className="px-3 py-2.5 text-center font-medium">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {CAPABILITIES.map(({ label, check }) => (
              <tr key={label}>
                <td className="px-4 py-2.5 sm:px-5">{label}</td>
                {ORG_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2.5 text-center">
                    {check(viewer(role, overrides)) ? <Check className="mx-auto size-4 text-primary" aria-label={`${ROLE_LABELS[role]} may`} /> : <span className="text-muted-foreground/50">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t">
        <PermissionToggleForm initial={{ membersCanPlan: overrides.membersCanPlan === true, membersCanInvite: overrides.membersCanInvite === true, membersCanDeleteOwnTasks: overrides.membersCanDeleteOwnTasks === true }} />
      </div>
    </Section>
  );
}
