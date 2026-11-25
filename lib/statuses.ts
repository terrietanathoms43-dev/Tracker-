import { Archive, Ban, CalendarClock, CheckCheck, CheckCircle2, Circle, CircleDot, CirclePause, Clock, Eye, Flag, FlaskConical, GitMerge, GitPullRequest, Hourglass, ListChecks, OctagonAlert, Pin, Rocket, Snowflake, Star, Tag, XCircle, Zap, type LucideIcon } from "lucide-react";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";

// Workspace-configurable task statuses (2026-11-11): the nine built-ins are the defaults; an org may rename
// them, re-icon them, recolor them, reorder them, flip their closed flag, archive them, and add its own.
// A status's *key* never changes — tasks store the key — so a rename is a label-only change and every
// existing task follows it. Behaviour travels with the *kind*: built-ins keep theirs (blocked asks a reason,
// awaiting_approval asks an approver, completed runs the goal machinery, merged needs a parent); a custom
// status is either "open" or "closed" (reason required, like Rejected), nothing more.

/** What a status does when a task enters it. `closed` covers the built-in closed-without-completion statuses and every custom closed status. */
export type StatusKind = "open" | "in_progress" | "blocked" | "awaiting_approval" | "completed" | "closed" | "merged";

/** The colour families a status may use — each maps to a `status-<name>-*` CSS token pair. */
export const STATUS_TONES = ["slate", "stone", "red", "orange", "amber", "green", "teal", "blue", "violet", "rose"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** The icons the picker offers. The stored value is the key; the component is looked up here. */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  circle: Circle,
  "circle-dot": CircleDot,
  clock: Clock,
  "octagon-alert": OctagonAlert,
  "circle-pause": CirclePause,
  "x-circle": XCircle,
  ban: Ban,
  "git-merge": GitMerge,
  "check-circle": CheckCircle2,
  flag: Flag,
  hourglass: Hourglass,
  pin: Pin,
  star: Star,
  tag: Tag,
  zap: Zap,
  "check-check": CheckCheck,
  eye: Eye,
  "flask-conical": FlaskConical,
  "git-pull-request": GitPullRequest,
  rocket: Rocket,
  snowflake: Snowflake,
  "calendar-clock": CalendarClock,
  archive: Archive,
  "list-checks": ListChecks,
};
export type StatusIconKey = keyof typeof STATUS_ICONS & string;

/** One status as the workspace sees it: what to draw (label/icon/tone), what it does (kind), where it sits (position). */
export type TaskStatusDef = {
  key: string;
  label: string;
  icon: string;
  tone: StatusTone;
  kind: StatusKind;
  /** Closed statuses are hidden unless "Show closed" is on, never overdue, and (except Completed) off the board. */
  closed: boolean;
  /** Archived statuses stay on existing tasks but can no longer be picked. */
  archived: boolean;
  builtin: boolean;
  position: number;
};

/** The resolved list for a workspace, sorted in picker/board order. */
export type StatusCatalog = TaskStatusDef[];

/** Built-in keys and their behaviour — the kind is fixed and never configurable. */
const BUILTIN_KINDS: Record<TaskStatus, StatusKind> = {
  not_started: "open",
  in_progress: "in_progress",
  awaiting_approval: "awaiting_approval",
  blocked: "blocked",
  rejected: "closed",
  cancelled: "closed",
  merged: "merged",
  completed: "completed",
};

const BUILTIN_ICONS: Record<TaskStatus, string> = {
  not_started: "circle",
  in_progress: "circle-dot",
  awaiting_approval: "clock",
  blocked: "octagon-alert",
  rejected: "x-circle",
  cancelled: "ban",
  merged: "git-merge",
  completed: "check-circle",
};

const BUILTIN_TONES: Record<TaskStatus, StatusTone> = {
  not_started: "slate",
  in_progress: "blue",
  awaiting_approval: "amber",
  blocked: "red",
  rejected: "rose",
  cancelled: "stone",
  merged: "violet",
  completed: "green",
};

const BUILTIN_CLOSED = new Set<string>(["completed", "rejected", "deferred", "cancelled", "merged"]);

