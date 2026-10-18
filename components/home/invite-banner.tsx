import { ArrowRight, UserPlus } from "lucide-react";
import Link from "next/link";

// The nudge on an admin's Home while nobody else is in the workspace: there is no team to track yet.

export function InviteBanner() {
  return (
    <Link
      href="/members"
      className="flex items-center gap-3 rounded-lg border border-status-in-progress-dot/30 bg-status-in-progress-bg px-4 py-3 text-sm text-status-in-progress-fg transition-colors hover:bg-status-in-progress-bg/70"
    >
      <UserPlus className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        <span className="font-medium">You&apos;re the only one here.</span> Invite your colleagues from the Members page.
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
