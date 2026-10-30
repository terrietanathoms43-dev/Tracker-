"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { optionalText, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { goals } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { GOAL_STATUSES, type GoalStatus } from "@/lib/constants";
import { findGoal, lockGoal, ownerError, subGoalDeadlines } from "@/lib/dal/goals";
import { setGoalProjects } from "@/lib/dal/projects";
import { parentDeadlineProblem, subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { log } from "@/lib/log";
import { canManagePlanning } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Every change to a goal. Goals are workspace-wide and managed by leaders and admins (canManagePlanning). They are
// paused or marked achieved, never deleted, so the work that served them keeps its history. A goal may be a
// sub-goal of one top-level goal (docs/PLAN.md, 2026-10-30 log); a sub-goal's target date never passes its parent's.

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");

const goalFields = {
  title: requiredText(1, LIMITS.goalTitle, "Give the goal a title."),
  description: optionalText(LIMITS.goalDescription),
  successCriteria: optionalText(LIMITS.successCriteria),
  /** Empty means "me" on create, "keep the current owner" on edit. */
  ownerId: z.string().max(64).default(""),
  /** Empty means a top-level goal. */
  parentGoalId: z.string().max(64).default(""),
  /** The projects rolling up into it; the whole list replaces the old one. */
  projectIds: z.array(id).max(100).default([]),
  targetDate: day,
};

type GoalFields = z.infer<z.ZodObject<typeof goalFields>>;

/** The columns both create and edit write, with empty strings stored as null. */
const goalValues = (data: Pick<GoalFields, "title" | "description" | "successCriteria" | "targetDate" | "parentGoalId">) => ({
  title: data.title,
  description: data.description || null,
  successCriteria: data.successCriteria || null,
  targetDate: data.targetDate || null,
  parentGoalId: data.parentGoalId || null,
});

const STATUS_MESSAGES: Record<GoalStatus, string> = {
  active: "Goal is active again.",
  achieved: "Goal marked achieved.",
  paused: "Goal paused.",
};

type FieldErrors = Record<string, string[]>;

/**
 * The sub-goal rules, as field errors: the parent must be a top-level goal of this workspace (never the goal
 * itself), a goal with sub-goals can't become one, and a sub-goal's date can't pass its parent's.
 */
async function parentErrors(tx: Tx, orgId: string, data: Pick<GoalFields, "parentGoalId" | "targetDate">, self: { id: string } | null, today: string): Promise<FieldErrors | null> {
  if (data.parentGoalId === "") return null;
  if (self !== null && data.parentGoalId === self.id) return { parentGoalId: ["A goal can't be its own parent."] };
  const parent = await findGoal(tx, orgId, data.parentGoalId);
  if (parent === null) return { parentGoalId: ["That goal doesn't exist, or you can't see it."] };
  if (parent.parentGoalId !== null) return { parentGoalId: ["A sub-goal can't have sub-goals of its own. Pick a top-level goal."] };
  if (self !== null && (await subGoalDeadlines(tx, orgId, self.id)).length > 0) return { parentGoalId: ["This goal has sub-goals, so it can't become a sub-goal itself."] };
  const problem = subGoalDeadlineProblem(parent.targetDate, data.targetDate || null, today);
  return problem === null ? null : { targetDate: [problem] };
}

// --- create and edit -------------------------------------------------------------------------------------------

const createSchema = z.object(goalFields);

/** Creates a goal, or a sub-goal when `parentGoalId` is set. Only the title is required; the owner defaults to whoever creates it. */
export async function createGoal(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("goals.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const today = dayKey(new Date(), viewer.timezone);
    const ownerId = data.ownerId || viewer.userId;
    const problem = await ownerError(db, viewer.orgId, ownerId);
    if (problem) return fail(ERR.badRequest, { ownerId: [problem] });
    const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      const errors = await parentErrors(tx, viewer.orgId, data, null, today);
      if (errors) return fail(ERR.badRequest, errors);
      const [row] = await tx
        .insert(goals)
        .values({ orgId: viewer.orgId, ownerId, createdBy: viewer.userId, ...goalValues(data) })
        .returning({ id: goals.id });
      // A sub-goal's projects stay its own; only a top-level goal gathers projects from the dialog's list.
      if (data.parentGoalId === "") await setGoalProjects(tx, viewer.orgId, row.id, data.projectIds);
      return ok(row);
    });
    if (!result.ok) return result;
    log.info("goals.created", { orgId: viewer.orgId, goalId: result.data.id, parentGoalId: data.parentGoalId || null, by: viewer.userId });
    refresh();
    return ok(result.data, data.parentGoalId ? "Sub-goal created." : "Goal created.");
  });
}

const updateSchema = z.object({ goalId: id, ...goalFields });

/** Saves a goal's fields (title, description, success criteria, owner, parent, target date). Status has its own action. */
export async function updateGoal(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("goals.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const today = dayKey(new Date(), viewer.timezone);
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
      const errors = await parentErrors(tx, viewer.orgId, data, goal, today);
      if (errors) return fail(ERR.badRequest, errors);
      // Moving a parent's date earlier than one of its sub-goals would break the rule from the other side.
      const dateProblem = parentDeadlineProblem(data.targetDate || null, await subGoalDeadlines(tx, viewer.orgId, goal.id), today);
      if (dateProblem) return fail(ERR.badRequest, { targetDate: [dateProblem] });
      await tx
        .update(goals)
        .set({ ...goalValues(data), ownerId, updatedAt: new Date() })
        .where(eq(goals.id, goal.id));
      if (data.parentGoalId === "") await setGoalProjects(tx, viewer.orgId, goal.id, data.projectIds);
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
