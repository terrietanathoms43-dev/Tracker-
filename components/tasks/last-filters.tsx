"use client";

import { History, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import type { TaskView } from "@/lib/tasks/filters";

// "Back to your last view" (apex-ux §6): the last filtered /home list address, remembered in this browser only.
// It is a preference, not data, so localStorage is the right place; it never reaches the server.

const KEY = "trackwise.tasks.lastQuery";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, value);
  } catch {
    // Storage can be unavailable (private mode); the link then simply never shows.
  }
  for (const listener of listeners) listener();
}

/** Remembers the current filters, and offers the last ones back when the list opens unfiltered. */
export function LastFilters({ current, view }: { current: string; view: TaskView }) {
  const saved = useSyncExternalStore(subscribe, read, () => null);

  useEffect(() => {
    if (current !== "") write(current);
  }, [current]);

  if (current !== "" || !saved) return null;
  const href = view === "board" ? `/home?${saved}&view=board` : `/home?${saved}&view=list`;
  return (
    <div className="mb-3 flex items-center gap-2 text-[13px] text-muted-foreground">
      <History className="size-3.5 shrink-0" aria-hidden />
      <Link href={href} className="font-medium text-link underline-offset-4 hover:underline">
        Back to your last view
      </Link>
      <button type="button" aria-label="Forget the last view" className="rounded-sm p-0.5 hover:text-foreground" onClick={() => write(null)}>
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
