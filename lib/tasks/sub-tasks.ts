import type { TaskListItem } from "./types";

// Sub-tasks in a list (docs/PLAN.md, 2026-11-08 log): a task attached to another sits right under it, indented,
// wherever the two are listed together. The list query stays flat; this pure function puts the rows in order:
// every parent (or plain task) in the order the list gave, each followed by its children in their own order.
// A child whose parent is not on the page stays where it was and is drawn with a "Part of" link instead, so a
// filter that matches the child alone still shows it.

export type NestedRow = {
  task: TaskListItem;
  /** Drawn indented under the row before it, which is its parent. */
  nested: boolean;
};

/** Parents first in list order, each followed by its children; children without their parent on the page stay put. */
export function nestSubTasks(items: TaskListItem[]): NestedRow[] {
  const present = new Set(items.map((item) => item.id));
  const childrenOf = new Map<string, TaskListItem[]>();
  for (const item of items) {
    if (item.parent !== null && present.has(item.parent.id)) {
      const siblings = childrenOf.get(item.parent.id) ?? [];
      siblings.push(item);
      childrenOf.set(item.parent.id, siblings);
    }
  }
  const rows: NestedRow[] = [];
  for (const item of items) {
    if (item.parent !== null && present.has(item.parent.id)) continue;
    rows.push({ task: item, nested: false });
    for (const child of childrenOf.get(item.id) ?? []) rows.push({ task: child, nested: true });
  }
  return rows;
}

/** "3 sub-tasks", "1 sub-task". */
export const describeSubTasks = (n: number): string => `${n} ${n === 1 ? "sub-task" : "sub-tasks"}`;
