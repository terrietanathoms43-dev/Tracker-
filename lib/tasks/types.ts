import type { OrgRole, TaskActivityKind, TaskPriority, TaskStatus } from "@/lib/constants";

// Shapes that cross from server to client: plain JSON only (instants as ISO strings, calendar days as
// "YYYY-MM-DD"), so a server component can hand them straight to a client component.

/** Someone shown with an avatar and a name. */
export type Person = { id: string; name: string | null; email: string | null; image: string | null };

/** Who a task is assigned to: any number of people, all equal (docs/PLAN.md, 2026-10-18 and 2026-10-30 logs). */
export type Assignees = Person[];

/** One row of any task list, board column or My Work group. */
export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  nextAction: string | null;
  assignees: Assignees;
  project: { id: string; name: string } | null;
  goalId: string | null;
  /** Leaders and admins only: whether the row's menu offers Delete. */
  canDelete: boolean;
  updatedAt: string;
  /** Attention lists only: why it is there ("Overdue", "Your approval", …). */
  reason?: string;
};

/** A page of the task list; `nextCursor` is the id of the last row, or null when there is no more. */
export type TaskPage = { items: TaskListItem[]; nextCursor: string | null };

/** A worker in a picker, with the role that decides default approvers. */
export type PersonOption = Person & { role: OrgRole };

/** A goal in a picker: a sub-goal's label carries its parent ("Ship onboarding › Invite flow"). */
export type GoalOption = { id: string; title: string };

/** What the New task form needs: who you are, who can own work, and what it can belong to. */
export type TaskFormOptions = {
  viewerId: string;
  people: Person[];
  projects: { id: string; name: string }[];
  goals: GoalOption[];
};

/**
 * Defaults the create dialog starts from: a project or goal page passes its own id, and the quick-add bar's
 * "More options" hands over what was already typed and picked.
 */
export type CreateDefaults = {
  projectId?: string;
  goalId?: string;
  title?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
};

export type EvidenceLink = { id: string; url: string; label: string | null; addedBy: string };

/** Everything the task page shows about the task itself. */
export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  project: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  request: { id: string; title: string } | null;
  assignees: Assignees;
  approver: Person | null;
  creator: Person;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
  rejectionReason: string | null;
  latestProgress: string | null;
  nextAction: string | null;
  completionSummary: string | null;
  /** Comments nobody has marked resolved yet; while there are any, the task can't be completed. */
  openComments: number;
  /** The newest progress update (comments don't count): who wrote it and when. */
  lastUpdate: { author: Person; at: string } | null;
};

/** What the viewer may do on one task, decided on the server from lib/permissions.ts. */
export type TaskAbilities = { edit: boolean; progress: boolean; approve: boolean; reject: boolean };

/** What the Update progress form and the status dialogs need about one task. */
export type UpdateContext = {
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    assigneeIds: string[];
    nextAction: string | null;
    blockedReason: string | null;
    blockedBy: string | null;
    /** Comments still open: completing is refused until they are resolved. */
    openComments: number;
  };
  people: PersonOption[];
  defaultApprover: string | null;
  abilities: TaskAbilities;
};

/** One entry of a task's comments and history, already phrased and timed in the viewer's timezone. */
export type HistoryItem = {
  id: string;
  type: "progress" | "comment" | TaskActivityKind;
  actor: Person;
  phrase: string;
  change: { before: string | null; after: string | null } | null;
  note: string | null;
  /** Progress update: what got done. Comment: the comment. */
  body: string | null;
  nextAction: string | null;
  blocker: string | null;
  /** Comments only: who marked it resolved and when; null while it is open. */
  resolved: { by: string; at: string } | null;
  at: string;
  day: string;
  dayLabel: string;
  time: string;
  absolute: string;
};

export type HistoryPage = { items: HistoryItem[]; nextCursor: string | null };

/** An important change for the Home and Members feeds: "Jordan Dev completed Fix nightly backup". */
export type ActivityFeedItem = {
  id: string;
  kind: TaskActivityKind;
  actor: Person;
  /** The verb phrase between the actor and the task title: "completed", "changed the due date of". */
  verb: string;
  task: { id: string; title: string };
  href: string;
  /** The whole sentence in plain text, for tooltips, emails and screen readers. */
  summary: string;
  note: string | null;
  at: string;
};

/** Completed out of total (rejected tasks don't count), with the problems inside it. */
export type TaskProgress = { completed: number; total: number; blocked: number; overdue: number };

export type TaskCounts = { active: number; completed: number; overdue: number; blocked: number; awaiting: number };

/** One person's open work (person null = nobody). */
export type WorkloadRow = { person: Person | null; active: TaskListItem[]; blocked: number; overdue: number };
