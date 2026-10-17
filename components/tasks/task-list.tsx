"use client";

import { useState, useTransition } from "react";
import { loadMoreTasks } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import type { TaskListItem, TaskPage } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { TaskRow } from "./task-row";

// Rows of tasks with cursor-based Load more.

/**
 * The rows of a list. With `query` (the list's filters as URL params), "Load more" fetches the next page of the
 * same filters. Put it inside a bordered card; it draws only the rows.
 */
export function TaskList({
  page,
  today,
  query,
  showReason = true,
  readOnly = false,
}: {
  page: TaskPage | { items: TaskListItem[]; nextCursor: null };
  today: string;
  query?: Record<string, string>;
  showReason?: boolean;
  readOnly?: boolean;
}) {
  // Extra pages are keyed to the first page, so new filters (a new first page) start the list over.
  const [more, setMore] = useState<{ key: TaskPage; items: TaskListItem[]; cursor: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const extra = more !== null && more.key === page ? more : null;
  const items = extra ? [...page.items, ...extra.items] : page.items;
  const cursor = extra ? extra.cursor : page.nextCursor;

  return (
    <>
      <ul className="divide-y">
        {items.map((task) => (
          <TaskRow key={task.id} task={task} today={today} showReason={showReason} readOnly={readOnly} />
        ))}
      </ul>
      {cursor && query ? (
        <div className="flex justify-center border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await loadMoreTasks({ query, cursor });
                if (!result.ok) return void toastResult(result);
                setMore({ key: page, items: [...(extra?.items ?? []), ...result.data.items], cursor: result.data.nextCursor });
              })
            }
          >
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
