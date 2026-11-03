"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { optionalText, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { goalLinks, goals, projects, tasks } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { GOAL_STATUSES, type GoalStatus } from "@/lib/constants";
import { saveApprovalSettings } from "@/lib/dal/approvals";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, assignmentOf } from "@/lib/dal/assignments";
import { findGoal, goalsById, linkEdgesForCycleCheck, lockGoal, ownerError, subGoalDeadlines } from "@/lib/dal/goals";
import { findProject } from "@/lib/dal/projects";
import { liveOnly } from "@/lib/dal/tasks";
import { parentDeadlineProblem, subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { wouldCycle } from "@/lib/goals/graph";
import { log } from "@/lib/log";
import { canCompleteGoal, canLinkGoals, canManageApprovals, canManagePlanning } from "@/lib/permissions";
import { nextAfterFinishing, normalizeRecurrence, type Recurrence } from "@/lib/recurrence";
import { calendarDaysBetween, dayKey, formatDay } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Every change to a goal. Goals belong to a project (docs/PLAN.md, 2026-11-03 log) and are managed by leaders and
// admins (canManagePlanning); marking one completed is for admins, leaders and stakeholders (canCompleteGoal).
// They are paused or completed, never deleted, so the work that served them keeps its history. A goal may be a
// sub-goal of one top-level goal in the same project (2026-10-30 log); a sub-goal's target date never passes its
// parent's. A repeating goal makes its next occurrence, tasks included, when it is completed.

// --- shared checks -----------------------------------------------------------------------------------------

const id = z.string().min(1).max(64);
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");
const recurrenceInput = z.unknown().transform((value) => normalizeRecurrence(value)).default(null);

const goalFields = {
  title: requiredText(1, LIMITS.goalTitle, "Give the goal a title."),
  description: optionalText(LIMITS.goalDescription),
  successCriteria: optionalText(LIMITS.successCriteria),
  /** Empty means "me" on create, "keep the current owner" on edit. */
  ownerId: z.string().max(64).default(""),
  /** The project the goal belongs to; a sub-goal takes its parent's. */
  projectId: z.string().max(64).default(""),
  /** Instead of `projectId`: make a project of this name on the spot (a newcomer's first goal). */
  newProjectName: optionalText(LIMITS.projectName),
  /** Empty means a top-level goal. */
  parentGoalId: z.string().max(64).default(""),
  targetDate: day,
  recurrence: recurrenceInput,
};

type GoalFields = z.infer<z.ZodObject<typeof goalFields>>;

/** The columns both create and edit write, with empty strings stored as null. */
const goalValues = (data: Pick<GoalFields, "title" | "description" | "successCriteria" | "targetDate" | "parentGoalId" | "recurrence">) => ({
  title: data.title,
  description: data.description || null,
  successCriteria: data.successCriteria || null,
  targetDate: data.targetDate || null,
  parentGoalId: data.parentGoalId || null,
  recurrence: data.recurrence,
});

const STATUS_MESSAGES: Record<GoalStatus, string> = {
  active: "Goal is active again.",
  completed: "Goal completed.",
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

/**
 * The project a goal goes in: its parent's for a sub-goal, else the one picked (active), else a new one made from
 * `newProjectName`. Returns the id or a field error.
 */
async function resolveProject(tx: Tx, viewerId: string, orgId: string, data: Pick<GoalFields, "projectId" | "newProjectName" | "parentGoalId">): Promise<{ projectId: string } | { errors: FieldErrors }> {
  if (data.parentGoalId !== "") {
    const parent = await findGoal(tx, orgId, data.parentGoalId);
    if (parent === null) return { errors: { parentGoalId: ["That goal doesn't exist, or you can't see it."] } };
    return { projectId: parent.projectId };
  }
  if (data.projectId !== "") {
    const project = await findProject(tx, orgId, data.projectId);
    if (project === null) return { errors: { projectId: ["That project doesn't exist, or you can't see it."] } };
    if (project.status !== "active") return { errors: { projectId: ["That project isn't active. Pick an active one."] } };
    return { projectId: project.id };
  }
  if (data.newProjectName !== "") {
    const [created] = await tx
      .insert(projects)
      .values({ orgId, name: data.newProjectName, ownerId: viewerId, createdBy: viewerId })
      .returning({ id: projects.id });
    return { projectId: created.id };
  }
  return { errors: { projectId: ["Pick the project this goal belongs to, or name a new one."] } };
}

// --- create and edit -------------------------------------------------------------------------------------------

const createSchema = z.object(goalFields);

/** Creates a goal in a project (or a sub-goal in its parent's project). Only the title and the project are required. */
export async function createGoal(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; projectId: string }>> {
  return runAction("goals.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const today = dayKey(new Date(), viewer.timezone);
    const ownerId = data.ownerId || viewer.userId;
    const problem = await ownerError(db, viewer.orgId, ownerId);
    if (problem) return fail(ERR.badRequest, { ownerId: [problem] });
    if (data.recurrence !== null && data.targetDate === "") return fail(ERR.badRequest, { targetDate: ["A repeating goal needs a first target date."] });
    const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string; projectId: string }>> => {
      const errors = await parentErrors(tx, viewer.orgId, data, null, today);
      if (errors) return fail(ERR.badRequest, errors);
      const placed = await resolveProject(tx, viewer.userId, viewer.orgId, data);
      if ("errors" in placed) return fail(ERR.badRequest, placed.errors);
      const [row] = await tx
        .insert(goals)
        .values({ orgId: viewer.orgId, projectId: placed.projectId, ownerId, createdBy: viewer.userId, ...goalValues(data) })
        .returning({ id: goals.id });
      if (data.recurrence !== null) await tx.update(goals).set({ seriesId: row.id }).where(eq(goals.id, row.id));
      return ok({ id: row.id, projectId: placed.projectId });
    });
    if (!result.ok) return result;
    log.info("goals.created", { orgId: viewer.orgId, goalId: result.data.id, projectId: result.data.projectId, parentGoalId: data.parentGoalId || null, by: viewer.userId });
    refresh();
    return ok(result.data, data.parentGoalId ? "Sub-goal created." : data.newProjectName ? `Goal created in the new project “${data.newProjectName}”.` : "Goal created.");
  });
}

