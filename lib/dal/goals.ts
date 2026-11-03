import "server-only";
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { goalLinks, goals, projects, users } from "@/db/schema";
import type { GoalStatus } from "@/lib/constants";
import { findMembership, listWorkers } from "@/lib/dal/orgs";
import { goalOptionLabel, progressForGoals } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import { describeRecurrence, type Recurrence } from "@/lib/recurrence";
import type { GoalOption, Person, TaskProgress } from "@/lib/tasks/types";

// Reads of goals: the list with progress, one goal, its sub-goals, the links between goals (the branch view), the
// pickers that offer them, and the row lock the actions use. Every goal belongs to a project (docs/PLAN.md,
// 2026-11-03 log); every read filters by viewer.orgId, and a list can be narrowed to one project.

const parentGoal = alias(goals, "parent_goal");

/** A goal pointed at from another goal's page or the branch view. */
export type GoalRef = { id: string; title: string; status: GoalStatus; targetDate: string | null };

/** One goal as the list, the goal page, Home and Reports show it: plain JSON, progress included. */
export type GoalListItem = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  status: GoalStatus;
  project: { id: string; name: string };
  /** Null only when the owner's account was deleted. */
  owner: Person | null;
  /** The goal this is a sub-goal of, when it is one. */
  parent: { id: string; title: string; targetDate: string | null } | null;
  /** How many sub-goals it has (a sub-goal always has none). */
  subGoals: number;
  targetDate: string | null;
  recurrence: Recurrence | null;
  /** "Every week on Mon" for a repeating goal. */
  repeats: string | null;
  seriesId: string | null;
  requiresApproval: boolean;
  completedAt: string | null;
  /** Tasks linked to the goal and to its sub-goals (rejected ones never count). */
  progress: TaskProgress;
  createdAt: string;
  updatedAt: string;
};

const goalColumns = {
  id: goals.id,
  title: goals.title,
  description: goals.description,
  successCriteria: goals.successCriteria,
  status: goals.status,
  targetDate: goals.targetDate,
  recurrence: goals.recurrence,
  seriesId: goals.seriesId,
  requiresApproval: goals.requiresApproval,
  completedAt: goals.completedAt,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
  projectId: projects.id,
  projectName: projects.name,
  ownerId: users.id,
  ownerName: users.name,
  ownerEmail: users.email,
  ownerImage: users.image,
  parentId: parentGoal.id,
  parentTitle: parentGoal.title,
  parentTargetDate: parentGoal.targetDate,
  subGoals: sql<number>`(select count(*)::int from goals sub where sub.parent_goal_id = ${goals}.id)`,
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  status: GoalStatus;
  targetDate: string | null;
  recurrence: Recurrence | null;
  seriesId: string | null;
  requiresApproval: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  projectName: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerImage: string | null;
  parentId: string | null;
  parentTitle: string | null;
  parentTargetDate: string | null;
  subGoals: number;
};

const EMPTY_PROGRESS: TaskProgress = { completed: 0, total: 0, blocked: 0, overdue: 0 };

function toItem(row: GoalRow, progress: Map<string, TaskProgress>): GoalListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    successCriteria: row.successCriteria,
    status: row.status,
    project: { id: row.projectId, name: row.projectName },
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName, email: row.ownerEmail, image: row.ownerImage } : null,
    parent: row.parentId && row.parentTitle ? { id: row.parentId, title: row.parentTitle, targetDate: row.parentTargetDate } : null,
    subGoals: row.subGoals,
    targetDate: row.targetDate,
    recurrence: row.recurrence ?? null,
    repeats: row.recurrence ? describeRecurrence(row.recurrence, row.targetDate) : null,
    seriesId: row.seriesId,
    requiresApproval: row.requiresApproval,
    completedAt: row.completedAt?.toISOString() ?? null,
    progress: progress.get(row.id) ?? EMPTY_PROGRESS,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Active goals first, then paused, then completed; nearest target date first within each (undated last), then by title. */
const listOrder = [
  sql`(case ${goals.status} when 'active' then 0 when 'paused' then 1 else 2 end)`,
  sql`${goals.targetDate} asc nulls last`,
  asc(goals.title),
];

function selectGoals() {
  return db
    .select(goalColumns)
    .from(goals)
    .innerJoin(projects, eq(projects.id, goals.projectId))
    .leftJoin(users, eq(users.id, goals.ownerId))
    .leftJoin(parentGoal, eq(parentGoal.id, goals.parentGoalId));
}

