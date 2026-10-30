"use client";

import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";

// One picker for everyone a task is assigned to: any number of people.

/** Who can be picked. `viewerId` marks "(me)"; null options means they are still loading. */
export type PickerOptions = { people: Person[]; viewerId: string | null };

/** The trigger's text: "Jordan Dev, Sam Dev", "You" before the options arrive, or the placeholder. */
function summary(value: string[], options: PickerOptions | null, placeholder: string, assumeMe: boolean): string {
  if (options === null) return assumeMe ? "You" : value.length > 0 ? "Loading…" : placeholder;
  const names = value
    .map((id) => options.people.find((person) => person.id === id))
    .filter((person): person is Person => person !== undefined)
    .map((person) => (person.id === options.viewerId ? "You" : nameOf(person)));
  return names.length === 0 ? placeholder : names.join(", ");
}

/**
 * A button that says who is on it and opens a searchable list with check marks (apex-ux §4: one control, no
 * second dialog). Picking toggles. `onClose` fires when the list closes, so a page editor can save once instead
 * of on every tick.
 */
export function AssigneePicker({
  id,
  label,
  value,
  onChange,
  options,
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
  value: string[];
  onChange: (next: string[]) => void;
  options: PickerOptions | null;
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
  const empty = options !== null && value.length === 0;
  const toggle = (personId: string) => onChange(value.includes(personId) ? value.filter((each) => each !== personId) : [...value, personId]);

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
          <CommandInput placeholder="Search people…" maxLength={LIMITS.search} />
          <CommandList>
            <CommandEmpty>Nobody matches.</CommandEmpty>
            {options !== null ? (
              <CommandGroup heading="People">
                {options.people.map((person) => {
                  const on = value.includes(person.id);
                  const me = person.id === options.viewerId;
                  return (
                    <CommandItem key={person.id} value={`person ${nameOf(person)} ${person.email ?? ""} ${me ? "me" : ""}`} onSelect={() => toggle(person.id)} aria-selected={on} data-picked={on ? "true" : undefined}>
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
