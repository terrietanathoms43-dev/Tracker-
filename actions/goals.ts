"use server";

import { and, eq, inArray, isNull, ne, not, notInArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { optionalText, requiredText } from "@/lib/sanitize";
import { db, type Tx } from "@/db";
import { goalLinks, goals, notifications, projects, tasks } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { CLOSED_STATUSES, GOAL_STATUSES, type GoalStatus } from "@/lib/constants";
import { saveApprovalSettings } from "@/lib/dal/approvals";
import { recordActivity } from "@/lib/dal/activity";
import { findGoal, goalsById, linkEdgesForCycleCheck, lockGoal, ownerError, subGoalDeadlines } from "@/lib/dal/goals";
import { assertNoOpenTasks, goalAchievedNotice } from "@/lib/dal/goal-achievement";
import { syncLinkedWork } from "@/lib/dal/comment-tasks";
import { automaticGoalTask, completeGoalCloser, createGoalCloser, deleteGoalClosers, reopenGoalCloser, type ChangedCloser } from "@/lib/dal/goal-closers";
import { findProject } from "@/lib/dal/projects";
import { createGoalOccurrence, type NextGoal } from "@/lib/dal/recurrence";
import { parentDeadlineProblem, subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { wouldCycle } from "@/lib/goals/graph";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import { canCompleteGoal, canCreatePlanning, canDeleteGoal, canLinkGoals, canManageApprovals, canManagePlanning } from "@/lib/permissions";
import { nextAfterFinishing, normalizeRecurrence, type Recurrence } from "@/lib/recurrence";
import { dayKey, formatDay } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// Every change to a goal. Goals belong to a project (docs/PLAN.md, 2026-11-03 log) and are managed by leaders and
// admins (canManagePlanning); marking one completed is for admins, leaders and stakeholders (canCompleteGoal).
// They are paused or completed, or deleted without their tasks (2026-11-04 log), so the work keeps its history. A goal may be a
// sub-goal of one top-level goal in the same project (2026-10-30 log); a sub-goal's target date never passes its
// parent's. A repeating goal makes its next occurrence, tasks included, when it is completed. Every goal is made with
// its "Everything completed" task (lib/dal/goal-closers.ts, 2026-11-09 log): completing that task is what achieves
// the goal, and the row here follows the goal (completed with it by hand, open again with it, gone with it).

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
    if (!canCreatePlanning(viewer)) throw new GuardError("forbidden");
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
      // Every goal is made with its "Everything completed" task: its last step, which marks it achieved.
      await createGoalCloser(tx, { id: row.id, orgId: viewer.orgId, projectId: placed.projectId, ownerId, targetDate: data.targetDate || null }, viewer.userId, new Date());
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
      const target = data.targetDate || null;
      if (target !== goal.targetDate) {
        // The closer is due when its goal is: it follows a moved target unless someone gave it a day of its own.
        const now = new Date();
        const following = await tx
          .update(tasks)
          .set({ dueDate: target, updatedAt: now })
          .where(
            and(
              eq(tasks.orgId, viewer.orgId),
              eq(tasks.goalId, goal.id),
              eq(tasks.goalCloser, true),
              notInArray(tasks.status, [...CLOSED_STATUSES]),
              goal.targetDate === null ? isNull(tasks.dueDate) : eq(tasks.dueDate, goal.targetDate),
            ),
          )
          .returning({ id: tasks.id });
        for (const closer of following) {
          await recordActivity(tx, { orgId: viewer.orgId, taskId: closer.id, actorId: viewer.userId }, [{ kind: "due_changed", before: { dueDate: goal.targetDate }, after: { dueDate: target }, note: "Moved with its goal's target date." }], now);
        }
      }
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

/**
 * When a repeating goal is completed, the next one is made in the same transaction (lib/dal/recurrence.ts): same
 * project, owner, criteria and rule, target on the next scheduled day, with fresh copies of its tasks. Only the
 * latest occurrence makes one; a missed series is caught up when a work screen loads.
 */
async function spawnNextGoal(tx: Tx, viewerId: string, orgId: string, goal: NonNullable<Awaited<ReturnType<typeof lockGoal>>>, today: string, now: Date): Promise<NextGoal | null> {
  const rule: Recurrence | null = goal.recurrence ?? null;
  if (rule === null) return null;
  const seriesId = goal.seriesId ?? goal.id;
  const [later] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.seriesId, seriesId), ne(goals.id, goal.id), sql`${goals.targetDate} > ${goal.targetDate}::date`));
  if ((later?.n ?? 0) > 0) return null;
  const targetDate = nextAfterFinishing(rule, goal.targetDate, goal.targetDate, today);
  if (targetDate === null) return null;
  return createGoalOccurrence(tx, viewerId, { ...goal, orgId, recurrence: rule }, targetDate, now);
}

