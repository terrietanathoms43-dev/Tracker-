"use client";

import { useEffect, useState } from "react";
import { getTaskFormOptions } from "@/actions/tasks";
import type { TaskFormOptions } from "@/lib/tasks/types";

// The New task form's pickers (people, teams, projects, goals), kept once per browser session so the dialog
// opens at once: the form renders with what it has and the pickers fill in when the options arrive.

type Loaded = { options: TaskFormOptions | null; error: string | null };

let cached: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;
const listeners = new Set<(loaded: Loaded) => void>();

/** Fetches (or refetches) the options; one request at a time, shared by everyone waiting. */
export function loadTaskFormOptions(): Promise<Loaded> {
  if (inflight) return inflight;
  inflight = getTaskFormOptions()
    .then((result): Loaded => (result.ok ? { options: result.data, error: null } : { options: null, error: result.error }))
    .catch((): Loaded => ({ options: null, error: "Couldn't load the pickers. Try again." }))
    .then((loaded) => {
      cached = loaded;
      inflight = null;
      for (const listener of listeners) listener(loaded);
      return loaded;
    });
  return inflight;
}

/** Warms the cache once the page is idle, so the first N is instant too. */
export function prefetchTaskFormOptions(): void {
  if (cached !== null || inflight !== null) return;
  void loadTaskFormOptions();
}

/** The current options (the cached ones at once, refreshed in the background each time the form opens). */
export function useTaskFormOptions(): Loaded {
  const [loaded, setLoaded] = useState<Loaded>(() => cached ?? { options: null, error: null });
  useEffect(() => {
    listeners.add(setLoaded);
    void loadTaskFormOptions();
    return () => {
      listeners.delete(setLoaded);
    };
  }, []);
  return loaded;
}
