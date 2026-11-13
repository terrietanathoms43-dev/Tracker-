import { Ban, CheckCircle2, Circle, CircleDot, CirclePause, Clock, Flag, GitMerge, Hourglass, OctagonAlert, PauseCircle, Pin, Star, Tag, XCircle, Zap, type LucideIcon } from "lucide-react";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";

// Workspace-configurable task statuses (2026-11-11): the nine built-ins are the defaults; an org may rename
// them, re-icon them, recolor them, reorder them, flip their closed flag, archive them, and add its own.
// A status's *key* never changes — tasks store the key — so a rename is a label-only change and every
// existing task follows it. Behaviour travels with the *kind*: built-ins keep theirs (blocked asks a reason,
// awaiting_approval asks an approver, completed runs the goal machinery, merged needs a parent); a custom
// status is either "open" or "closed" (reason required, like Rejected), nothing more.

/** What a status does when a task enters it. `closed` covers the built-in closed-without-completion statuses and every custom closed status. */
export type StatusKind = "open" | "in_progress" | "blocked" | "awaiting_approval" | "completed" | "closed" | "merged";

/** The colour families a status may use — the existing `status-*` CSS token pairs. */
export const STATUS_TONES = ["not_started", "in_progress", "awaiting_approval", "blocked", "deferred", "rejected", "cancelled", "merged", "completed"] as const;
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
  "pause-circle": PauseCircle,
  pin: Pin,
  star: Star,
  tag: Tag,
  zap: Zap,
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
  deferred: "closed",
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
  deferred: "circle-pause",
  rejected: "x-circle",
  cancelled: "ban",
  merged: "git-merge",
  completed: "check-circle",
};

const BUILTIN_CLOSED = new Set<string>(["completed", "rejected", "deferred", "cancelled", "merged"]);

