"use client";

import { cn } from "cn";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { BOARD_STATUSES } from "@/lib/tasks/board";
import { DEFAULT_FILTERS, isFiltered, SORT_LABELS, tasksHref, type DueFilter, type TaskFilters, type TaskSort, type TaskView } from "@/lib/tasks/filters";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";

// The task list's search, filters and sort, all kept in the URL.

const half = "w-[calc(50%-0.25rem)]";

/** Search, filters and sort for /tasks (list and board). Every change is a URL change, so a view can be shared. */
export function TaskToolbar({
  filters,
  view,
  people,
  projects,
  goals,
}: {
  filters: TaskFilters;
  view: TaskView;
  people: Person[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const apply = (patch: Partial<TaskFilters>) => startTransition(() => router.replace(tasksHref({ ...filters, ...patch }, view), { scroll: false }));

  // Debounced search: the list follows the typing without a request per keystroke.
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const timer = window.setTimeout(() => apply({ q: q.trim() }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const statuses: readonly TaskStatus[] = view === "board" ? BOARD_STATUSES : TASK_STATUSES;
  const toggleStatus = (status: TaskStatus) =>
    apply({ status: filters.status.includes(status) ? filters.status.filter((each) => each !== status) : [...filters.status, status] });
  const active = [filters.status.length > 0, filters.assignee, filters.priority, filters.project, filters.goal, filters.due, filters.closed].filter(Boolean).length;
  const sortSelect = (className: string, label: string) => (
    <NativeSelect aria-label={label} className={className} value={filters.sort} onChange={(event) => apply({ sort: event.target.value as TaskSort })}>
      {Object.entries(SORT_LABELS).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div className={cn("mb-4 grid gap-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            data-list-search
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            className="pl-8"
          />
        </div>
        {sortSelect("hidden w-44 sm:block", "Sort")}
        <Button variant="outline" className="md:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <SlidersHorizontal aria-hidden />
          Filters{active > 0 ? ` · ${active}` : ""}
        </Button>
      </div>

      <div className={cn("gap-3", open ? "grid" : "hidden md:grid")}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {statuses.map((status) => {
            const on = filters.status.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(status)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground/20 bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <StatusIcon status={status} className="size-3.5" />
                {TASK_STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Assignee" className={cn(half, "sm:w-40")} value={filters.assignee} onChange={(event) => apply({ assignee: event.target.value })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {nameOf(person)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Priority" className={cn(half, "sm:w-36")} value={filters.priority} onChange={(event) => apply({ priority: event.target.value as TaskPriority | "" })}>
            <option value="">Any priority</option>
            {[...TASK_PRIORITIES].reverse().map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Due" className={cn(half, "sm:w-36")} value={filters.due} onChange={(event) => apply({ due: event.target.value as DueFilter | "" })}>
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="week">Due this week</option>
            <option value="none">No due date</option>
          </NativeSelect>
          {projects.length > 0 || filters.project ? (
            <NativeSelect aria-label="Project" className={cn(half, "sm:w-44")} value={filters.project} onChange={(event) => apply({ project: event.target.value })}>
              <option value="">Any project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          {goals.length > 0 || filters.goal ? (
            <NativeSelect aria-label="Goal" className={cn(half, "sm:w-44")} value={filters.goal} onChange={(event) => apply({ goal: event.target.value })}>
              <option value="">Any goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          {sortSelect(cn(half, "sm:hidden"), "Sort order")}
          {view === "list" ? (
            <div className="flex h-9 items-center gap-2 px-1">
              <Switch id="show-closed" checked={filters.closed} onCheckedChange={(closed) => apply({ closed })} />
              <Label htmlFor="show-closed" className="text-xs font-normal text-muted-foreground">
                Show closed
              </Label>
            </div>
          ) : null}
          {isFiltered(filters) ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setQ("");
                apply({ ...DEFAULT_FILTERS, sort: filters.sort });
              }}
            >
              <X aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