const updateSchema = z.object({ goalId: id, ...goalFields });

/**
 * Saves a goal's fields. Moving a goal to another project moves its sub-goals and every task under them too, so a
 * task is always in its goal's project. Status has its own action.
 */
export async function updateGoal(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("goals.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const today = dayKey(new Date(), viewer.timezone);
    if (data.recurrence !== null && data.targetDate === "") return fail(ERR.badRequest, { targetDate: ["A repeating goal needs a target date."] });
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
      const placed = await resolveProject(tx, viewer.userId, viewer.orgId, { ...data, projectId: data.projectId || goal.projectId });
      if ("errors" in placed) return fail(ERR.badRequest, placed.errors);
      await tx
        .update(goals)
        .set({ ...goalValues(data), projectId: placed.projectId, ownerId, seriesId: data.recurrence ? (goal.seriesId ?? goal.id) : goal.seriesId, updatedAt: new Date() })
        .where(eq(goals.id, goal.id));
      if (placed.projectId !== goal.projectId) {
        // The goal moved: its sub-goals and every task under the family follow it.
        await tx.update(goals).set({ projectId: placed.projectId, updatedAt: new Date() }).where(eq(goals.parentGoalId, goal.id));
        await tx.update(tasks).set({ projectId: placed.projectId, updatedAt: new Date() }).where(sql`${tasks.goalId} in (select g.id from goals g where g.id = ${goal.id} or g.parent_goal_id = ${goal.id})`);
      }
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

type NextGoal = { id: string; targetDate: string; tasks: number };

/**
 * When a repeating goal is completed, the next one is made in the same transaction: same project, owner, criteria
 * and rule, target on the next scheduled day after today, and fresh copies of the goal's own tasks (each due the
 * same number of days after the new target as it was after the old one, with the same people).
 */
async function spawnNextGoal(tx: Tx, viewerId: string, orgId: string, goal: NonNullable<Awaited<ReturnType<typeof lockGoal>>>, today: string, now: Date): Promise<NextGoal | null> {
  const rule: Recurrence | null = goal.recurrence ?? null;
  if (rule === null) return null;
  const seriesId = goal.seriesId ?? goal.id;
  const [open] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.seriesId, seriesId), ne(goals.id, goal.id), eq(goals.status, "active")));
  if ((open?.n ?? 0) > 0) return null;
  const targetDate = nextAfterFinishing(rule, goal.targetDate, goal.targetDate, today);
  const shift = goal.targetDate ? calendarDaysBetween(goal.targetDate, targetDate) : 0;
  const [created] = await tx
    .insert(goals)
    .values({
      orgId,
      projectId: goal.projectId,
      parentGoalId: goal.parentGoalId,
      title: goal.title,
      description: goal.description,
      successCriteria: goal.successCriteria,
      ownerId: goal.ownerId,
      targetDate,
      recurrence: rule,
      seriesId,
      requiresApproval: goal.requiresApproval,
      createdBy: viewerId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: goals.id });
  const copies = await tx
    .select({ id: tasks.id, title: tasks.title, description: tasks.description, priority: tasks.priority, dueDate: tasks.dueDate, dueTime: tasks.dueTime, createdBy: tasks.createdBy })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, goal.id), liveOnly, ne(tasks.status, "rejected")));
  for (const source of copies) {
    const [task] = await tx
      .insert(tasks)
      .values({
        orgId,
        projectId: goal.projectId,
        goalId: created.id,
        title: source.title,
        description: source.description,
        createdBy: viewerId,
        priority: source.priority,
        dueDate: source.dueDate ? dayKey(new Date(Date.parse(`${source.dueDate}T00:00:00Z`) + shift * 86_400_000), "UTC") : null,
        dueTime: source.dueTime,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tasks.id });
    await applyAssignment(tx, task.id, viewerId, [], await assignmentOf(tx, source.id), now);
    await recordActivity(tx, { orgId, taskId: task.id, actorId: viewerId }, [{ kind: "created", after: { title: source.title, copiedFrom: source.id }, note: `Copied into the next occurrence of the goal “${goal.title}”.` }], now);
  }
  return { id: created.id, targetDate, tasks: copies.length };
}

