"use client";

import { useSyncExternalStore } from "react";
import { loadDraft, saveDraft } from "@/actions/drafts";

// The notepad's state, shared by the Draft tab and the floating notepad (docs/PLAN.md, 2026-11-04 log): one text,
// one debounced save, one open / folded / off switch kept in this browser. Both views read the same snapshot, so
// typing in one shows in the other at once.

export type NotepadMode = "off" | "open" | "collapsed";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type Notepad = {
  body: string;
  loaded: boolean;
  save: SaveState;
  savedAt: string | null;
  mode: NotepadMode;
};

const MODE_KEY = "trackwise.notepad";
const SAVE_DELAY = 900;

let state: Notepad = { body: "", loaded: false, save: "idle", savedAt: null, mode: "off" };
const listeners = new Set<() => void>();
let timer: number | null = null;
let loading: Promise<void> | null = null;

function emit(next: Partial<Notepad>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function readMode(): NotepadMode {
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "open" || raw === "collapsed" ? raw : "off";
  } catch {
    return "off";
  }
}

export function subscribeNotepad(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    const mode = readMode();
    if (mode !== state.mode) state = { ...state, mode };
  }
  return () => listeners.delete(listener);
}

const SERVER: Notepad = { body: "", loaded: false, save: "idle", savedAt: null, mode: "off" };

/** The notepad as it is now; the server and the hydrating render see an empty, closed one. */
export function useNotepad(): Notepad {
  return useSyncExternalStore(subscribeNotepad, () => state, () => SERVER);
}

/** What the server has, handed over by the Draft tab (or fetched by the floating notepad); typing already under way wins. */
export function hydrateNotepad(body: string, savedAt: string | null): void {
  if (state.loaded && state.save !== "idle" && state.save !== "saved") return;
  emit({ body, savedAt, loaded: true, save: "idle" });
}

/** Fetches the note once, for a floating notepad opened on a page that didn't render the Draft tab. */
export function ensureNotepadLoaded(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  if (loading) return loading;
  loading = loadDraft()
    .then((result) => {
      if (result.ok) hydrateNotepad(result.data.body, result.data.updatedAt);
      else emit({ loaded: true, save: "error" });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The text as typed; saved about a second after the last keystroke. */
export function setNotepadBody(body: string): void {
  emit({ body, loaded: true, save: "dirty" });
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => void flushNotepad(), SAVE_DELAY);
}

/** Saves now (a page about to unload, a convert about to read the text). */
export async function flushNotepad(): Promise<void> {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (state.save !== "dirty" && state.save !== "error") return;
  const body = state.body;
  emit({ save: "saving" });
  const result = await saveDraft({ body });
  if (!result.ok) {
    emit({ save: "error" });
    return;
  }
  // Keep "dirty" if more was typed while the save ran; that text is saved by the timer it started.
  emit(state.body === body ? { save: "saved", savedAt: result.data.updatedAt } : { savedAt: result.data.updatedAt });
}

/** Open the floating notepad, fold it to the edge, or put it away; remembered in this browser. */
export function setNotepadMode(mode: NotepadMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* not remembered; still applies now */
  }
  emit({ mode });
}
