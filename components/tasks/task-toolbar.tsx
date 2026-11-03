"use client";

import { cn } from "cn";
import { CalendarRange, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { BOARD_STATUSES } from "@/lib/tasks/board";
import {
  activeFilterChips,
  DATE_FIELD_LABELS,
  DATE_FIELDS,
  DEFAULT_FILTERS,
  describeDateRange,
  isFiltered,
  SORT_LABELS,
  tasksHref,
  visibleStatuses,
  type DateField,
  type DueFilter,
  type FilterNames,
  type TaskFilters,
  type TaskSort,
  type TaskView,
} from "@/lib/tasks/filters";
import { nameOf } from "@/lib/tasks/people";
import type { GoalOption, Person } from "@/lib/tasks/types";

// The task list's search, filters and sort, all kept in the URL. A filter that is on looks on: its control takes
// the brand tint, and a row of chips under the toolbar says what is narrowing the list, each chip removable. The
// project is not here: the navigation's project picker narrows every screen at once.

const half = "w-[calc(50%-0.25rem)]";
/** A picker whose value narrows the list: the same tint as the active nav item, so "on" is unmistakable. */
const ACTIVE = "[&>select]:border-primary [&>select]:bg-sidebar-accent [&>select]:font-medium [&>select]:text-foreground";

/** "Dates": a range of calendar days on the created, completed or updated date (docs/PLAN.md, 2026-11-03 log). */
export function DateRangeFilter({ filters, today, onApply, className }: { filters: Pick<TaskFilters, "dateField" | "from" | "to">; today: string; onApply: (next: Pick<TaskFilters, "dateField" | "from" | "to">) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<DateField>(filters.dateField || "created");
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const on = describeDateRange(filters, today);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setField(filters.dateField || "created");
          setFrom(filters.from);
          setTo(filters.to);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Dates" data-dates-filter className={cn("h-9", on && "border-primary bg-sidebar-accent font-medium text-foreground", className)}>
          <CalendarRange aria-hidden />
          {on ?? "Dates"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onApply({ dateField: from || to ? field : "", from, to });
            setOpen(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="dates-field" className="text-[13px]">
              Which date
            </Label>
            <NativeSelect id="dates-field" value={field} onChange={(event) => setField(event.target.value as DateField)}>
              {DATE_FIELDS.map((each) => (
                <option key={each} value={each}>
                  {DATE_FIELD_LABELS[each]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dates-from" className="text-[13px]">
                From
              </Label>
              <Input id="dates-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dates-to" className="text-[13px]">
                To
              </Label>
              <Input id="dates-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!on}
              onClick={() => {
                onApply({ dateField: "", from: "", to: "" });
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={!from && !to}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Search, filters and sort for /home's list and board. Every change is a URL change, so a view can be shared. */
export function TaskToolbar({ filters, view, people, goals, today }: { filters: TaskFilters; view: TaskView; people: Person[]; goals: GoalOption[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  // When the URL's search changes from outside the box (Clear filters, the back button), the box follows it
  // instead of pushing its stale text back into the URL.
  const [applied, setApplied] = useState(filters.q);
  if (filters.q !== applied) {
    setApplied(filters.q);
    setQ(filters.q);
  }
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
  // Without a status filter the chips show what the list really shows: open work, plus closed work when
  // "Show closed" is on. The first click takes one status off that set; selecting everything back normalises to
  // the empty "all" form.
  const shown = visibleStatuses(filters, statuses);
  const toggleStatus = (status: TaskStatus) => {
    const next = shown.includes(status) ? shown.filter((each) => each !== status) : [...shown, status];
    apply({ status: next.length === statuses.length ? [] : next });
  };
  const names: FilterNames = { people, goals };
  const chips = activeFilterChips(filters, names, today);
  const active = chips.length + (filters.status.length > 0 ? 1 : 0);
  // Goals of the chosen project only; without a project scope, every goal.
  const goalChoices = filters.project ? goals.filter((goal) => goal.projectId === filters.project) : goals;
  const sortSelect = (className: string, label: string) => (
    <NativeSelect aria-label={label} className={className} value={filters.sort} onChange={(event) => apply({ sort: event.target.value as TaskSort })}>
      {Object.entries(SORT_LABELS).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </NativeSelect>
  );
  const clearAll = () => {
    setQ("");
    apply({ ...DEFAULT_FILTERS, project: filters.project, sort: filters.sort });
  };

  return (
    <div className={cn("mb-4 grid gap-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className={cn("pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2", filters.q ? "text-primary" : "text-muted-foreground")} aria-hidden />
          <Input
            data-list-search
            type="search"
            aria-label="Search tasks"
            placeholder="Search titles and descriptions…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={LIMITS.search}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            className={cn("pl-8", filters.q && "border-primary bg-sidebar-accent")}
          />
        </div>
        {sortSelect("hidden w-44 sm:block", "Sort")}
        <Button variant={active > 0 ? "default" : "outline"} className="md:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <SlidersHorizontal aria-hidden />
          Filters{active > 0 ? ` · ${active}` : ""}
        </Button>
      </div>

      <div className={cn("gap-3", open ? "grid" : "hidden md:grid")}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {statuses.map((status) => {
            const on = shown.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(status)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground/20 bg-accent text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/60 hover:bg-accent hover:text-foreground",
                )}
              >
                <StatusIcon status={status} className={cn("size-3.5", !on && "opacity-50")} />
                {TASK_STATUS_LABELS[status]}
              </button>
            );
          })}
          {filters.status.length > 0 ? (
            <button type="button" onClick={() => apply({ status: [] })} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-sidebar-accent">
              <X className="size-3.5" aria-hidden />
              All statuses
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Assignee" className={cn(half, "sm:w-40", filters.assignee && ACTIVE)} value={filters.assignee} onChange={(event) => apply({ assignee: event.target.value })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {nameOf(person)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Priority" className={cn(half, "sm:w-36", filters.priority && ACTIVE)} value={filters.priority} onChange={(event) => apply({ priority: event.target.value as TaskPriority | "" })}>
            <option value="">Any priority</option>
            {[...TASK_PRIORITIES].reverse().map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Due" className={cn(half, "sm:w-36", filters.due && ACTIVE)} value={filters.due} onChange={(event) => apply({ due: event.target.value as DueFilter | "" })}>
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="week">Due this week</option>
            <option value="none">No due date</option>
          </NativeSelect>
          {goalChoices.length > 0 || filters.goal ? (
            <NativeSelect aria-label="Goal" className={cn(half, "sm:w-44", filters.goal && ACTIVE)} value={filters.goal} onChange={(event) => apply({ goal: event.target.value })}>
              <option value="">All goals</option>
              <option value="none">No goal</option>
              {goalChoices.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <DateRangeFilter filters={filters} today={today} onApply={(next) => apply(next)} className={cn(half, "sm:w-auto")} />
          {sortSelect(cn(half, "sm:hidden"), "Sort order")}
          {view === "list" ? (
            <div className="flex h-9 items-center gap-2 px-1">
              <Switch id="show-closed" checked={filters.closed} onCheckedChange={(closed) => apply({ closed })} />
              <Label htmlFor="show-closed" className={cn("text-[13px] font-normal", filters.closed ? "font-medium text-foreground" : "text-muted-foreground")}>
                Show closed
              </Label>
            </div>
          ) : null}
        </div>
      </div>

      {isFiltered(filters) ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-sidebar-accent/60 px-2.5 py-1.5 text-[13px]" role="status" aria-live="polite">
          <span className="font-medium text-primary">Filtered:</span>
          {filters.status.length > 0 ? (
            <button type="button" onClick={() => apply({ status: [] })} className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/30 bg-background px-2 text-foreground transition-colors hover:bg-accent">
              {filters.status.length === 1 ? TASK_STATUS_LABELS[filters.status[0]] : `${filters.status.length} statuses`}
              <X className="size-3 text-muted-foreground" aria-hidden />
              <span className="sr-only">Remove status filter</span>
            </button>
          ) : null}
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if ("q" in chip.clear) setQ("");
                apply(chip.clear);
              }}
              className="inline-flex h-6 max-w-64 items-center gap-1 rounded-md border border-primary/30 bg-background px-2 text-foreground transition-colors hover:bg-accent"
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[13px] text-primary" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
