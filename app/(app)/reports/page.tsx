import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { GoalProgressList } from "@/components/dashboard/goal-progress";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/page-header";
import { ContributionsTable } from "@/components/reports/contributions-table";
import { HealthBoard } from "@/components/reports/health-board";
import { PrintButton } from "@/components/reports/print-button";
import { RangeChart } from "@/components/reports/range-chart";
import { ReportCutTabs } from "@/components/reports/report-cut-tabs";
import { CsvLink, ReportControls } from "@/components/reports/report-controls";
import { ReportTiles } from "@/components/reports/report-tiles";
import { BlockedList, DeliveredList, OpenList } from "@/components/reports/task-facts";
import { canSeeReports, isAdmin, isLeader } from "@/lib/permissions";
import { buildReport } from "@/lib/reports/build";
import { parseReportCut, parseReportRange, type ReportCut } from "@/lib/reports/params";
import { calendarDaysBetween, dayKey, formatAbsolute, formatDay } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /reports: a date range and the facts (docs/PLAN.md §8), in three views: Executive health (admins first),
// Workload (leaders first) and My work (members, and the only view they get).

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) redirect("/home");
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const searchParams = await props.searchParams;
  const range = parseReportRange(searchParams, today);
  const report = await buildReport(viewer, range, today);

  // Role cuts: a leader or admin may switch; a member only gets their own.
  const leader = isLeader(viewer);
  const defaultCut: ReportCut = isAdmin(viewer) ? "exec" : leader ? "leader" : "member";
  const cut = leader ? parseReportCut(searchParams, defaultCut) : "member";

  const goalNotes = Object.fromEntries(
    Object.entries(report.goalsDeliveredInRange).map(([goalId, n]) => [goalId, `${n} completed in this range`]),
  );

  // Member-specific subsets
  const isMine = (task: (typeof report.delivered)[number]) => task.assignees.some((p) => p.id === viewer.userId);

  const myDelivered = report.delivered.filter(isMine);
  const myOpen = report.open.filter(isMine);
  const myBlocked = report.blockedOverdue.filter((t) => isMine(t) && t.status === "blocked");

  const daysInRange = Math.max(1, calendarDaysBetween(range.from, range.to) + 1);
  const myDailyPace = Math.round((myDelivered.length / daysInRange) * 10) / 10;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${org.name} · ${formatDay(range.from, today)} – ${formatDay(range.to, today)}`}
        action={<PrintButton />}
      />

      <div className="mb-6 grid gap-4">
        <ReportCutTabs current={cut} range={range} canSwitch={leader} />
        <ReportControls range={range} today={today} cut={cut} />
      </div>

      <div className="grid gap-6">
        {/* MEMBER CUT: Scoped to my work */}
        {cut === "member" ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[12px] font-medium text-muted-foreground">My delivered</div>
                <div className="mt-1 text-2xl font-bold tracking-tight">{myDelivered.length}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">in selected range</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[12px] font-medium text-muted-foreground">Open assigned</div>
                <div className="mt-1 text-2xl font-bold tracking-tight">{myOpen.length}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">current commitments</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[12px] font-medium text-muted-foreground">Pace</div>
                <div className="mt-1 text-2xl font-bold tracking-tight">{myDailyPace}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">tasks / day delivered</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[12px] font-medium text-muted-foreground">Blocked</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-status-blocked-fg">{myBlocked.length}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">needs intervention</div>
              </div>
            </div>

            <RangeChart timeline={report.timeline} today={today} showMyWork={true} title="My delivery flow & upcoming deadlines" />

            <Panel title="My delivered" count={myDelivered.length}>
              <DeliveredList tasks={myDelivered} today={today} />
            </Panel>
            <Panel title="My open commitments" count={myOpen.length}>
              <OpenList tasks={myOpen} today={today} />
            </Panel>
            {myBlocked.length > 0 ? (
              <Panel title="My blocked tasks" count={myBlocked.length}>
                <BlockedList tasks={myBlocked} today={today} />
              </Panel>
            ) : null}
          </>
        ) : null}

        {/* LEADER CUT: Who's outstanding, workload, blocked duration */}
        {cut === "leader" ? (
          <>
            <ReportTiles summary={report.summary} />

            {report.blockedDuration.currentlyBlocked > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-status-awaiting-dot/30 bg-status-awaiting-bg p-4">
                <Clock className="size-5 shrink-0 text-status-awaiting-fg" aria-hidden />
                <div className="text-sm text-status-awaiting-fg">
                  <span className="font-semibold">Blocked work duration:</span> tasks currently blocked have sat stuck for an average of{" "}
                  <strong>{report.blockedDuration.averageDays} days</strong> (max {report.blockedDuration.maxDays} days).
                </div>
              </div>
            ) : null}

            <RangeChart timeline={report.timeline} today={today} title="Delivery velocity & goal deadlines" />

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
            <Panel title="Goals" count={report.goals.length}>
              <GoalProgressList goals={report.goals} today={today} notes={goalNotes} empty="No active goals." />
            </Panel>
          </>
        ) : null}

        {/* EXEC CUT: Overall project & goal health board with sparkbars */}
        {cut === "exec" ? (
          <>
            <ReportTiles summary={report.summary} />
            <HealthBoard data={report.healthBoard} />
            <RangeChart timeline={report.timeline} today={today} title="Goal progress burnup & daily completions" />
            <Panel title="Contributions" aside={<CsvLink range={range} table="contributions" label="Contributions" />}>
              <ContributionsTable rows={report.contributions} />
            </Panel>
          </>
        ) : null}

        <p className="text-[13px] text-muted-foreground">
          Generated {formatAbsolute(now, viewer.timezone)} from {org.name}&apos;s task records. Blocked and overdue are as of today; everything else
          falls inside the range.
        </p>
      </div>
    </>
  );
}
