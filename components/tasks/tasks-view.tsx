import { SearchX, SquareCheckBig } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LastFilters } from "@/components/tasks/last-filters";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { SelectionProvider } from "@/components/tasks/selection";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskToolbar } from "@/components/tasks/task-toolbar";
import { ViewTabs } from "@/components/home/view-tabs";
import { Button } from "@/components/ui/button";
import { boardTasks, listTasks, taskFormOptions } from "@/lib/dal/tasks";
import type { HomeTabConfig } from "@/lib/home-tabs";
import { isLeader, type Viewer } from "@/lib/permissions";
import type { ScopedProject } from "@/lib/project-scope-server";
import { BOARD_STATUSES } from "@/lib/tasks/board";
import { filtersToParams, isFiltered, tasksHref, type TaskFilters, type TaskView } from "@/lib/tasks/filters";
import { dayKey } from "@/lib/time";

// The List and Board tabs of /home: every live task in the workspace (or the chosen project), filtered by the address.

/** "Find the thing": the task list or board under the /home tab row. */
export async function TasksView({ viewer, filters, view, tabsConfig, scope }: { viewer: Viewer; filters: TaskFilters; view: TaskView; tabsConfig: HomeTabConfig; scope: ScopedProject | null }) {
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
      <PageHeader title="Tasks" description={scope ? `In ${scope.name}` : undefined} />
      <QuickAddTask today={today} defaults={scope && scope.status === "active" ? { projectId: scope.id } : {}} />
      <ViewTabs active={view} query={query.toString()} config={tabsConfig} />
      <TaskToolbar filters={filters} view={view} people={options.people} goals={options.goals} today={today} />
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
            description={
              scope
                ? `Nothing in ${scope.name} yet. Add the first task above, or pick All projects in the navigation.`
                : view === "board"
                  ? "Add the first one above and it will show up in its column."
                  : "Add the first one above, or switch on Show closed to see finished work."
            }
          />
        )
      ) : page ? (
        <SelectionProvider canDelete={isLeader(viewer)}>
          <div className="overflow-hidden rounded-lg border bg-card">
            <TaskList page={page} today={today} query={Object.fromEntries(query)} />
          </div>
        </SelectionProvider>
      ) : columns ? (
        <TaskBoard columns={columns} today={today} statuses={filters.status.length > 0 ? BOARD_STATUSES.filter((status) => filters.status.includes(status)) : BOARD_STATUSES} />
      ) : null}
    </>
  );
}