/** The defaults every workspace starts with, in order. */
export const DEFAULT_STATUSES: TaskStatusDef[] = TASK_STATUSES.map((key, position) => ({
  key,
  label: TASK_STATUS_LABELS[key],
  icon: BUILTIN_ICONS[key],
  tone: key,
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

/**
 * Overlays the org's rows on the defaults: a row whose key is a built-in edits it (kind stays fixed); any
 * other row is a custom status whose kind follows its closed flag. Rows with unusable icon/tone values fall
 * back to the built-in's or a neutral default. Result sorted by position.
 */
export function resolveStatuses(rows: StatusRow[]): StatusCatalog {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const list: TaskStatusDef[] = DEFAULT_STATUSES.map((def) => {
    const row = byKey.get(def.key);
    byKey.delete(def.key);
    if (row === undefined) return def;
    return {
      ...def,
      label: row.label.trim() === "" ? def.label : row.label,
      icon: isIcon(row.icon) ? row.icon : def.icon,
      tone: isTone(row.tone) ? row.tone : def.tone,
      // Completed and Merged are structurally closed; every other flag is editable.
      closed: def.kind === "completed" || def.kind === "merged" ? true : row.closed,
      archived: row.archivedAt !== null,
      position: row.position,
    };
  });
  for (const row of byKey.values()) {
    if (row.label.trim() === "") continue;
    list.push({
      key: row.key,
      label: row.label,
      icon: isIcon(row.icon) ? row.icon : "circle",
      tone: isTone(row.tone) ? row.tone : "not_started",
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
  statusOf(catalog, key) ?? { key, label: key, icon: "circle", tone: "not_started", kind: "open", closed: false, archived: false, builtin: false, position: 999 };

/** Statuses that may still be picked (not archived), in order — what every status control offers. */
export const activeStatuses = (catalog: StatusCatalog): TaskStatusDef[] => catalog.filter((status) => !status.archived);

/** The keys of closed statuses, for SQL fragments that used to inline CLOSED_STATUSES. */
export const closedStatusKeys = (catalog: StatusCatalog): string[] => catalog.filter((status) => status.closed).map((status) => status.key);

/** Closed without completing: asks a reason, keeps it in rejection_reason, can be reopened. */
export const isClosedWithoutCompletion = (status: TaskStatusDef): boolean => status.kind === "closed" || status.kind === "merged";

/** The keys of statuses that close a task without completing it (built-ins and customs), for pace/reason logic. */
export const closedWithoutCompletionKeys = (catalog: StatusCatalog): string[] => catalog.filter(isClosedWithoutCompletion).map((status) => status.key);

export const isClosedStatusKey = (catalog: StatusCatalog, key: string): boolean => statusOf(catalog, key)?.closed ?? false;

/** A label for any stored key, even one whose status row has since gone (safety net — shouldn't happen). */
export const statusLabel = (catalog: StatusCatalog, key: string): string => statusOf(catalog, key)?.label ?? key;

/** The badge/dot token classes for a tone — literal strings, or Tailwind would strip them (the classes the old static map held). */
export const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string }> = {
  not_started: { badge: "bg-status-not-started-bg text-status-not-started-fg", dot: "text-status-not-started-dot" },
  in_progress: { badge: "bg-status-in-progress-bg text-status-in-progress-fg", dot: "text-status-in-progress-dot" },
  awaiting_approval: { badge: "bg-status-awaiting-bg text-status-awaiting-fg", dot: "text-status-awaiting-dot" },
  blocked: { badge: "bg-status-blocked-bg text-status-blocked-fg", dot: "text-status-blocked-dot" },
  deferred: { badge: "bg-status-deferred-bg text-status-deferred-fg", dot: "text-status-deferred-dot" },
  rejected: { badge: "bg-status-rejected-bg text-status-rejected-fg", dot: "text-status-rejected-dot" },
  cancelled: { badge: "bg-status-cancelled-bg text-status-cancelled-fg", dot: "text-status-cancelled-dot" },
  merged: { badge: "bg-status-merged-bg text-status-merged-fg", dot: "text-status-merged-dot" },
  completed: { badge: "bg-status-completed-bg text-status-completed-fg", dot: "text-status-completed-dot" },
};

export const iconFor = (icon: string): LucideIcon => STATUS_ICONS[icon] ?? Circle;

/** The first key holding a kind — the special kinds have exactly one bearer each (a built-in). */
export const keyOfKind = (catalog: StatusCatalog, kind: StatusKind): string | undefined => catalog.find((status) => status.kind === kind)?.key;

/** The label of the status holding a kind, for metric names that should follow a rename ("Stuck now" for a renamed Blocked). */
export const labelOfKind = (catalog: StatusCatalog, kind: StatusKind): string => catalog.find((status) => status.kind === kind)?.label ?? kind;

/** Where a reopened task lands: the first pickable open status. */
export const reopenTarget = (catalog: StatusCatalog): string => activeStatuses(catalog).find((status) => status.kind === "open")?.key ?? "not_started";

/**
 * Closing someone else's work is an edit right: Rejected, Cancelled and every custom closed status ask for
 * it; Deferred and Merged stay progress rights. The distinction lives on keys because all of them share the
 * "closed" kind — every permission path (mayMove, the status menus, the update form) uses this one helper.
 */
export const requiresEditToEnter = (status: TaskStatusDef): boolean => status.key === "rejected" || status.key === "cancelled" || (!status.builtin && status.closed);

/** The built-in's factory label — wording that names the status only holds while it kept its name. */
export const defaultLabelOf = (key: string): string | undefined => DEFAULT_STATUSES.find((status) => status.key === key)?.label;

/** The title a status-change dialog gives the move; renamed and custom statuses go by their own label. */
export function transitionTitle(status: TaskStatusDef): string {
  if (status.kind === "awaiting_approval") return "Send for approval";
  if (status.kind === "merged") return "Merge into its parent";
  if (status.builtin && status.label === defaultLabelOf(status.key)) {
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
  if (status.builtin && status.label === defaultLabelOf(status.key)) {
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
  const names = catalog.filter((status) => status.closed && status.kind !== "merged").map((status) => status.label.toLowerCase());
  if (names.length === 0) return "closed";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
