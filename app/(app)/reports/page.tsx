import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { GoalProgressList } from "@/components/dashboard/goal-progress";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/page-header";
import { ContributionsTable } from "@/components/reports/contributions-table";
import { DecisionsPanel } from "@/components/reports/decisions-panel";
import { HealthBoard } from "@/components/reports/health-board";
import { PrintButton } from "@/components/reports/print-button";
import { ProjectSelect } from "@/components/reports/project-select";
import { RangeChart } from "@/components/reports/range-chart";
import { ReportCutTabs } from "@/components/reports/report-cut-tabs";
import { CsvLink, ReportControls } from "@/components/reports/report-controls";
import { ReportTiles } from "@/components/reports/report-tiles";
import { ReportVerdict } from "@/components/reports/report-verdict";
import { BlockedList, DeliveredList, OpenList, StalledList } from "@/components/reports/task-facts";
import { canDecideRequest, canSeeReports, isAdmin, isLeader } from "@/lib/permissions";
import { buildReport } from "@/lib/reports/build";
import { parseReportCut, parseReportProject, parseReportRange, type ReportCut } from "@/lib/reports/params";
import { addDays, dayKey, formatAbsolute, formatDay } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// /reports: a date range, a project (or all of them) and the facts (docs/PLAN.md §8, 2026-11-01 log), in three
// views: Executive health (admins first: what is wrong, what is waiting to be decided, the health board, the daily
// chart), Workload (leaders first) and My work (members, and the only view they get).

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) redirect("/home");
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const searchParams = await props.searchParams;
  const range = parseReportRange(searchParams, today);
  const project = parseReportProject(searchParams);
  const report = await buildReport(viewer, range, today, project);

  // Role cuts: a leader or admin may switch; a member only gets their own.
  const leader = isLeader(viewer);
  const defaultCut: ReportCut = isAdmin(viewer) ? "exec" : leader ? "leader" : "member";
  const cut = leader ? parseReportCut(searchParams, defaultCut) : "member";

  const scopeLabel = report.scope.chosen ? report.scope.chosen.name : project === "none" ? "Work in no project" : "All projects";
  const csv = { range, project };

  const goalNotes = Object.fromEntries(
    Object.entries(report.goalsDeliveredInRange).map(([goalId, n]) => [goalId, `${n} completed in this range`]),
  );

  // Member-specific subsets
  const isMine = (task: (typeof report.delivered)[number]) => task.assignees.some((p) => p.id === viewer.userId);

  const myDelivered = report.delivered.filter(isMine);
  const myOpen = report.open.filter(isMine);
  const myBlocked = report.blockedOverdue.filter((t) => isMine(t) && t.status === "blocked");
  // "Am I on schedule?": what is already late, and what falls due in the next week.
  const myOverdue = myOpen.filter((t) => t.dueDate !== null && t.dueDate < today);
  const weekEnd = addDays(today, 7);
  const myDueSoon = myOpen.filter((t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= weekEnd);
  const tile = (label: string, value: number, note: string, problem = false) => (
    <div className={problem && value > 0 ? "rounded-lg border border-status-blocked-dot/30 bg-status-blocked-bg p-4" : "rounded-lg border bg-card p-4"}>
      <div className={problem && value > 0 ? "text-[12px] font-medium text-status-blocked-fg" : "text-[12px] font-medium text-muted-foreground"}>{label}</div>
      <div className={problem && value > 0 ? "mt-1 text-2xl font-bold tracking-tight text-status-blocked-fg" : "mt-1 text-2xl font-bold tracking-tight"}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${org.name} · ${scopeLabel} · ${formatDay(range.from, today)} – ${formatDay(range.to, today)}`}
        action={<PrintButton />}
      />

      <div className="mb-6 grid gap-4">
        <ReportCutTabs current={cut} range={range} project={project} canSwitch={leader} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ReportControls range={range} today={today} cut={cut} project={project} />
          <ProjectSelect options={report.scope.options} value={project} range={range} cut={cut} />
        </div>
      </div>

      <div className="grid gap-6">
        {/* MEMBER CUT: Scoped to my work */}
        {cut === "member" ? (
          <>
            {/* Negative first: am I late, am I stuck, what is coming, what did I finish. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tile("Overdue", myOverdue.length, "past their due date", true)}
              {tile("Blocked", myBlocked.length, "waiting on someone or something", true)}
              {tile("Due in 7 days", myDueSoon.length, "coming up")}
              {tile("Delivered", myDelivered.length, "in selected range")}
            </div>

            <RangeChart timeline={report.timeline} today={today} showMyWork title="My deliveries and what's due next" pace={report.pace} />

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
            <ReportTiles summary={report.summary} project={project} />

            {report.blockedDuration.currentlyBlocked > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-status-awaiting-dot/30 bg-status-awaiting-bg p-4">
                <Clock className="size-5 shrink-0 text-status-awaiting-fg" aria-hidden />
                <div className="text-sm text-status-awaiting-fg">
                  <span className="font-semibold">Blocked work duration:</span> tasks currently blocked have sat stuck for an average of{" "}
                  <strong>{report.blockedDuration.averageDays} days</strong> (max {report.blockedDuration.maxDays} days).
                </div>
              </div>
            ) : null}

            <RangeChart timeline={report.timeline} today={today} title="Delivery, blockers and what's due next" pace={report.pace} />

            <Panel title="Blocked and overdue" count={report.blockedOverdue.length}>
              <BlockedList tasks={report.blockedOverdue} today={today} />
            </Panel>
            <div id="stalled" className="scroll-mt-20">
              <Panel title="Stalled" count={report.stalled.length}>
                <StalledList tasks={report.stalled} today={today} />
              </Panel>
            </div>
            <div id="people" className="scroll-mt-20">
              <Panel title="People" aside={<CsvLink {...csv} table="contributions" label="People" />}>
                <ContributionsTable rows={report.contributions} />
              </Panel>
            </div>
            <Panel title="Open commitments" count={report.open.length} aside={<CsvLink {...csv} table="open" label="Open commitments" />}>
              <OpenList tasks={report.open} today={today} />
            </Panel>
            <Panel title="Delivered" count={report.delivered.length} aside={<CsvLink {...csv} table="delivered" label="Delivered" />}>
              <DeliveredList tasks={report.delivered} today={today} />
            </Panel>
            <Panel title="Goals" count={report.goals.length}>
              <GoalProgressList goals={report.goals} today={today} notes={goalNotes} empty="No active goals." />
            </Panel>
          </>
        ) : null}

        {/* EXEC CUT: what is wrong, what is waiting on a decision, the health board, the chart */}
        {cut === "exec" ? (
          <>
            <ReportVerdict summary={report.summary} project={project} />
            <DecisionsPanel decisions={report.decisions} project={project} canDecide={canDecideRequest(viewer)} now={now} today={today} timeZone={viewer.timezone} />
            <HealthBoard data={report.healthBoard} today={today} />
            <div id="stalled" className="scroll-mt-20">
              <Panel title="Stalled" count={report.stalled.length}>
                <StalledList tasks={report.stalled} today={today} />
              </Panel>
            </div>
            <RangeChart timeline={report.timeline} today={today} title="Daily completions, blockers and what's due next" pace={report.pace} />
            <div id="people" className="scroll-mt-20">
              <Panel title="People" aside={<CsvLink {...csv} table="contributions" label="People" />}>
                <ContributionsTable rows={report.contributions} />
              </Panel>
            </div>
          </>
        ) : null}

        <p className="text-[13px] text-muted-foreground">
          Generated {formatAbsolute(now, viewer.timezone)} from {org.name}&apos;s task records
          {report.scope.chosen ? `, narrowed to ${report.scope.chosen.name}` : project === "none" ? ", narrowed to work in no project" : ""}. Blocked, overdue and
          decisions waiting are as of today; the chart looks two weeks ahead; everything else falls inside the range.
        </p>
      </div>
    </>
  );
}
