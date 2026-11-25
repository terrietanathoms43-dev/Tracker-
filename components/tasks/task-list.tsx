"use client";

import { useState, useTransition } from "react";
import { loadMoreTasks } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { groupRows, type ListEntry } from "@/lib/tasks/groups";
import { nestSubTasks } from "@/lib/tasks/sub-tasks";
import type { TaskListItem, TaskPage } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { TaskGroupBlock } from "./task-group";
import { TaskRow } from "./task-row";

// Rows of tasks with cursor-based Load more.

/** Each task once, first place kept: a page brings the rest of its groups forward, and a later page brings them again. */
function unique(items: TaskListItem[]): TaskListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * The rows of a list. With `query` (the list's filters as URL params), "Load more" fetches the next page of the
 * same filters. Put it inside a bordered card; it draws only the rows. Sub-tasks sit under their parents, and the
 * tasks of one group (docs/PLAN.md, 2026-11-11 log) side by side inside one border (`lib/tasks/groups.ts`). `plain`
 * leaves the group borders and chips out: the task page's Group section is the group, so its rows need neither.
 */
export function TaskList({
  page,
  today,
  query,
  showReason = true,
  readOnly = false,
  plain = false,
}: {
  page: TaskPage | { items: TaskListItem[]; nextCursor: null };
  today: string;
  query?: Record<string, string>;
  showReason?: boolean;
  readOnly?: boolean;
  plain?: boolean;
}) {
  // Extra pages are keyed to the first page, so new filters (a new first page) start the list over.
  const [more, setMore] = useState<{ key: TaskPage; items: TaskListItem[]; cursor: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const extra = more !== null && more.key === page ? more : null;
  const items = extra ? unique([...page.items, ...extra.items]) : page.items;
  const cursor = extra ? extra.cursor : page.nextCursor;
  const entries: ListEntry[] = plain ? nestSubTasks(items).map((row) => ({ type: "row", row })) : groupRows(items);

  return (
    <>
      <ul className="divide-y">
        {entries.map((entry) =>
          entry.type === "row" ? (
            <TaskRow key={entry.row.task.id} task={entry.row.task} today={today} showReason={showReason} readOnly={readOnly} nested={entry.row.nested} inGroup={plain} />
          ) : (
            <TaskGroupBlock key={`group-${entry.group.id}`} group={entry.group} shown={entry.shown} readOnly={readOnly}>
              {entry.rows.map(({ task, nested }) => (
                <TaskRow key={task.id} task={task} today={today} showReason={showReason} readOnly={readOnly} nested={nested} inGroup />
              ))}
            </TaskGroupBlock>
          ),
        )}
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
