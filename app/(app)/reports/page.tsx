import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ContributionsTable } from "@/components/reports/contributions-table";
import { PrintButton } from "@/components/reports/print-button";
import { CsvLink, ReportControls } from "@/components/reports/report-controls";
import { ReportTiles } from "@/components/reports/report-tiles";
import { BlockedList, DeliveredList, OpenList } from "@/components/reports/task-facts";
import { TeamsTable } from "@/components/reports/teams-table";
import { GoalProgressList } from "@/components/team/goal-progress";
import { Panel } from "@/components/team/panel";
import { canSeeReports } from "@/lib/permissions";
import { buildReport } from "@/lib/reports/build";
import { parseReportRange } from "@/lib/reports/params";
import { dayKey, formatAbsolute, formatDay } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /reports: a date range and the facts in it (docs/PLAN.md §8). Built from stored rows on every load; prints as
// a document and exports each table as CSV.

export const metadata: Metadata = { title: "Reports" };

/** "What did we deliver, what's outstanding, what's stuck?" for any range, deterministic from the records. */
export default async function ReportsPage(props: PageProps<"/reports">) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) redirect("/home");
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const range = parseReportRange(await props.searchParams, today);
  const report = await buildReport(viewer, range, today);
  const goalNotes = Object.fromEntries(
    Object.entries(report.goalsDeliveredInRange).map(([goalId, n]) => [goalId, `${n} completed in this range`]),
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${org.name} · ${formatDay(range.from, today)} – ${formatDay(range.to, today)}`}
        action={<PrintButton />}
      />
      <ReportControls range={range} today={today} />

      <div className="grid gap-6">
        <ReportTiles summary={report.summary} />
        <Panel title="Delivered" count={report.delivered.length} aside={<CsvLink range={range} table="delivered" label="Delivered" />}>
          <DeliveredList tasks={report.delivered} today={today} />
        </Panel>
        <Panel title="Open commitments" count={report.open.length} aside={<CsvLink range={range} table="open" label="Open commitments" />}>
          <OpenList tasks={report.open} today={today} />
        </Panel>
        <Panel title="Blocked and overdue" count={report.blockedOverdue.length}>
          <BlockedList tasks={report.blockedOverdue} today={today} />
        </Panel>
        <Panel title="Contributions" aside={<CsvLink range={range} table="contributions" label="Contributions" />}>
          <ContributionsTable rows={report.contributions} />
        </Panel>
        <Panel title="Teams" count={report.teams.length} aside={<CsvLink range={range} table="teams" label="Teams" />}>
          <TeamsTable rows={report.teams} />
        </Panel>
        <Panel title="Goals" count={report.goals.length}>
          <GoalProgressList goals={report.goals} today={today} notes={goalNotes} empty="No active goals." />
        </Panel>
        <p className="text-xs text-muted-foreground">
          Generated {formatAbsolute(now, viewer.timezone)} from {org.name}&apos;s task records. Blocked and overdue are as of today; everything else
          falls inside the range.
        </p>
      </div>
    </>
  );
}
