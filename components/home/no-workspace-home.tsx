"use client";

import { Building2, Mail } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { acceptListedInvitation } from "@/actions/invitations";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";

// Home for a signed-in person with no workspace (docs/PLAN.md, 2026-10-18 log): start one, or join the
// workspace that invited them. Everything else in the app needs a workspace, so this is the whole screen.

export type ListedInvitation = { id: string; orgName: string; role: OrgRole; inviterName: string | null; expiresAt: string };

function AcceptButton({ invitation }: { invitation: ListedInvitation }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => startTransition(async () => void toastResult(await acceptListedInvitation({ id: invitation.id })))}>
      {pending ? "Joining…" : `Join ${invitation.orgName}`}
    </Button>
  );
}

export function NoWorkspaceHome({ firstName, email, invitations, now, timeZone }: { firstName: string | null; email: string; invitations: ListedInvitation[]; now: Date; timeZone: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Welcome${firstName ? `, ${firstName}` : ""}`} description="You're not in a workspace yet. A workspace holds a team's tasks, goals and requests." />
      <div className="grid gap-4">
        {invitations.length > 0 ? (
          <section aria-labelledby="invitations-heading" className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <Mail className="size-4 text-muted-foreground" aria-hidden />
              <h2 id="invitations-heading" className="text-sm font-semibold">
                You&apos;ve been invited
              </h2>
            </div>
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{invitation.orgName}</p>
                    <p className="text-xs text-muted-foreground">
                      As {ORG_ROLE_LABELS[invitation.role].toLowerCase()}
                      {invitation.inviterName ? ` · invited by ${invitation.inviterName}` : ""} · expires{" "}
                      <RelativeTime date={new Date(invitation.expiresAt)} now={now} timeZone={timeZone} />
                    </p>
                  </div>
                  <AcceptButton invitation={invitation} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="create-heading" className="rounded-lg border bg-card p-5">
          <div className="mb-3 grid size-9 place-items-center rounded-md bg-secondary">
            <Building2 className="size-4" aria-hidden />
          </div>
          <h2 id="create-heading" className="text-sm font-semibold">
            Start a workspace
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">Create one for your team and invite people to it. You become its admin.</p>
          <Button asChild variant={invitations.length > 0 ? "outline" : "default"} className="mt-4">
            <Link href="/onboarding">Create a workspace</Link>
          </Button>
        </section>

        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Joining a team that already uses Trackwise? Ask one of its admins or leaders to invite <span className="text-foreground">{email}</span>. The invitation
            shows up here, and the link in the email works too.
          </p>
        ) : null}
      </div>
    </div>
  );
}
