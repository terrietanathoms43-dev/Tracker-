import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { projectPins, projects, users } from "@/db/schema";
import type { ProjectStatus } from "@/lib/constants";
import { progressForProjects } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { Person, TaskProgress } from "@/lib/tasks/types";

// Reads of projects: the list with progress, one project, the pickers, and the row lock the actions use. A project
// is the top of the funnel (docs/PLAN.md, 2026-11-03 log): its goals sit under it and its tasks count towards it.
// Everyone in the workspace reads projects.

/** One project as the list, the project page and the pickers show it: plain JSON, progress included. */
export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner: Person | null;
  targetDate: string | null;
  /** New tasks here wait for the sign-off chain. */
  requiresApproval: boolean;
  /** Active goals under it. */
  goals: number;
  progress: TaskProgress;
  createdAt: string;
  updatedAt: string;
};

const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  targetDate: projects.targetDate,
  requiresApproval: projects.requiresApproval,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  goals: sql<number>`(select count(*)::int from goals g where g.project_id = ${projects}.id and g.status = 'active' and g.parent_goal_id is null)`,
  ownerId: users.id,
  ownerName: users.name,
  ownerEmail: users.email,
  ownerImage: users.image,
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  targetDate: string | null;
  requiresApproval: boolean;
  createdAt: Date;
  updatedAt: Date;
  goals: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerImage: string | null;
};

const EMPTY_PROGRESS: TaskProgress = { completed: 0, total: 0, blocked: 0, overdue: 0 };

function toItem(row: ProjectRow, progress: Map<string, TaskProgress>): ProjectListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName, email: row.ownerEmail, image: row.ownerImage } : null,
    targetDate: row.targetDate,
    requiresApproval: row.requiresApproval,
    goals: row.goals,
    progress: progress.get(row.id) ?? EMPTY_PROGRESS,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Active projects first, then completed, then archived; nearest target date first within each, then by name. */
const listOrder = [
  sql`(case ${projects.status} when 'active' then 0 when 'completed' then 1 else 2 end)`,
  sql`${projects.targetDate} asc nulls last`,
  asc(projects.name),
];

/** Projects of this workspace matching `where`, each with its owner and its progress. */
async function selectProjects(viewer: Viewer, where: SQL | undefined): Promise<ProjectListItem[]> {
  const rows = await db
    .select(projectColumns)
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(and(eq(projects.orgId, viewer.orgId), where))
    .orderBy(...listOrder);
  const progress = await progressForProjects(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toItem(row, progress));
}

/** The workspace's projects with their progress. Completed and archived ones are left out unless `includeClosed`. */
export async function listProjects(viewer: Viewer, { includeClosed }: { includeClosed: boolean }): Promise<ProjectListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  return selectProjects(viewer, includeClosed ? undefined : eq(projects.status, "active"));
}

/** One project of this workspace with its progress; null when it doesn't exist, belongs elsewhere, or the viewer can't read projects. */
export async function getProject(viewer: Viewer, id: string): Promise<ProjectListItem | null> {
  if (!canReadPlanning(viewer)) return null;
  const [project] = await selectProjects(viewer, eq(projects.id, id));
  return project ?? null;
}

/** Every project a picker can offer, active ones first: the navigation's scope picker lists them all. */
export type ProjectOption = { id: string; name: string; status: ProjectStatus };

export async function projectOptions(viewer: Viewer, { activeOnly = true }: { activeOnly?: boolean } = {}): Promise<ProjectOption[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.orgId, viewer.orgId), activeOnly ? eq(projects.status, "active") : undefined))
    .orderBy(sql`(case ${projects.status} when 'active' then 0 when 'completed' then 1 else 2 end)`, asc(projects.name));
}

/** The projects this person pinned in this workspace, in the order they arranged them (docs/PLAN.md, 2026-11-04 log). */
export async function pinnedProjectIds(viewer: Viewer): Promise<string[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: projectPins.projectId })
    .from(projectPins)
    .where(and(eq(projectPins.userId, viewer.userId), eq(projectPins.orgId, viewer.orgId)))
    .orderBy(asc(projectPins.position), asc(projectPins.createdAt));
  return rows.map((row) => row.id);
}

/** Replaces this person's pins in this workspace with `projectIds`, in that order (ids of other workspaces are dropped). */
export async function savePins(tx: Tx, viewer: Viewer, projectIds: string[]): Promise<string[]> {
  const unique = [...new Set(projectIds)];
  const known = unique.length === 0 ? [] : await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.orgId, viewer.orgId), inArray(projects.id, unique)));
  const keep = unique.filter((each) => known.some((row) => row.id === each));
  await tx.delete(projectPins).where(and(eq(projectPins.userId, viewer.userId), eq(projectPins.orgId, viewer.orgId)));
  if (keep.length > 0) await tx.insert(projectPins).values(keep.map((projectId, position) => ({ userId: viewer.userId, orgId: viewer.orgId, projectId, position })));
  return keep;
}

/** A project of this workspace by id, for the actions that put something in it (null when it isn't one). */
export async function findProject(handle: Tx | typeof db, orgId: string, projectId: string) {
  const [row] = await handle
    .select({ id: projects.id, name: projects.name, status: projects.status, requiresApproval: projects.requiresApproval })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return row ?? null;
}

/**
 * The project row an action works on, locked (`select … for update`) for the rest of the transaction. Null when the
 * id is unknown or belongs to another workspace, so a foreign id is simply not found.
 */
export async function lockProject(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select({ id: projects.id, name: projects.name, status: projects.status, ownerId: projects.ownerId, requiresApproval: projects.requiresApproval })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
    .for("update");
  return row ?? null;
}
