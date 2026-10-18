import Link from "next/link";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { isRevisitDue } from "@/lib/requests/filters";
import type { RequestListItem } from "@/lib/requests/types";
import { nameOf } from "@/lib/tasks/people";
import { formatDay } from "@/lib/time";
import { DecideMenu } from "./decision-controls";
import { RequestStatusBadge, UrgencyGlyph } from "./request-badges";

// One request in a list: the requests page, the review queue's sections, Home's "Your requests".

/**
 * One request as an `<li>` (render it inside a `<ul>`): urgency · title · who asked and when (· when to revisit) ·
 * the decision's reason · its task · status · and, with `showControls`, a leader's Decide menu. The whole row opens
 * the request.
 */
export function RequestRow({
  request,
  now,
  today,
  timeZone,
  showControls = false,
  showRequester = true,
}: {
  request: RequestListItem;
  now: Date;
  today: string;
  timeZone: string;
  showControls?: boolean;
  /** Off where every row is the viewer's own (a stakeholder's "Your requests"). */
  showRequester?: boolean;
}) {
  const revisitDue = isRevisitDue(request, today);
  const reason = request.status !== "new" ? request.decisionReason : null;

  return (
    <li className="group relative flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:flex-nowrap sm:px-4">
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <UrgencyGlyph urgency={request.urgency} />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          href={`/requests/${request.id}`}
          prefetch={false}
          className="min-w-0 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <span className="block truncate text-[13px] leading-5 font-medium">{request.title}</span>
        </Link>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <RequestStatusBadge status={request.status} className="h-5 px-1.5 text-[11px] sm:hidden" />
          {showRequester ? (
            <>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <UserAvatar name={request.requester.name} email={request.requester.email} image={request.requester.image} size="sm" className="data-[size=sm]:size-5" />
                <span className="truncate">{nameOf(request.requester)}</span>
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span>
            {showRequester ? null : "Sent "}
            <RelativeTime date={new Date(request.createdAt)} timeZone={timeZone} now={now} className="relative" />
          </span>
          {request.status === "deferred" && request.deferUntil ? (
            <>
              <span aria-hidden>·</span>
              <span className={revisitDue ? "font-medium text-priority-high" : undefined}>{revisitDue ? "Revisit now" : `Revisit ${formatDay(request.deferUntil, today)}`}</span>
            </>
          ) : null}
        </p>
        {reason ? <p className="truncate text-xs text-muted-foreground">“{reason}”</p> : null}
      </div>
      {request.task ? (
        <Link
          href={`/tasks/${request.task.id}`}
          prefetch={false}
          className="relative z-10 hidden h-6 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          title={`Task: ${TASK_STATUS_LABELS[request.task.status]}`}
        >
          <StatusIcon status={request.task.status} className="size-3.5" />
          Task
        </Link>
      ) : null}
      <RequestStatusBadge status={request.status} className="relative hidden sm:inline-flex" />
      {/* On a phone the controls get their own line under the title, so the title keeps the full width. */}
      {showControls ? (
        <DecideMenu
          request={{ id: request.id, title: request.title, status: request.status, urgency: request.urgency }}
          className="relative z-10 basis-full pl-7 sm:-my-0.5 sm:basis-auto sm:pl-0"
        />
      ) : null}
    </li>
  );
}
