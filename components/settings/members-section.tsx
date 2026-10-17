"use client";

import { Trash2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { changeRole, removeMember } from "@/actions/members";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { ORG_ROLE_LABELS, ORG_ROLES, type OrgRole } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// The workspace's people. Admins change roles inline and remove people behind a confirmation; everyone else
// reads the same list. The sole admin's own role is locked here as well as on the server.

export type MemberRowData = { userId: string; name: string | null; email: string; image: string | null; role: OrgRole; joined: string };

function MemberRow({ member, orgName, isSelf, canManage, roleLocked }: { member: MemberRowData; orgName: string; isSelf: boolean; canManage: boolean; roleLocked: boolean }) {
  const [pending, startTransition] = useTransition();
  // Shows the chosen role at once; falls back to the server's value when the action finishes (or fails).
  const [role, setRole] = useOptimistic(member.role);
  const label = member.name ?? member.email;

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:flex sm:px-5">
      <UserAvatar name={member.name} email={member.email} image={member.image} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">
          {label}
          {isSelf ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {member.email}
          <span className="hidden sm:inline"> · Joined {member.joined}</span>
        </p>
      </div>
      {canManage ? (
        <div className="col-start-2 flex items-center gap-1.5 sm:ml-auto">
          <NativeSelect
            aria-label={`Role for ${label}`}
            title={roleLocked ? "You're the only admin" : undefined}
            className="w-36"
            value={role}
            disabled={pending || roleLocked}
            onChange={(event) => {
              const next = event.target.value as OrgRole;
              startTransition(async () => {
                setRole(next);
                toastResult(await changeRole({ userId: member.userId, role: next }));
              });
            }}
          >
            {ORG_ROLES.map((each) => (
              <option key={each} value={each}>
                {ORG_ROLE_LABELS[each]}
              </option>
            ))}
          </NativeSelect>
          {isSelf ? (
            <span className="size-9" aria-hidden />
          ) : (
            <ConfirmDialog
              title={`Remove ${label} from ${orgName}?`}
              description="They lose access straight away. Their open tasks become unassigned; their updates and history stay."
              confirmLabel="Remove member"
              pending={pending}
              onConfirm={() =>
                new Promise<boolean>((resolve) => startTransition(async () => resolve(toastResult(await removeMember({ userId: member.userId })))))
              }
              trigger={
                <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} className="text-muted-foreground">
                  <Trash2 />
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <span className="col-start-2 text-xs text-muted-foreground sm:ml-auto">{ORG_ROLE_LABELS[member.role]}</span>
      )}
    </li>
  );
}

export function MembersSection({ members, orgName, viewerId, canManage }: { members: MemberRowData[]; orgName: string; viewerId: string; canManage: boolean }) {
  const adminCount = members.filter((member) => member.role === "admin").length;
  return (
    <Section
      id="members"
      title={`Members (${members.length})`}
      description={canManage ? "Roles apply to this workspace only. Stakeholders see just their own requests." : "Only admins can change roles or remove people."}
    >
      <ul className="divide-y">
        {members.map((member) => {
          const isSelf = member.userId === viewerId;
          return (
            <MemberRow
              key={member.userId}
              member={member}
              orgName={orgName}
              isSelf={isSelf}
              canManage={canManage}
              roleLocked={isSelf && member.role === "admin" && adminCount <= 1}
            />
          );
        })}
      </ul>
    </Section>
  );
}
