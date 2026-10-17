"use client";

import { useEffect, useRef } from "react";

// The global keys (apex-ux §9): N new task, U update progress on a task page, ⌘K / Ctrl+K the palette,
// / focuses the list search. None of them fire while typing in a field or while a dialog or menu is open.

/** True when a key press belongs to whatever has focus (a field, an open dialog or menu), not to the app. */
function isBusy(target: EventTarget | null): boolean {
  if (document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu]")) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export type ShortcutHandlers = {
  onCreate: () => void;
  /** Called for U; does nothing when no task page is open. */
  onUpdate: () => void;
  onPalette: () => void;
};

export function useShortcuts(handlers: ShortcutHandlers) {
  // Always call the latest handlers without re-binding the listener on every render.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        latest.current.onPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isBusy(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        latest.current.onCreate();
      } else if (key === "u") {
        event.preventDefault();
        latest.current.onUpdate();
      } else if (key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-list-search]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
