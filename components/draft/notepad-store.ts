"use client";

import { useSyncExternalStore } from "react";
import { createDraft, deleteDraft, loadDraft, loadDrafts, saveDraft } from "@/actions/drafts";
import type { ActionResult } from "@/lib/action-result";
import { draftExcerpt, isBlankDraft, type DraftNote, type DraftSummary, type DraftTask } from "@/lib/drafts";

// The notepad's state, shared by the Draft tab and the floating notepad (docs/PLAN.md, 2026-11-04 and 2026-11-11
// logs): the person's list of drafts, the one that is open with its title and text, one debounced save, and the
// open / folded / off switch kept in this browser. Both views read the same snapshot, so typing in one shows in
// the other (and in the list row) at once. After the first load the store is the truth for what is open and what
// was typed; the server's list is taken again whenever nothing is waiting to be saved.

export type NotepadMode = "off" | "open" | "collapsed";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type Notepad = {
  /** The list has been read (handed over by the Draft tab, or fetched by the floating notepad). */
  loaded: boolean;
  /** The latest change first, as loaded; a new draft goes on top, and rows don't jump about while one is typed in. */
  drafts: DraftSummary[];
  /** The draft that is open. Null while the person has none: the first words typed make the first draft. */
  currentId: string | null;
  title: string;
  body: string;
  /** False while a draft that was just picked is still on its way. */
  ready: boolean;
  save: SaveState;
  savedAt: string | null;
  /** Something the person should read (a draft that could not be made or opened). */
  notice: string | null;
  mode: NotepadMode;
};

const MODE_KEY = "trackwise.notepad";
/** The draft this browser had open last, so the floating notepad comes back to it. */
const CURRENT_KEY = "trackwise.notepad.draft";
const SAVE_DELAY = 900;

const EMPTY: Notepad = { loaded: false, drafts: [], currentId: null, title: "", body: "", ready: true, save: "idle", savedAt: null, notice: null, mode: "off" };

let state: Notepad = EMPTY;
const listeners = new Set<() => void>();
let timer: number | null = null;
let loading: Promise<void> | null = null;
/** One save at a time: a save asked for while another runs waits for it, then writes whatever is newest. */
let saving: Promise<void> = Promise.resolve();

function emit(next: Partial<Notepad>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* not remembered; still applies now */
  }
}

function readMode(): NotepadMode {
  const raw = readStored(MODE_KEY);
  return raw === "open" || raw === "collapsed" ? raw : "off";
}

export function subscribeNotepad(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    const mode = readMode();
    if (mode !== state.mode) state = { ...state, mode };
  }
  return () => listeners.delete(listener);
}

/** The notepad as it is now; the server and the hydrating render see an empty, closed one. */
export function useNotepad(): Notepad {
  return useSyncExternalStore(
    subscribeNotepad,
    () => state,
    () => EMPTY,
  );
}

/** The notepad right now, for an event handler that has just awaited something (a render's snapshot may be a step behind). */
export const notepadNow = (): Notepad => state;

/** Words are waiting to be saved, or on their way: what the server says about the open draft must not replace them. */
const unsaved = () => state.save === "dirty" || state.save === "saving" || state.save === "error";

const summaryOf = (draft: DraftNote): DraftSummary => ({ id: draft.id, title: draft.title, excerpt: draft.excerpt, updatedAt: draft.updatedAt, task: draft.task });

/** The list with one row changed. */
const patched = (id: string, change: Partial<DraftSummary>): DraftSummary[] => state.drafts.map((draft) => (draft.id === id ? { ...draft, ...change } : draft));

/** Opens `current` (or nothing) on top of `drafts`. */
function adopt(drafts: DraftSummary[], current: DraftNote | null): void {
  emit({ loaded: true, drafts, currentId: current?.id ?? null, title: current?.title ?? "", body: current?.body ?? "", ready: true, save: "idle", savedAt: current?.updatedAt ?? null, notice: null });
  store(CURRENT_KEY, current?.id ?? null);
}

/**
 * What the server has, handed over by the Draft tab each time it renders. The first time it fills the store. After
 * that the list is taken as the server has it and the open draft stays open. Its text is taken from the server
 * again only when the server's copy is newer than the last save made here (it was changed in another tab); a
 * render that started before that save finished is older, and must not put the earlier text back. The open draft
 * gives way only when it is gone (deleted elsewhere). Typing already under way always wins.
 */
export function hydrateNotepad(drafts: DraftSummary[], current: DraftNote | null): void {
  if (!state.loaded) return adopt(drafts, current);
  if (unsaved() || !state.ready) return;
  const openId = state.currentId;
  if (openId === null || !drafts.some((draft) => draft.id === openId)) return adopt(drafts, current);
  if (current !== null && current.id === openId && (state.savedAt === null || current.updatedAt > state.savedAt)) return adopt(drafts, current);
  // The server's list, with the open draft's row as it is known here (this browser may be a save ahead of that render).
  const { title, body, savedAt } = state;
  emit({
    drafts: drafts.map((draft) => (draft.id === openId ? { ...draft, title, excerpt: draftExcerpt(body), updatedAt: savedAt !== null && savedAt > draft.updatedAt ? savedAt : draft.updatedAt } : draft)),
  });
}

