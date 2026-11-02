import { Inbox } from "lucide-react";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { RequestRow } from "@/components/requests/request-row";
import { ApprovalStaging } from "@/components/tasks/approval-staging";
import type { PendingDecisions } from "@/lib/reports/data";
import type { ReportProject } from "@/lib/reports/params";

// What is waiting for a leader to decide (docs/PLAN.md, 2026-11-01 log): the tasks awaiting approval, with the
// same evidence-first list a leader's Home shows and the same Approve / Send back, then the requests nobody has
// answered, each with its Decide menu. Requests belong to no project, so a project report says where they went.

export function DecisionsPanel({
  decisions,
  project,
  canDecide,
  now,
  today,
  timeZone,
}: {
  decisions: PendingDecisions;
  project: ReportProject;
  canDecide: boolean;
  now: Date;
  today: string;
  timeZone: string;
}) {
  const total = decisions.approvals.length + decisions.requests.length;
  return (
    <section id="decisions" aria-labelledby="decisions-title" className="grid scroll-mt-20 gap-3">
      <div className="flex items-center gap-2">
        <h2 id="decisions-title" className="text-base font-semibold">
          Decisions waiting
        </h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{total}</span>
      </div>
      <ApprovalStaging tasks={decisions.approvals} />
      {project === "" ? (
        <Panel title="Requests waiting for a decision" count={decisions.requests.length} href="/requests" hrefLabel="All requests">
          {decisions.requests.length === 0 ? (
            <PanelEmpty>No request is waiting: every one has been answered.</PanelEmpty>
          ) : (
            <ul className="divide-y">
              {decisions.requests.map((request) => (
                <RequestRow key={request.id} request={request} now={now} today={today} timeZone={timeZone} showControls={canDecide} />
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          <Inbox className="size-4 shrink-0" aria-hidden />
          Requests aren&apos;t tied to a project. Choose All projects to see the ones waiting for a decision.
        </p>
      )}
    </section>
  );
}
