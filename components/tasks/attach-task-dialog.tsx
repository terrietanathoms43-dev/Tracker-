"use client";

import { GitMerge, Group } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { groupTasks } from "@/actions/task-groups";
import { attachTask, bulkAttach, paletteSearch } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIMITS } from "@/lib/limits";
import { taskLabel } from "@/lib/tasks/closer";
import { groupLabel } from "@/lib/tasks/groups";
import type { TaskListItem } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// "Attach to a task…" (sub-tasks, docs/PLAN.md 2026-11-08 log): search the workspace's tasks by title, the way ⌘K
// does, and pick the one this task (or these ticked tasks) belongs under. The same dialog serves the row menu, the
// task page and the selection bar. A task that is already a sub-task, or the task itself, is not offered: one
// level only.
//
// The same search picks the task to group with (`mode="group"`, docs/PLAN.md 2026-11-11 log: "Group with…" on a row
// menu and the task page). That is not attaching: the two stay equals and show together, inside one border, in
// every list; a task that is already in a group brings the picked task's group to this one.

/**
 * `taskIds`: the tasks to attach under the task picked here. With `parentId` instead, the picked task is attached
 * under that parent (the Sub-tasks section's "Attach an existing task"). `onDone` runs after a successful attach.
 * `mode="group"` groups `taskIds` with the task picked instead of attaching them under it: they join the picked
 * task's group. With `intoOwnGroup` (the task is in a group already) it is the other way round: the picked task
 * joins this one's group.
 */
export function AttachTaskDialog({
  taskIds = [],
  parentId,
  excludeIds = taskIds,
  title,
  mode = "attach",
  intoOwnGroup = false,
  onClose,
  onDone,
}: {
  taskIds?: string[];
  parentId?: string;
  excludeIds?: string[];
  title?: string;
  mode?: "attach" | "group";
  intoOwnGroup?: boolean;
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
  const grouping = mode === "group";
  // A task that can be grouped is live, top-level and not a goal's closer: the same three things on both sides.
  const offered = (term === "" ? recent : results.q.toLowerCase() === term ? results.items : []).filter(
    (task) =>
      !excludeIds.includes(task.id) &&
      task.id !== parentId &&
      task.parent === null &&
      (task.proposal === null || task.proposal === "approved") &&
      (grouping ? !task.goalCloser : !pickingChild || (task.subTasks === 0 && !task.goalCloser)),
  );

  const pick = (picked: string) =>
    startTransition(async () => {
      const result = grouping
        ? intoOwnGroup
          ? await groupTasks({ taskIds: [picked], withTaskId: taskIds[0] })
          : await groupTasks({ taskIds, withTaskId: picked })
        : pickingChild
          ? await attachTask({ taskId: picked, parentId: parentId! })
          : taskIds.length === 1
            ? await attachTask({ taskId: taskIds[0], parentId: picked })
            : await bulkAttach({ taskIds, parentId: picked });
      if (toastResult(result)) {
        onDone?.();
        onClose();
      }
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" data-attach-task-dialog data-mode={mode}>
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            {grouping ? <Group className="size-4 text-muted-foreground" aria-hidden /> : <GitMerge className="size-4 text-muted-foreground" aria-hidden />}
            {grouping ? (intoOwnGroup ? "Add a task to the group" : "Group with a task") : pickingChild ? "Attach an existing task" : taskIds.length === 1 ? "Attach to a task" : `Make ${taskIds.length} tasks sub-tasks of a task`}
          </DialogTitle>
          <DialogDescription className="line-clamp-3">
            {grouping
              ? intoOwnGroup
                ? "The task you pick joins this group: it stays a task of its own, on the same level, and shows inside the group's border in every list."
                : `${title ? `“${title}” and the task you pick` : "This task and the one you pick"} stay separate, on the same level, and show together inside one border in every list. A task already in a group brings this one into it.`
              : (title ?? (pickingChild ? "The task you pick becomes a sub-task of this one: listed under it, in its project and goal." : "The tasks become sub-tasks of the one you pick: listed under it, in its project and goal."))}
          </DialogDescription>
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
                    {grouping && task.group !== null ? <span className="shrink-0 rounded-md border border-primary/35 px-1.5 text-[11px] text-muted-foreground">{groupLabel(task.group)} · {task.group.size}</span> : null}
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
