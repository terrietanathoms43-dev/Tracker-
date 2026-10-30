import { CheckCircle2, Clock, MessageSquareWarning, OctagonAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { RelativeTime } from "@/components/relative-time";
import { nameOf } from "@/lib/tasks/people";
import type { EvidenceLink, TaskAbilities, TaskDetail, UpdateContext } from "@/lib/tasks/types";
import { EvidenceChips } from "../evidence-chips";
import { AddLink } from "./add-link";
import { InlineUpdate } from "./inline-update";
import { ApprovalActions, UnblockButton } from "./resume-actions";

// The Resume card: where a task stands, first on its page.

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium text-muted-foreground">{children}</p>;
}

/** The strip at the top of the card for the states that need someone: blocked, awaiting approval, or closed. */
function StatusStrip({ detail, abilities, timeZone, now }: { detail: TaskDetail; abilities: TaskAbilities; timeZone: string; now: Date }) {
  if (detail.status === "blocked") {
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-status-blocked-dot/30 bg-status-blocked-bg px-5 py-3 text-status-blocked-fg md:px-6">
        <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 basis-48 text-base">
          <p>
            <span className="font-medium">Blocked</span>
            {detail.blockedReason ? ` · ${detail.blockedReason}` : ""}
          </p>
          {detail.blockedBy ? <p className="mt-0.5 text-[13px] opacity-80">Who or what unblocks it: {detail.blockedBy}</p> : null}
        </div>
        {abilities.progress ? <UnblockButton taskId={detail.id} /> : null}
      </div>
    );
  }
  if (detail.status === "awaiting_approval") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-status-awaiting-dot/30 bg-status-awaiting-bg px-5 py-3 text-status-awaiting-fg md:px-6">
        <Clock className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-base">
          <span className="font-medium">Awaiting approval</span>
          {detail.approver ? ` from ${nameOf(detail.approver)}` : ""}
        </p>
        {abilities.approve ? <ApprovalActions taskId={detail.id} openComments={detail.openComments} /> : null}
      </div>
    );
  }
  if (detail.status === "completed") {
    return (
      <div className="flex items-start gap-3 border-b border-status-completed-dot/30 bg-status-completed-bg px-5 py-3 text-base text-status-completed-fg md:px-6">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">
            Completed{detail.completedAt ? " " : ""}
            {detail.completedAt ? <RelativeTime date={new Date(detail.completedAt)} timeZone={timeZone} now={now} /> : null}
          </p>
          {detail.completionSummary ? <p className="mt-0.5 whitespace-pre-line opacity-90">{detail.completionSummary}</p> : null}
        </div>
      </div>
    );
  }
  if (detail.status === "rejected") {
    return (
      <div className="flex items-start gap-3 border-b bg-status-rejected-bg px-5 py-3 text-base text-status-rejected-fg md:px-6">
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-medium">Rejected</span>
          {detail.rejectionReason ? ` · ${detail.rejectionReason}` : ""}
        </p>
      </div>
    );
  }
  return null;
}

/**
 * The Resume card (docs/PLAN.md §5, apex-ux §2), first on the task page: what happens next (largest type on the
 * page), what happened last, what is in the way, the proof, who updated it and when, and the form to add the
 * next update. An interrupted task can be picked up without reading its history.
 */
export function ResumeCard({
  detail,
  links,
  removableLinks,
  abilities,
  updateContext,
  timeZone,
  now,
}: {
  detail: TaskDetail;
  links: EvidenceLink[];
  removableLinks: string[];
  abilities: TaskAbilities;
  /** Present when the viewer may update progress: the inline form's context. */
  updateContext: UpdateContext | null;
  timeZone: string;
  now: Date;
}) {
  const closed = detail.status === "completed" || detail.status === "rejected";
  return (
    <section aria-label="Where this task stands" className="overflow-hidden rounded-xl border bg-card">
      <StatusStrip detail={detail} abilities={abilities} timeZone={timeZone} now={now} />
      <div className="grid gap-5 px-5 py-5 md:px-6">
        <div className="grid gap-1.5">
          <Label>Next action</Label>
          {detail.nextAction ? (
            <p className="text-lg leading-snug font-semibold whitespace-pre-line">{detail.nextAction}</p>
          ) : (
            <p className="text-base text-muted-foreground">
              {closed ? "Nothing left to do." : abilities.progress ? "No next action yet. Leave one below so you know where to pick up." : "No next action recorded yet."}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label>Latest progress</Label>
          {detail.latestProgress ? (
            <p className="text-base leading-relaxed whitespace-pre-line">{detail.latestProgress}</p>
          ) : (
            <p className="text-base text-muted-foreground">No progress recorded yet.</p>
          )}
        </div>
        {links.length > 0 ? (
          <div className="grid gap-1.5">
            <Label>Evidence</Label>
            <EvidenceChips taskId={detail.id} links={links} removable={removableLinks} />
          </div>
        ) : null}
        {!closed && detail.openComments > 0 ? (
          <a href="#history-heading" className="flex items-center gap-2 rounded-md text-[13px] text-status-awaiting-fg underline-offset-4 hover:underline">
            <MessageSquareWarning className="size-4 shrink-0" aria-hidden />
            {detail.openComments === 1 ? "1 open comment" : `${detail.openComments} open comments`} to resolve before this task can be completed
          </a>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-[13px] text-muted-foreground">
            {detail.lastUpdate ? (
              <>
                Updated by {nameOf(detail.lastUpdate.author)} · <RelativeTime date={new Date(detail.lastUpdate.at)} timeZone={timeZone} now={now} />
              </>
            ) : (
              "No updates yet."
            )}
          </p>
          {abilities.progress ? <AddLink taskId={detail.id} /> : null}
        </div>
      </div>
      {updateContext ? <InlineUpdate context={updateContext} fresh={detail.lastUpdate === null} /> : null}
    </section>
  );
}