async function withProgress(viewer: Viewer, rows: GoalRow[]): Promise<GoalListItem[]> {
  const progress = await progressForGoals(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toItem(row, progress));
}

export type GoalListOptions = {
  /** Completed goals are left out unless asked for: Home only cares about what is still being worked towards. */
  includeCompleted: boolean;
  /** "" for every project, else one project's goals. */
  project?: string;
  /** Top-level goals only (the default lists sub-goals too; the page nests them under their parent). */
  topLevelOnly?: boolean;
};

/** The workspace's goals with their progress, in the order the list shows them. */
export async function listGoals(viewer: Viewer, options: GoalListOptions): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const where: (SQL | undefined)[] = [eq(goals.orgId, viewer.orgId)];
  if (!options.includeCompleted) where.push(sql`${goals.status} <> 'completed'`);
  if (options.project) where.push(eq(goals.projectId, options.project));
  if (options.topLevelOnly) where.push(isNull(goals.parentGoalId));
  const rows = await selectGoals()
    .where(and(...where))
    .orderBy(...listOrder);
  return withProgress(viewer, rows);
}

/** One goal of this workspace with its progress; null when it doesn't exist, belongs elsewhere, or the viewer can't read goals. */
export async function getGoal(viewer: Viewer, id: string): Promise<GoalListItem | null> {
  if (!canReadPlanning(viewer)) return null;
  const [row] = await selectGoals().where(and(eq(goals.id, id), eq(goals.orgId, viewer.orgId)));
  if (!row) return null;
  return (await withProgress(viewer, [row]))[0];
}

/** The sub-goals of a goal, with their progress, in the list order (completed ones included: the parent page shows them all). */
export async function subGoalsOf(viewer: Viewer, goalId: string): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await selectGoals()
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.parentGoalId, goalId)))
    .orderBy(...listOrder);
  return withProgress(viewer, rows);
}

/** Active goals whose target date has passed and that nobody has marked completed: the ones that shout. */
export async function goalsPastTarget(viewer: Viewer, today: string, project = ""): Promise<GoalRef[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: goals.id, title: goals.title, status: goals.status, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), sql`${goals.targetDate} < ${today}::date`, project ? eq(goals.projectId, project) : undefined))
    .orderBy(asc(goals.targetDate), asc(goals.title));
}

/** The goals a task can point at: the active ones (optionally one project's), a sub-goal labelled with its parent. */
export async function activeGoalOptions(viewer: Viewer, project = ""): Promise<GoalOption[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: goals.id, title: goals.title, projectId: goals.projectId, parentTitle: parentGoal.title })
    .from(goals)
    .leftJoin(parentGoal, eq(parentGoal.id, goals.parentGoalId))
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), project ? eq(goals.projectId, project) : undefined))
    .orderBy(asc(sql`coalesce(${parentGoal.title}, ${goals.title})`), sql`${goals.parentGoalId} is not null`, asc(goals.title));
  return rows.map((row) => ({ id: row.id, title: goalOptionLabel(row.title, row.parentTitle), projectId: row.projectId }));
}

/** A top-level goal a sub-goal can belong to, with the target date the sub-goal's own date has to respect. */
export type ParentOption = { id: string; title: string; targetDate: string | null; projectId: string };

/** The goals a goal can be a sub-goal of: active, top-level ones (a sub-goal can't have sub-goals). */
export async function parentGoalOptions(viewer: Viewer): Promise<ParentOption[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate, projectId: goals.projectId })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), isNull(goals.parentGoalId)))
    .orderBy(asc(goals.title));
}

/** Who can own a goal or a project: the workspace's workers (never a stakeholder), for the dialogs' owner picker. */
export async function ownerOptions(viewer: Viewer): Promise<Person[]> {
  const workers = await listWorkers(viewer);
  return workers.map((worker) => ({ id: worker.userId, name: worker.name, email: worker.email, image: worker.image }));
}

/**
 * Why `ownerId` can't own planning work in this workspace, or null when it can. Owners are workers: an id from
 * another workspace, or a stakeholder's, is refused with a message the owner field can show.
 */
export async function ownerError(handle: Tx | typeof db, orgId: string, ownerId: string): Promise<string | null> {
  const membership = await findMembership(handle, orgId, ownerId);
  return membership === null || membership.role === "stakeholder" ? "Pick an owner from this workspace." : null;
}

