import { nameOf } from "./people";
import type { Assignees, Person } from "./types";

// Assignment as a set of people (docs/PLAN.md, 2026-10-18 log; teams left on 2026-10-30): the pure helpers the
// actions, the history and the screens share, so "who is on this" is spelled the same way everywhere.

export const EMPTY_ASSIGNEES: Assignees = [];

/** Unique, in the order given, with empties dropped. */
export const uniqueIds = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => id !== ""))];

/** The same set, whatever the order. */
export const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

export const idsOf = (assignees: Assignees): string[] => assignees.map((person) => person.id);

export const isUnassigned = (assignees: Assignees): boolean => assignees.length === 0;

/** "Jordan Dev, Sam Dev"; `fallback` when nobody is on it. */
export function describeAssignees(assignees: Assignees, fallback = "Unassigned"): string {
  return assignees.length === 0 ? fallback : assignees.map((person) => nameOf(person)).join(", ");
}

/** A name and an id, as an audit row keeps them: the history still reads right after a rename or a deletion. */
export type NamedRef = { id: string; name: string };

export const namedPeople = (people: Person[]): NamedRef[] => people.map((person) => ({ id: person.id, name: nameOf(person) }));

/**
 * What an `assigned` or `handed_over` activity row stores on each side. `teams` only appears on rows written
 * while teams existed (before 2026-10-30); it is read so old history still names them, never written.
 */
export type AssignmentSnapshot = { assignees: NamedRef[]; teams?: NamedRef[] };

export const snapshotOf = (assignees: Assignees): AssignmentSnapshot => ({ assignees: namedPeople(assignees) });

/** "Jordan Dev, Sam Dev and Frontend": every name on one side of an assignment change (legacy teams last). */
export function listNames(snapshot: Partial<AssignmentSnapshot> | null | undefined): string[] {
  return [...(snapshot?.assignees ?? []), ...(snapshot?.teams ?? [])].map((ref) => ref.name);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Who joined and who left between two assignment sets, by id. */
export function diffAssignees(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  };
}
