"use client";

import { Search } from "lucide-react";
import { useTaskActions } from "@/components/tasks/task-actions";

// The two visible ways into the command palette (⌘K / Ctrl+K on a keyboard).

/** The phone top bar's search icon. */
export function SearchButton() {
  const { openPalette } = useTaskActions();
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={openPalette}
      className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Search className="size-5" aria-hidden />
    </button>
  );
}

/** The sidebar's muted search row under the workspace switcher, showing the palette's shortcut. */
export function SidebarSearch() {
  const { openPalette } = useTaskActions();
  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-8 w-full items-center gap-2.5 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <Search className="size-3.5" aria-hidden />
      Search…
      <kbd className="ml-auto rounded border px-1 font-sans text-[11px]">⌘K</kbd>
    </button>
  );
}
