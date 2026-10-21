"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getTaskFormOptions } from "@/actions/tasks";
import type { TaskFormOptions } from "@/lib/tasks/types";

// The New task form's pickers (people, teams, projects, goals), kept once per browser session so the dialog
// opens at once: the form renders with what it has and the pickers fill in when the options arrive.

type Loaded = { options: TaskFormOptions | null; error: string | null };

const NOTHING: Loaded = { options: null, error: null };

let cached: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fetches (or refetches) the options; one request at a time, shared by everyone waiting. */
export function loadTaskFormOptions(): Promise<Loaded> {
  if (inflight) return inflight;
  inflight = getTaskFormOptions()
    .then((result): Loaded => (result.ok ? { options: result.data, error: null } : { options: null, error: result.error }))
    .catch((): Loaded => ({ options: null, error: "Couldn't load the pickers. Try again." }))
    .then((loaded) => {
      cached = loaded;
      inflight = null;
      for (const listener of listeners) listener();
      return loaded;
    });
  return inflight;
}

/** Warms the cache once the page is idle, so the first N is instant too. */
export function prefetchTaskFormOptions(): void {
  if (cached !== null || inflight !== null) return;
  void loadTaskFormOptions();
}

/**
 * The current options (the cached ones at once, refreshed in the background each time the form mounts). The server
 * and the hydrating render see none, so an always-visible form like the quick-add bar hydrates cleanly.
 */
export function useTaskFormOptions(): Loaded {
  const loaded = useSyncExternalStore(subscribe, () => cached ?? NOTHING, () => NOTHING);
  useEffect(() => {
    void loadTaskFormOptions();
  }, []);
  return loaded;
}
