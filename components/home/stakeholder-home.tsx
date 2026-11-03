import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { GoalsPastTargetBanner } from "@/components/goals/goal-alerts";
import { PageHeader } from "@/components/page-header";
import { ProposalList } from "@/components/proposals/proposal-list";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { Panel } from "@/components/dashboard/panel";
import type { ProposalListItem } from "@/lib/dal/approvals";
import type { GoalRef } from "@/lib/dal/goals";
import type { ScopedProject } from "@/lib/project-scope-server";

// A stakeholder's Home: the goals waiting for their sign-off, and what they proposed, split into what still waits
// for a signature and what was decided.

/** How many rows each panel shows before "See all" on /proposals. */
const SHOWN = 10;

export function StakeholderHome({
  title,
  description,
  proposals,
  lateGoals,
  now,
  today,
  timeZone,
  scope,
}: {
  title: string;
  description: string;
  proposals: ProposalListItem[];
  lateGoals: GoalRef[];
  now: Date;
  today: string;
  timeZone: string;
  scope: ScopedProject | null;
}) {
  const waiting = proposals.filter((item) => item.status === "pending");
  const decided = proposals.filter((item) => item.status !== "pending");
  const rows = (items: ProposalListItem[]) => <ProposalList items={items.slice(0, SHOWN)} today={today} now={now} timeZone={timeZone} showProposer={false} />;

  return (
    <>
      <PageHeader title={title} description={description} />
      <QuickAddTask today={today} defaults={scope && scope.status === "active" ? { projectId: scope.id } : {}} />
      <div className="grid gap-6">
        {lateGoals.length > 0 ? <GoalsPastTargetBanner goals={lateGoals} today={today} canComplete /> : null}
        {proposals.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="You haven't proposed anything yet" description="Propose a task above. A leader or admin signs it off, and you follow it here with every decision." />
        ) : (
          <>
            {waiting.length > 0 ? (
              <Panel title={`Waiting for sign-off · ${waiting.length}`} href="/proposals">
                {rows(waiting)}
              </Panel>
            ) : null}
            {decided.length > 0 ? (
              <Panel title={waiting.length > 0 ? "Decided" : "Your proposals"} href="/proposals">
                {rows(decided)}
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
