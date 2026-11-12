import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";

// A task made from a comment (docs/PLAN.md, 2026-11-11 log): a link, not a sub-task. The comment cannot be resolved
// by hand while a live task made from it is open; it resolves itself when the last of them is closed (completed,
// rejected, deferred, cancelled or merged), and opens again when one is reopened, which puts the task it is on back
// to In progress when that one was completed. The task the comment is on waits for its open comments as it always
// did, so it waits for those tasks too. These are the words the server and the screens share for it.

const quoted = (titles: string[]): string => {
  const names = titles.map((title) => `“${title}”`);
  if (names.length <= 1) return names[0] ?? "the task made from it";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** " on “Ship the report”", or nothing when the viewer may not read the task the comment is on. */
const on = (title: string | null) => (title === null ? "" : ` on “${title}”`);

/** What a waiting comment says in place of its Resolve button: "Waits for “Fix the export”". */
export function waitsForLabel(titles: string[]): string {
  return titles.length > 2 ? `Waits for ${titles.length} tasks` : `Waits for ${quoted(titles)}`;
}

/** Why a comment can't be resolved by hand: the open tasks made from it. */
export function commentWaitsMessage(titles: string[]): string {
  return `This comment waits for ${quoted(titles)}: it resolves itself when ${titles.length > 1 ? "those tasks are" : "that task is"} closed.`;
}

/** The line the history keeps on the comment's task when the comment resolves itself (the history quotes a note, so it does not open with a quote of its own). */
export function resolvedByTaskNote(title: string, status: TaskStatus): string {
  return `The task made from it, “${title}”, was ${TASK_STATUS_LABELS[status].toLowerCase()}.`;
}

/** The line the history keeps when a reopened task opens its comment again. */
export function reopenedByTaskNote(title: string): string {
  return `The task made from it, “${title}”, was reopened.`;
}

/** Why a completed task is in progress again: a task made from a comment on it was reopened, so that comment is open again. */
export function reopenedBecause(title: string): string {
  return `A comment on it is open again: “${title}”, the task made from that comment, was reopened.`;
}

/** What the New task form says when the task is being made from a comment. */
export function fromCommentHint(parentTitle: string): string {
  return `Made from a comment on “${parentTitle}”: the comment stays open until this task is closed, then resolves itself.`;
}

/** The title a comment becomes: its first line that says something, cut to `max` characters. */
export function titleFromComment(body: string, max: number): string {
  const line =
    body
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part !== "") ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** What a made task's forms know about the comment it came from (UpdateContext). `taskTitle` is null when the viewer may not read the task the comment is on. */
export type FromCommentContext = { resolved: boolean; taskTitle: string | null; taskStatus: TaskStatus | null; otherOpen: number };

/** What closing a made task (any closed status) does to its comment, said before the save; null when it does nothing. */
export function closingResolvesMessage(from: FromCommentContext): string | null {
  if (from.resolved) return null;
  if (from.otherOpen === 0) return `Closing this task resolves the comment it was made from${on(from.taskTitle)}.`;
  const others = from.otherOpen === 1 ? "1 other task" : `${from.otherOpen} other tasks`;
  return `The comment it was made from${on(from.taskTitle)} still waits for ${others}: it resolves itself when the last of them is closed.`;
}

/** What reopening a closed made task does, said before the save; null when its comment is open anyway. */
export function reopeningMessage(from: FromCommentContext): string | null {
  if (!from.resolved) return null;
  const parent = from.taskStatus === "completed" && from.taskTitle !== null ? `, and “${from.taskTitle}”, which is completed, goes back to In progress` : from.taskStatus === "completed" ? ", and the task it is on goes back to In progress" : "";
  return `Reopening this task opens the comment it was made from${on(from.taskTitle)} again${parent}.`;
}