/**
 * Marks a goal completed, pauses it, or makes it active again. Completing (and reopening a completed goal) is for
 * admins, leaders and stakeholders; pausing is for whoever manages planning. Completing a repeating goal makes the
 * next one, tasks included. The goal's "Everything completed" task goes with it: completed with a goal marked
 * completed here (refused while any other task under the goal is open), open again with a goal reopened here.
 */
export async function setGoalStatus(input: z.input<typeof statusSchema>): Promise<ActionResult<{ next: NextGoal | null }>> {
  return runAction("goals.status", statusSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const today = dayKey(now, viewer.timezone);
    const notices: Notice[] = [];
    const outcome = await db.transaction(async (tx) => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      const completing = data.status === "completed" || goal.status === "completed";
      if (completing ? !canCompleteGoal(viewer) : !canManagePlanning(viewer)) {
        throw new GuardError("forbidden", completing ? "Only admins, leaders and stakeholders can mark a goal completed." : "Only leaders and admins can pause a goal.");
      }
      if (goal.status === data.status) return { from: goal.status, next: null, achieved: null };
      const closerGoal = { ...goal, orgId: viewer.orgId };
      // Every status change syncs the comment a task was made from (lib/dal/comment-tasks.ts); a closer has none.
      const sync = async (changed: ChangedCloser[]) => {
        for (const closer of changed) notices.push(...(await syncLinkedWork(tx, viewer, closer, closer.to, now)).notices);
      };
      // A goal is achieved when its tasks are done (lib/dal/goal-achievement.ts): the button is a shortcut, not a way
      // round that. What it does stand in for is the goal's last step, so the closer is completed with the goal.
      if (data.status === "completed") {
        await assertNoOpenTasks(tx, viewer.orgId, goal);
        await sync(await completeGoalCloser(tx, viewer.userId, closerGoal, now));
      }
      await tx
        .update(goals)
        .set({
          status: data.status,
          completedAt: data.status === "completed" ? now : null,
          completedBy: data.status === "completed" ? viewer.userId : null,
          updatedAt: now,
        })
        .where(eq(goals.id, goal.id));
      // A goal that is no longer completed has its last step open again.
      if (goal.status === "completed") await sync(await reopenGoalCloser(tx, viewer.userId, closerGoal, now));
      const next = data.status === "completed" ? await spawnNextGoal(tx, viewer.userId, viewer.orgId, goal, today, now) : null;
      return { from: goal.status, next, achieved: data.status === "completed" ? { title: goal.title, people: [goal.ownerId, goal.createdBy] } : null };
    });
    log.info("goals.status_changed", { orgId: viewer.orgId, goalId: data.goalId, from: outcome.from, to: data.status, next: outcome.next?.id ?? null, by: viewer.userId });
    // The goal's owner and maker hear that it was achieved, as they do when its last task achieves it.
    await dispatch([...notices, ...(outcome.achieved ? goalAchievedNotice(viewer, { id: data.goalId, title: outcome.achieved.title }, outcome.achieved.people) : [])]);
    refresh();
    const next = outcome.next;
    const message = next
      ? `Goal completed. The next one is due ${formatDay(next.targetDate, today)}${next.tasks > 0 ? ` with ${next.tasks} ${next.tasks === 1 ? "task" : "tasks"} copied over` : ""}.`
      : STATUS_MESSAGES[data.status];
    return ok({ next }, message);
  });
}

