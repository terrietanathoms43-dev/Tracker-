import { SearchX, SquareCheckBig } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LastFilters } from "@/components/tasks/last-filters";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskToolbar } from "@/components/tasks/task-toolbar";
import { ViewTabs } from "@/components/tasks/view-tabs";
import { Button } from "@/components/ui/button";
import { boardTasks, listTasks, taskFormOptions } from "@/lib/dal/tasks";
import { isStakeholder } from "@/lib/permissions";
import { BOARD_STATUSES } from "@/lib/tasks/board";
import { filtersToParams, isFiltered, parseFilters, parseView, tasksHref } from "@/lib/tasks/filters";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /tasks: the task list and board, filtered by the address.

export const metadata: Metadata = { title: "Tasks" };

/** "Find the thing": every task in the workspace as a list or a board, filtered by the address. */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const viewer = await requireViewer();
  if (isStakeholder(viewer)) redirect("/home");
  const raw = await props.searchParams;
  const filters = parseFilters(raw);
  const view = parseView(raw);
  const today = dayKey(new Date(), viewer.timezone);
  const query = filtersToParams(filters);
  const [options, page, columns] = await Promise.all([
    taskFormOptions(viewer),
    view === "list" ? listTasks(viewer, filters, { today }) : null,
    view === "board" ? boardTasks(viewer, filters, { today }) : null,
  ]);
  const empty = page ? page.items.length === 0 : columns ? Object.values(columns).every((items) => items.length === 0) : true;

  return (
    <>
      <PageHeader title="Tasks" action={<NewTaskButton />} />
      <ViewTabs active={view} query={query.toString()} />
      <TaskToolbar filters={filters} view={view} people={options.people} projects={options.projects} goals={options.goals} />
      <LastFilters current={query.toString()} view={view} />
      {empty ? (
        isFiltered(filters) ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches these filters"
            action={
              <Button asChild variant="outline">
                <Link href={tasksHref({ sort: filters.sort }, view)}>Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SquareCheckBig}
            title={view === "board" ? "No tasks yet" : "No open tasks"}
            description={view === "board" ? "Create the first one and it will show up in its column." : "Create the first one, or switch on Show closed to see finished work."}
            action={<NewTaskButton variant="outline" />}
          />
        )
      ) : page ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <TaskList page={page} today={today} query={Object.fromEntries(query)} />
        </div>
      ) : columns ? (
        <TaskBoard columns={columns} today={today} statuses={filters.status.length > 0 ? BOARD_STATUSES.filter((status) => filters.status.includes(status)) : BOARD_STATUSES} />
      ) : null}
    </>
  );
}
