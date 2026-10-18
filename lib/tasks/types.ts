import type { OrgRole, TaskActivityKind, TaskPriority, TaskStatus } from "@/lib/constants";

// Shapes that cross from server to client: plain JSON only (instants as ISO strings, calendar days as
// "YYYY-MM-DD"), so a server component can hand them straight to a client component.

/** Someone shown with an avatar and a name. */
export type Person = { id: string; name: string | null; email: string | null; image: string | null };

/** A team as a chip or a picker row. */
export type TeamRef = { id: string; name: string };

/** Who a task (or a goal) is assigned to: any number of people and teams, all equal (docs/PLAN.md, 2026-10-18 log). */
export type Assignees = { people: Person[]; teams: TeamRef[] };

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
  updatedAt: string;
  /** Attention lists only: why it is there ("Overdue", "Your approval", …). */
  reason?: string;
  /** My Work only: the team through which the viewer is on it ("Frontend") when they are not assigned directly. */
  via?: string;
};

/** A page of the task list; `nextCursor` is the id of the last row, or null when there is no more. */
export type TaskPage = { items: TaskListItem[]; nextCursor: string | null };

/** A worker in a picker, with the role that decides default approvers. */
export type PersonOption = Person & { role: OrgRole };

/** What the New task form needs: who you are, who and which teams can own work, and what it can belong to. */
export type TaskFormOptions = {
  viewerId: string;
  people: Person[];
  teams: TeamRef[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
};

/** Defaults the create dialog starts from (a project or goal page passes its own id). */
export type CreateDefaults = { projectId?: string; goalId?: string };

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
    /** The people assigned directly (teams don't take part in hand-overs or approver rules). */
    assigneeIds: string[];
    nextAction: string | null;
    blockedReason: string | null;
    blockedBy: string | null;
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

/** One person's open work, assigned to them directly (person null = nobody and no team). */
export type WorkloadRow = { person: Person | null; active: TaskListItem[]; blocked: number; overdue: number };

/** One team's open work: what it is expected to deliver. */
export type TeamWorkloadRow = { team: TeamRef; active: number; blocked: number; overdue: number };
