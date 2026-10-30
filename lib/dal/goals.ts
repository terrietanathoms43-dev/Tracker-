import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { goals, users } from "@/db/schema";
import type { GoalStatus } from "@/lib/constants";
import { findMembership, listWorkers } from "@/lib/dal/orgs";
import { goalOptionLabel, progressForGoals } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { GoalOption, Person, TaskProgress } from "@/lib/tasks/types";

// Reads of goals: the list with progress, one goal, its sub-goals, the pickers that offer them, and the row lock
// the actions use. Goals are workspace-wide; every worker reads them, stakeholders never do (an empty list, a goal
// that isn't found). A goal may have sub-goals, one level deep (docs/PLAN.md, 2026-10-30 log).

const parentGoal = alias(goals, "parent_goal");

/** One goal as the list, the goal page, Home and Reports show it: plain JSON, progress included. */
export type GoalListItem = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  status: GoalStatus;
  /** Null only when the owner's account was deleted. */
  owner: Person | null;
  /** The goal this is a sub-goal of, when it is one. */
  parent: { id: string; title: string; targetDate: string | null } | null;
  /** How many sub-goals it has (a sub-goal always has none). */
  subGoals: number;
  targetDate: string | null;
  /** Tasks linked directly, through the goal's projects and through its sub-goals (rejected ones never count). */
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
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
  ownerId: users.id,
  ownerName: users.name,
  ownerEmail: users.email,
  ownerImage: users.image,
  parentId: parentGoal.id,
  parentTitle: parentGoal.title,
  parentTargetDate: parentGoal.targetDate,
  subGoals: sql<number>`(select count(*)::int from goals sub where sub.parent_goal_id = ${goals.id})`,
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  status: GoalStatus;
  targetDate: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName, email: row.ownerEmail, image: row.ownerImage } : null,
    parent: row.parentId && row.parentTitle ? { id: row.parentId, title: row.parentTitle, targetDate: row.parentTargetDate } : null,
    subGoals: row.subGoals,
    targetDate: row.targetDate,
    progress: progress.get(row.id) ?? EMPTY_PROGRESS,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Active goals first, then paused, then achieved; nearest target date first within each, then by title. */
const listOrder = [
  sql`(case ${goals.status} when 'active' then 0 when 'paused' then 1 else 2 end)`,
  sql`${goals.targetDate} asc nulls last`,
  asc(goals.title),
];

function selectGoals() {
  return db
    .select(goalColumns)
    .from(goals)
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

/**
 * The workspace's top-level goals with their progress, in the order the list shows them (sub-goals live on their
 * parent's page). Achieved goals are left out unless `includeAchieved`: Home only cares about what is still being
 * worked towards.
 */
export async function listGoals(viewer: Viewer, { includeAchieved }: { includeAchieved: boolean }): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await selectGoals()
    .where(and(eq(goals.orgId, viewer.orgId), isNull(goals.parentGoalId), includeAchieved ? undefined : sql`${goals.status} <> 'achieved'`))
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

/** The sub-goals of a goal, with their progress, in the list order (achieved ones included: the parent page shows them all). */
export async function subGoalsOf(viewer: Viewer, goalId: string): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await selectGoals()
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.parentGoalId, goalId)))
    .orderBy(...listOrder);
  return withProgress(viewer, rows);
}

/** The goals a project or task can point at: the active ones, a sub-goal labelled with its parent. */
export async function activeGoalOptions(viewer: Viewer): Promise<GoalOption[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: goals.id, title: goals.title, parentTitle: parentGoal.title })
    .from(goals)
    .leftJoin(parentGoal, eq(parentGoal.id, goals.parentGoalId))
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
    .orderBy(asc(sql`coalesce(${parentGoal.title}, ${goals.title})`), sql`${goals.parentGoalId} is not null`, asc(goals.title));
  return rows.map((row) => ({ id: row.id, title: goalOptionLabel(row.title, row.parentTitle) }));
}

/**
 * The goals a goal can be a sub-goal of: active, top-level ones (a sub-goal can't have sub-goals), with the target
 * date the sub-goal's own date has to respect.
 */
export async function parentGoalOptions(viewer: Viewer): Promise<{ id: string; title: string; targetDate: string | null }[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate })
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
    .select({ id: goals.id, title: goals.title, status: goals.status, ownerId: goals.ownerId, parentGoalId: goals.parentGoalId, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)))
    .for("update");
  return row ?? null;
}

/** A goal of this workspace by id, for the actions that link something to it (null when it isn't one). */
export async function findGoal(handle: Tx | typeof db, orgId: string, goalId: string) {
  const [row] = await handle
    .select({ id: goals.id, title: goals.title, status: goals.status, parentGoalId: goals.parentGoalId, targetDate: goals.targetDate })
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
