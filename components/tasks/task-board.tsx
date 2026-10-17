import { StatusIcon } from "@/components/status-badge";
import { RECENTLY_FINISHED_DAYS, TASK_STATUS_LABELS } from "@/lib/constants";
import { BOARD_STATUSES, type BoardColumns, type BoardStatus } from "@/lib/tasks/board";
import { TaskCards } from "./task-cards";

// The board view: five status columns of compact cards.

/**
 * The board (`/tasks?view=board`): five status columns with counts. On a phone the columns scroll sideways and
 * snap one at a time; from `lg` up all five sit side by side.
 */
export function TaskBoard({ columns, today, statuses = BOARD_STATUSES }: { columns: BoardColumns; today: string; statuses?: readonly BoardStatus[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex snap-x snap-mandatory gap-3 lg:grid lg:snap-none" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}>
        {statuses.map((status) => {
          const items = columns[status];
          return (
            <section key={status} aria-labelledby={`column-${status}`} className="flex w-[80vw] max-w-72 shrink-0 snap-start flex-col rounded-lg bg-muted/50 p-2 lg:w-auto lg:max-w-none">
              <div className="flex items-center gap-2 px-1 pt-0.5 pb-2">
                <StatusIcon status={status} />
                <h2 id={`column-${status}`} className="text-[13px] font-semibold">
                  {TASK_STATUS_LABELS[status]}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${items.length} tasks`}>
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  {status === "completed" ? `Nothing completed in the last ${RECENTLY_FINISHED_DAYS} days.` : "Nothing here."}
                </p>
              ) : (
                <TaskCards items={items} today={today} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
