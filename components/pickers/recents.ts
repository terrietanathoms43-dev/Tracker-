// What this browser picked lately (projects, goals), for the "Recent" group at the top of a picker. A browser
// preference, not data: localStorage, newest first, a handful at most; a browser that refuses storage simply has
// no recents. Read through useSyncExternalStore so a server render and the hydrating render agree (nothing).

const EVENT = "trackwise:recents";
const MAX = 5;

export const RECENT_PROJECTS_KEY = "trackwise.recentProjects";
export const RECENT_GOALS_KEY = "trackwise.recentGoals";

const EMPTY: string[] = [];
/** The last value read per key, so useSyncExternalStore gets the same array back while nothing changed. */
const cache = new Map<string, string[]>();

export function readRecents(key: string): string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((each): each is string => typeof each === "string").slice(0, MAX) : [];
    const last = cache.get(key);
    if (last && last.length === ids.length && last.every((each, index) => each === ids[index])) return last;
    cache.set(key, ids);
    return ids;
  } catch {
    return cache.get(key) ?? EMPTY;
  }
}

/** Puts `id` first in the list behind `key`, dropping it from wherever it was. */
export function rememberRecent(key: string, id: string): void {
  if (typeof window === "undefined" || id === "") return;
  try {
    const next = [id, ...readRecents(key).filter((each) => each !== id)].slice(0, MAX);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* no storage: nothing to remember */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeRecents(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Nothing on the server and while hydrating. */
export const noRecents = (): string[] => EMPTY;
