import { cn } from "cn";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { CsvLink } from "@/components/reports/report-controls";
import { TaskGroupBlock } from "@/components/tasks/task-group";
import { TaskRow } from "@/components/tasks/task-row";
import { closedStatusNames, isClosedWithoutCompletion, statusDef, type StatusCatalog } from "@/lib/statuses";
import type { ReportTask } from "@/lib/reports/data";
import type { ReportProject } from "@/lib/reports/params";
import { addedInCycle, type ActiveScope } from "@/lib/reports/scope";
import { groupRows } from "@/lib/tasks/groups";
import type { TaskListItem } from "@/lib/tasks/types";
import { formatDay } from "@/lib/time";

// The Active scope view (docs/PLAN.md, 2026-11-06 and 2026-11-07 logs): "what this cycle was to work on". A sentence
// that says what the list is, six numbers, then the tasks grouped by status with the problems first, what was closed
// without completing next and the completed work last (lib/reports/scope.ts). The rows are the same rows as every
// other list (components/tasks/task-row.tsx): the title links to the task, the rest expands in place, the menu acts;
// the report adds what only it knows: the project and goal under the title (the scope spans them), the blocker or the
// closing reason, "New this cycle" on a task created since the Since day, and the day a closed task was closed.
// No chart here; it prints like the other views, and its CSV is table=scope.

function Tile({ label, value, note, problem = false }: { label: string; value: number; note: string; problem?: boolean }) {
  const tinted = problem && value > 0;
  return (
    <li data-scope-tile={label} data-value={value} className={cn("rounded-lg border p-4 break-inside-avoid", tinted ? "border-status-red-dot/30 bg-status-red-bg" : "bg-card")}>
      <div className={cn("text-[12px] font-medium", tinted ? "text-status-red-fg" : "text-muted-foreground")}>{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tracking-tight", tinted && "text-status-red-fg")}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>
    </li>
  );
}

/** One line of detail: the blocker, why it was closed without completing, or the completion summary (the next action is on the row already). */
function detailOf(statuses: StatusCatalog, task: ReportTask): string | null {
  const status = statusDef(statuses, task.status);
  if (status.kind === "completed" || status.kind === "merged") return task.completionSummary;
  if (status.kind === "blocked") return [task.blockedReason ?? status.label, task.blockedBy ? `Waiting on ${task.blockedBy}` : null].filter((part) => part !== null).join(" · ");
  if (isClosedWithoutCompletion(status)) return task.rejectionReason ? `${status.label}: ${task.rejectionReason}` : null;
  return null;
}

/** The report's own words on a row: where it sits, then the detail. */
function Note({ statuses, task }: { statuses: StatusCatalog; task: ReportTask }) {
  const place = task.project ? (task.goalTitle ? `${task.project.name} · ${task.goalTitle}` : task.project.name) : "No project";
  const detail = detailOf(statuses, task);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="truncate" data-scope-place>
        {place}
      </span>
      {detail ? <span className={cn("min-w-0", statusDef(statuses, task.status).kind === "blocked" ? "text-status-red-fg" : undefined)}>{detail}</span> : null}
    </span>
  );
}

export function ActiveScopeView({
  active,
  items,
  today,
  project,
  statuses,
  readOnly = false,
}: {
  active: ActiveScope;
  statuses: StatusCatalog;
  /** The standard list row for every task in scope, by id (lib/reports/build.ts). */
  items: Map<string, TaskListItem>;
  today: string;
  project: ReportProject;
  /** A stakeholder reads the rows without their menus. */
  readOnly?: boolean;
}) {
  const since = formatDay(active.range.from, today);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="max-w-3xl text-sm text-muted-foreground" data-scope-intro>
          Every task still open, plus everything closed on or after <strong className="font-medium text-foreground">{since}</strong> ({closedStatusNames(statuses)}): the work this
          report cycle was to get through. For a daily read choose Daily above; to start from the day of the last report, choose Custom and set Since to that day.
        </p>
        <CsvLink range={active.range} table="scope" project={project} label="Active scope" />
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="The scope in numbers" data-scope-summary>
        <Tile label="In scope" value={active.total} note={`open, or closed since ${since}`} />
        <Tile label="Not completed" value={active.notCompleted} note="open today, or closed without completing" />
        <Tile label="Overdue" value={active.overdue} note="open and past their due date" problem />
        <Tile label="Blocked" value={active.blocked} note="waiting on someone or something" problem />
        <Tile label="Completed" value={active.completed} note={`on or after ${since}`} />
        <Tile label="New this cycle" value={active.added} note={`added since ${since}`} />
      </ul>

      {active.groups.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <PanelEmpty>Nothing is open, and nothing was closed on or after {since}.</PanelEmpty>
        </div>
      ) : (
        active.groups.map((group) => {
          const closed = statusDef(statuses, group.status).closed;
          const scopeOf = new Map(group.tasks.map((task) => [task.id, task]));
          // The standard row, with what the report adds to it.
          const row = (item: TaskListItem, inGroup: boolean) => {
            const task = scopeOf.get(item.id);
            if (task === undefined) return null;
            const added = addedInCycle(task, active.range);
            return (
              <TaskRow
                key={task.id}
                task={item}
                today={today}
                showReason={false}
                readOnly={readOnly}
                inGroup={inGroup}
                attributes={{ "data-scope-task": task.id, "data-added": added ? "yes" : "no" }}
                badge={
                  added ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground" title={`Added ${formatDay(task.createdDay, today)}`}>
                      New this cycle
                    </span>
                  ) : null
                }
                note={<Note statuses={statuses} task={task} />}
                trailing={
                  closed && task.closedDay ? (
                    <span className="relative hidden shrink-0 text-[13px] whitespace-nowrap text-muted-foreground sm:inline" data-scope-closed>
                      {group.label} {formatDay(task.closedDay, today)}
                    </span>
                  ) : null
                }
              />
            );
          };
          // Rows stay flat here (the report's own order); the tasks of one group share a border (2026-11-11 log).
          const entries = groupRows(
            group.tasks.flatMap((task) => items.get(task.id) ?? []),
            false,
          );
          return (
            <div key={group.status} id={`scope-${group.status}`} data-scope-group={group.status} data-count={group.tasks.length} className="min-w-0 scroll-mt-20">
              <Panel title={closed ? `${group.label} since ${since}` : group.label} count={group.tasks.length}>
                <ul className="divide-y">
                  {entries.map((entry) =>
                    entry.type === "row" ? (
                      row(entry.row.task, false)
                    ) : (
                      <TaskGroupBlock key={`group-${entry.group.id}`} group={entry.group} shown={entry.shown} readOnly={readOnly}>
                        {entry.rows.map((each) => row(each.task, true))}
                      </TaskGroupBlock>
                    ),
                  )}
                </ul>
              </Panel>
            </div>
          );
        })
      )}
    </>
  );
}