// --- delete --------------------------------------------------------------------------------------------------------

const deleteSchema = z.object({ goalId: id, deleteSubGoals: z.boolean().default(false) });

/**
 * Deletes a goal (docs/PLAN.md, 2026-11-04 log). Nothing under it is lost: its own tasks stay in the project
 * without a goal (each gets a history line saying why); its sub-goals become top-level goals of the same project
 * with their tasks, or, when asked, go too (their tasks stay the same way); only the goal's links, sign-off chain,
 * notifications and its "Everything completed" task (which means nothing without the goal) go with it.
 */
export async function deleteGoal(input: z.input<typeof deleteSchema>): Promise<ActionResult<{ projectId: string; tasks: number; subGoals: number; subGoalsDeleted: number }>> {
  return runAction("goals.delete", deleteSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canDeleteGoal(viewer)) throw new GuardError("forbidden", "Only leaders and admins can delete a goal.");
    const now = new Date();
    const detach = async (tx: Tx, goal: { id: string; title: string }) => {
      const detached = await tx
        .update(tasks)
        .set({ goalId: null, updatedAt: now })
        .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.goalId, goal.id), not(automaticGoalTask())))
        .returning({ id: tasks.id });
      for (const task of detached) {
        await recordActivity(
          tx,
          { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId },
          [{ kind: "edited", before: { goalId: goal.id, goalTitle: goal.title }, after: { goalId: null, goalTitle: null }, note: `The goal “${goal.title}” was deleted; the task stays in its project.` }],
          now,
        );
      }
      return detached.length;
    };
    const outcome = await db.transaction(async (tx) => {
      const goal = await lockGoal(tx, viewer.orgId, data.goalId);
      if (goal === null) throw new GuardError("not_found");
      const subGoals = await tx
        .select({ id: goals.id, title: goals.title })
        .from(goals)
        .where(and(eq(goals.orgId, viewer.orgId), eq(goals.parentGoalId, goal.id)));
      await deleteGoalClosers(tx, viewer.orgId, goal.id);
      let detachedTasks = await detach(tx, goal);
      let subGoalsDeleted = 0;
      if (data.deleteSubGoals) {
        for (const sub of subGoals) {
          await deleteGoalClosers(tx, viewer.orgId, sub.id);
          detachedTasks += await detach(tx, sub);
          await tx.delete(goals).where(eq(goals.id, sub.id));
          await tx.delete(notifications).where(and(eq(notifications.orgId, viewer.orgId), eq(notifications.href, `/goals/${sub.id}`)));
          subGoalsDeleted += 1;
        }
      } else if (subGoals.length > 0) {
        await tx.update(goals).set({ parentGoalId: null, updatedAt: now }).where(and(eq(goals.orgId, viewer.orgId), eq(goals.parentGoalId, goal.id)));
      }
      await tx.delete(goals).where(eq(goals.id, goal.id));
      await tx.delete(notifications).where(and(eq(notifications.orgId, viewer.orgId), eq(notifications.href, `/goals/${goal.id}`)));
      return { projectId: goal.projectId, tasks: detachedTasks, subGoals: data.deleteSubGoals ? 0 : subGoals.length, subGoalsDeleted };
    });
    log.info("goals.deleted", { orgId: viewer.orgId, goalId: data.goalId, tasks: outcome.tasks, subGoals: outcome.subGoals, subGoalsDeleted: outcome.subGoalsDeleted, by: viewer.userId });
    refresh();
    const kept = [
      outcome.tasks > 0 ? `${outcome.tasks} ${outcome.tasks === 1 ? "task stays" : "tasks stay"} in the project` : null,
      outcome.subGoals > 0 ? `${outcome.subGoals} ${outcome.subGoals === 1 ? "sub-goal is" : "sub-goals are"} now top-level` : null,
      outcome.subGoalsDeleted > 0 ? `${outcome.subGoalsDeleted} ${outcome.subGoalsDeleted === 1 ? "sub-goal" : "sub-goals"} deleted too` : null,
    ].filter(Boolean);
    return ok(outcome, kept.length > 0 ? `Goal deleted. ${kept.join("; ")}.` : "Goal deleted.");
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

