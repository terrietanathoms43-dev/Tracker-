import type { TaskPriority } from "@/lib/constants";
import type { Person, TeamRef } from "./types";

// The quick-add bar's typed shortcuts: "Fix the login bug !high @tomorrow @sam" is a task titled "Fix the login
// bug", high priority, due tomorrow, assigned to Sam. Pure, so the bar and the unit tests read titles the same way.

/** `!word` → priority. "medium" is accepted for "normal", the word most trackers use. */
const PRIORITY_WORDS: Record<string, TaskPriority> = { urgent: "urgent", high: "high", normal: "normal", medium: "normal", low: "low" };

/** `@word` → due date. These never name a person, even someone called Today. */
const DUE_WORDS = ["today", "tomorrow"] as const;
export type DueWord = (typeof DUE_WORDS)[number];

/** Someone (or a team) an `@` can name: `keys` are every spelling that matches, `handle` the one suggestions insert. */
export type MentionTarget = { kind: "person" | "team"; id: string; label: string; handle: string; keys: string[] };

/** What a token did; `start`/`end` cover it in the text, including punctuation stuck to its end ("@sam,"). */
export type QuickAddToken = { kind: "priority" | "due" | "person" | "team"; start: number; end: number };

export type QuickAddParse = {
  /** The text with every recognised token taken out. */
  title: string;
  /** The last `!word` wins. */
  priority: TaskPriority | null;
  due: DueWord | null;
  people: string[];
  teams: string[];
  /** `@words` that name nobody, or more than one target: they stay in the title. */
  unmatched: string[];
  tokens: QuickAddToken[];
};

/** Lowercase, accents and anything but letters, digits, dot, dash and underscore dropped. */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");

const isDueWord = (word: string): word is DueWord => (DUE_WORDS as readonly string[]).includes(word);

/**
 * Everyone an `@` can name. A person matches by first name, full name without spaces ("@jordandev") and the part
 * of their email before the @; a team by its name without spaces. The handle is the shortest of those no one else
 * shares, so a suggestion never inserts an ambiguous name.
 */
export function mentionTargets(people: Person[], teams: TeamRef[]): MentionTarget[] {
  const drafts = [
    ...people.map((person) => {
      const words = (person.name ?? "").trim().split(/\s+/).filter(Boolean);
      const keys = [words[0] ?? "", words.join(""), (person.email ?? "").split("@")[0]];
      return { kind: "person" as const, id: person.id, label: person.name ?? person.email ?? "Someone", keys };
    }),
    ...teams.map((team) => ({ kind: "team" as const, id: team.id, label: team.name, keys: [team.name] })),
  ].map((draft) => ({ ...draft, keys: [...new Set(draft.keys.map(normalize))].filter((key) => key !== "" && !isDueWord(key)) }));
  const owners = new Map<string, number>();
  for (const draft of drafts) for (const key of draft.keys) owners.set(key, (owners.get(key) ?? 0) + 1);
  return drafts
    .filter((draft) => draft.keys.length > 0)
    .map((draft) => ({ ...draft, handle: draft.keys.find((key) => owners.get(key) === 1) ?? draft.keys[draft.keys.length - 1] }));
}

/** A `!` or `@` at the start of the text or after a space, and the word glued to it. */
const TOKEN = /(^|\s)([!@])([^\s!@]+)/gu;

/** Reads a quick-add title. Unknown `!words` and `@words` are left alone: "ping @ops" with no Ops team stays as typed. */
export function parseQuickAdd(text: string, targets: MentionTarget[]): QuickAddParse {
  const result: QuickAddParse = { title: "", priority: null, due: null, people: [], teams: [], unmatched: [], tokens: [] };
  for (const match of text.matchAll(TOKEN)) {
    const [, lead, symbol, raw] = match;
    const start = match.index + lead.length;
    const end = start + symbol.length + raw.length;
    const word = normalize(raw.replace(/[,.;:)]+$/u, ""));
    if (symbol === "!") {
      const priority = PRIORITY_WORDS[word];
      if (priority === undefined) continue;
      result.priority = priority;
      result.tokens.push({ kind: "priority", start, end });
      continue;
    }
    if (isDueWord(word)) {
      result.due = word;
      result.tokens.push({ kind: "due", start, end });
      continue;
    }
    const found = targets.filter((target) => target.keys.includes(word));
    if (found.length !== 1) {
      result.unmatched.push(`@${raw}`);
      continue;
    }
    const [target] = found;
    const list = target.kind === "person" ? result.people : result.teams;
    if (!list.includes(target.id)) list.push(target.id);
    result.tokens.push({ kind: target.kind, start, end });
  }
  result.title = removeTokens(text, result.tokens);
  return result;
}

/** The text without the given tokens, spaces tidied. */
export function removeTokens(text: string, tokens: QuickAddToken[]): string {
  let out = "";
  let at = 0;
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, token.start);
    at = token.end;
  }
  return (out + text.slice(at)).replace(/\s+/g, " ").trim();
}

/** The `!word` or `@word` the caret is in (or right after), for suggestions; null anywhere else. */
export function activeToken(text: string, caret: number): { symbol: "!" | "@"; query: string; start: number; end: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)([!@])([^\s!@]*)$/u.exec(before);
  if (match === null) return null;
  const start = match.index + match[1].length;
  const rest = /^[^\s!@]*/u.exec(text.slice(caret))?.[0] ?? "";
  return { symbol: match[2] as "!" | "@", query: normalize(match[3] + rest), start, end: caret + rest.length };
}

/** One suggestion: what to put in place of the token, and how the list shows it. */
export type QuickAddSuggestion = { insert: string; label: string; hint: string; kind: "priority" | "due" | "person" | "team" };

const PRIORITY_SUGGESTIONS: QuickAddSuggestion[] = [
  { insert: "!urgent", label: "Urgent", hint: "Priority", kind: "priority" },
  { insert: "!high", label: "High", hint: "Priority", kind: "priority" },
  { insert: "!normal", label: "Normal", hint: "Priority", kind: "priority" },
  { insert: "!low", label: "Low", hint: "Priority", kind: "priority" },
];

/** What fits a partial token: priorities after `!`; due words, then people, then teams after `@`. */
export function suggest(token: { symbol: "!" | "@"; query: string }, targets: MentionTarget[], limit = 6): QuickAddSuggestion[] {
  const { query } = token;
  if (token.symbol === "!") return PRIORITY_SUGGESTIONS.filter((each) => each.insert.slice(1).startsWith(query) || (query !== "" && "medium".startsWith(query) && each.insert === "!normal"));
  const due: QuickAddSuggestion[] = DUE_WORDS.filter((word) => word.startsWith(query)).map((word) => ({
    insert: `@${word}`,
    label: word === "today" ? "Today" : "Tomorrow",
    hint: "Due date",
    kind: "due",
  }));
  const labelWords = (label: string) => label.split(/\s+/).map(normalize);
  const named = targets
    .filter((target) => target.keys.some((key) => key.startsWith(query)) || labelWords(target.label).some((word) => word.startsWith(query)))
    .map((target): QuickAddSuggestion => ({ insert: `@${target.handle}`, label: target.label, hint: target.kind === "team" ? "Team" : `@${target.handle}`, kind: target.kind }));
  // A name typed out in full belongs above the date words ("@to" offers Today first, "@tom" offers Tom first).
  const exact = named.filter((each) => each.insert === `@${query}`);
  return [...exact, ...due, ...named.filter((each) => !exact.includes(each))].slice(0, limit);
}
