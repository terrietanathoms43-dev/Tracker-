"use client";

import { AudioLines, BarChart3, ClipboardCheck, Clock, Columns3, FolderKanban, House, ListChecks, NotebookPen, Plus, Search, SquareCheckBig, Target, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getPaletteContext, paletteSearch } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIMITS } from "@/lib/limits";
import type { NavKey } from "@/lib/permissions";
import { taskLabel } from "@/lib/tasks/closer";
import { tasksHref } from "@/lib/tasks/filters";
import type { TaskListItem } from "@/lib/tasks/types";
import { useTaskActions } from "./task-actions";

// The ⌘K palette: task search by title and description, the tasks you were just looking at, the task actions,
// and the places the viewer's role can go.

/** Where the palette can go, each tied to the navigation key that grants it (lib/permissions.ts navFor). */
const PLACES: { href: string; label: string; icon: LucideIcon; nav: NavKey }[] = [
  { href: "/home", label: "Home", icon: House, nav: "home" },
  { href: "/my-work", label: "My Work", icon: ListChecks, nav: "my-work" },
  { href: "/home?view=list", label: "Tasks", icon: SquareCheckBig, nav: "tasks" },
  { href: "/home?view=board", label: "Board", icon: Columns3, nav: "tasks" },
  { href: "/home?view=projects", label: "Projects", icon: FolderKanban, nav: "tasks" },
  { href: "/goals", label: "Goals", icon: Target, nav: "goals" },
  { href: "/members", label: "Members", icon: Users, nav: "members" },
  { href: "/proposals", label: "Proposals", icon: ClipboardCheck, nav: "proposals" },
  { href: "/reports", label: "Reports", icon: BarChart3, nav: "reports" },
];

type Caps = { nav: NavKey[]; canCreate: boolean; canCapture: boolean; worker: boolean };

/** The tasks this browser opened most recently (ids and titles only), newest first. */
const RECENT_KEY = "trackwise.recentTasks";
const RECENT_MAX = 8;
type Recent = { id: string; title: string };

function readRecent(): Recent[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((each): each is Recent => typeof each?.id === "string" && typeof each?.title === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Called by the task page: the task joins the top of the recent list. */
export function rememberRecentTask(task: Recent): void {
  try {
    const next = [task, ...readRecent().filter((each) => each.id !== task.id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* a browser that refuses storage simply has no recents */
  }
}

/** ⌘K / Ctrl+K: find a task by title or description, pick up a recent one, start one, or go anywhere the viewer's role reaches. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { openCreate, openUpdate, currentTaskId } = useTaskActions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: TaskListItem[] }>({ q: "", items: [] });
  // Read each time the palette opens (the dialog never renders on the server, so there is nothing to hydrate).
  const recent = useMemo<Recent[]>(() => (open ? readRecent() : []), [open]);
  const [touched, setTouched] = useState<TaskListItem[]>([]);
  const [caps, setCaps] = useState<Caps | null>(null);

  // What this viewer may do is asked each time the palette opens, so a workspace switch is picked up, and the
  // workspace's latest tasks are fetched then too.
  useEffect(() => {
    if (!open) return;
    let live = true;
    getPaletteContext().then((result) => {
      if (live && result.ok) setCaps(result.data);
    });
    paletteSearch({ q: "" }).then((result) => {
      if (live && result.ok) setTouched(result.data);
    });
    return () => {
      live = false;
    };
  }, [open]);

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
  const recentIds = new Set(recent.map((each) => each.id));
  const latest = touched.filter((task) => !recentIds.has(task.id)).slice(0, Math.max(0, 6 - recent.length));
  // The tasks views aren't a nav destination any more (the /home tab row is), but workers still get them here.
  const places =
    caps === null
      ? []
      : PLACES.filter(
          (place) => (place.nav === "tasks" ? caps.worker : caps.nav.includes(place.nav)) && (term === "" || place.label.toLowerCase().includes(term)),
        );
  const showCreate = caps?.canCreate === true && (term === "" || "new task".includes(term));
  const showCapture = caps?.canCapture === true && (term === "" || "capture from a meeting".includes(term));
  const showUpdate = currentTaskId !== null && (term === "" || "update progress".includes(term));
  const showAll = term !== "" && caps?.worker === true;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search tasks, start one, or go somewhere</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:text-[13px] **:[[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search tasks by title or description…" maxLength={LIMITS.search} />
          <CommandList className="max-h-[min(60dvh,420px)]">
            <CommandEmpty>{term === "" ? "Type to search tasks." : "Nothing matches."}</CommandEmpty>
            {term === "" && (recent.length > 0 || latest.length > 0) ? (
              <CommandGroup heading="Recent">
                {recent.map((task) => (
                  <CommandItem key={`recent-${task.id}`} value={`recent-${task.id}`} onSelect={() => go(`/tasks/${task.id}`)}>
                    <Clock className="text-muted-foreground" />
                    <span className="truncate">{task.title}</span>
                    <span className="ml-auto text-[12px] text-muted-foreground">viewed</span>
                  </CommandItem>
                ))}
                {latest.map((task) => (
                  <CommandItem key={`latest-${task.id}`} value={`latest-${task.id}`} onSelect={() => go(`/tasks/${task.id}`)}>
                    <StatusIcon status={task.status} />
                    <span className="truncate">{taskLabel(task)}</span>
                    <span className="ml-auto text-[12px] text-muted-foreground">updated</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {tasks.length > 0 || showAll ? (
              <CommandGroup heading="Tasks">
                {tasks.map((task) => (
                  <CommandItem key={task.id} value={`task-${task.id}`} onSelect={() => go(`/tasks/${task.id}`)}>
                    <StatusIcon status={task.status} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{taskLabel(task)}</span>
                      {task.description ? <span className="truncate text-[12px] text-muted-foreground">{task.description.slice(0, 120)}</span> : null}
                    </span>
                  </CommandItem>
                ))}
                {showAll ? (
                  <CommandItem value="search-all" onSelect={() => go(tasksHref({ q: query.trim(), closed: true }))}>
                    <Search />
                    See every task matching “{query.trim()}”
                  </CommandItem>
                ) : null}
              </CommandGroup>
            ) : null}
            {showCreate || showUpdate || showCapture ? (
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
                    {caps?.worker ? "New task" : "Propose a task"}
                    <CommandShortcut>N</CommandShortcut>
                  </CommandItem>
                ) : null}
                {showCapture ? (
                  <CommandItem value="capture-meeting" onSelect={() => go("/capture")}>
                    <AudioLines />
                    Capture from a meeting
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