/**
 * Marks a goal completed, pauses it, or makes it active again. Completing (and reopening a completed goal) is for
 * admins, leaders and stakeholders; pausing is for whoever manages planning. Completing a repeating goal makes the
 * next one, tasks included.
 */
export async function setGoalStatus(input: z.input<typeof statusSchema>): Promise<ActionResult<{ next: NextGoal | null }>> {
  return runAction("goals.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const today = dayKey(now, viewer.timezone);
    const outcome = await db.transaction(async (tx) => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      const completing = data.status === "completed" || goal.status === "completed";
      if (completing ? !canCompleteGoal(viewer) : !canManagePlanning(viewer)) {
        throw new GuardError("forbidden", completing ? "Only admins, leaders and stakeholders can mark a goal completed." : "Only leaders and admins can pause a goal.");
      }
      if (goal.status === data.status) return { from: goal.status, next: null };
      await tx
        .update(goals)
        .set({
          status: data.status,
          completedAt: data.status === "completed" ? now : null,
          completedBy: data.status === "completed" ? viewer.userId : null,
          updatedAt: now,
        })
        .where(eq(goals.id, goal.id));
      const next = data.status === "completed" ? await spawnNextGoal(tx, viewer.userId, viewer.orgId, goal, today, now) : null;
      return { from: goal.status, next };
    });
    log.info("goals.status_changed", { orgId: viewer.orgId, goalId: data.goalId, from: outcome.from, to: data.status, next: outcome.next?.id ?? null, by: viewer.userId });
    refresh();
    const next = outcome.next;
    const message = next
      ? `Goal completed. The next one is due ${formatDay(next.targetDate, today)}${next.tasks > 0 ? ` with ${next.tasks} ${next.tasks === 1 ? "task" : "tasks"} copied over` : ""}.`
      : STATUS_MESSAGES[data.status];
    return ok({ next }, message);
  });
}

