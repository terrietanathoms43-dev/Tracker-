import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { goalTeams, goals, users } from "@/db/schema";
import type { GoalStatus } from "@/lib/constants";
import { findMembership, listWorkers } from "@/lib/dal/orgs";
import { progressForGoals } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { Person, TaskProgress, TeamRef } from "@/lib/tasks/types";

// Reads of goals: the list with progress, one goal, the pickers that offer them, and the row lock the actions use.
// Goals are workspace-wide; every worker reads them, stakeholders never do (an empty list, a goal that isn't found).

/** One goal as the list, the goal page, Home and Team show it: plain JSON, progress included. */
export type GoalListItem = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  status: GoalStatus;
  /** Null only when the owner's account was deleted. */
  owner: Person | null;
  /** The teams expected to deliver it, by name. */
  teams: TeamRef[];
  targetDate: string | null;
  /** Tasks linked directly and through the goal's projects (rejected ones never count). */
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
  teams: sql<TeamRef[]>`coalesce((select json_agg(json_build_object('id', tm.id, 'name', tm.name) order by tm.name) from goal_teams gt join teams tm on tm.id = gt.team_id where gt.goal_id = ${goals.id}), '[]'::json)`,
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
  teams: TeamRef[];
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
    teams: row.teams,
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

/**
 * The workspace's goals with their progress, in the order the list shows them. Achieved goals are left out unless
 * `includeAchieved`: Home and Team only care about what is still being worked towards.
 */
export async function listGoals(viewer: Viewer, { includeAchieved }: { includeAchieved: boolean }): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select(goalColumns)
    .from(goals)
    .leftJoin(users, eq(users.id, goals.ownerId))
    .where(and(eq(goals.orgId, viewer.orgId), includeAchieved ? undefined : sql`${goals.status} <> 'achieved'`))
    .orderBy(...listOrder);
  const progress = await progressForGoals(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toItem(row, progress));
}

/** One goal of this workspace with its progress; null when it doesn't exist, belongs elsewhere, or the viewer can't read goals. */
export async function getGoal(viewer: Viewer, id: string): Promise<GoalListItem | null> {
  if (!canReadPlanning(viewer)) return null;
  const [row] = await db
    .select(goalColumns)
    .from(goals)
    .leftJoin(users, eq(users.id, goals.ownerId))
    .where(and(eq(goals.id, id), eq(goals.orgId, viewer.orgId)));
  if (!row) return null;
  return toItem(row, await progressForGoals(viewer, [row.id]));
}

/** The active goals a team owns, with their progress (the team page). */
export async function goalsForTeam(viewer: Viewer, teamId: string): Promise<GoalListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select(goalColumns)
    .from(goals)
    .innerJoin(goalTeams, eq(goalTeams.goalId, goals.id))
    .leftJoin(users, eq(users.id, goals.ownerId))
    .where(and(eq(goals.orgId, viewer.orgId), eq(goalTeams.teamId, teamId), sql`${goals.status} <> 'achieved'`))
    .orderBy(...listOrder);
  const progress = await progressForGoals(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toItem(row, progress));
}

/** Replaces the teams on a goal with `teamIds` (already checked against the workspace), in the caller's transaction. */
export async function setGoalTeams(tx: Tx, goalId: string, teamIds: string[], actorId: string): Promise<void> {
  const current = (await tx.select({ teamId: goalTeams.teamId }).from(goalTeams).where(eq(goalTeams.goalId, goalId))).map((row) => row.teamId);
  const removed = current.filter((id) => !teamIds.includes(id));
  const added = teamIds.filter((id) => !current.includes(id));
  if (removed.length > 0) await tx.delete(goalTeams).where(and(eq(goalTeams.goalId, goalId), inArray(goalTeams.teamId, removed)));
  if (added.length > 0) await tx.insert(goalTeams).values(added.map((teamId) => ({ goalId, teamId, addedBy: actorId })));
}

/** The goals a project can point at: the active ones, by title. */
export async function activeGoalOptions(viewer: Viewer): Promise<{ id: string; title: string }[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
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
    .select({ id: goals.id, title: goals.title, status: goals.status, ownerId: goals.ownerId })
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)))
    .for("update");
  return row ?? null;
}

/** A goal of this workspace by id, for the actions that link a project to it (null when it isn't one). */
export async function findGoal(handle: Tx | typeof db, orgId: string, goalId: string) {
  const [row] = await handle
    .select({ id: goals.id, status: goals.status })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, orgId)));
  return row ?? null;
}
