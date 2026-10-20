import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RelativeTime } from "@/components/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import type { PhrasedDecision } from "@/lib/requests/decisions";
import { isRevisitDue } from "@/lib/requests/filters";
import type { RequestDetail } from "@/lib/requests/types";
import { nameOf } from "@/lib/tasks/people";
import { formatDay } from "@/lib/time";
import { RequestStatusBadge, UrgencyBadge } from "./request-badges";

// The parts of the request page: who asked for what, where the decision stands, the ask itself, and its history.

type Clock = { now: Date; timeZone: string };

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-xl border bg-card">
      <h2 id={`${id}-heading`} className="border-b px-5 py-3 text-base font-semibold md:px-6">
        {title}
      </h2>
      <div className="grid gap-4 px-5 py-4 md:px-6">{children}</div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium text-muted-foreground">{children}</p>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Back link, title, urgency, who asked and when. */
export function RequestHeader({ detail, now, timeZone }: { detail: RequestDetail } & Clock) {
  return (
    <header className="mb-5">
      <Link href="/requests" className="inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Requests
      </Link>
      <h1 className="mt-2 text-xl leading-snug font-semibold tracking-tight md:text-2xl">{detail.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
        <UrgencyBadge urgency={detail.urgency} />
        <span className="inline-flex items-center gap-1.5">
          <UserAvatar name={detail.requester.name} email={detail.requester.email} image={detail.requester.image} size="sm" className="data-[size=sm]:size-5" />
          <span className="text-foreground">{nameOf(detail.requester)}</span>
        </span>
        <span>
          submitted <RelativeTime date={new Date(detail.createdAt)} timeZone={timeZone} now={now} />
        </span>
      </div>
    </header>
  );
}

/** One sentence on where the decision stands, person first like the history: who decided, when, what happens next. */
function StatusLine({ detail, today, now, timeZone }: { detail: RequestDetail; today: string } & Clock) {
  const by = nameOf(detail.decidedBy, "A leader");
  const at = detail.decidedAt ? <RelativeTime date={new Date(detail.decidedAt)} timeZone={timeZone} now={now} /> : null;
  const latest = detail.decisions[0];
  switch (detail.status) {
    case "new":
      return latest?.decision === "reopened" ? (
        <>
          {nameOf(latest.decider)} reopened it <RelativeTime date={new Date(latest.at)} timeZone={timeZone} now={now} />. It&apos;s waiting for a decision.
        </>
      ) : (
        <>Waiting for a leader to decide.</>
      );
    case "approved":
      return (
        <>
          {by} approved it {at}. It becomes a task when a leader converts it.
        </>
      );
    case "deferred":
      return (
        <>
          {by} deferred it {at}
          {detail.deferUntil ? `, to revisit on ${formatDay(detail.deferUntil, today)}` : ""}.
          {isRevisitDue(detail, today) ? <span className="font-medium text-priority-high"> The revisit date has come.</span> : null}
        </>
      );
    case "rejected":
      return (
        <>
          {by} rejected it {at}.
        </>
      );
    case "converted":
      return (
        <>
          {by} turned it into a task {at}.
        </>
      );
  }
}

/** The decision as it stands, with its reason and (for leaders) the controls to make the next one. */
export function DecisionSummary({ detail, today, now, timeZone, controls }: { detail: RequestDetail; today: string; controls: ReactNode } & Clock) {
  return (
    <section aria-label="Decision" className="rounded-xl border bg-card px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <RequestStatusBadge status={detail.status} />
        <p className="min-w-0 flex-1 basis-60 text-base">
          <StatusLine detail={detail} today={today} now={now} timeZone={timeZone} />
        </p>
      </div>
      {detail.decisionReason ? <p className="mt-3 text-base whitespace-pre-line text-muted-foreground">“{detail.decisionReason}”</p> : null}
      {controls ? <div className="mt-4 border-t pt-4">{controls}</div> : null}
    </section>
  );
}

/** What was asked for: why it matters, the details, and the supporting link. */
export function RequestAsk({ detail }: { detail: RequestDetail }) {
  return (
    <Card id="ask" title="The ask">
      <div className="grid gap-1.5">
        <Label>Why it matters</Label>
        {detail.desiredOutcome ? <p className="text-base whitespace-pre-line">{detail.desiredOutcome}</p> : <p className="text-base text-muted-foreground">Not given.</p>}
      </div>
      <div className="grid gap-1.5">
        <Label>Details</Label>
        {detail.description ? <p className="text-base whitespace-pre-line">{detail.description}</p> : <p className="text-base text-muted-foreground">No further details.</p>}
      </div>
      {detail.link ? (
        <a
          href={detail.link}
          target="_blank"
          rel="noopener noreferrer"
          title={detail.link}
          className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[13px] hover:bg-accent"
        >
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{hostOf(detail.link)}</span>
        </a>
      ) : null}
    </Card>
  );
}

/** Every decision ever made on the request, newest first: "Morgan Lead deferred it until Oct 30: waiting on budget". */
export function DecisionHistory({ decisions, now, timeZone }: { decisions: PhrasedDecision[] } & Clock) {
  return (
    <Card id="history" title="Decision history">
      {decisions.length === 0 ? (
        <p className="text-base text-muted-foreground">No decisions yet.</p>
      ) : (
        <ol className="grid gap-3">
          {decisions.map((decision) => (
            <li key={decision.id} className="flex gap-3">
              <UserAvatar name={decision.decider.name} email={decision.decider.email} image={decision.decider.image} size="sm" className="mt-0.5" />
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <p className="min-w-0 text-base">
                  <span className="font-medium">{nameOf(decision.decider)}</span> {decision.verb}
                  {decision.reason ? <span className="text-muted-foreground">: {decision.reason}</span> : null}
                </p>
                <RelativeTime date={new Date(decision.at)} timeZone={timeZone} now={now} className="shrink-0 text-[13px] text-muted-foreground" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