/**
 * Built-ins whose open/closed is part of what they are: active work is always open (a closed Not started would
 * start every new task closed), finishing is always closed. Deferred, Rejected and Cancelled are the admin's call.
 */
const FIXED_CLOSED: Partial<Record<string, boolean>> = { not_started: false, in_progress: false, blocked: false, awaiting_approval: false, completed: true, merged: true };

/** Built-ins that can't be archived: every new task starts in Not started, and Completed is how work and goals finish. */
const ARCHIVE_LOCKED = new Set<string>(["not_started", "completed"]);

/** The defaults every workspace starts with, in order. */
export const DEFAULT_STATUSES: TaskStatusDef[] = TASK_STATUSES.map((key, position) => ({
  key,
  label: TASK_STATUS_LABELS[key],
  icon: BUILTIN_ICONS[key],
  tone: BUILTIN_TONES[key],
  kind: BUILTIN_KINDS[key],
  closed: BUILTIN_CLOSED.has(key),
  archived: false,
  builtin: true,
  position,
}));

/** A row of the task_statuses table as the DAL hands it over. */
export type StatusRow = {
  key: string;
  label: string;
  icon: string;
  tone: string;
  closed: boolean;
  archivedAt: Date | null;
  position: number;
};

const isTone = (tone: string): tone is StatusTone => (STATUS_TONES as readonly string[]).includes(tone);
const isIcon = (icon: string) => icon in STATUS_ICONS;

/** The key a new custom status gets: `custom_` plus randomness, so it can never collide with a built-in. */
export const newStatusKey = () => `custom_${crypto.randomUUID().slice(0, 8)}`;

/** Whether a status's closes-the-task flag is fixed (see FIXED_CLOSED). */
export const closedLocked = (status: TaskStatusDef): boolean => status.builtin && FIXED_CLOSED[status.key] !== undefined;

/** Whether a status can never be archived (see ARCHIVE_LOCKED). */
export const archiveLocked = (status: TaskStatusDef): boolean => status.builtin && ARCHIVE_LOCKED.has(status.key);

/**
 * Overlays the org's rows on the defaults: a row whose key is a built-in edits it; any other row is a custom
 * status whose kind follows its closed flag, and so does a Deferred, Rejected or Cancelled the admin reopened.
 * Fixed flags and archive locks hold whatever a row says. Rows with unusable icon/tone values fall back to the
 * built-in's or a neutral default. Result sorted by position.
 */
export function resolveStatuses(rows: StatusRow[]): StatusCatalog {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const list: TaskStatusDef[] = DEFAULT_STATUSES.map((def) => {
    const row = byKey.get(def.key);
    byKey.delete(def.key);
    if (row === undefined) return def;
    const closed = FIXED_CLOSED[def.key] ?? row.closed;
    return {
      ...def,
      label: row.label.trim() === "" ? def.label : row.label,
      icon: isIcon(row.icon) ? row.icon : def.icon,
      tone: isTone(row.tone) ? row.tone : def.tone,
      kind: def.kind === "closed" && !closed ? "open" : def.kind,
      closed,
      archived: !ARCHIVE_LOCKED.has(def.key) && row.archivedAt !== null,
      position: row.position,
    };
  });
  for (const row of byKey.values()) {
    if (row.label.trim() === "") continue;
    list.push({
      key: row.key,
      label: row.label,
      icon: isIcon(row.icon) ? row.icon : "circle",
      tone: isTone(row.tone) ? row.tone : "slate",
      kind: row.closed ? "closed" : "open",
      closed: row.closed,
      archived: row.archivedAt !== null,
      builtin: false,
      position: row.position,
    });
  }
  return list.sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
}

export const statusOf = (catalog: StatusCatalog, key: string): TaskStatusDef | undefined => catalog.find((status) => status.key === key);

/** A def for any stored key — the catalog's own, or a plain placeholder for a key that resolves to nothing. */
export const statusDef = (catalog: StatusCatalog, key: string): TaskStatusDef =>
  statusOf(catalog, key) ?? { key, label: key, icon: "circle", tone: "slate", kind: "open", closed: false, archived: false, builtin: false, position: 999 };

