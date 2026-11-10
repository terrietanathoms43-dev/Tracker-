"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { goals, projects, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { captureProviderFor } from "@/lib/capture/availability";
import { captureDraftSchema, describeCounts, draftCounts, type CaptureDraft, type CaptureOutcome } from "@/lib/capture/draft";
import { CaptureError, proposeWork } from "@/lib/capture/provider";
import { recordActivity } from "@/lib/dal/activity";
import { applyAssignment, snapshotAssignment, validateAssignment } from "@/lib/dal/assignments";
import { createGoalCloser } from "@/lib/dal/goal-closers";
import { captureContext } from "@/lib/dal/capture";
import { subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { LIMITS } from "@/lib/limits";
import { log } from "@/lib/log";
import { dispatch, type Notice } from "@/lib/notify";
import { canCapture } from "@/lib/permissions";
import { rateLimitHit } from "@/lib/rate-limit";
import { requiredText } from "@/lib/sanitize";
import { sameIds } from "@/lib/tasks/assignees";
import type { ActivityDraft } from "@/lib/tasks/transitions";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// Capture from a meeting (docs/PLAN.md, 2026-11-01 log), in two steps that never blur: `draftFromTranscript` asks
// the helper and returns a draft without writing anything; `applyCapture` takes the draft a person edited and
// approved and creates the project, its goals and the tasks in one transaction, through the same rules as the
// forms (goals need a project, assignment validated, sub-goal deadlines checked, history and notifications as
// for any new task). Leaders and admins capture, so what they create goes live at once.

/** How many drafts one person may ask for in ten minutes: each is a model call that costs money. */
const DRAFTS_PER_WINDOW = 6;
const DRAFT_WINDOW_MS = 10 * 60_000;

const draftSchema = z.object({
  transcript: requiredText(20, LIMITS.transcript, "Paste at least a few lines of the meeting.", `Keep it under ${LIMITS.transcript.toLocaleString()} characters: paste a long meeting in two parts.`),
  projectId: z.string().max(64).default(""),
});

/** The transcript read into a draft of goals and tasks. Nothing is created: the person reviews it first. */
export async function draftFromTranscript(input: z.input<typeof draftSchema>): Promise<ActionResult<CaptureDraft>> {
  return runAction("capture.draft", draftSchema, input, async (data) => {
    const { viewer, user } = await requireViewerContext();
    if (!canCapture(viewer)) throw new GuardError("forbidden", "Only leaders and admins can turn a meeting into tasks.");
    const provider = captureProviderFor(user.email);
    if (provider === null) return fail("Capture from a meeting isn't switched on for this server yet.");
    if (rateLimitHit(`capture:${viewer.userId}`, DRAFTS_PER_WINDOW, DRAFT_WINDOW_MS)) return fail("That's a lot of drafts in a few minutes. Give it a short while and try again.");
    const context = await captureContext(viewer, data.projectId);
    try {
      const draft = await proposeWork(provider, context, data.transcript);
      log.info("capture.draft", { orgId: viewer.orgId, by: viewer.userId, provider, goals: draft.goals.length, tasks: draft.tasks.length });
      return ok(draft);
    } catch (error) {
      if (error instanceof CaptureError) return fail(error.message);
      throw error;
    }
  });
}

/** The row for an existing project, or a clear refusal. */
async function activeProject(tx: Tx, orgId: string, projectId: string) {
  const [row] = await tx.select({ id: projects.id, status: projects.status }).from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  if (!row) throw new GuardError("not_found", "That project doesn't exist, or you can't see it.");
  if (row.status !== "active") throw new GuardError("forbidden", "That project isn't active. Pick another one, or make it active first.");
  return row;
}

/** Creates what the person approved. The project first (goals need one), then the goals in it, then the tasks. */
export async function applyCapture(input: z.input<typeof captureDraftSchema>): Promise<ActionResult<CaptureOutcome>> {
  return runAction("capture.apply", captureDraftSchema, input, async (draft) => {
    const { viewer } = await requireViewerContext();
    if (!canCapture(viewer)) throw new GuardError("forbidden", "Only leaders and admins can turn a meeting into tasks.");
    const counts = draftCounts(draft);
    if (counts.tasks + counts.goals + counts.project === 0) return fail("Nothing is ticked. Tick at least one task or goal to create, or start over.");
    const now = new Date();
    const today = dayKey(now, viewer.timezone);
    const notices: Notice[] = [];
    const meeting = draft.meetingTitle || "a meeting";

    const outcome = await db.transaction(async (tx): Promise<CaptureOutcome> => {
      // 1. The project: goals must sit in one.
      let projectId: string | null = null;
      if (draft.project.mode === "existing") {
        if (draft.project.existingId === "") throw new GuardError("forbidden", "Pick the project the work belongs to, or choose a new one.");
        projectId = (await activeProject(tx, viewer.orgId, draft.project.existingId)).id;
      } else if (draft.project.mode === "new") {
        if (draft.project.name === "") throw new GuardError("forbidden", "Give the new project a name.");
        const [created] = await tx
          .insert(projects)
          .values({
            orgId: viewer.orgId,
            name: draft.project.name,
            description: draft.project.description || null,
            ownerId: viewer.userId,
            targetDate: draft.project.targetDate || null,
            createdBy: viewer.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: projects.id });
        projectId = created.id;
      }

      // The goals this workspace has, for every reference the draft makes to one by id.
      const wantedGoalIds = [
        ...draft.goals.filter((goal) => goal.mode === "existing").map((goal) => goal.existingId),
        ...draft.goals.map((goal) => goal.parentGoalId),
        ...draft.tasks.map((task) => task.goalKey),
      ].filter((id) => id !== "");
      const knownGoals =
        wantedGoalIds.length === 0
          ? []
          : await tx
              .select({ id: goals.id, parentGoalId: goals.parentGoalId, projectId: goals.projectId, targetDate: goals.targetDate, status: goals.status })
              .from(goals)
              .where(and(eq(goals.orgId, viewer.orgId), inArray(goals.id, [...new Set(wantedGoalIds)])));
      const knownGoal = (id: string) => knownGoals.find((goal) => goal.id === id);

      // 2. Goals: an existing one is just referenced; a new one is created in the project (a sub-goal in its parent's).
      const goalIdByKey = new Map<string, string>();
      const goalProjectById = new Map<string, string>(knownGoals.map((goal) => [goal.id, goal.projectId]));
      const createdGoalIds: string[] = [];
      for (const goal of draft.goals) {
        if (!goal.include) continue;
        if (goal.mode === "existing") {
          if (!knownGoal(goal.existingId)) throw new GuardError("not_found", `The goal for "${goal.title}" doesn't exist any more. Untick it or make it a new goal.`);
          goalIdByKey.set(goal.key, goal.existingId);
          continue;
        }
        if (goal.title === "") throw new GuardError("forbidden", "Every new goal needs a title.");
        let parentGoalId: string | null = null;
        let goalProject = projectId;
        if (goal.parentGoalId !== "") {
          const parent = knownGoal(goal.parentGoalId);
          if (!parent || parent.parentGoalId !== null) throw new GuardError("forbidden", `"${goal.title}" can only sit under a top-level goal.`);
          const problem = subGoalDeadlineProblem(parent.targetDate, goal.targetDate || null, today);
          if (problem) throw new GuardError("forbidden", `"${goal.title}": ${problem}`);
          parentGoalId = parent.id;
          goalProject = parent.projectId;
        }
        if (goalProject === null) throw new GuardError("forbidden", `Goals belong to a project. Pick or name a project for "${goal.title}", or untick it.`);
        const [created] = await tx
          .insert(goals)
          .values({
            orgId: viewer.orgId,
            projectId: goalProject,
            parentGoalId,
            title: goal.title,
            description: goal.description || null,
            ownerId: viewer.userId,
            targetDate: goal.targetDate || null,
            createdBy: viewer.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: goals.id });
        // Like every goal, it is made with its "Everything completed" task (lib/dal/goal-closers.ts).
        await createGoalCloser(tx, { id: created.id, orgId: viewer.orgId, projectId: goalProject, ownerId: viewer.userId, targetDate: goal.targetDate || null }, viewer.userId, now);
        goalIdByKey.set(goal.key, created.id);
        goalProjectById.set(created.id, goalProject);
        createdGoalIds.push(created.id);
      }
      /** A task's goal: a draft goal that was created or referenced, or an existing goal by id. */
      const resolveGoal = (key: string): string | null => {
        if (key === "") return null;
        const fromDraft = goalIdByKey.get(key);
        if (fromDraft) return fromDraft;
        return knownGoal(key)?.id ?? null;
      };

      // 3. The tasks, exactly as createTask makes them (actions/tasks.ts): in their goal's project, assignment
      // validated, history, notices. A leader's or admin's tasks are live at once.
      const taskIds: string[] = [];
      for (const task of draft.tasks) {
        if (!task.include || task.title === "") continue;
        const assignment = await validateAssignment(tx, viewer.orgId, task.assigneeIds);
        const goalId = resolveGoal(task.goalKey);
        const taskProject = goalId ? (goalProjectById.get(goalId) ?? projectId) : projectId;
        const description = task.description || (task.evidence ? `From ${meeting}: “${task.evidence}”` : null);
        const [created] = await tx
          .insert(tasks)
          .values({
            orgId: viewer.orgId,
            projectId: taskProject,
            goalId,
            title: task.title,
            description,
            createdBy: viewer.userId,
            priority: task.priority,
            dueDate: task.dueDate || null,
            nextAction: task.nextAction || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: tasks.id });
        await applyAssignment(tx, created.id, viewer.userId, [], assignment, now);
        const drafts: ActivityDraft[] = [{ kind: "created", after: { title: task.title }, note: `Captured from ${meeting}` }];
        if (!sameIds(assignment, [viewer.userId]) && assignment.length > 0) drafts.push({ kind: "assigned", after: await snapshotAssignment(tx, assignment) });
        await recordActivity(tx, { orgId: viewer.orgId, taskId: created.id, actorId: viewer.userId }, drafts, now);
        if (assignment.length > 0) {
          notices.push({
            orgId: viewer.orgId,
            actorId: viewer.userId,
            recipients: assignment,
            kind: "assigned",
            title: `New task for you: ${task.title}`,
            body: task.nextAction ? `First step: ${task.nextAction}` : `From ${meeting}`,
            href: `/tasks/${created.id}`,
          });
        }
        taskIds.push(created.id);
      }

      return { projectId, goalIds: createdGoalIds, taskIds };
    });

    log.info("capture.applied", { orgId: viewer.orgId, by: viewer.userId, projectId: outcome.projectId, goals: outcome.goalIds.length, tasks: outcome.taskIds.length });
    await dispatch(notices);
    refresh();
    return ok(outcome, `Created ${describeCounts(counts)} from ${meeting}.`);
  });
}
