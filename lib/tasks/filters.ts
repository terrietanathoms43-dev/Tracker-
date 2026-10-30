import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";

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

export const TASK_VIEWS = ["list", "board"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export type TaskFilters = {
  q: string;
  status: TaskStatus[];
  /** "" anyone · "me" · "none" (unassigned) · a user id (assigned directly, or through a team they are in) */
  assignee: string;
  /** "" any · a team id: tasks the team is assigned to */
  team: string;
  priority: TaskPriority | "";
  project: string;
  /** Tasks linked to the goal directly or through one of its projects. */
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
  team: "",
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
    team: idLike(one(raw, "team")),
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
  if (filters.team) params.set("team", filters.team);
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
