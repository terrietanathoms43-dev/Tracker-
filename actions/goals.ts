"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { GOAL_STATUSES, type GoalStatus } from "@/lib/constants";
import { validateAssignment } from "@/lib/dal/assignments";
import { lockGoal, ownerError, setGoalTeams } from "@/lib/dal/goals";
import { log } from "@/lib/log";
import { canManagePlanning } from "@/lib/permissions";
import { requireViewer } from "@/lib/viewer";

// Every change to a goal. Goals are workspace-wide and managed by leaders and admins (canManagePlanning). They are
// paused or marked achieved, never deleted, so the work that served them keeps its history.

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const goalFields = {
  title: z.string().trim().min(1, "Give the goal a title.").max(200),
  description: optionalText(4000),
  successCriteria: optionalText(2000),
  /** Empty means "me" on create, "keep the current owner" on edit. */
  ownerId: z.string().max(64).default(""),
  /** The teams expected to deliver it; the whole list replaces the old one. */
  teamIds: z.array(id).max(50).default([]),
  targetDate: day,
};

/** The columns both create and edit write, with empty strings stored as null. */
const goalValues = (data: { title: string; description: string; successCriteria: string; targetDate: string }) => ({
  title: data.title,
  description: data.description || null,
  successCriteria: data.successCriteria || null,
  targetDate: data.targetDate || null,
});

const STATUS_MESSAGES: Record<GoalStatus, string> = {
  active: "Goal is active again.",
  achieved: "Goal marked achieved.",
  paused: "Goal paused.",
};

// --- create and edit -------------------------------------------------------------------------------------------

const createSchema = z.object(goalFields);

/** Creates a goal. Only the title is required; the owner defaults to whoever creates it. */
export async function createGoal(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("goals.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const ownerId = data.ownerId || viewer.userId;
    const problem = await ownerError(db, viewer.orgId, ownerId);
    if (problem) return fail(ERR.badRequest, { ownerId: [problem] });
    const created = await db.transaction(async (tx) => {
      const { teamIds } = await validateAssignment(tx, viewer.orgId, { assigneeIds: [], teamIds: data.teamIds });
      const [row] = await tx
        .insert(goals)
        .values({ orgId: viewer.orgId, ownerId, createdBy: viewer.userId, ...goalValues(data) })
        .returning({ id: goals.id });
      await setGoalTeams(tx, row.id, teamIds, viewer.userId);
      return row;
    });
    log.info("goals.created", { orgId: viewer.orgId, goalId: created.id, teams: data.teamIds.length, by: viewer.userId });
    refresh();
    return ok({ id: created.id }, "Goal created.");
  });
}

const updateSchema = z.object({ goalId: id, ...goalFields });

/** Saves a goal's fields (title, description, success criteria, owner, target date). Status has its own action. */
export async function updateGoal(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("goals.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
      const ownerId = data.ownerId || goal.ownerId;
      // Only a change of owner is checked: a goal keeps its owner even after they stop being a worker here.
      if (ownerId !== null && ownerId !== goal.ownerId) {
        const problem = await ownerError(tx, viewer.orgId, ownerId);
        if (problem) return fail(ERR.badRequest, { ownerId: [problem] });
      }
      const { teamIds } = await validateAssignment(tx, viewer.orgId, { assigneeIds: [], teamIds: data.teamIds });
      await tx
        .update(goals)
        .set({ ...goalValues(data), ownerId, updatedAt: new Date() })
        .where(eq(goals.id, goal.id));
      await setGoalTeams(tx, goal.id, teamIds, viewer.userId);
      return ok(undefined);
    });
    if (!result.ok) return result;
    log.info("goals.updated", { orgId: viewer.orgId, goalId: data.goalId, by: viewer.userId });
    refresh();
    return ok(undefined, "Goal saved.");
  });
}

// --- status ------------------------------------------------------------------------------------------------------

const statusSchema = z.object({ goalId: id, status: z.enum(GOAL_STATUSES) });

/** Marks a goal achieved, pauses it, or makes it active again. Any status can move to any other. */
export async function setGoalStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return runAction("goals.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const from = await db.transaction(async (tx) => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
      if (goal.status !== data.status) await tx.update(goals).set({ status: data.status, updatedAt: new Date() }).where(eq(goals.id, goal.id));
      return goal.status;
    });
    log.info("goals.status_changed", { orgId: viewer.orgId, goalId: data.goalId, from, to: data.status, by: viewer.userId });
    refresh();
    return ok(undefined, STATUS_MESSAGES[data.status]);
  });
}