// --- connections (the branch view) --------------------------------------------------------------------------------

const connectionsSchema = z.object({ goalId: id, comesAfter: z.array(id).max(50).default([]), leadsTo: z.array(id).max(50).default([]) });

/**
 * Replaces the goals that lead into this one and the ones it leads to. Every goal must be in this workspace, and
 * no link may close a loop (lib/goals/graph.ts), parent → sub-goal edges included.
 */
export async function setGoalConnections(input: z.input<typeof connectionsSchema>): Promise<ActionResult> {
  return runAction("goals.connections", connectionsSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canLinkGoals(viewer)) throw new GuardError("forbidden");
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      const wanted = [...new Set([...data.comesAfter, ...data.leadsTo])].filter((each) => each !== goal.id);
      const known = await goalsById(tx, viewer.orgId, wanted);
      if (known.length !== wanted.length) return fail("One of those goals doesn't exist, or you can't see it.");
      const comesAfter = [...new Set(data.comesAfter)].filter((each) => each !== goal.id);
      const leadsTo = [...new Set(data.leadsTo)].filter((each) => each !== goal.id && !comesAfter.includes(each));
      // The loop check runs against the links that will remain, plus the ones being added, one at a time.
      const others = (await linkEdgesForCycleCheck(tx, viewer.orgId)).filter((edge) => edge.from !== goal.id && edge.to !== goal.id);
      const additions = [...comesAfter.map((from) => ({ from, to: goal.id })), ...leadsTo.map((to) => ({ from: goal.id, to }))];
      const edges = [...others];
      for (const edge of additions) {
        if (wouldCycle(edges, edge.from, edge.to)) {
          const other = known.find((each) => each.id === (edge.from === goal.id ? edge.to : edge.from));
          return fail(`Linking “${other?.title ?? "that goal"}” would make a loop: a goal can't lead back into something that leads to it.`);
        }
        edges.push(edge);
      }
      await tx.delete(goalLinks).where(and(eq(goalLinks.orgId, viewer.orgId), sql`(${goalLinks.fromGoalId} = ${goal.id} or ${goalLinks.toGoalId} = ${goal.id})`));
      if (additions.length > 0) await tx.insert(goalLinks).values(additions.map((edge) => ({ orgId: viewer.orgId, fromGoalId: edge.from, toGoalId: edge.to, createdBy: viewer.userId })));
      await tx.update(goals).set({ updatedAt: new Date() }).where(inArray(goals.id, [goal.id, ...wanted]));
      return ok(undefined);
    });
    if (!result.ok) return result;
    log.info("goals.connections", { orgId: viewer.orgId, goalId: data.goalId, comesAfter: data.comesAfter.length, leadsTo: data.leadsTo.length, by: viewer.userId });
    refresh();
    return ok(undefined, "Connections saved.");
  });
}

// --- sign-off chain --------------------------------------------------------------------------------------------------

const approvalsSchema = z.object({
  goalId: id,
  requiresApproval: z.boolean(),
  stepUserIds: z.array(id).max(LIMITS.approvalPeople).default([]),
  bypassUserIds: z.array(id).max(LIMITS.approvalPeople).default([]),
});

/** Who signs off new tasks under this goal, in order, and who skips the queue; overrides the project's rule. */
export async function saveGoalApprovals(input: z.input<typeof approvalsSchema>): Promise<ActionResult> {
  return runAction("goals.approvals", approvalsSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManageApprovals(viewer)) throw new GuardError("forbidden");
    await db.transaction(async (tx) => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      await saveApprovalSettings(tx, viewer.orgId, { goalId: goal.id }, data);
    });
    log.info("goals.approvals", { orgId: viewer.orgId, goalId: data.goalId, requiresApproval: data.requiresApproval, steps: data.stepUserIds.length, by: viewer.userId });
    refresh();
    return ok(undefined, data.requiresApproval ? "New tasks under this goal now wait for sign-off." : "Sign-off settings saved.");
  });
}