/** Fetches the drafts once, for a floating notepad opened on a page that didn't render the Draft tab. */
export function ensureNotepadLoaded(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  if (loading) return loading;
  loading = loadDrafts({ prefer: readStored(CURRENT_KEY) ?? "" })
    .then((result) => {
      if (state.loaded) return;
      if (result.ok) adopt(result.data.drafts, result.data.current);
      else emit({ loaded: true, save: "error", notice: result.error });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function schedule(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => void flushNotepad(), SAVE_DELAY);
}

/** What was typed, into the open draft and its row in the list; saved about a second after the last keystroke. */
function typed(next: { title?: string; body?: string }): void {
  const title = next.title ?? state.title;
  const body = next.body ?? state.body;
  emit({ title, body, save: "dirty", notice: null, drafts: state.currentId === null ? state.drafts : patched(state.currentId, { title, excerpt: draftExcerpt(body) }) });
  schedule();
}

export const setNotepadBody = (body: string): void => typed({ body });
export const setNotepadTitle = (title: string): void => typed({ title });

async function saveNow(): Promise<void> {
  if (state.save !== "dirty" && state.save !== "error") return;
  const { currentId, title, body } = state;
  emit({ save: "saving" });
  // The first words a person types make their first draft.
  if (currentId === null) {
    const made = await createDraft({ title, body });
    if (!made.ok) return emit({ save: "error", notice: made.error });
    if (state.currentId !== null) return;
    const same = state.title === title && state.body === body;
    emit({
      currentId: made.data.id,
      drafts: [{ ...summaryOf(made.data), title: state.title, excerpt: draftExcerpt(state.body) }, ...state.drafts],
      savedAt: made.data.updatedAt,
      ...(same ? { save: "saved" as const } : {}),
    });
    store(CURRENT_KEY, made.data.id);
    return;
  }
  const result = await saveDraft({ id: currentId, title, body });
  // Another draft was opened meanwhile: this save was the old one's last, and the new one has its own state.
  if (state.currentId !== currentId) return;
  if (!result.ok) return emit({ save: "error", notice: result.error });
  // Keep "dirty" if more was typed while the save ran; that text is saved by the timer it started.
  const same = state.title === title && state.body === body;
  emit({ savedAt: result.data.updatedAt, drafts: patched(currentId, { updatedAt: result.data.updatedAt }), ...(same ? { save: "saved" as const } : {}) });
}

/** Saves now (a page about to unload, another draft about to open, a convert about to read the text). */
export function flushNotepad(): Promise<void> {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  saving = saving.then(saveNow, saveNow);
  return saving;
}

/** Opens another draft: what was typed in the one being left is saved first, then the picked one's text is fetched. */
export async function openDraft(id: string): Promise<void> {
  if (id === state.currentId) return;
  await flushNotepad();
  const row = state.drafts.find((draft) => draft.id === id);
  emit({ currentId: id, title: row?.title ?? "", body: "", ready: false, save: "idle", savedAt: row?.updatedAt ?? null, notice: null });
  store(CURRENT_KEY, id);
  const result = await loadDraft({ id });
  if (state.currentId !== id) return;
  if (!result.ok) {
    // It is gone (deleted elsewhere): out of the list, and the next one opens instead.
    const rest = state.drafts.filter((draft) => draft.id !== id);
    emit({ drafts: rest, currentId: null, title: "", body: "", ready: true, notice: result.error });
    store(CURRENT_KEY, null);
    if (rest[0]) await openDraft(rest[0].id);
    return;
  }
  const known = state.drafts.some((draft) => draft.id === id);
  emit({ title: result.data.title, body: result.data.body, ready: true, savedAt: result.data.updatedAt, drafts: known ? patched(id, summaryOf(result.data)) : [summaryOf(result.data), ...state.drafts] });
}

/**
 * Starts a new draft and opens it. A draft nobody has written in yet is the new draft already (wherever it is in
 * the list), so pressing the button twice never leaves a pile of empty ones behind.
 */
export async function newDraft(): Promise<boolean> {
  await flushNotepad();
  if (state.currentId === null) {
    // No draft is open: the empty editor is the new draft, made when something is typed.
    emit({ title: "", body: "", ready: true, save: "idle", savedAt: null, notice: null });
    return true;
  }
  const blank = state.drafts.find((draft) => isBlankDraft(draft));
  if (blank !== undefined) {
    await openDraft(blank.id);
    return true;
  }
  const made = await createDraft({});
  if (!made.ok) {
    emit({ notice: made.error });
    return false;
  }
  emit({ drafts: [summaryOf(made.data), ...state.drafts], currentId: made.data.id, title: "", body: "", ready: true, save: "idle", savedAt: null, notice: null });
  store(CURRENT_KEY, made.data.id);
  return true;
}

/** Deletes a draft for good; when it was the open one, the next in the list opens. Returns the action's result for the toast. */
export async function removeDraft(id: string): Promise<ActionResult> {
  if (id === state.currentId && timer !== null) {
    // What was typed into a draft that is about to go is not worth saving.
    window.clearTimeout(timer);
    timer = null;
  }
  await saving;
  const result = await deleteDraft({ id });
  if (!result.ok) return result;
  const rest = state.drafts.filter((draft) => draft.id !== id);
  if (state.currentId !== id) {
    emit({ drafts: rest });
    return result;
  }
  emit({ drafts: rest, currentId: null, title: "", body: "", ready: true, save: "idle", savedAt: null, notice: null });
  store(CURRENT_KEY, null);
  if (rest[0]) await openDraft(rest[0].id);
  return result;
}

/** A draft was attached to a task, or let go of it (the action already ran): its row says so. */
export function noteDraftTask(id: string, task: DraftTask | null): void {
  if (state.drafts.some((draft) => draft.id === id)) emit({ drafts: patched(id, { task }) });
}

/** Open the floating notepad, fold it to the edge, or put it away; remembered in this browser. */
export function setNotepadMode(mode: NotepadMode): void {
  store(MODE_KEY, mode);
  emit({ mode });
}
