"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { optionalText, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { projects } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import { findGoal, ownerError } from "@/lib/dal/goals";
import { lockProject } from "@/lib/dal/projects";
import { log } from "@/lib/log";
import { canManagePlanning } from "@/lib/permissions";
import { requireViewer } from "@/lib/viewer";

// Every change to a project. Projects are workspace-wide and managed by leaders and admins (canManagePlanning).
// They are completed or archived, never deleted, so their tasks and history stay readable.

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const projectFields = {
  name: requiredText(1, LIMITS.projectName, "Give the project a name."),
  description: optionalText(LIMITS.projectDescription),
  /** Empty means no owner. */
  ownerId: z.string().max(64).default(""),
  /** Empty means the project doesn't roll up into a goal. */
  goalId: z.string().max(64).default(""),
  targetDate: day,
};

type ProjectFields = z.infer<z.ZodObject<typeof projectFields>>;

const STATUS_MESSAGES: Record<ProjectStatus, string> = {
  active: "Project is active again.",
  completed: "Project marked completed.",
  archived: "Project archived.",
};

/**
 * Field errors for the owner and goal a form asked for, or null when both are fine. Only what changed is checked
 * (`current`), so editing the name of a project whose goal was later paused doesn't force a new goal on it.
 */
async function referenceErrors(
  handle: Tx | typeof db,
  orgId: string,
  data: Pick<ProjectFields, "ownerId" | "goalId">,
  current: { ownerId: string | null; goalId: string | null } = { ownerId: null, goalId: null },
): Promise<Record<string, string[]> | null> {
  const errors: Record<string, string[]> = {};
  if (data.ownerId && data.ownerId !== current.ownerId) {
    const problem = await ownerError(handle, orgId, data.ownerId);
    if (problem) errors.ownerId = [problem];
  }
  if (data.goalId && data.goalId !== current.goalId) {
    const goal = await findGoal(handle, orgId, data.goalId);
    if (goal === null) errors.goalId = ["That goal doesn't exist, or you can't see it."];
    else if (goal.status !== "active") errors.goalId = ["That goal isn't active. Pick an active one."];
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** The columns both create and edit write, with empty strings stored as null. */
const projectValues = (data: ProjectFields) => ({
  name: data.name,
  description: data.description || null,
  ownerId: data.ownerId || null,
  goalId: data.goalId || null,
  targetDate: data.targetDate || null,
});

// --- create and edit -------------------------------------------------------------------------------------------

const createSchema = z.object(projectFields);

/** Creates a project. Only the name is required; it can roll up into an active goal. */
export async function createProject(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("projects.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const errors = await referenceErrors(db, viewer.orgId, data);
    if (errors) return fail(ERR.badRequest, errors);
    const [created] = await db
      .insert(projects)
      .values({ orgId: viewer.orgId, createdBy: viewer.userId, ...projectValues(data) })
      .returning({ id: projects.id });
    log.info("projects.created", { orgId: viewer.orgId, projectId: created.id, goalId: data.goalId || null, by: viewer.userId });
    refresh();
    return ok({ id: created.id }, "Project created.");
  });
}

const updateSchema = z.object({ projectId: id, ...projectFields });

/** Saves a project's fields (name, description, owner, goal, target date). Status has its own action. */
export async function updateProject(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("projects.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const project = await lockProject(tx, viewer.orgId, data.projectId);
      if (project === null) throw new GuardError("not_found");
      if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
      const errors = await referenceErrors(tx, viewer.orgId, data, project);
      if (errors) return fail(ERR.badRequest, errors);
      await tx
        .update(projects)
        .set({ ...projectValues(data), updatedAt: new Date() })
        .where(eq(projects.id, project.id));
      return ok(undefined);
    });
    if (!result.ok) return result;
    log.info("projects.updated", { orgId: viewer.orgId, projectId: data.projectId, by: viewer.userId });
    refresh();
    return ok(undefined, "Project saved.");
  });
}

// --- status ------------------------------------------------------------------------------------------------------

const statusSchema = z.object({ projectId: id, status: z.enum(PROJECT_STATUSES) });

/** Marks a project completed, archives it, or makes it active again. Its tasks are untouched either way. */
export async function setProjectStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return runAction("projects.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const from = await db.transaction(async (tx) => {
      const project = await lockProject(tx, viewer.orgId, data.projectId);
      if (project === null) throw new GuardError("not_found");
      if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
      if (project.status !== data.status) await tx.update(projects).set({ status: data.status, updatedAt: new Date() }).where(eq(projects.id, project.id));
      return project.status;
    });
    log.info("projects.status_changed", { orgId: viewer.orgId, projectId: data.projectId, from, to: data.status, by: viewer.userId });
    refresh();
    return ok(undefined, STATUS_MESSAGES[data.status]);
  });
}
