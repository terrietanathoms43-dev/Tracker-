"use client";

import { cn } from "cn";
import { Check, ChevronsUpDown, Target } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LIMITS } from "@/lib/limits";
import type { GoalOption } from "@/lib/tasks/types";
import { noRecents, readRecents, RECENT_GOALS_KEY, rememberRecent, subscribeRecents } from "@/components/pickers/recents";

// The goal picker beside the project picker in every task form (docs/PLAN.md, 2026-11-04 log): searchable, with
// what this browser picked lately first. With a project chosen it lists that project's goals and says so when
// there are none; without one it lists every active goal under its project's name, and picking one tells the
// form which project the task is going into.

export type GoalPickerProps = {
  id?: string;
  label?: string;
  /** "" means no goal. */
  value: string;
  onChange: (goalId: string) => void;
  /** Null while they load. */
  goals: GoalOption[] | null;
  /** Names for the group headings (and the search), by project id. */
  projects: { id: string; name: string }[];
  /** The project the task is in: only its goals are offered. "" offers every goal. */
  projectId: string;
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  triggerProps?: Record<string, string | undefined>;
};

function Row({ goal, selected, onPick, prefix }: { goal: GoalOption; selected: boolean; onPick: (id: string) => void; prefix: string }) {
  return (
    <CommandItem value={`${prefix}${goal.id}`} onSelect={() => onPick(goal.id)} data-goal-item={goal.id} className="gap-2">
      <Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{goal.title}</span>
      <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} aria-hidden />
    </CommandItem>
  );
}

/** A button that says which goal is chosen and opens the list; picking closes it and remembers the choice here. */
export function GoalPicker({ id, label = "Goal", value, onChange, goals, projects, projectId, noneLabel = "No goal", disabled = false, invalid = false, className, triggerProps }: GoalPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recents = useSyncExternalStore(subscribeRecents, () => readRecents(RECENT_GOALS_KEY), noRecents);
  const list = goals ?? [];
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const offered = projectId === "" ? list : list.filter((goal) => goal.projectId === projectId);
  const byId = new Map(list.map((goal) => [goal.id, goal]));
  const chosen = value === "" ? null : (byId.get(value) ?? null);
  const q = query.trim().toLowerCase();
  const recentItems = recents.map((each) => byId.get(each)).filter((goal): goal is GoalOption => goal !== undefined && offered.includes(goal));
  const rest = offered.filter((goal) => !recentItems.includes(goal));
  const found = q === "" ? [] : offered.filter((goal) => goal.title.toLowerCase().includes(q) || (projectName.get(goal.projectId) ?? "").toLowerCase().includes(q));
  // Without a project, the goals come grouped under their project (the options arrive in project order).
  const groups: { projectId: string; items: GoalOption[] }[] = [];
  for (const goal of rest) {
    const last = groups[groups.length - 1];
    if (last && last.projectId === goal.projectId) last.items.push(goal);
    else groups.push({ projectId: goal.projectId, items: [goal] });
  }

  function pick(next: string) {
    onChange(next);
    if (next !== "") rememberRecent(RECENT_GOALS_KEY, next);
    setOpen(false);
    setQuery("");
  }

  const text = chosen ? chosen.title : value !== "" && goals === null ? "Loading…" : noneLabel;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        data-value={value}
        {...triggerProps}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
          className,
        )}
      >
        <Target className={cn("size-4 shrink-0", chosen ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", chosen === null && "text-muted-foreground")}>{text}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-80 max-w-[calc(100vw-1.5rem)] p-0" data-goal-picker>
        <Command shouldFilter={false} loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search goals…" maxLength={LIMITS.search} />
          <CommandList className="max-h-80">
            {goals === null ? (
              <p className="px-3 py-4 text-[13px] text-muted-foreground">Loading goals…</p>
            ) : q !== "" ? (
              found.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-muted-foreground">No goal matches “{query.trim()}”.</p>
              ) : (
                <CommandGroup heading="Goals">
                  {found.map((goal) => (
                    <Row key={goal.id} goal={goal} prefix="found:" selected={goal.id === value} onPick={pick} />
                  ))}
                </CommandGroup>
              )
            ) : (
              <>
                <CommandGroup>
                  <CommandItem value="__none__" onSelect={() => pick("")} data-goal-item="" className="gap-2">
                    <span className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                    <Check className={cn("size-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")} aria-hidden />
                  </CommandItem>
                </CommandGroup>
                {offered.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-muted-foreground">{projectId === "" ? "No active goals yet." : `No goals in ${projectName.get(projectId) ?? "this project"} yet.`}</p>
                ) : null}
                {recentItems.length > 0 ? (
                  <CommandGroup heading="Recent">
                    {recentItems.map((goal) => (
                      <Row key={goal.id} goal={goal} prefix="recent:" selected={goal.id === value} onPick={pick} />
                    ))}
                  </CommandGroup>
                ) : null}
                {groups.map((group) => (
                  <CommandGroup key={group.projectId} heading={projectId === "" ? (projectName.get(group.projectId) ?? "Goals") : recentItems.length > 0 ? "Other goals" : "Goals"}>
                    {group.items.map((goal) => (
                      <Row key={goal.id} goal={goal} prefix="all:" selected={goal.id === value} onPick={pick} />
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
