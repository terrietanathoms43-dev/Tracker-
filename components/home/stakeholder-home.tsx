import { BarChart3, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { GoalProgressList } from "@/components/dashboard/goal-progress";
import { EmptyState } from "@/components/empty-state";
import { GoalsPastTargetBanner } from "@/components/goals/goal-alerts";
import { PageHeader } from "@/components/page-header";
import { ProposalList } from "@/components/proposals/proposal-list";
import { ReportVerdict } from "@/components/reports/report-verdict";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { Panel } from "@/components/dashboard/panel";
import type { ProposalListItem } from "@/lib/dal/approvals";
import type { GoalProgress } from "@/lib/dal/dashboard";
import type { GoalRef } from "@/lib/dal/goals";
import type { ReportSummary } from "@/lib/reports/build";
import type { ScopedProject } from "@/lib/project-scope-server";

// A stakeholder's Home (docs/PLAN.md, 2026-11-04 log): the Executive verdict (is anything off track, late, blocked
// or waiting on a decision?), the goals and how far along they are, the goals waiting for their sign-off, and what
// they proposed, split into what still waits for a signature and what was decided. The full report is a click away.

/** How many rows each panel shows before "See all" on /proposals. */
const SHOWN = 10;

export function StakeholderHome({
  title,
  description,
  proposals,
  lateGoals,
  summary,
  goals,
  now,
  today,
  timeZone,
  scope,
}: {
  title: string;
  description: string;
  proposals: ProposalListItem[];
  lateGoals: GoalRef[];
  /** The Executive view's verdict for the last 30 days, narrowed like everything else. */
  summary: ReportSummary;
  goals: GoalProgress[];
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
        <section aria-labelledby="exec-heading" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="exec-heading" className="text-base font-semibold">
              How the work stands
            </h2>
            <Link href="/reports" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-link underline-offset-4 hover:underline">
              <BarChart3 className="size-3.5" aria-hidden />
              Open the full report
            </Link>
          </div>
          <ReportVerdict summary={summary} project={scope?.id ?? ""} anchorBase="/reports" />
        </section>
        <Panel title="Goals" href="/goals" hrefLabel="All goals">
          <GoalProgressList goals={goals} today={today} empty="No active goals yet. When a leader adds one, you'll see here how far along it is." />
        </Panel>
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
