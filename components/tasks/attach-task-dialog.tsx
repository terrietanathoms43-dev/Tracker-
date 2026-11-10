"use client";

import { GitMerge } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { attachTask, bulkAttach, paletteSearch } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIMITS } from "@/lib/limits";
import { taskLabel } from "@/lib/tasks/closer";
import type { TaskListItem } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// "Attach to a task…" (sub-tasks, docs/PLAN.md 2026-11-08 log): search the workspace's tasks by title, the way ⌘K
// does, and pick the one this task (or these ticked tasks) belongs under. The same dialog serves the row menu, the
// task page and the selection bar. A task that is already a sub-task, or the task itself, is not offered: one
// level only.

/**
 * `taskIds`: the tasks to attach under the task picked here. With `parentId` instead, the picked task is attached
 * under that parent (the Sub-tasks section's "Attach an existing task"). `onDone` runs after a successful attach.
 */
export function AttachTaskDialog({
  taskIds = [],
  parentId,
  excludeIds = taskIds,
  title,
  onClose,
  onDone,
}: {
  taskIds?: string[];
  parentId?: string;
  excludeIds?: string[];
  title?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: TaskListItem[] }>({ q: "", items: [] });
  const [recent, setRecent] = useState<TaskListItem[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    paletteSearch({ q: "" }).then((result) => {
      if (live && result.ok) setRecent(result.data);
    });
    return () => {
      live = false;
    };
  }, []);

  // Debounced search: one request once typing pauses.
  useEffect(() => {
    const q = query.trim();
    if (q === "") return;
    const timer = window.setTimeout(async () => {
      const result = await paletteSearch({ q });
      if (result.ok) setResults({ q, items: result.data });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const term = query.trim().toLowerCase();
  const pickingChild = parentId !== undefined;
  const offered = (term === "" ? recent : results.q.toLowerCase() === term ? results.items : []).filter(
    (task) => !excludeIds.includes(task.id) && task.id !== parentId && task.parent === null && (task.proposal === null || task.proposal === "approved") && (!pickingChild || (task.subTasks === 0 && !task.goalCloser)),
  );

  const pick = (picked: string) =>
    startTransition(async () => {
      const result = pickingChild ? await attachTask({ taskId: picked, parentId: parentId! }) : taskIds.length === 1 ? await attachTask({ taskId: taskIds[0], parentId: picked }) : await bulkAttach({ taskIds, parentId: picked });
      if (toastResult(result)) {
        onDone?.();
        onClose();
      }
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" data-attach-task-dialog>
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-4 text-muted-foreground" aria-hidden />
            {pickingChild ? "Attach an existing task" : taskIds.length === 1 ? "Attach to a task" : `Group ${taskIds.length} tasks under a task`}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{title ?? (pickingChild ? "The task you pick becomes a sub-task of this one: listed under it, in its project and goal." : "The tasks become sub-tasks of the one you pick: listed under it, in its project and goal.")}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:text-[13px] **:[[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search tasks by title or description…" maxLength={LIMITS.search} autoFocus />
          <CommandList className="max-h-[min(50dvh,360px)]">
            <CommandEmpty>{term === "" ? "Type to search tasks." : "No task matches."}</CommandEmpty>
            {offered.length > 0 ? (
              <CommandGroup heading={term === "" ? "Recently touched" : "Tasks"}>
                {offered.map((task) => (
                  <CommandItem key={task.id} value={task.id} disabled={pending} onSelect={() => pick(task.id)} data-attach-choice={task.id}>
                    <StatusIcon status={task.status} />
                    <span className="truncate">{taskLabel(task)}</span>
                    {task.project ? <span className="ml-auto truncate text-[12px] text-muted-foreground">{task.project.name}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
        <div className="flex justify-end border-t px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
