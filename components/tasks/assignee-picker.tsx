"use client";

import { cn } from "cn";
import { Check, ChevronsUpDown, UsersRound } from "lucide-react";
import { useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import type { AssigneeIds } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";
import type { Person, TeamRef } from "@/lib/tasks/types";

// One picker for everyone a task (or a goal) is assigned to: people and teams, any number of each.

/** Who can be picked. `viewerId` marks "(me)"; null options means they are still loading. */
export type PickerOptions = { people: Person[]; teams: TeamRef[]; viewerId: string | null };

/** The trigger's text: "Jordan Dev, Sam Dev · Frontend", "You" before the options arrive, or the placeholder. */
function summary(value: AssigneeIds, options: PickerOptions | null, placeholder: string, assumeMe: boolean): string {
  if (options === null) return assumeMe ? "You" : value.assigneeIds.length + value.teamIds.length > 0 ? "Loading…" : placeholder;
  const people = value.assigneeIds.map((id) => options.people.find((person) => person.id === id)).filter((person): person is Person => person !== undefined);
  const teams = value.teamIds.map((id) => options.teams.find((team) => team.id === id)).filter((team): team is TeamRef => team !== undefined);
  const names = [...people.map((person) => (person.id === options.viewerId ? "You" : nameOf(person))), ...teams.map((team) => team.name)];
  return names.length === 0 ? placeholder : names.join(", ");
}

/**
 * A button that says who is on it and opens a searchable list with check marks (apex-ux §4: one control, no
 * second dialog). People and teams sit in two groups; picking toggles. `onClose` fires when the list closes, so a
 * page editor can save once instead of on every tick. With `mode="teams"` only teams are offered (goals).
 */
export function AssigneePicker({
  id,
  label,
  value,
  onChange,
  options,
  mode = "both",
  placeholder = "Unassigned",
  assumeMe = false,
  disabled = false,
  invalid = false,
  onClose,
  className,
}: {
  id?: string;
  /** The accessible name of the button (a <Field> label points at `id` instead). */
  label?: string;
  value: AssigneeIds;
  onChange: (next: AssigneeIds) => void;
  options: PickerOptions | null;
  mode?: "both" | "teams";
  placeholder?: string;
  /** Before the options load, the value is "you" (the New task form's default). */
  assumeMe?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = summary(value, options, placeholder, assumeMe);
  const empty = options !== null && value.assigneeIds.length + value.teamIds.length === 0;
  const togglePerson = (personId: string) =>
    onChange({ ...value, assigneeIds: value.assigneeIds.includes(personId) ? value.assigneeIds.filter((each) => each !== personId) : [...value.assigneeIds, personId] });
  const toggleTeam = (teamId: string) =>
    onChange({ ...value, teamIds: value.teamIds.includes(teamId) ? value.teamIds.filter((each) => each !== teamId) : [...value.teamIds, teamId] });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose?.();
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={label}
        disabled={disabled || options === null}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", (empty || options === null) && !assumeMe && "text-muted-foreground")}>{text}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command loop>
          <CommandInput placeholder={mode === "teams" ? "Search teams…" : "Search people and teams…"} />
          <CommandList>
            <CommandEmpty>Nobody matches.</CommandEmpty>
            {options !== null && options.teams.length > 0 ? (
              <CommandGroup heading="Teams">
                {options.teams.map((team) => {
                  const on = value.teamIds.includes(team.id);
                  return (
                    <CommandItem key={team.id} value={`team ${team.name}`} onSelect={() => toggleTeam(team.id)} aria-selected={on} data-picked={on ? "true" : undefined}>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary">
                        <UsersRound className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{team.name}</span>
                      <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {mode === "both" && options !== null ? (
              <CommandGroup heading="People">
                {options.people.map((person) => {
                  const on = value.assigneeIds.includes(person.id);
                  const me = person.id === options.viewerId;
                  return (
                    <CommandItem key={person.id} value={`person ${nameOf(person)} ${person.email ?? ""} ${me ? "me" : ""}`} onSelect={() => togglePerson(person.id)} aria-selected={on} data-picked={on ? "true" : undefined}>
                      <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {nameOf(person)}
                        {me ? <span className="text-muted-foreground"> (me)</span> : null}
                      </span>
                      <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
