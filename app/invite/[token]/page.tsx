import { Building2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOutToAcceptInvitation } from "@/actions/invitations";
import { AcceptInvitationButton } from "@/components/accept-invitation-button";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_NAME, ORG_ROLE_LABELS } from "@/lib/constants";
import { findInvitationByToken } from "@/lib/dal/invitations";
import { getSessionUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Invitation" };

/** A dead end with the next step: invalid, used, expired, or meant for another account. */
function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <div className="mb-5 grid size-11 place-items-center rounded-full bg-muted">
        <CircleAlert className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

function WorkspaceCard({ orgName, role }: { orgName: string; role: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
        <Building2 className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{orgName}</span>
        <span className="block truncate text-xs text-muted-foreground">Join as {role}</span>
      </span>
    </div>
  );
}

/**
 * The link is the credential, so this page reads the invitation by its token alone, then decides: not valid,
 * already used, expired, signed out (sign in first, then come back here), the wrong account, or ready to join.
 */
async function Invitation({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const [invite, user] = await Promise.all([findInvitationByToken(token), getSessionUser()]);
  const home = user ? (
    <Button asChild variant="outline">
      <Link href="/home">Go to {APP_NAME}</Link>
    </Button>
  ) : null;

  if (invite === null) {
    return (
      <Notice title="This link isn't valid" action={home}>
        The invitation may have been revoked, or replaced by a newer link. Ask whoever invited you to send it again.
      </Notice>
    );
  }
  if (invite.acceptedAt !== null) {
    return (
      <Notice
        title="Invitation already used"
        action={
          home ?? (
            <Button asChild variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          )
        }
      >
        This invitation to {invite.orgName} has already been accepted.{user ? null : " If that was you, sign in to get started."}
      </Notice>
    );
  }
  if (invite.expired) {
    return (
      <Notice title="This invitation has expired" action={home}>
        Invitations work for 7 days. Ask {invite.inviterName ?? `an admin of ${invite.orgName}`} to resend it.
      </Notice>
    );
  }

  const role = ORG_ROLE_LABELS[invite.role].toLowerCase();

  if (user === null) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold">You&apos;re invited</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {invite.inviterName ?? "Someone"} invited <strong className="font-medium text-foreground">{invite.email}</strong> to {APP_NAME}. Sign
          in with that address to accept.
        </p>
        <WorkspaceCard orgName={invite.orgName} role={role} />
        <Button asChild className="h-10 w-full">
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
        </Button>
      </div>
    );
  }

  if (user.email.toLowerCase() !== invite.email) {
    return (
      <Notice
        title="This invitation is for someone else"
        action={
          <form action={signOutToAcceptInvitation}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton variant="outline" pendingLabel="Signing out…">
              Sign out and switch account
            </SubmitButton>
          </form>
        }
      >
        It was sent to <strong className="font-medium text-foreground">{invite.email}</strong>, but you&apos;re signed in as{" "}
        <strong className="font-medium text-foreground">{user.email}</strong>. Sign in with the invited address to accept it.
      </Notice>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Join {invite.orgName}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {invite.inviterName ?? "An admin"} invited you as {role}.
      </p>
      <WorkspaceCard orgName={invite.orgName} role={role} />
      <AcceptInvitationButton token={token} />
    </div>
  );
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="grid gap-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-[74px] w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <Invitation params={props.params} />
      </Suspense>
    </AuthShell>
  );
}
