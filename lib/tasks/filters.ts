import { CLOSED_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "./people";
import type { GoalOption, Person } from "./types";

// The task list's state lives in the URL (apex-ux §6), so a view can be shared and the back button works.
// These functions are the only translation between the address and the filters the DAL understands.

export const TASK_SORTS = ["smart", "due", "priority", "updated", "created"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const SORT_LABELS: Record<TaskSort, string> = {
  smart: "Smart order",
  due: "Due date",
  priority: "Priority",
  updated: "Recently updated",
  created: "Newest",
};

export const DUE_FILTERS = ["overdue", "week", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export const DUE_LABELS: Record<DueFilter, string> = {
  overdue: "Overdue",
  week: "Due this week",
  none: "No due date",
};

export const TASK_VIEWS = ["list", "board"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export type TaskFilters = {
  q: string;
  status: TaskStatus[];
  /** "" anyone · "me" · "none" (unassigned) · a user id */
  assignee: string;
  priority: TaskPriority | "";
  /** "" all · "none" (no project) · a project id */
  project: string;
  /** "" all · "none" (no goal) · a goal id: tasks linked to it directly, through one of its projects, or through a sub-goal. */
  goal: string;
  due: DueFilter | "";
  /** Show completed and rejected tasks (hidden by default). */
  closed: boolean;
  sort: TaskSort;
};

export const DEFAULT_FILTERS: TaskFilters = {
  q: "",
  status: [],
  assignee: "",
  priority: "",
  project: "",
  goal: "",
  due: "",
  closed: false,
  sort: "smart",
};

type Raw = Record<string, string | string[] | undefined>;

const one = (raw: Raw, key: string): string => {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

const pick = <T extends string>(value: string, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(value) ? (value as T) : "");

/** An id or "me"/"none": anything else in the address is ignored rather than sent to the database. */
const idLike = (value: string) => (/^[\w-]{1,64}$/.test(value) ? value : "");

/** Reads the filters from searchParams, dropping anything it does not recognise. */
export function parseFilters(raw: Raw): TaskFilters {
  const statuses = one(raw, "status")
    .split(",")
    .map((value) => pick(value, TASK_STATUSES))
    .filter((value): value is TaskStatus => value !== "");
  return {
    q: one(raw, "q").slice(0, LIMITS.search),
    status: [...new Set(statuses)],
    assignee: idLike(one(raw, "assignee")),
    priority: pick(one(raw, "priority"), TASK_PRIORITIES),
    project: idLike(one(raw, "project")),
    goal: idLike(one(raw, "goal")),
    due: pick(one(raw, "due"), DUE_FILTERS),
    closed: one(raw, "closed") === "1",
    sort: pick(one(raw, "sort"), TASK_SORTS) || "smart",
  };
}

/** List or board: `?view=board`, anything else is the list. */
export function parseView(raw: Raw): TaskView {
  return pick(one(raw, "view"), TASK_VIEWS) || "list";
}

/** Only what differs from the defaults goes into the URL. */
export function filtersToParams(filters: TaskFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.project) params.set("project", filters.project);
  if (filters.goal) params.set("goal", filters.goal);
  if (filters.due) params.set("due", filters.due);
  if (filters.closed) params.set("closed", "1");
  if (filters.sort !== "smart") params.set("sort", filters.sort);
  return params;
}

/** The /home address for some filters, keeping the board view when asked. */
export function tasksHref(filters: Partial<TaskFilters>, view: TaskView = "list"): string {
  const params = filtersToParams({ ...DEFAULT_FILTERS, ...filters });
  if (view === "board") params.set("view", "board");
  else params.set("view", "list");
  return `/home?${params}`;
}

/** Whether anything narrows the list (the sort order alone does not). */
export function isFiltered(filters: TaskFilters): boolean {
  return filtersToParams({ ...filters, sort: "smart" }).toString() !== "";
}

/**
 * Which statuses the list shows when no status filter is set: the open ones, plus the closed ones when "Show
 * closed" is on. The board's columns always include Completed (its last 14 days), so it is passed its own set.
 */
export function visibleStatuses(filters: TaskFilters, offered: readonly TaskStatus[]): TaskStatus[] {
  if (filters.status.length > 0) return filters.status.filter((status) => offered.includes(status));
  return offered.filter((status) => filters.closed || !CLOSED_STATUSES.includes(status) || offered.length < TASK_STATUSES.length);
}

// --- what is on, in words ------------------------------------------------------------------------------------

/** One active filter as a removable chip: what it says, and the change that takes it off. */
export type FilterChip = { key: string; label: string; clear: Partial<TaskFilters> };

/** The names the chips need; the toolbar has them for its pickers already. */
export type FilterNames = { people: Person[]; projects: { id: string; name: string }[]; goals: GoalOption[] };

const labelOf = (items: { id: string; name?: string | null; title?: string }[], id: string, fallback: string) => {
  const found = items.find((item) => item.id === id);
  return found === undefined ? fallback : (found.title ?? found.name ?? fallback);
};

/**
 * Every filter that narrows the list, as a chip (apex-ux §6: a person must be able to see at a glance that a
 * view is filtered, and take one filter off without losing the rest). Status chips are shown by the status row
 * itself, so they are not repeated here.
 */
export function activeFilterChips(filters: TaskFilters, names: FilterNames): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.q) chips.push({ key: "q", label: `Search: “${filters.q}”`, clear: { q: "" } });
  if (filters.assignee === "me") chips.push({ key: "assignee", label: "Assigned to me", clear: { assignee: "" } });
  else if (filters.assignee === "none") chips.push({ key: "assignee", label: "Unassigned", clear: { assignee: "" } });
  else if (filters.assignee) {
    const person = names.people.find((each) => each.id === filters.assignee);
    chips.push({ key: "assignee", label: `Assigned to ${person ? nameOf(person) : "someone"}`, clear: { assignee: "" } });
  }
  if (filters.priority) chips.push({ key: "priority", label: `${TASK_PRIORITY_LABELS[filters.priority]} priority`, clear: { priority: "" } });
  if (filters.due) chips.push({ key: "due", label: DUE_LABELS[filters.due], clear: { due: "" } });
  if (filters.project === "none") chips.push({ key: "project", label: "No project", clear: { project: "" } });
  else if (filters.project) chips.push({ key: "project", label: `Project: ${labelOf(names.projects, filters.project, "a project")}`, clear: { project: "" } });
  if (filters.goal === "none") chips.push({ key: "goal", label: "No goal", clear: { goal: "" } });
  else if (filters.goal) chips.push({ key: "goal", label: `Goal: ${labelOf(names.goals, filters.goal, "a goal")}`, clear: { goal: "" } });
  if (filters.closed) chips.push({ key: "closed", label: "Showing closed", clear: { closed: false } });
  return chips;
}
