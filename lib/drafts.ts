import { titleFromText } from "@/lib/tasks/title-from";

// What a draft is called and how it is previewed (docs/PLAN.md, 2026-11-11 log). Pure and shared: the server
// lists drafts with these, and the notepad's store keeps the list in step with what is being typed.

/** A task a draft is attached to, as the draft shows it. */
export type DraftTask = { id: string; title: string };

/** A draft in a list: everything but its full text. */
export type DraftSummary = {
  id: string;
  /** As typed; may be empty (see `draftName`). */
  title: string;
  /** The start of the body, line breaks kept: its first line names an untitled draft; a list row shows it on one line. */
  excerpt: string;
  updatedAt: string;
  task: DraftTask | null;
};

/** A draft with its text. */
export type DraftNote = DraftSummary & { body: string };

/** A draft as the task page shows it to its author: the start of the text, and whether there is more. */
export type TaskDraft = { id: string; title: string; excerpt: string; body: string; truncated: boolean; updatedAt: string };

export const UNTITLED_DRAFT = "Untitled draft";

/** How much of a body a list row carries. */
export const DRAFT_EXCERPT_LENGTH = 160;

/** The start of a draft's text, for the list. */
export function draftExcerpt(body: string): string {
  return body.trim().slice(0, DRAFT_EXCERPT_LENGTH);
}

/** An excerpt on one line. */
export const oneLine = (text: string): string => text.replace(/\s+/gu, " ").trim();

/** What a draft is called: its title, else the start of its text, else "Untitled draft". */
export function draftName(draft: { title: string; excerpt?: string; body?: string }): string {
  const title = draft.title.trim();
  if (title !== "") return title;
  return titleFromText(draft.body ?? draft.excerpt ?? "", 60) || UNTITLED_DRAFT;
}

/** A draft nobody has written in: no title, no text, no task. Such a draft is not kept when it is left. */
export function isBlankDraft(draft: { title: string; body?: string; excerpt?: string; task: DraftTask | null }): boolean {
  return draft.title.trim() === "" && (draft.body ?? draft.excerpt ?? "").trim() === "" && draft.task === null;
}
