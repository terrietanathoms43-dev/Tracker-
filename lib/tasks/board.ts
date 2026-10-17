import type { TaskStatus } from "@/lib/constants";
import type { TaskListItem } from "./types";

// The board's columns (docs/PLAN.md §5): five statuses, left to right in the order work moves.
// Rejected tasks never appear on the board; completed ones only for the last RECENTLY_FINISHED_DAYS days.

export const BOARD_STATUSES = ["not_started", "in_progress", "awaiting_approval", "blocked", "completed"] as const satisfies readonly TaskStatus[];
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export type BoardColumns = Record<BoardStatus, TaskListItem[]>;

/** Splits already-sorted tasks into the board's columns, keeping their order. */
export function toBoardColumns(items: TaskListItem[]): BoardColumns {
  const columns: BoardColumns = { not_started: [], in_progress: [], awaiting_approval: [], blocked: [], completed: [] };
  for (const item of items) {
    if (item.status in columns) columns[item.status as BoardStatus].push(item);
  }
  return columns;
}
