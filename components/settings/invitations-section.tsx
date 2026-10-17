"use client";

import { Link2, RotateCw, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { renewInvitationLink, resendInvitation, revokeInvitation, type InviteLink } from "@/actions/invitations";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";
import { InviteForm } from "./invite-form";
import { Section } from "./section";

// Invite people and look after pending invitations. Only a hash of each link is stored, so the links this
// browser has just been given (by Send, Resend or Copy new link) are kept in state here; any other row's
// "Copy new link" makes a fresh one.

export type InvitationRowData = {
  id: string;
  email: string;
  role: OrgRole;
  invitedByName: string | null;
  expired: boolean;
  /** "in 6 days", rendered on the server as <RelativeTime>. */
  expires: ReactNode;
  /** Admins manage every invitation, leaders the ones they sent. */
  canManage: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function InvitationRow({ invite, link, onLink }: { invite: InvitationRowData; link: string | undefined; onLink: (link: InviteLink) => void }) {
  const [pending, startTransition] = useTransition();

  function copy() {
    startTransition(async () => {
      let url = link;
      if (url === undefined) {
        const result = await renewInvitationLink({ id: invite.id });
        if (!toastResult(result)) return;
        onLink(result.data);
        url = result.data.url;
      }
      if (await copyText(url)) toast.success(link === undefined ? "New link copied. Earlier links for this invitation no longer work." : "Link copied.");
      // Clipboard refused (permissions, an old browser): show the link so it can be copied by hand.
      else toast.message("Copy this link", { description: url, duration: 20_000 });
    });
  }

  const meta = [ORG_ROLE_LABELS[invite.role], invite.invitedByName ? `invited by ${invite.invitedByName}` : null].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-48 flex-1">
        <p className="truncate text-[13px] font-medium">{invite.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meta} ·{" "}
          {invite.expired ? <span className="font-medium text-status-blocked-fg">Expired</span> : <>Expires {invite.expires}</>}
        </p>
      </div>
      {invite.canManage ? (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={copy}
            title={link === undefined ? "Makes a new link to copy. Links sent earlier for this invitation stop working." : undefined}
          >
            <Link2 aria-hidden />
            {link === undefined ? "Copy new link" : "Copy link"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await resendInvitation({ id: invite.id });
                if (toastResult(result)) onLink(result.data);
              })
            }
          >
            <RotateCw aria-hidden />
            Resend
          </Button>
          <ConfirmDialog
            title={`Revoke the invitation to ${invite.email}?`}
            description="The link stops working straight away. You can invite them again any time."
            confirmLabel="Revoke invitation"
            pending={pending}
            onConfirm={() => new Promise<boolean>((resolve) => startTransition(async () => resolve(toastResult(await revokeInvitation({ id: invite.id })))))}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Revoke invitation for ${invite.email}`} className="text-muted-foreground">
                <X />
              </Button>
            }
          />
        </div>
      ) : null}
    </li>
  );
}

export function InvitationsSection({ invitations, roles }: { invitations: InvitationRowData[]; roles: OrgRole[] }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const remember = (more: InviteLink[]) => setLinks((current) => ({ ...current, ...Object.fromEntries(more.map((each) => [each.id, each.url])) }));

  return (
    <Section id="invitations" title="Invitations" description="Each link works for 7 days. If an email doesn't arrive, copy the link and send it yourself.">
      <InviteForm roles={roles} onInvited={remember} className="border-b p-4 sm:p-5" />
      {invitations.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">No pending invitations.</p>
      ) : (
        <>
          <h3 className="px-4 pt-3 text-xs font-medium text-muted-foreground sm:px-5">Pending ({invitations.length})</h3>
          <ul className="divide-y">
            {invitations.map((invite) => (
              <InvitationRow key={invite.id} invite={invite} link={links[invite.id]} onLink={(link) => remember([link])} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