const linkSchema = z.object({ fromGoalId: id, toGoalId: id });

/** Draws one arrow on the branch view: `from` leads into `to`. Refused when it would close a loop. */
export async function linkGoals(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  return runAction("goals.link", linkSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canLinkGoals(viewer)) throw new GuardError("forbidden");
    if (data.fromGoalId === data.toGoalId) return fail("A goal can't lead into itself.");
    const result = await db.transaction(async (tx): Promise<ActionResult<{ from: string; to: string }>> => {
      const [from, to] = await Promise.all([lockGoal(tx, viewer.orgId, data.fromGoalId), findGoal(tx, viewer.orgId, data.toGoalId)]);
      if (from === null || to === null) throw new GuardError("not_found", "One of those goals doesn't exist, or you can't see it.");
      if (to.parentGoalId === from.id || from.parentGoalId === to.id) return fail("A goal already leads to its own sub-goals; that arrow is drawn for you.");
      const edges = await linkEdgesForCycleCheck(tx, viewer.orgId);
      if (edges.some((edge) => edge.from === from.id && edge.to === to.id)) return ok({ from: from.title, to: to.title });
      if (wouldCycle(edges, from.id, to.id)) return fail(`“${from.title}” can't lead into “${to.title}”: that would make a loop, because “${to.title}” already leads to it.`);
      await tx.insert(goalLinks).values({ orgId: viewer.orgId, fromGoalId: from.id, toGoalId: to.id, createdBy: viewer.userId }).onConflictDoNothing();
      await tx.update(goals).set({ updatedAt: new Date() }).where(inArray(goals.id, [from.id, to.id]));
      return ok({ from: from.title, to: to.title });
    });
    if (!result.ok) return result;
    log.info("goals.linked", { orgId: viewer.orgId, from: data.fromGoalId, to: data.toGoalId, by: viewer.userId });
    refresh();
    return ok(undefined, `“${result.data.from}” now leads to “${result.data.to}”.`);
  });
}

/** Takes one arrow off the branch view. */
export async function unlinkGoals(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  return runAction("goals.unlink", linkSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canLinkGoals(viewer)) throw new GuardError("forbidden");
    await db.transaction(async (tx) => {
      const from = await lockGoal(tx, viewer.orgId, data.fromGoalId);
      if (from === null) throw new GuardError("not_found");
      await tx.delete(goalLinks).where(and(eq(goalLinks.orgId, viewer.orgId), eq(goalLinks.fromGoalId, data.fromGoalId), eq(goalLinks.toGoalId, data.toGoalId)));
      await tx.update(goals).set({ updatedAt: new Date() }).where(eq(goals.id, from.id));
    });
    log.info("goals.unlinked", { orgId: viewer.orgId, from: data.fromGoalId, to: data.toGoalId, by: viewer.userId });
    refresh();
    return ok(undefined, "Connection removed.");
  });
}

// --- sign-off chain --------------------------------------------------------------------------------------------------

const approvalsSchema = z.object({
  goalId: id,
  requiresApproval: z.boolean(),
  /** The chain, in order: each step's people, any one of whom signs it (an empty step is any leader's). */
  steps: z.array(z.array(id).max(LIMITS.approvalPeople)).max(10).default([]),
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
    log.info("goals.approvals", { orgId: viewer.orgId, goalId: data.goalId, requiresApproval: data.requiresApproval, steps: data.steps.length, by: viewer.userId });
    refresh();
    return ok(undefined, data.requiresApproval ? "New tasks under this goal now wait for sign-off." : "Sign-off settings saved.");
  });
}
