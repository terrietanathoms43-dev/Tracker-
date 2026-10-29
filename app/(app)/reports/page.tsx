import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ContributionsTable } from "@/components/reports/contributions-table";
import { HealthBoard } from "@/components/reports/health-board";
import { PrintButton } from "@/components/reports/print-button";
import { RangeChart } from "@/components/reports/range-chart";
import { ReportCutTabs, type ReportCut } from "@/components/reports/report-cut-tabs";
import { CsvLink, ReportControls } from "@/components/reports/report-controls";
import { ReportTiles } from "@/components/reports/report-tiles";
import { BlockedList, DeliveredList, OpenList } from "@/components/reports/task-facts";
import { TeamsTable } from "@/components/reports/teams-table";
import { GoalProgressList } from "@/components/team/goal-progress";
import { Panel } from "@/components/team/panel";
import { canSeeReports, isAdmin, isLeader } from "@/lib/permissions";
import { buildReport } from "@/lib/reports/build";
import { parseReportRange } from "@/lib/reports/params";
import { calendarDaysBetween, dayKey, formatAbsolute, formatDay } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) redirect("/home");
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const searchParams = await props.searchParams;
  const range = parseReportRange(searchParams, today);
  const report = await buildReport(viewer, range, today);

  // Role cuts: default based on user role, or explicit query param
  const leader = isLeader(viewer);
  const admin = isAdmin(viewer);
  const defaultCut: ReportCut = admin ? "exec" : leader ? "leader" : "member";
  const rawCut = typeof searchParams.cut === "string" ? searchParams.cut : "";
  const cut: ReportCut = (["exec", "leader", "member"] as const).includes(rawCut as ReportCut)
    ? (rawCut as ReportCut)
    : defaultCut;

  const goalNotes = Object.fromEntries(
    Object.entries(report.goalsDeliveredInRange).map(([goalId, n]) => [goalId, `${n} completed in this range`]),
  );

  // Member-specific subsets
  const isMine = (task: (typeof report.delivered)[number]) =>
    task.assignees.people.some((p) => p.id === viewer.userId) ||
    task.assignees.teams.some((tm) => viewer.teamIds.includes(tm.id));

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

      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ReportControls range={range} today={today} />
        <ReportCutTabs current={cut} range={range} canSwitch={leader} />
      </div>

      <div className="grid gap-6">
        {/* MEMBER CUT: Scoped to my work */}
        {cut === "member" ? (
          <>
            {/* Burndown / Keeping up metrics */}
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
                <div className="mt-1 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">{myBlocked.length}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">needs intervention</div>
              </div>
            </div>

            {/* Daily completion chart scoped to my work + due this week strip */}
            <RangeChart
              timeline={report.timeline}
              today={today}
              showMyWork={true}
              title="My delivery flow & upcoming deadlines"
            />

            {/* Collapsed panels below */}
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

            {/* Blocked time & workload alert overlay */}
            {report.blockedDuration.currentlyBlocked > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                <Clock className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div className="text-sm">
                  <span className="font-semibold text-amber-950 dark:text-amber-200">
                    Blocked work duration:
                  </span>{" "}
                  <span className="text-amber-900 dark:text-amber-300">
                    Tasks currently blocked have sat stuck for an average of{" "}
                    <strong>{report.blockedDuration.averageDays} days</strong> (max {report.blockedDuration.maxDays} days).
                  </span>
                </div>
              </div>
            ) : null}

            {/* Daily completion chart + goal deadlines */}
            <RangeChart timeline={report.timeline} today={today} title="Team delivery velocity & goal deadlines" />

            <Panel title="Delivered" count={report.delivered.length} aside={<CsvLink range={range} table="delivered" label="Delivered" />}>
              <DeliveredList tasks={report.delivered} today={today} />
            </Panel>
            <Panel title="Open commitments" count={report.open.length} aside={<CsvLink range={range} table="open" label="Open commitments" />}>
              <OpenList tasks={report.open} today={today} />
            </Panel>
            <Panel title="Blocked and overdue" count={report.blockedOverdue.length}>
              <BlockedList tasks={report.blockedOverdue} today={today} />
            </Panel>
            <Panel title="Contributions & Prior Delta" aside={<CsvLink range={range} table="contributions" label="Contributions" />}>
              <ContributionsTable rows={report.contributions} />
            </Panel>
            <Panel title="Teams workload" count={report.teams.length} aside={<CsvLink range={range} table="teams" label="Teams" />}>
              <TeamsTable rows={report.teams} />
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
            <Panel title="Teams" count={report.teams.length} aside={<CsvLink range={range} table="teams" label="Teams" />}>
              <TeamsTable rows={report.teams} />
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