/** Statuses that may still be picked (not archived), in order — what every status control offers. */
export const activeStatuses = (catalog: StatusCatalog): TaskStatusDef[] => catalog.filter((status) => !status.archived);

/** A task's status menu: the pickable statuses, plus its own when that one is archived, so the menu still shows where it stands. */
export const menuStatuses = (catalog: StatusCatalog, current: string): TaskStatusDef[] => catalog.filter((status) => !status.archived || status.key === current);

/** The keys of closed statuses, for SQL fragments that used to inline CLOSED_STATUSES. */
export const closedStatusKeys = (catalog: StatusCatalog): string[] => catalog.filter((status) => status.closed).map((status) => status.key);

/** Closed-as-done keys (Completed and Merged — a duplicate folded into its parent is completed work), the workspace's COMPLETED_STATUSES. */
export const doneStatusKeys = (catalog: StatusCatalog): string[] => catalog.filter((status) => status.kind === "completed" || status.kind === "merged").map((status) => status.key);

/** Closed-but-not-done keys (kind "closed": Rejected, Cancelled and every custom closed status), the workspace's INCOMPLETE_STATUSES. */
export const incompleteStatusKeys = (catalog: StatusCatalog): string[] => catalog.filter((status) => status.kind === "closed").map((status) => status.key);

/** Closed without completing: asks a reason, keeps it in rejection_reason, can be reopened. */
export const isClosedWithoutCompletion = (status: TaskStatusDef): boolean => status.kind === "closed" || status.kind === "merged";

/** The keys of statuses that close a task without completing it (built-ins and customs), for pace/reason logic. */
export const closedWithoutCompletionKeys = (catalog: StatusCatalog): string[] => catalog.filter(isClosedWithoutCompletion).map((status) => status.key);

/**
 * Reads as the work having ended without being done: every closed-without-completion status except Deferred —
 * a pause the task comes back from (its title isn't struck through, it still counts as open on a goal). A custom
 * closed status always reads as an ending; a Deferred the admin made open stops being either, naturally.
 */
export const endedWithoutCompletion = (status: TaskStatusDef): boolean => isClosedWithoutCompletion(status) && status.key !== "deferred";

export const isClosedStatusKey = (catalog: StatusCatalog, key: string): boolean => statusOf(catalog, key)?.closed ?? false;

/** A label for any stored key. A `custom_*` key whose row was deleted reads as a removed status (only history can still name it — nothing can sit in it). */
export const statusLabel = (catalog: StatusCatalog, key: string): string => statusOf(catalog, key)?.label ?? (key.startsWith("custom_") ? "a removed status" : key);

/** The badge/dot token classes for a tone — literal strings, or Tailwind would strip them (the classes the old static map held). */
export const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string; swatch: string }> = {
  slate: { badge: "bg-status-slate-bg text-status-slate-fg", dot: "text-status-slate-dot", swatch: "bg-status-slate-dot" },
  stone: { badge: "bg-status-stone-bg text-status-stone-fg", dot: "text-status-stone-dot", swatch: "bg-status-stone-dot" },
  red: { badge: "bg-status-red-bg text-status-red-fg", dot: "text-status-red-dot", swatch: "bg-status-red-dot" },
  orange: { badge: "bg-status-orange-bg text-status-orange-fg", dot: "text-status-orange-dot", swatch: "bg-status-orange-dot" },
  amber: { badge: "bg-status-amber-bg text-status-amber-fg", dot: "text-status-amber-dot", swatch: "bg-status-amber-dot" },
  green: { badge: "bg-status-green-bg text-status-green-fg", dot: "text-status-green-dot", swatch: "bg-status-green-dot" },
  teal: { badge: "bg-status-teal-bg text-status-teal-fg", dot: "text-status-teal-dot", swatch: "bg-status-teal-dot" },
  blue: { badge: "bg-status-blue-bg text-status-blue-fg", dot: "text-status-blue-dot", swatch: "bg-status-blue-dot" },
  violet: { badge: "bg-status-violet-bg text-status-violet-fg", dot: "text-status-violet-dot", swatch: "bg-status-violet-dot" },
  rose: { badge: "bg-status-rose-bg text-status-rose-fg", dot: "text-status-rose-dot", swatch: "bg-status-rose-dot" },
};

