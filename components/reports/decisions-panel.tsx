import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { ProposalList } from "@/components/proposals/proposal-list";
import { ApprovalStaging } from "@/components/tasks/approval-staging";
import type { PendingDecisions } from "@/lib/reports/data";

// What is waiting for a leader to decide (docs/PLAN.md, 2026-11-01 and 2026-11-03 logs): the tasks awaiting
// approval, with the same evidence-first list a leader's Home shows and the same Approve / Send back, then the
// proposals nobody has signed off yet, each with its chain and the buttons for whoever is up.

export function DecisionsPanel({ decisions, now, today, timeZone }: { decisions: PendingDecisions; now: Date; today: string; timeZone: string }) {
  const total = decisions.approvals.length + decisions.proposals.length;
  return (
    <section id="decisions" aria-labelledby="decisions-title" className="grid scroll-mt-20 gap-3">
      <div className="flex items-center gap-2">
        <h2 id="decisions-title" className="text-base font-semibold">
          Decisions waiting
        </h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{total}</span>
      </div>
      <ApprovalStaging tasks={decisions.approvals} />
      <Panel title="Proposals waiting for sign-off" count={decisions.proposals.length} href="/proposals" hrefLabel="All proposals">
        {decisions.proposals.length === 0 ? <PanelEmpty>No proposal is waiting: every one has been signed off or declined.</PanelEmpty> : <ProposalList items={decisions.proposals} today={today} now={now} timeZone={timeZone} />}
      </Panel>
    </section>
  );
}
