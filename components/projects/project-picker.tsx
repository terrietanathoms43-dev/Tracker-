"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { Check, ChevronsUpDown, FolderKanban, GripVertical, Pin, Plus } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ProjectStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { noRecents, readRecents, RECENT_PROJECTS_KEY, rememberRecent, subscribeRecents } from "@/components/pickers/recents";

// The one project picker (docs/PLAN.md, 2026-11-04 log): the navigation's scope, the add bar, the New task and
// goal dialogs and the task page all open the same searchable list. Pinned projects come first, in the order the
// person dragged them into (kept on the server, per person and workspace); then what this browser picked lately;
// then every other project, closed ones grouped at the end where a picker offers them.

export type ProjectPickerOption = { id: string; name: string; status?: ProjectStatus };

export type ProjectPickerProps = {
  id?: string;
  /** The accessible name of the trigger. */
  label?: string;
  /** "" means none / all. */
  value: string;
  onChange: (projectId: string) => void;
  /** Null while they load. */
  options: ProjectPickerOption[] | null;
  /** Pinned project ids, in order. */
  pinned?: string[];
  /** When given, rows get a pin and the Pinned group can be dragged into order. */
  onPinsChange?: (projectIds: string[]) => void;
  /** The empty choice's label ("All projects", "No project"); omit it to require a project. */
  noneLabel?: string;
  /** What the trigger says while nothing is chosen and there is no empty choice. */
  placeholder?: string;
  /** Lists completed and archived projects in a group of their own (the navigation's picker). */
  includeClosed?: boolean;
  /** One more choice at the end, such as "+ New project…". */
  extra?: { value: string; label: string };
  /** How the trigger looks: a form field, the sidebar's picker, or the phone's icon. */
  trigger?: "field" | "nav" | "icon";
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Data attributes and the like, spread onto the trigger. */
  triggerProps?: Record<string, string | undefined>;
};

const STATUS_LABEL: Record<ProjectStatus, string> = { active: "", completed: "completed", archived: "archived" };

const matches = (option: ProjectPickerOption, query: string) => option.name.toLowerCase().includes(query);

function Row({
  item,
  prefix,
  selected,
  pinned,
  onPick,
  onTogglePin,
  handle,
  style,
  rowRef,
}: {
  item: ProjectPickerOption;
  prefix: string;
  selected: boolean;
  pinned: boolean;
  onPick: (id: string) => void;
  onTogglePin?: (id: string) => void;
  handle?: ReactNode;
  style?: React.CSSProperties;
  rowRef?: (node: HTMLDivElement | null) => void;
}) {
  const status = item.status && item.status !== "active" ? STATUS_LABEL[item.status] : "";
  return (
    <CommandItem ref={rowRef} style={style} value={`${prefix}${item.id}`} onSelect={() => onPick(item.id)} data-project-item={item.id} className="group/row gap-2 pr-1">
      {handle ?? <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {status ? <span className="shrink-0 text-[12px] text-muted-foreground">{status}</span> : null}
      <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} aria-hidden />
      {onTogglePin ? (
        <button
          type="button"
          aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
          aria-pressed={pinned}
          data-pin={item.id}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin(item.id);
          }}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-opacity outline-none hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
            pinned ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 data-[selected=true]:opacity-100",
          )}
        >
          <Pin className={cn("size-3.5", pinned && "fill-current")} aria-hidden />
        </button>
      ) : null}
    </CommandItem>
  );
}