export const iconFor = (icon: string): LucideIcon => STATUS_ICONS[icon] ?? Circle;

/** The first key holding a kind — the special kinds have exactly one bearer each (a built-in). */
export const keyOfKind = (catalog: StatusCatalog, kind: StatusKind): string | undefined => catalog.find((status) => status.kind === kind)?.key;

/** The label of the status holding a kind, for metric names that should follow a rename ("Stuck now" for a renamed Blocked). */
export const labelOfKind = (catalog: StatusCatalog, kind: StatusKind): string => catalog.find((status) => status.kind === kind)?.label ?? kind;

/** Where a reopened task lands: the first pickable open status. */
export const reopenTarget = (catalog: StatusCatalog): string => activeStatuses(catalog).find((status) => status.kind === "open")?.key ?? "not_started";

/** Where Send back, Mark unblocked and the update form's default return a task to work: the in-progress-kind status while it's pickable, else the first open one (Not started can't be archived, so this always resolves). */
export const backToWorkTarget = (catalog: StatusCatalog): string => activeStatuses(catalog).find((status) => status.kind === "in_progress")?.key ?? reopenTarget(catalog);

/**
 * Closing someone else's work is an edit right: Rejected, Cancelled and every custom closed status ask for
 * it; Deferred and Merged stay progress rights. The distinction lives on keys because all of them share the
 * "closed" kind — every permission path (mayMove, the status menus, the update form) uses this one helper.
 * A Rejected or Cancelled the admin made open is plain open work, a progress right like any other.
 */
export const requiresEditToEnter = (status: TaskStatusDef): boolean => status.kind === "closed" && (status.key === "rejected" || status.key === "cancelled" || !status.builtin);

/** The built-in's factory label — wording that names the status only holds while it kept its name. */
const defaultLabelOf = (key: string): string | undefined => DEFAULT_STATUSES.find((status) => status.key === key)?.label;

/** Whether a built-in still is what its factory words describe: its own name and its own behaviour. */
export const factoryWorded = (status: TaskStatusDef): boolean =>
  status.builtin && status.label === defaultLabelOf(status.key) && status.kind === BUILTIN_KINDS[status.key as TaskStatus];

/** A status named inside a sentence: "keep as in progress", but a workspace's own "QA gate" keeps its capitals. */
export const statusWord = (status: TaskStatusDef): string => (factoryWorded(status) ? status.label.toLowerCase() : status.label);

/** The title a status-change dialog gives the move; renamed and custom statuses go by their own label. */
export function transitionTitle(status: TaskStatusDef): string {
  if (status.kind === "awaiting_approval") return "Send for approval";
  if (status.kind === "merged") return "Merge into its parent";
  if (factoryWorded(status)) {
    const titled: Record<string, string> = {
      blocked: "Mark as blocked",
      completed: "Mark as completed",
      rejected: "Reject this task",
      deferred: "Defer this task",
      cancelled: "Cancel this task",
    };
    const title = titled[status.key];
    if (title !== undefined) return title;
  }
  return `Mark as ${status.label}`;
}

/** The toast a status change lands with; unchanged built-ins keep their factory words. */
export function statusToast(status: TaskStatusDef): string {
  if (status.kind === "awaiting_approval") return "Sent for approval.";
  if (status.kind === "merged") return "Merged into its parent.";
  if (factoryWorded(status)) {
    const toasted: Record<string, string> = {
      completed: "Marked completed.",
      blocked: "Marked blocked.",
      rejected: "Task rejected.",
      deferred: "Task deferred.",
      cancelled: "Task cancelled.",
    };
    const toast = toasted[status.key];
    if (toast !== undefined) return toast;
  }
  return status.closed && status.kind !== "completed" ? `Task ${status.label}.` : `Marked ${status.label}.`;
}

/** "completed, rejected, deferred or cancelled" — the closed statuses' own words, for report copy. */
export function closedStatusNames(catalog: StatusCatalog): string {
  const names = catalog.filter((status) => status.closed && status.kind !== "merged").map(statusWord);
  if (names.length === 0) return "closed";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