/**
 * The goal row an action works on, locked (`select … for update`) for the rest of the transaction. Null when the id
 * is unknown or belongs to another workspace, so a foreign id is simply not found.
 */
export async function lockGoal(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      successCriteria: goals.successCriteria,
      status: goals.status,
      ownerId: goals.ownerId,
      projectId: goals.projectId,
      parentGoalId: goals.parentGoalId,
      targetDate: goals.targetDate,
      recurrence: goals.recurrence,
      seriesId: goals.seriesId,
      requiresApproval: goals.requiresApproval,
    })
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)))
    .for("update");
  return row ?? null;
}

/** A goal of this workspace by id, for the actions that link something to it (null when it isn't one). */
export async function findGoal(handle: Tx | typeof db, orgId: string, goalId: string) {
  const [row] = await handle
    .select({ id: goals.id, title: goals.title, status: goals.status, projectId: goals.projectId, parentGoalId: goals.parentGoalId, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, orgId)));
  return row ?? null;
}

/** The sub-goals of a goal with their target dates: what a parent's new date has to respect. */
export async function subGoalDeadlines(handle: Tx | typeof db, orgId: string, goalId: string): Promise<{ id: string; title: string; targetDate: string | null }[]> {
  return handle
    .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.parentGoalId, goalId)));
}

// --- links between goals (the branch view) ------------------------------------------------------------------------

export type GoalLinkRow = { from: string; to: string };

/** Every link in the workspace (or among the goals of one project): what the branch view draws. */
export async function goalLinksIn(viewer: Viewer, project = ""): Promise<GoalLinkRow[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ from: goalLinks.fromGoalId, to: goalLinks.toGoalId })
    .from(goalLinks)
    .where(and(eq(goalLinks.orgId, viewer.orgId), project ? sql`${goalLinks.fromGoalId} in (select id from goals where project_id = ${project}) and ${goalLinks.toGoalId} in (select id from goals where project_id = ${project})` : undefined));
  return rows;
}

/** The goals that lead into this one, and the ones it leads to, for the goal page's Connections section. */
export async function connectionsOf(viewer: Viewer, goalId: string): Promise<{ comesAfter: GoalRef[]; leadsTo: GoalRef[] }> {
  if (!canReadPlanning(viewer)) return { comesAfter: [], leadsTo: [] };
  const rows = await db
    .select({ from: goalLinks.fromGoalId, to: goalLinks.toGoalId, id: goals.id, title: goals.title, status: goals.status, targetDate: goals.targetDate })
    .from(goalLinks)
    .innerJoin(goals, or(and(eq(goals.id, goalLinks.fromGoalId), eq(goalLinks.toGoalId, goalId)), and(eq(goals.id, goalLinks.toGoalId), eq(goalLinks.fromGoalId, goalId))))
    .where(and(eq(goalLinks.orgId, viewer.orgId), eq(goals.orgId, viewer.orgId)))
    .orderBy(sql`${goals.targetDate} asc nulls last`, asc(goals.title));
  const ref = (row: (typeof rows)[number]): GoalRef => ({ id: row.id, title: row.title, status: row.status, targetDate: row.targetDate });
  return {
    comesAfter: rows.filter((row) => row.to === goalId).map(ref),
    leadsTo: rows.filter((row) => row.from === goalId).map(ref),
  };
}

/** The links an action checks for loops: every edge in the workspace, plus parent → sub-goal. */
export async function linkEdgesForCycleCheck(tx: Tx, orgId: string): Promise<GoalLinkRow[]> {
  const [links, children] = await Promise.all([
    tx.select({ from: goalLinks.fromGoalId, to: goalLinks.toGoalId }).from(goalLinks).where(eq(goalLinks.orgId, orgId)),
    tx
      .select({ from: goals.parentGoalId, to: goals.id })
      .from(goals)
      .where(and(eq(goals.orgId, orgId), sql`${goals.parentGoalId} is not null`)),
  ]);
  return [...links, ...children.map((row) => ({ from: row.from!, to: row.to }))];
}

/** The id and project of several goals at once (the quick checks an action makes before linking or copying). */
export async function goalsById(handle: Tx | typeof db, orgId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return handle
    .select({ id: goals.id, title: goals.title, projectId: goals.projectId, status: goals.status, parentGoalId: goals.parentGoalId })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), inArray(goals.id, ids)));
}
