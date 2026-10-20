"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The "?" help sheet (apex-ux §9): the list of global keys, opened with ? or from the account menu. The keys
// themselves are bound in components/tasks/use-shortcuts.ts; this only describes them.

/** Dispatched by the account menu's "Keyboard shortcuts" item. */
export const SHORTCUTS_EVENT = "trackwise:shortcuts";

const SHORTCUTS = [
  { keys: ["N"], does: "New task" },
  { keys: ["U"], does: "Update progress, on a task page" },
  { keys: ["⌘", "K"], does: "Search tasks and commands (Ctrl+K on Windows)" },
  { keys: ["/"], does: "Focus the list search" },
  { keys: ["Ctrl", "Enter"], does: "Save the form you are typing in" },
  { keys: ["Esc"], does: "Close a dialog or menu" },
  { keys: ["?"], does: "This list" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function openShortcutsHelp(): void {
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      event.preventDefault();
      setOpen(true);
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, onOpen);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything here also works with a mouse.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2 text-base">
          {SHORTCUTS.map(({ keys, does }) => (
            <li key={does} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{does}</span>
              <span className="flex shrink-0 gap-1">
                {keys.map((key) => (
                  <kbd key={key} className="rounded-md border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium">
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
