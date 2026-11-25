import { nestSubTasks, type NestedRow } from "./sub-tasks";
import type { TaskGroupRef, TaskListItem } from "./types";

// Tasks grouped together (docs/PLAN.md, 2026-11-11 log): equals, not parent and child. Wherever a list shows two or
// more tasks of one group, they sit side by side inside one border, at the place of the first of them; the list
// query stays flat and sorted, and these pure functions put the rows in order. A sub-task is not grouped itself: it
// goes where its parent goes, so a grouped parent brings its sub-tasks into the border with it. A task whose group
// has nobody else on the page stays where it was and carries a "Group" chip instead.

/** One thing a list draws: a plain row, or a group's rows inside one border. */
export type ListEntry =
  | { type: "row"; row: NestedRow }
  | {
      type: "group";
      group: TaskGroupRef;
      rows: NestedRow[];
      /** How many of the group's tasks are in this list (sub-tasks aside); the group may have more elsewhere. */
      shown: number;
    };

/**
 * The rows of a list in the order they are drawn: sub-tasks under their parents (`nest`; a list that keeps its rows
 * flat passes false), and each group's tasks pulled together to where the first of them stands.
 */
export function groupRows(items: TaskListItem[], nest = true): ListEntry[] {
  const rows: NestedRow[] = nest ? nestSubTasks(items) : items.map((task) => ({ task, nested: false }));
  // A unit is a task with the sub-tasks drawn under it: they move as one.
  const units: NestedRow[][] = [];
  for (const row of rows) {
    if (row.nested && units.length > 0) units[units.length - 1].push(row);
    else units.push([row]);
  }
  const unitsOf = new Map<string, NestedRow[][]>();
  for (const unit of units) {
    const group = unit[0].task.group;
    if (group === null) continue;
    const mates = unitsOf.get(group.id) ?? [];
    mates.push(unit);
    unitsOf.set(group.id, mates);
  }
  const entries: ListEntry[] = [];
  const placed = new Set<string>();
  for (const unit of units) {
    const group = unit[0].task.group;
    const mates = group === null ? undefined : unitsOf.get(group.id);
    if (group === null || mates === undefined || mates.length < 2) {
      for (const row of unit) entries.push({ type: "row", row });
      continue;
    }
    if (placed.has(group.id)) continue;
    placed.add(group.id);
    entries.push({ type: "group", group, rows: mates.flat(), shown: mates.length });
  }
  return entries;
}

/**
 * The same items with each group's members next to one another, at the place of the first: for a list that draws
 * cards rather than rows (a board column). Everything else keeps its order.
 */
export function clusterGroups<T extends { group: TaskGroupRef | null }>(items: T[]): T[] {
  const membersOf = new Map<string, T[]>();
  for (const item of items) {
    if (item.group === null) continue;
    const members = membersOf.get(item.group.id) ?? [];
    members.push(item);
    membersOf.set(item.group.id, members);
  }
  const out: T[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    if (item.group === null) {
      out.push(item);
      continue;
    }
    if (placed.has(item.group.id)) continue;
    placed.add(item.group.id);
    out.push(...(membersOf.get(item.group.id) ?? [item]));
  }
  return out;
}

/** Neighbouring items of one group, as runs: a board column draws a border round each run of two or more. */
export function groupRuns<T extends { group: TaskGroupRef | null }>(items: T[]): { group: TaskGroupRef | null; items: T[] }[] {
  const runs: { group: TaskGroupRef | null; items: T[] }[] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last !== undefined && item.group !== null && last.group !== null && last.group.id === item.group.id) last.items.push(item);
    else runs.push({ group: item.group, items: [item] });
  }
  return runs;
}

/** "Login revamp", or "Group" for one without a name. */
export const groupLabel = (group: Pick<TaskGroupRef, "name">): string => group.name?.trim() || "Group";

/** "3 tasks", or "2 of 5 tasks here" when the list holds only part of the group. */
export function describeGroupCount(shown: number, size: number): string {
  if (shown >= size) return `${size} ${size === 1 ? "task" : "tasks"}`;
  return `${shown} of ${size} tasks here`;
}

/** What a task hears when it cannot be grouped: the words the action and the menus share. */
export const GROUP_REFUSALS = {
  subTask: "A sub-task goes where its parent goes: group the parent instead.",
  closer: "It marks its goal achieved and stays last under it, so it is not grouped.",
  notLive: "Only live tasks can be grouped: send a local task or a proposal on first.",
  edit: "You need to be able to edit a task to group it.",
} as const;
