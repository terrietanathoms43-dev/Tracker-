// The title a task gets from what was typed about it (docs/PLAN.md, 2026-11-11 log). The add bar's box is the
// task's description; the row still needs a short name, so the title is the start of that text: its first line,
// whole when it is short, else its first sentence, else cut at a word with an ellipsis. Pure, so the add bar's
// preview and the server (actions/tasks.ts createTask, which has the last word) read a text the same way.

/** How long a title taken from a description may be: about what a list row shows without wrapping. */
export const TITLE_SNIPPET_MAX = 80;

/** The shortest opening a sentence may be for it to stand as the title ("Hi. …" is not a name for a task). */
const SENTENCE_MIN = 12;

/** A list marker, a checkbox or a heading mark in front of the first line: "- ", "* ", "• ", "1. ", "[ ] ", "## ". */
const LEADING_MARK = /^(?:[-*•–—]\s+|\d{1,3}[.)]\s+|\[[ xX]?\]\s+|#{1,6}\s+)+/u;

const tidy = (line: string) => line.replace(LEADING_MARK, "").replace(/\s+/gu, " ").trim();

/**
 * A short title for `text`: the first line that says anything, without a list marker. A line that fits is the
 * title as typed (less a closing full stop); a longer one gives its first sentence when that fits, and otherwise
 * its opening words up to `max` characters with "…". Empty text has no title.
 */
export function titleFromText(text: string, max: number = TITLE_SNIPPET_MAX): string {
  const line =
    text
      .split(/\r?\n/u)
      .map(tidy)
      .find((part) => part !== "") ?? "";
  if (line === "") return "";
  const withoutStop = (value: string) => (/[^.]\.$/u.test(value) ? value.slice(0, -1) : value);
  if (line.length <= max) return withoutStop(line);

  // The first sentence, when it ends early enough to be a title and late enough to mean something.
  for (const match of line.matchAll(/[.!?](?=\s)/gu)) {
    const end = match.index + 1;
    if (end > max) break;
    if (end >= SENTENCE_MIN) return withoutStop(line.slice(0, end));
  }

  // Otherwise the opening words: cut at the last space that leaves most of the room used, never mid-word if it can be helped.
  const room = max - 1;
  const cut = line.lastIndexOf(" ", room);
  const head = (cut >= Math.floor(room * 0.6) ? line.slice(0, cut) : line.slice(0, room)).replace(/[\s,;:.\-–—]+$/u, "");
  return `${head}…`;
}

/** Whether the title says everything the text does: nothing more would be read by opening the description. */
export function titleCoversText(text: string, max: number = TITLE_SNIPPET_MAX): boolean {
  const lines = text
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return lines.length <= 1 && (lines[0] ?? "").replace(/\s+/gu, " ").length <= max;
}
