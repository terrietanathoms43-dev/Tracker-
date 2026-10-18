import { nameOf } from "./people";
import type { Assignees, Person, TeamRef } from "./types";

// Assignment as a set of people and teams (docs/PLAN.md, 2026-10-18 log): the pure helpers the actions, the
// history and the screens share, so "who is on this" is spelled the same way everywhere.

/** The ids behind an assignment, as a form or an action carries them. */
export type AssigneeIds = { assigneeIds: string[]; teamIds: string[] };

export const EMPTY_ASSIGNEES: Assignees = { people: [], teams: [] };

/** Unique, in the order given, with empties dropped. */
export const uniqueIds = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => id !== ""))];

/** The same set, whatever the order. */
export const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

export const idsOf = (assignees: Assignees): AssigneeIds => ({
  assigneeIds: assignees.people.map((person) => person.id),
  teamIds: assignees.teams.map((team) => team.id),
});

export const isUnassigned = (assignees: Assignees): boolean => assignees.people.length === 0 && assignees.teams.length === 0;

/** "Jordan Dev, Sam Dev · Frontend"; `fallback` when nobody is on it. */
export function describeAssignees(assignees: Assignees, fallback = "Unassigned"): string {
  const parts = [assignees.people.map((person) => nameOf(person)).join(", "), assignees.teams.map((team) => team.name).join(", ")].filter(Boolean);
  return parts.length === 0 ? fallback : parts.join(" · ");
}

/** A name and an id, as an audit row keeps them: the history still reads right after a rename or a deletion. */
export type NamedRef = { id: string; name: string };

export const namedPeople = (people: Person[]): NamedRef[] => people.map((person) => ({ id: person.id, name: nameOf(person) }));
export const namedTeams = (teams: TeamRef[]): NamedRef[] => teams.map((team) => ({ id: team.id, name: team.name }));

/** What an `assigned` or `handed_over` activity row stores on each side. */
export type AssignmentSnapshot = { assignees: NamedRef[]; teams: NamedRef[] };

export const snapshotOf = (assignees: Assignees): AssignmentSnapshot => ({ assignees: namedPeople(assignees.people), teams: namedTeams(assignees.teams) });

/** "Jordan Dev, Sam Dev and Frontend": every name on one side of an assignment change, people first. */
export function listNames(snapshot: Partial<AssignmentSnapshot> | null | undefined): string[] {
  const names = [...(snapshot?.assignees ?? []), ...(snapshot?.teams ?? [])].map((ref) => ref.name);
  return names;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Who joined and who left between two assignment sets, by id. */
export function diffAssignees(before: AssigneeIds, after: AssigneeIds): { addedPeople: string[]; removedPeople: string[]; addedTeams: string[]; removedTeams: string[] } {
  return {
    addedPeople: after.assigneeIds.filter((id) => !before.assigneeIds.includes(id)),
    removedPeople: before.assigneeIds.filter((id) => !after.assigneeIds.includes(id)),
    addedTeams: after.teamIds.filter((id) => !before.teamIds.includes(id)),
    removedTeams: before.teamIds.filter((id) => !after.teamIds.includes(id)),
  };
}
