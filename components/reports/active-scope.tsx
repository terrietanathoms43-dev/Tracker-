import { cn } from "cn";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { CsvLink } from "@/components/reports/report-controls";
import { Contributors, EvidenceLinks, TaskTitle } from "@/components/reports/task-facts";
import { StatusIcon } from "@/components/status-badge";
import { DueLabel } from "@/components/tasks/due-label";
import type { ReportTask } from "@/lib/reports/data";
import type { ReportProject } from "@/lib/reports/params";
import type { ReportRange } from "@/lib/reports/range";
import { addedInCycle, type ActiveScope } from "@/lib/reports/scope";
import { formatDay } from "@/lib/time";

// The Active scope view (docs/PLAN.md, 2026-11-06 log): "what this cycle was to work on". A sentence that says what
// the list is, six numbers, then the tasks grouped by status with the problems first and the completed work last
// (lib/reports/scope.ts). Each row names its project and goal, since the scope spans them, and a task created since
// the range began wears "New this cycle": the work the previous cycle added. No chart here; it prints like the
// other views, and its CSV is table=scope.

function Tile({ label, value, note, problem = false }: { label: string; value: number; note: string; problem?: boolean }) {
  const tinted = problem && value > 0;
  return (
    <li data-scope-tile={label} data-value={value} className={cn("rounded-lg border p-4 break-inside-avoid", tinted ? "border-status-blocked-dot/30 bg-status-blocked-bg" : "bg-card")}>
      <div className={cn("text-[12px] font-medium", tinted ? "text-status-blocked-fg" : "text-muted-foreground")}>{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tracking-tight", tinted && "text-status-blocked-fg")}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>
    </li>
  );
}

/** One task of the scope: status, title (and "New this cycle"), who and where, one line of detail, and when it is due or was completed. */
function ScopeRow({ task, range, today }: { task: ReportTask; range: ReportRange; today: string }) {
  const done = task.status === "completed";
  const added = addedInCycle(task, range);
  const place = task.project ? (task.goalTitle ? `${task.project.name} · ${task.goalTitle}` : task.project.name) : "No project";
  return (
    <li data-scope-task={task.id} data-added={added ? "yes" : "no"} className="flex items-start gap-3 px-4 py-2.5 break-inside-avoid">
      <StatusIcon status={task.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <TaskTitle task={task} />
          {added ? (
            <span className="inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground" title={`Added ${formatDay(task.createdDay, today)}`}>
              New this cycle
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
          <Contributors task={task} />
          <span className="truncate">{place}</span>
        </p>
        {done ? (
          task.completionSummary ? <p className="mt-1 text-sm text-muted-foreground">{task.completionSummary}</p> : null
        ) : task.status === "blocked" ? (
          <p className="mt-1 text-sm text-status-blocked-fg">
            {task.blockedReason ?? "Blocked"}
            {task.blockedBy ? <span className="text-muted-foreground"> · Waiting on {task.blockedBy}</span> : null}
          </p>
        ) : task.nextAction ? (
          <p className="mt-1 text-sm text-muted-foreground">Next: {task.nextAction}</p>
        ) : null}
        {done ? <EvidenceLinks evidence={task.evidence} /> : null}
      </div>
      {done ? (
        <span className="mt-0.5 shrink-0 text-[13px] whitespace-nowrap text-muted-foreground">Completed {task.completedDay ? formatDay(task.completedDay, today) : ""}</span>
      ) : (
        <DueLabel due={task.dueDate} today={today} status={task.status} className="mt-0.5 shrink-0" />
      )}
    </li>
  );
}

export function ActiveScopeView({ active, today, project }: { active: ActiveScope; today: string; project: ReportProject }) {
  const since = formatDay(active.range.from, today);
  const until = formatDay(active.range.to, today);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="max-w-3xl text-sm text-muted-foreground" data-scope-intro>
          Everything still open today, plus what was completed from <strong className="font-medium text-foreground">{since}</strong> to{" "}
          <strong className="font-medium text-foreground">{until}</strong>: the work this report cycle was to get through. To start from the day of the last report, choose Custom
          above and set From to that day.
        </p>
        <CsvLink range={active.range} table="scope" project={project} label="Active scope" />
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="The scope in numbers" data-scope-summary>
        <Tile label="In scope" value={active.total} note="open, or completed in the range" />
        <Tile label="Still open" value={active.open} note="as of today" />
        <Tile label="Overdue" value={active.overdue} note="past their due date" problem />
        <Tile label="Blocked" value={active.blocked} note="waiting on someone or something" problem />
        <Tile label="Completed" value={active.completed} note={`since ${since}`} />
        <Tile label="New this cycle" value={active.added} note={`added since ${since}`} />
      </ul>

      {active.groups.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <PanelEmpty>
            Nothing is open, and nothing was completed between {since} and {until}.
          </PanelEmpty>
        </div>
      ) : (
        active.groups.map((group) => (
          <div key={group.status} id={`scope-${group.status}`} data-scope-group={group.status} data-count={group.tasks.length} className="min-w-0 scroll-mt-20">
            <Panel title={group.status === "completed" ? `Completed since ${since}` : group.label} count={group.tasks.length}>
              <ul className="divide-y">
                {group.tasks.map((task) => (
                  <ScopeRow key={task.id} task={task} range={active.range} today={today} />
                ))}
              </ul>
            </Panel>
          </div>
        ))
      )}
    </>
  );
}
