import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { goals, projects, users } from "@/db/schema";
import type { ProjectStatus } from "@/lib/constants";
import { progressForProjects } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { Person, TaskProgress } from "@/lib/tasks/types";

// Reads of projects: the list with progress, one project, the projects under a goal, and the row lock the actions
// use. Projects are workspace-wide; every worker reads them, stakeholders never do.

/** One project as the list, the project page and a goal's page show it: plain JSON, progress included. */
export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner: Person | null;
  /** The goal it rolls up into, whatever that goal's status. */
  goal: { id: string; title: string } | null;
  targetDate: string | null;
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
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  goalId: goals.id,
  goalTitle: goals.title,
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
  createdAt: Date;
  updatedAt: Date;
  goalId: string | null;
  goalTitle: string | null;
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
    goal: row.goalId && row.goalTitle ? { id: row.goalId, title: row.goalTitle } : null,
    targetDate: row.targetDate,
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

/** Projects of this workspace matching `where`, each with its owner, its goal and its progress. */
async function selectProjects(viewer: Viewer, where: SQL | undefined): Promise<ProjectListItem[]> {
  const rows = await db
    .select(projectColumns)
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .leftJoin(goals, and(eq(goals.id, projects.goalId), eq(goals.orgId, viewer.orgId)))
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

/** Every project that rolls up into a goal, closed ones included (they still count towards its progress). */
export async function projectsForGoal(viewer: Viewer, goalId: string): Promise<ProjectListItem[]> {
  if (!canReadPlanning(viewer)) return [];
  return selectProjects(viewer, eq(projects.goalId, goalId));
}

/** The active projects for the goal dialog's attach list: id, name and the goal each already rolls up into. */
export async function projectOptions(viewer: Viewer): Promise<{ id: string; name: string; goal: { id: string; title: string } | null }[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: projects.id, name: projects.name, goalId: goals.id, goalTitle: goals.title })
    .from(projects)
    .leftJoin(goals, and(eq(goals.id, projects.goalId), eq(goals.orgId, viewer.orgId)))
    .where(and(eq(projects.orgId, viewer.orgId), eq(projects.status, "active")))
    .orderBy(asc(projects.name));
  return rows.map((row) => ({ id: row.id, name: row.name, goal: row.goalId && row.goalTitle ? { id: row.goalId, title: row.goalTitle } : null }));
}

/**
 * The projects rolling up into a goal, replaced by `projectIds`: named active projects of this workspace attach,
 * anything currently attached but not named detaches (its tasks stay — they just stop counting towards the goal).
 * A project can only roll up into one goal, so attaching moves it off its previous one.
 */
export async function setGoalProjects(tx: Tx, orgId: string, goalId: string, projectIds: string[]): Promise<void> {
  const keep = new Set(
    projectIds.length === 0
      ? []
      : (
          await tx
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.orgId, orgId), eq(projects.status, "active"), inArray(projects.id, projectIds)))
        ).map((row) => row.id),
  );
  const attached = (await tx.select({ id: projects.id }).from(projects).where(eq(projects.goalId, goalId))).map((row) => row.id);
  const removed = attached.filter((id) => !keep.has(id));
  const added = [...keep].filter((id) => !attached.includes(id));
  if (removed.length > 0) await tx.update(projects).set({ goalId: null, updatedAt: new Date() }).where(inArray(projects.id, removed));
  if (added.length > 0) await tx.update(projects).set({ goalId, updatedAt: new Date() }).where(inArray(projects.id, added));
}

/**
 * The project row an action works on, locked (`select … for update`) for the rest of the transaction. Null when the
 * id is unknown or belongs to another workspace, so a foreign id is simply not found.
 */
export async function lockProject(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select({ id: projects.id, name: projects.name, status: projects.status, goalId: projects.goalId, ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
    .for("update");
  return row ?? null;
}
