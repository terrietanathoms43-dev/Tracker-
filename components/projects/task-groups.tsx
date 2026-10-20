import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { TaskList } from "@/components/tasks/task-list";
import { TaskSection } from "@/components/tasks/task-section";
import { CLOSED_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import type { TaskListItem } from "@/lib/tasks/types";

// The Tasks section of a project or goal page: open work first, finished work folded away underneath.

/** Open statuses in the order work moves (the board's order), so a project page reads left to right like the board. */
const OPEN_STATUSES: TaskStatus[] = ["not_started", "in_progress", "awaiting_approval", "blocked"];

const isClosed = (task: TaskListItem) => CLOSED_STATUSES.includes(task.status);

/** Completed and rejected tasks behind a native disclosure: there for the record, out of the way of open work. */
export function ClosedTasks({ items, today }: { items: TaskListItem[]; today: string }) {
  if (items.length === 0) return null;
  return (
    <details className="group min-w-0">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-0.5 text-base font-semibold select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        Completed and rejected
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{items.length}</span>
      </summary>
      <div className="mt-2 overflow-hidden rounded-lg border bg-card">
        <TaskList page={{ items, nextCursor: null }} today={today} showReason={false} />
      </div>
    </details>
  );
}

/**
 * The "Tasks" heading with the page's New task button (`action`), then the tasks: one TaskSection per open status
 * when `groupByStatus` (a project), a single "Open" section otherwise (a goal), and the closed ones folded below.
 * `empty` is what a page with no tasks at all says.
 */
export function PlanningTasks({
  items,
  today,
  groupByStatus = false,
  action,
  empty,
}: {
  items: TaskListItem[];
  today: string;
  groupByStatus?: boolean;
  action?: ReactNode;
  empty: ReactNode;
}) {
  const open = items.filter((task) => !isClosed(task));
  const closed = items.filter(isClosed);
  return (
    <section aria-labelledby="tasks-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="tasks-heading" className="flex items-baseline gap-2 text-base font-semibold">
          Tasks
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{items.length}</span>
        </h2>
        {action}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-5 text-base text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid gap-5">
          {open.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-card px-4 py-4 text-base text-muted-foreground">Nothing open right now.</p>
          ) : groupByStatus ? (
            OPEN_STATUSES.map((status) => (
              <TaskSection key={status} title={TASK_STATUS_LABELS[status]} items={open.filter((task) => task.status === status)} today={today} reasonless />
            ))
          ) : (
            <TaskSection title="Open" id="open-tasks" items={open} today={today} reasonless />
          )}
          <ClosedTasks items={closed} today={today} />
        </div>
      )}
    </section>
  );
}
