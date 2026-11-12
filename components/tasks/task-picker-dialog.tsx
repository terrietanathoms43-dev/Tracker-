"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { paletteSearch } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIMITS } from "@/lib/limits";
import { taskLabel } from "@/lib/tasks/closer";
import type { TaskListItem } from "@/lib/tasks/types";

// Pick one task (docs/PLAN.md, 2026-11-11 log): search the workspace's tasks by title or description, the way ⌘K
// does, and hand the one that is picked to `onPick`. The Draft tab uses it to attach a draft to a task. It offers
// whatever the person can read (⌘K's rule: the main board and their own local tasks); the caller's action checks
// again on the server.

export function TaskPickerDialog({
  title,
  description,
  icon,
  onPick,
  onClose,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  /** Runs with the picked task; the dialog closes when it resolves to true and stays open (to pick again) on false. */
  onPick: (task: TaskListItem) => Promise<boolean>;
  onClose: () => void;
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
  const offered = term === "" ? recent : results.q.toLowerCase() === term ? results.items : [];

  const pick = (task: TaskListItem) =>
    startTransition(async () => {
      if (await onPick(task)) onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" data-task-picker>
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:text-[13px] **:[[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search tasks by title or description…" maxLength={LIMITS.search} autoFocus />
          <CommandList className="max-h-[min(50dvh,360px)]">
            <CommandEmpty>{term === "" ? "Type to search tasks." : "No task matches."}</CommandEmpty>
            {offered.length > 0 ? (
              <CommandGroup heading={term === "" ? "Recently touched" : "Tasks"}>
                {offered.map((task) => (
                  <CommandItem key={task.id} value={task.id} disabled={pending} onSelect={() => pick(task)} data-task-choice={task.id}>
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
