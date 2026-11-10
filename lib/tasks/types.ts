import type { ApprovalDecision, OrgRole, ProposalStatus, TaskActivityKind, TaskPriority, TaskStatus } from "@/lib/constants";
import type { Recurrence } from "@/lib/recurrence";

// Shapes that cross from server to client: plain JSON only (instants as ISO strings, calendar days as
// "YYYY-MM-DD"), so a server component can hand them straight to a client component.

/** Someone shown with an avatar and a name. */
export type Person = { id: string; name: string | null; email: string | null; image: string | null };

/** Who a task is assigned to: any number of people, all equal (docs/PLAN.md, 2026-10-18 and 2026-10-30 logs). */
export type Assignees = Person[];

/** One row of any task list, board column or My Work group. The row expands to show the longer fields. */
export type TaskListItem = {
  id: string;
  title: string;
  /** Cut to a few hundred characters for the expanded row; the task page has it all. */
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  /** "HH:MM" when a time of day matters. */
  dueTime: string | null;
  /** "Every day at 8:00 AM" for a repeating task, else null. */
  repeats: string | null;
  nextAction: string | null;
  latestProgress: string | null;
  assignees: Assignees;
  project: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  /** The task this one is attached to (sub-tasks, 2026-11-08 log): drawn under it in lists, or as a "Part of" link. */
  parent: { id: string; title: string } | null;
  /** How many tasks are attached to this one. */
  subTasks: number;
  /** Null for a live task; a proposal's state otherwise ("local": the maker's alone, not sent yet). */
  proposal: ProposalStatus | null;
  /** A local task: whether sending it on starts a sign-off chain (true) or publishes it at once (false). */
  needsSignOff: boolean;
  /**
   * The goal's "Everything completed" task (2026-11-04 and 2026-11-09 logs): completing it, last, marks `goal`
   * achieved. Every list names it by that goal (components/tasks/closer-chip.tsx).
   */
  goalCloser: boolean;
  /** Whether the row's menu offers Delete (leaders, the proposer of an open proposal, the maker of a local task; never a goal's closer). */
  canDelete: boolean;
  updatedAt: string;
  /** Attention lists only: why it is there ("Overdue", "Your approval", …). */
  reason?: string;
};

/** A page of the task list; `nextCursor` is the id of the last row, or null when there is no more. */
export type TaskPage = { items: TaskListItem[]; nextCursor: string | null };

/** A worker in a picker, with the role that decides default approvers. */
export type PersonOption = Person & { role: OrgRole };

/**
 * A goal in a picker: a sub-goal's label carries its parent ("Ship onboarding › Invite flow"); every goal names its
 * project. `signOff` (the task forms' options): a task the viewer adds here starts local, because the goal (or else
 * its project) asks for sign-off and the viewer doesn't skip the queue.
 */
export type GoalOption = { id: string; title: string; projectId: string; signOff?: boolean };

/** What the New task form needs: who you are, who can own work, and what it can belong to. */
export type TaskFormOptions = {
  viewerId: string;
  people: Person[];
  /** `signOff`: a task the viewer adds to the project starts local (its sign-off is on and they don't skip the queue). */
  projects: { id: string; name: string; signOff: boolean }[];
  /** The ids of the projects this person pinned, in their order: the pickers show them first. */
  pinnedProjects: string[];
  goals: GoalOption[];
  /** Whether "From a meeting" is offered to this person (lib/capture/availability.ts); filled in by the action. */
  canCapture: boolean;
  /** A stakeholder's new tasks are proposals: the forms say so before the save. */
  proposesOnly: boolean;
};

/**
 * Defaults the create dialog starts from: a project or goal page passes its own id, and the quick-add bar's
 * "More options" hands over what was already typed and picked.
 */
export type CreateDefaults = {
  projectId?: string;
  goalId?: string;
  title?: string;
  /** "Make a task" from a comment (2026-11-07 log) hands over the comment, quoted, with a link back. */
  description?: string;
  /** A sub-task: made attached to this task, in its project and goal (2026-11-08 log). */
  parentId?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
};

export type EvidenceLink = { id: string; url: string; label: string | null; addedBy: string };

/** One step of a proposal's sign-off chain, as the task page and the Proposals page show it. */
export type ApprovalStepView = {
  id: string;
  position: number;
  /** The people the step names, any one of whom signs it; empty means any leader or admin. */
  users: Person[];
  decision: ApprovalDecision | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  note: string | null;
};

/** Everything the task page shows about the task itself. */
export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  recurrence: Recurrence | null;
  seriesId: string | null;
  project: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  /** The task this one is attached to (sub-tasks, 2026-11-08 log). */
  parent: { id: string; title: string } | null;
  /** How many tasks are attached to this one; the page lists them. */
  subTasks: number;
  assignees: Assignees;
  approver: Person | null;
  creator: Person;
  proposalStatus: ProposalStatus | null;
  /** A local task: whether sending it on starts a sign-off chain, or publishes it at once because none applies. */
  needsSignOff: boolean;
  /** The sign-off chain, in order (empty for a task that was live from the start, or not sent yet). */
  approvals: ApprovalStepView[];
  /** The goal's "Everything completed" task: it stays with its goal and completing it marks the goal achieved. */
  goalCloser: boolean;
  /** A closer only: the other tasks under its goal still open, which it waits for (0 for any other task). */
  closerWaitsFor: number;
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
export type TaskAbilities = { edit: boolean; progress: boolean; approve: boolean; reject: boolean; decideProposal: boolean };

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
    /** A repeating task: completing it makes the next occurrence. */
    repeats: string | null;
    /** The task it is attached to: only then may it be marked Merged. */
    parent: { id: string; title: string } | null;
    /** Open tasks attached to it: it cannot be completed while there are any. */
    openSubTasks: number;
    /** A goal's "Everything completed" task: the goal it marks achieved, and the other tasks under it still open, which it waits for. */
    closer: { goalTitle: string | null; openOthers: number } | null;
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
