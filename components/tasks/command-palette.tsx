"use client";

import { Columns3, FolderKanban, House, Inbox, ListChecks, NotebookPen, Plus, SquareCheckBig, Target, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPaletteContext, paletteSearch } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NavKey } from "@/lib/permissions";
import type { TaskListItem } from "@/lib/tasks/types";
import { useTaskActions } from "./task-actions";

// The ⌘K palette: task search by title, the two task actions, and the places the viewer's role can go.

/** Where the palette can go, each tied to the navigation key that grants it (lib/permissions.ts navFor). */
const PLACES: { href: string; label: string; icon: LucideIcon; nav: NavKey }[] = [
  { href: "/home", label: "Home", icon: House, nav: "home" },
  { href: "/my-work", label: "My Work", icon: ListChecks, nav: "my-work" },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig, nav: "tasks" },
  { href: "/tasks?view=board", label: "Board", icon: Columns3, nav: "tasks" },
  { href: "/projects", label: "Projects", icon: FolderKanban, nav: "tasks" },
  { href: "/goals", label: "Goals", icon: Target, nav: "goals" },
  { href: "/team", label: "Team", icon: Users, nav: "team" },
  { href: "/requests", label: "Requests", icon: Inbox, nav: "requests" },
];

type Caps = { nav: NavKey[]; canCreate: boolean };

/** ⌘K / Ctrl+K: find a task by title, start one, update the open one, or go anywhere the viewer's role reaches. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { openCreate, openUpdate, currentTaskId } = useTaskActions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: TaskListItem[] }>({ q: "", items: [] });
  const [caps, setCaps] = useState<Caps | null>(null);

  // What this viewer may do is asked each time the palette opens, so a workspace switch is picked up.
  useEffect(() => {
    if (!open) return;
    let live = true;
    getPaletteContext().then((result) => {
      if (live && result.ok) setCaps(result.data);
    });
    return () => {
      live = false;
    };
  }, [open]);

  // Debounced title search: one request once typing pauses.
  useEffect(() => {
    const q = query.trim();
    if (q === "") return;
    const timer = window.setTimeout(async () => {
      const result = await paletteSearch({ q });
      if (result.ok) setResults({ q, items: result.data });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const term = query.trim().toLowerCase();
  const tasks = term !== "" && results.q.toLowerCase() === term ? results.items : [];
  const places = caps === null ? [] : PLACES.filter((place) => caps.nav.includes(place.nav) && (term === "" || place.label.toLowerCase().includes(term)));
  const showCreate = caps?.canCreate === true && (term === "" || "new task".includes(term));
  const showUpdate = currentTaskId !== null && (term === "" || "update progress".includes(term));

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search tasks, start one, or go somewhere</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search tasks or type a command…" />
          <CommandList className="max-h-[min(60dvh,420px)]">
            <CommandEmpty>{term === "" ? "Type to search tasks." : "Nothing matches."}</CommandEmpty>
            {tasks.length > 0 ? (
              <CommandGroup heading="Tasks">
                {tasks.map((task) => (
                  <CommandItem key={task.id} value={`task-${task.id}`} onSelect={() => go(`/tasks/${task.id}`)}>
                    <StatusIcon status={task.status} />
                    <span className="truncate">{task.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {showCreate || showUpdate ? (
              <CommandGroup heading="Actions">
                {showCreate ? (
                  <CommandItem
                    value="new-task"
                    onSelect={() => {
                      close();
                      openCreate();
                    }}
                  >
                    <Plus />
                    New task
                    <CommandShortcut>N</CommandShortcut>
                  </CommandItem>
                ) : null}
                {showUpdate && currentTaskId ? (
                  <CommandItem
                    value="update-progress"
                    onSelect={() => {
                      close();
                      openUpdate(currentTaskId);
                    }}
                  >
                    <NotebookPen />
                    Update progress
                    <CommandShortcut>U</CommandShortcut>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            ) : null}
            {places.length > 0 ? (
              <CommandGroup heading="Go to">
                {places.map(({ href, label, icon: Icon }) => (
                  <CommandItem key={href} value={`go-${href}`} onSelect={() => go(href)}>
                    <Icon />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
