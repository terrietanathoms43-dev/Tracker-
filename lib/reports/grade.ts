// How the report colours a column of counts (2026-10-30 log): 0 is red, the column's highest value is fully green,
// everything between is mixed in proportion, so the colours re-grade themselves whenever the top value changes.
// The mix is done by the browser (`color-mix` of two status tokens), which keeps both themes right automatically.
// Pure, so the share and the sort order are unit-tested.

/** How far along the red → green scale a value sits, 0 to 1. A column of all zeros stays red. */
export function gradeShare(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}

/** The CSS colour for a share: red at 0, green at 1, mixed in oklch between the status tokens. */
export function gradeColor(share: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return `color-mix(in oklch, var(--status-blocked-fg), var(--status-completed-fg) ${percent}%)`;
}

export type SortDirection = "asc" | "desc";

/** The next direction after a click on a header: a new column starts high → low, a second click flips it. */
export function nextSort<K extends string>(current: { key: K; direction: SortDirection }, key: K, defaultDirection: SortDirection = "desc"): { key: K; direction: SortDirection } {
  if (current.key !== key) return { key, direction: defaultDirection };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

/** Sorts rows by a number or a string, ties kept in their original order (a stable sort, like a file list). */
export function sortRows<T>(rows: readonly T[], value: (row: T) => number | string, direction: SortDirection): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = value(a.row);
      const right = value(b.row);
      const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
      return (direction === "asc" ? order : -order) || a.index - b.index;
    })
    .map((entry) => entry.row);
}