/** A pinned row: the grip drags it into place (or Space, then the arrows, on a keyboard). */
function PinnedRow({ item, selected, onPick, onTogglePin, sortable }: { item: ProjectPickerOption; selected: boolean; onPick: (id: string) => void; onTogglePin: (id: string) => void; sortable: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !sortable });
  const handle = sortable ? (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${item.name}`}
      data-pin-handle={item.id}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        // The list behind would otherwise move its own selection, or pick the row, on the keys that move the pin.
        if (event.key === " " || event.key === "Enter" || isDragging) event.stopPropagation();
      }}
      className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  ) : undefined;
  return (
    <Row
      item={item}
      prefix="pinned:"
      selected={selected}
      pinned
      onPick={onPick}
      onTogglePin={onTogglePin}
      handle={handle}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined, position: "relative", zIndex: isDragging ? 1 : undefined }}
    />
  );
}

/**
 * A button that says which project is chosen and opens the list. Picking closes it and remembers the choice in
 * this browser's recents; pinning and dragging never close it. `pinned` is the server's order; the list moves at
 * once and tells `onPinsChange`, which saves.
 */
export function ProjectPicker({
  id,
  label = "Project",
  value,
  onChange,
  options,
  pinned = [],
  onPinsChange,
  noneLabel,
  placeholder = "Pick a project…",
  includeClosed = false,
  extra,
  trigger = "field",
  disabled = false,
  invalid = false,
  className,
  triggerProps,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recents = useSyncExternalStore(subscribeRecents, () => readRecents(RECENT_PROJECTS_KEY), noRecents);
  // The pins as shown: the server's order until the person drags one, then the new order while the save runs.
  const [pins, setPins] = useState(pinned);
  const [pinsProp, setPinsProp] = useState(pinned);
  if (pinned !== pinsProp) {
    setPinsProp(pinned);
    setPins(pinned);
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const list = options ?? [];
  const byId = new Map(list.map((option) => [option.id, option]));
  const chosen = value === "" ? null : (byId.get(value) ?? null);
  const q = query.trim().toLowerCase();
  const pinnedItems = pins.map((each) => byId.get(each)).filter((option): option is ProjectPickerOption => option !== undefined);
  const recentItems = recents
    .filter((each) => !pins.includes(each))
    .map((each) => byId.get(each))
    .filter((option): option is ProjectPickerOption => option !== undefined);
  const above = new Set([...pins, ...recentItems.map((option) => option.id)]);
  const rest = list.filter((option) => !above.has(option.id));
  const activeRest = rest.filter((option) => (option.status ?? "active") === "active");
  const closedRest = includeClosed ? rest.filter((option) => option.status !== undefined && option.status !== "active") : [];
  const found = q === "" ? [] : list.filter((option) => matches(option, q));

  function pick(next: string) {
    onChange(next);
    if (next !== "" && byId.has(next)) rememberRecent(RECENT_PROJECTS_KEY, next);
    setOpen(false);
    setQuery("");
  }
  function togglePin(projectId: string) {
    const next = pins.includes(projectId) ? pins.filter((each) => each !== projectId) : [...pins, projectId];
    setPins(next);
    onPinsChange?.(next);
  }
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = pins.indexOf(String(active.id));
    const to = pins.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(pins, from, to);
    setPins(next);
    onPinsChange?.(next);
  }

  const text = chosen ? chosen.name : value !== "" && options === null ? "Loading…" : (noneLabel ?? placeholder);
  const muted = chosen === null && noneLabel === undefined;
  const triggerClass =
    trigger === "icon"
      ? cn("grid size-9 place-items-center rounded-md transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", chosen ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:text-foreground")
      : trigger === "nav"
        ? cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 text-left text-base transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            chosen ? "border-primary bg-sidebar-accent font-medium text-foreground" : "border-input bg-background text-foreground hover:bg-accent/60",
          )
        : cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
          );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger id={id} aria-label={trigger === "icon" ? `${label}: ${chosen ? chosen.name : (noneLabel ?? "none")}` : label} aria-invalid={invalid ? true : undefined} disabled={disabled} data-value={value} {...triggerProps} className={cn(triggerClass, className)}>
        {trigger === "icon" ? (
          <FolderKanban className="size-5" aria-hidden />
        ) : (
          <>
            <FolderKanban className={cn("size-4 shrink-0", chosen ? "text-primary" : "text-muted-foreground")} aria-hidden />
            <span className={cn("min-w-0 flex-1 truncate", muted && "text-muted-foreground", options === null && value === "" && "text-muted-foreground")}>{text}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-80 max-w-[calc(100vw-1.5rem)] p-0" data-project-picker>
        <Command shouldFilter={false} loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search projects…" maxLength={LIMITS.search} />
          <CommandList className="max-h-80">
            {options === null ? (
              <p className="px-3 py-4 text-[13px] text-muted-foreground">Loading projects…</p>
            ) : q !== "" ? (
              found.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-muted-foreground">No project matches “{query.trim()}”.</p>
              ) : (
                <CommandGroup heading="Projects">
                  {found.map((item) => (
                    <Row key={item.id} item={item} prefix="found:" selected={item.id === value} pinned={pins.includes(item.id)} onPick={pick} onTogglePin={onPinsChange ? togglePin : undefined} />
                  ))}
                </CommandGroup>
              )
            ) : (
              <>
                {noneLabel !== undefined ? (
                  <CommandGroup>
                    <CommandItem value="__none__" onSelect={() => pick("")} data-project-item="" className="gap-2">
                      <span className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                      <Check className={cn("size-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")} aria-hidden />
                    </CommandItem>
                  </CommandGroup>
                ) : null}
                {pinnedItems.length > 0 ? (
                  <CommandGroup heading="Pinned">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={pins} strategy={verticalListSortingStrategy}>
                        {pinnedItems.map((item) => (
                          <PinnedRow key={item.id} item={item} selected={item.id === value} onPick={pick} onTogglePin={togglePin} sortable={onPinsChange !== undefined && pinnedItems.length > 1} />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </CommandGroup>
                ) : null}
                {recentItems.length > 0 ? (
                  <CommandGroup heading="Recent">
                    {recentItems.map((item) => (
                      <Row key={item.id} item={item} prefix="recent:" selected={item.id === value} pinned={false} onPick={pick} onTogglePin={onPinsChange ? togglePin : undefined} />
                    ))}
                  </CommandGroup>
                ) : null}
                {activeRest.length > 0 ? (
                  <CommandGroup heading={pinnedItems.length > 0 || recentItems.length > 0 ? "Other projects" : "Projects"}>
                    {activeRest.map((item) => (
                      <Row key={item.id} item={item} prefix="all:" selected={item.id === value} pinned={false} onPick={pick} onTogglePin={onPinsChange ? togglePin : undefined} />
                    ))}
                  </CommandGroup>
                ) : null}
                {closedRest.length > 0 ? (
                  <CommandGroup heading="Completed and archived">
                    {closedRest.map((item) => (
                      <Row key={item.id} item={item} prefix="closed:" selected={item.id === value} pinned={false} onPick={pick} onTogglePin={onPinsChange ? togglePin : undefined} />
                    ))}
                  </CommandGroup>
                ) : null}
                {list.length === 0 ? <p className="px-3 py-4 text-[13px] text-muted-foreground">No projects yet.</p> : null}
                {extra ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem value="__extra__" onSelect={() => pick(extra.value)} data-project-item={extra.value} className="gap-2 font-medium">
                        <Plus className="size-4 shrink-0" aria-hidden />
                        {extra.label}
                      </CommandItem>
                    </CommandGroup>
                  </>
                ) : null}
              </>
            )}
          </CommandList>
          {onPinsChange && q === "" && options !== null && list.length > 0 ? (
            <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">{pins.length === 0 ? "Pin a project (the pin on its row) to keep it at the top." : "Drag the grip to put your pinned projects in order."}</p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
