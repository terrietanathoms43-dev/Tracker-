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
import { saveApprovalSettings } from "@/lib/dal/approvals";
import { ownerError } from "@/lib/dal/goals";
import { lockProject } from "@/lib/dal/projects";
import { log } from "@/lib/log";
import { canManageApprovals, canManagePlanning } from "@/lib/permissions";
import { requireViewer } from "@/lib/viewer";

// Every change to a project. Projects are the top of the funnel (docs/PLAN.md, 2026-11-03 log), workspace-wide and
// managed by leaders and admins (canManagePlanning). They are completed or archived, never deleted, so their goals,
// tasks and history stay readable.

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const projectFields = {
  name: requiredText(1, LIMITS.projectName, "Give the project a name."),
  description: optionalText(LIMITS.projectDescription),
  /** Empty means no owner. */
  ownerId: z.string().max(64).default(""),
  targetDate: day,
};

type ProjectFields = z.infer<z.ZodObject<typeof projectFields>>;

const STATUS_MESSAGES: Record<ProjectStatus, string> = {
  active: "Project is active again.",
  completed: "Project marked completed.",
  archived: "Project archived.",
};

/** A field error for the owner a form asked for, or null. Only a change is checked. */
async function ownerErrors(handle: Tx | typeof db, orgId: string, data: Pick<ProjectFields, "ownerId">, current: string | null = null): Promise<Record<string, string[]> | null> {
  if (data.ownerId && data.ownerId !== current) {
    const problem = await ownerError(handle, orgId, data.ownerId);
    if (problem) return { ownerId: [problem] };
  }
  return null;
}

/** The columns both create and edit write, with empty strings stored as null. */
const projectValues = (data: ProjectFields) => ({
  name: data.name,
  description: data.description || null,
  ownerId: data.ownerId || null,
  targetDate: data.targetDate || null,
});

// --- create and edit -------------------------------------------------------------------------------------------

const createSchema = z.object(projectFields);

/** Creates a project. Only the name is required. */
export async function createProject(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("projects.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const errors = await ownerErrors(db, viewer.orgId, data);
    if (errors) return fail(ERR.badRequest, errors);
    const [created] = await db
      .insert(projects)
      .values({ orgId: viewer.orgId, createdBy: viewer.userId, ...projectValues(data) })
      .returning({ id: projects.id });
    log.info("projects.created", { orgId: viewer.orgId, projectId: created.id, by: viewer.userId });
    refresh();
    return ok({ id: created.id }, "Project created.");
  });
}

const updateSchema = z.object({ projectId: id, ...projectFields });

/** Saves a project's fields (name, description, owner, target date). Status has its own action. */
export async function updateProject(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("projects.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const project = await lockProject(tx, viewer.orgId, data.projectId);
      if (project === null) throw new GuardError("not_found");
      if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
      const errors = await ownerErrors(tx, viewer.orgId, data, project.ownerId);
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

/** Marks a project completed, archives it, or makes it active again. Its goals and tasks are untouched either way. */
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

// --- sign-off chain --------------------------------------------------------------------------------------------------

const approvalsSchema = z.object({
  projectId: id,
  requiresApproval: z.boolean(),
  stepUserIds: z.array(id).max(LIMITS.approvalPeople).default([]),
  bypassUserIds: z.array(id).max(LIMITS.approvalPeople).default([]),
});

/** Who signs off new tasks in this project, in order, and who skips the queue (docs/PLAN.md, 2026-11-03 log). */
export async function saveProjectApprovals(input: z.input<typeof approvalsSchema>): Promise<ActionResult> {
  return runAction("projects.approvals", approvalsSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManageApprovals(viewer)) throw new GuardError("forbidden");
    await db.transaction(async (tx) => {
      const project = await lockProject(tx, viewer.orgId, data.projectId);
      if (project === null) throw new GuardError("not_found");
      await saveApprovalSettings(tx, viewer.orgId, { projectId: project.id }, data);
    });
    log.info("projects.approvals", { orgId: viewer.orgId, projectId: data.projectId, requiresApproval: data.requiresApproval, steps: data.stepUserIds.length, by: viewer.userId });
    refresh();
    return ok(undefined, data.requiresApproval ? "New tasks in this project now wait for sign-off." : "Sign-off settings saved.");
  });
}
