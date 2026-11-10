// A goal's "Everything completed" task (docs/PLAN.md, 2026-11-04 and 2026-11-09 logs): made with the goal, it is the
// goal's last step, and completing it marks the goal achieved. These are the words every screen and the server use
// for it, so a refusal reads the same in a toast, under a form and in a selection bar's summary.

export const CLOSER_TITLE = "Everything completed";
export const CLOSER_DESCRIPTION = "Complete this last, once every other task under the goal is done: it marks the goal achieved.";

/**
 * A closer named in plain text, where no chip can be drawn (the palette, pickers, notifications, the activity feed):
 * "Everything completed · Ship onboarding". Any other task is just its title. lib/dal/tasks.ts `taskLabelSql` writes
 * the same in SQL.
 */
export function closerLabel(title: string, goalTitle: string | null | undefined): string {
  return goalTitle ? `${title} · ${goalTitle}` : title;
}

/** A list row's title in plain text: a closer with its goal, any other task as it is. */
export function taskLabel(task: { title: string; goalCloser: boolean; goal: { title: string } | null }): string {
  return task.goalCloser ? closerLabel(task.title, task.goal?.title) : task.title;
}

const named = (goalTitle: string | null | undefined) => (goalTitle ? `“${goalTitle}”` : "its goal");

/** Why a closer can't be completed yet: the same words on the server and under the forms' Completed option. */
export function closerHeldMessage(open: number, goalTitle: string | null | undefined): string {
  return `Finish the other ${open} ${open === 1 ? "task" : "tasks"} under ${named(goalTitle)} first: this one marks the goal achieved.`;
}

/** What the forms say under Completed once nothing else is open: the save achieves the goal. */
export function closerReadyMessage(goalTitle: string | null | undefined): string {
  return `Completing this marks ${named(goalTitle)} achieved.`;
}

/** A closer belongs to its goal: it is not moved to another project or goal, nor attached under another task. */
export function closerStaysMessage(goalTitle: string | null | undefined): string {
  return `This task marks ${named(goalTitle)} achieved, so it stays with its goal: it can't be moved or attached under another task.`;
}

/** A closer is not deleted on its own. */
export function closerDeleteMessage(goalTitle: string | null | undefined): string {
  return `This task marks ${named(goalTitle)} achieved, so it can't be deleted on its own: it goes when the goal is deleted.`;
}

/** A closer is done once per goal: a goal that comes round again repeats itself, closer included. */
export function closerRepeatMessage(goalTitle: string | null | undefined): string {
  return `This task marks ${named(goalTitle)} achieved, so it doesn't repeat: set the repeat on the goal.`;
}
