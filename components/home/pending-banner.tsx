import { ArrowRight, Inbox } from "lucide-react";
import Link from "next/link";

// The leader's nudge on Home when requests wait for a decision; it opens the review queue on /requests.

export function PendingBanner({ count }: { count: number }) {
  return (
    <Link
      href="/requests"
      className="flex items-center gap-3 rounded-lg border border-status-in-progress-dot/30 bg-status-in-progress-bg px-4 py-3 text-sm text-status-in-progress-fg transition-colors hover:bg-status-in-progress-bg/70"
    >
      <Inbox className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        <span className="font-medium">
          {count} {count === 1 ? "request is" : "requests are"} waiting for your decision.
        </span>{" "}
        Open the review.
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
