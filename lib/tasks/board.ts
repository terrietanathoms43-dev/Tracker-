import type { StatusCatalog, TaskStatusDef } from "@/lib/statuses";
import type { TaskListItem } from "./types";

// The board's columns (docs/PLAN.md §5): the workspace's open statuses, left to right in their configured
// order. Closed statuses never appear — except Completed, which keeps its column for the last
// RECENTLY_FINISHED_DAYS days; a custom open status simply gets its own column. An archived open status keeps
// its column while tasks still sit in it (the board draws it only then, and takes no drops on it).

/** The statuses the board may draw a column for: every not-closed status (archived ones too), plus Completed. */
export function boardStatuses(catalog: StatusCatalog): TaskStatusDef[] {
  return catalog.filter((status) => !status.closed || status.kind === "completed");
}

export type BoardColumns = Record<string, TaskListItem[]>;

/** Splits already-sorted tasks into the board's columns, keeping their order. */
export function toBoardColumns(items: TaskListItem[], statuses: TaskStatusDef[]): BoardColumns {
  const columns: BoardColumns = Object.fromEntries(statuses.map((status) => [status.key, []]));
  for (const item of items) {
    if (item.status in columns) columns[item.status].push(item);
  }
  return columns;
}
