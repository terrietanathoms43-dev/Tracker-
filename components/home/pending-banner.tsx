import { ArrowRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";

// The nudge on Home when proposals wait for this person's signature; it opens the Proposals page.

export function ProposalsBanner({ count }: { count: number }) {
  return (
    <Link
      href="/proposals"
      className="flex items-center gap-3 rounded-lg border border-status-in-progress-dot/30 bg-status-in-progress-bg px-4 py-3 text-sm text-status-in-progress-fg transition-colors hover:bg-status-in-progress-bg/70"
      data-proposals-banner={count}
    >
      <ClipboardCheck className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        <span className="font-medium">
          {count} {count === 1 ? "proposal is" : "proposals are"} waiting for your sign-off.
        </span>{" "}
        Open the Proposals page.
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
