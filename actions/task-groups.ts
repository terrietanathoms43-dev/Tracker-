"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { taskGroups, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { recordActivity } from "@/lib/dal/activity";
import { dissolveIfSmall, findGroup, groupMembers } from "@/lib/dal/task-groups";
import { lockTask } from "@/lib/dal/tasks";
import { LIMITS } from "@/lib/limits";
import { log } from "@/lib/log";
import { canGroupTask, canManageTaskGroup, isLive, isWorker, type TaskScope, type Viewer } from "@/lib/permissions";
import { optionalText } from "@/lib/sanitize";
import { GROUP_REFUSALS, groupLabel } from "@/lib/tasks/groups";
import { requireViewer } from "@/lib/viewer";

// Tasks grouped together (docs/PLAN.md, 2026-11-11 log): equals that every list draws side by side inside one
// border. Not parent and child: that is a sub-task (actions/tasks.ts `attachTask`). A task is in one group at most;
// a sub-task goes where its parent goes and a goal's closer stays last under its goal, so neither is grouped. Each
// action is one transaction (the group and its members change together), with a history line on every task.

const id = z.string().min(1).max(64);

type Outcome = { done: number; failed: { id: string; title: string; error: string }[] };
type Locked = NonNullable<Awaited<ReturnType<typeof lockTask>>>;

/** Why this task cannot be put in a group, in the words its menu would use; null when it can. */
function refusal(viewer: Viewer, { task, scope }: Locked): string | null {
  if (!isLive(task)) return GROUP_REFUSALS.notLive;
  if (task.parentTaskId !== null) return GROUP_REFUSALS.subTask;
  if (task.goalCloser) return GROUP_REFUSALS.closer;
  if (!canGroupTask(viewer, scope)) return GROUP_REFUSALS.edit;
  return null;
}

/** "“A”, “B” and 2 more": the tasks a history line says this one was grouped with. */
const others = (members: { id: string; title: string }[], exceptId: string) => members.filter((member) => member.id !== exceptId).map((member) => member.title);

const groupSchema = z.object({
  taskIds: z.array(id).min(1, "Pick at least one task.").max(100, "Pick at most 100 tasks at a time."),
  /** "Group with…" on one task: the task picked. Its group is the one joined (it is made with it otherwise). */
  withTaskId: z.string().max(64).default(""),
  /** What the tasks have in common; optional. Given for a group that exists, it renames it. */
  name: optionalText(LIMITS.groupName),
});

/**
 * Groups tasks together: the ticked rows of the selection bar, or one task with another ("Group with…"). They join
 * the group the picked task is in, else the first group any of them is in, else a new one; a task that was in
 * another group leaves it (a group left with one task is dissolved). A task that cannot be grouped is named with
 * the reason and the rest still are; fewer than two tasks in the group at the end changes nothing.
 */
export async function groupTasks(input: z.input<typeof groupSchema>): Promise<ActionResult<Outcome & { groupId: string }>> {
  return runAction("tasks.group", groupSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!isWorker(viewer)) throw new GuardError("forbidden");
    // Sorted, so two people grouping overlapping sets lock the rows in the same order.
    const ids = [...new Set([...(data.withTaskId ? [data.withTaskId] : []), ...data.taskIds])].sort();
    if (ids.length < 2) return fail("Pick at least two tasks to group together.");
    const now = new Date();
    const scope = { orgId: viewer.orgId, actorId: viewer.userId };
    const result = await db.transaction(async (tx) => {
      const outcome: Outcome = { done: 0, failed: [] };
      const joining: Locked[] = [];
      for (const taskId of ids) {
        const locked = await lockTask(tx, viewer.orgId, taskId);
        if (locked === null) {
          outcome.failed.push({ id: taskId, title: "A task", error: "it doesn't exist, or you can't see it" });
          continue;
        }
        const why = refusal(viewer, locked);
        if (why !== null) outcome.failed.push({ id: taskId, title: locked.task.title, error: why });
        else joining.push(locked);
      }
      if (joining.length < 2) return { outcome, groupId: null, name: null, created: false };

      // The group to join: the picked task's, else the first one any of them is already in (while it still is a
      // group: two tasks or more), else a new one.
      const candidates = [...new Set([joining.find((each) => each.task.id === data.withTaskId)?.task.groupId, ...joining.map((each) => each.task.groupId)].filter((groupId): groupId is string => typeof groupId === "string"))];
      let target: { id: string; name: string | null } | null = null;
      for (const groupId of candidates) {
        const group = await findGroup(tx, viewer.orgId, groupId);
        if (group !== null && (await groupMembers(tx, viewer.orgId, groupId)).length >= 2) {
          target = group;
          break;
        }
      }
      const created = target === null;
      if (target === null) {
        const [row] = await tx
          .insert(taskGroups)
          .values({ orgId: viewer.orgId, name: data.name || null, createdBy: viewer.userId, createdAt: now, updatedAt: now })
          .returning({ id: taskGroups.id, name: taskGroups.name });
        target = row;
      } else if (data.name !== "" && data.name !== target.name) {
        await tx.update(taskGroups).set({ name: data.name, updatedAt: now }).where(eq(taskGroups.id, target.id));
        target = { ...target, name: data.name };
      }

      const moved = joining.filter((each) => each.task.groupId !== target.id);
      const left = new Set<string>();
      if (moved.length > 0) {
        await tx
          .update(tasks)
          .set({ groupId: target.id, updatedAt: now })
          .where(
            and(
              eq(tasks.orgId, viewer.orgId),
              inArray(
                tasks.id,
                moved.map((each) => each.task.id),
              ),
            ),
          );
      }
      const members = await groupMembers(tx, viewer.orgId, target.id);
      for (const { task } of moved) {
        if (task.groupId !== null) left.add(task.groupId);
        await recordActivity(tx, { ...scope, taskId: task.id }, [{ kind: "grouped", before: { groupId: task.groupId }, after: { groupId: target.id, groupName: target.name, with: others(members, task.id).slice(0, 5), size: members.length } }], now);
      }
      // A group these tasks came out of may be down to one task: it is not a group any more.
      for (const groupId of left) await dissolveIfSmall(tx, scope, groupId, now);
      outcome.done = moved.length;
      return { outcome, groupId: target.id, name: target.name, created };
    });

    const { outcome, groupId } = result;
    const tail = outcome.failed.length > 0 ? ` ${outcome.failed.length} couldn't: ${outcome.failed.map((each) => `“${each.title}” (${each.error})`).join("; ")}` : "";
    if (groupId === null) return fail(`Nothing was grouped: a group needs two tasks.${tail}`);
    log.info("tasks.grouped", { orgId: viewer.orgId, groupId, created: result.created, done: outcome.done, failed: outcome.failed.length, by: viewer.userId });
    refresh();
    const named = result.name ? ` in “${result.name}”` : "";
    const head = outcome.done === 0 ? "They were already grouped together." : result.created ? `${outcome.done} tasks grouped together${named}.` : `${outcome.done} ${outcome.done === 1 ? "task" : "tasks"} added to the group${named}.`;
    return ok({ ...outcome, groupId }, `${head}${tail}`);
  });
}

const ungroupSchema = z.object({ taskId: id });

/** Takes one task out of its group. A group left with a single task is dissolved: that task is let go as well. */
export async function ungroupTask(input: z.input<typeof ungroupSchema>): Promise<ActionResult> {
  return runAction("tasks.ungroup", ungroupSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const scope = { orgId: viewer.orgId, actorId: viewer.userId };
    const gone = await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId);
      if (locked === null) throw new GuardError("not_found");
      const { task } = locked;
      if (!canGroupTask(viewer, locked.scope)) throw new GuardError("forbidden", GROUP_REFUSALS.edit);
      if (task.groupId === null) throw new GuardError("conflict", "This task is not in a group.");
      const group = await findGroup(tx, viewer.orgId, task.groupId);
      await tx.update(tasks).set({ groupId: null, updatedAt: now }).where(eq(tasks.id, task.id));
      await recordActivity(tx, { ...scope, taskId: task.id }, [{ kind: "ungrouped", before: { groupId: task.groupId, groupName: group?.name ?? null } }], now);
      return dissolveIfSmall(tx, scope, task.groupId, now);
    });
    log.info("tasks.ungrouped", { orgId: viewer.orgId, taskId: data.taskId, dissolved: gone, by: viewer.userId });
    refresh();
    return ok(undefined, gone ? "Taken out. One task was left, so the group is gone." : "Taken out of the group.");
  });
}

/** The group and the permission scope of each of its tasks, locked; refuses a viewer who may not manage it. */
async function lockGroup(tx: Tx, viewer: Viewer, groupId: string) {
  const group = await findGroup(tx, viewer.orgId, groupId);
  if (group === null) throw new GuardError("not_found", "That group doesn't exist any more.");
  const members: Locked[] = [];
  const scopes: TaskScope[] = [];
  for (const member of await groupMembers(tx, viewer.orgId, groupId)) {
    const locked = await lockTask(tx, viewer.orgId, member.id);
    if (locked === null) continue;
    members.push(locked);
    scopes.push(locked.scope);
  }
  if (!canManageTaskGroup(viewer, group, scopes)) {
    throw new GuardError("forbidden", "Only a leader, whoever made the group, or someone who can edit every task in it can change the group. You can still take your own task out.");
  }
  return { group, members };
}

const renameSchema = z.object({ groupId: id, name: optionalText(LIMITS.groupName) });

/** Names a group, or takes its name away (the lists then say "Group"). */
export async function renameGroup(input: z.input<typeof renameSchema>): Promise<ActionResult> {
  return runAction("tasks.group_rename", renameSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const changed = await db.transaction(async (tx) => {
      const { group } = await lockGroup(tx, viewer, data.groupId);
      const name = data.name === "" ? null : data.name;
      if ((group.name ?? null) === name) return false;
      await tx.update(taskGroups).set({ name, updatedAt: now }).where(eq(taskGroups.id, group.id));
      return true;
    });
    if (!changed) return ok(undefined);
    log.info("tasks.group_renamed", { orgId: viewer.orgId, groupId: data.groupId, by: viewer.userId });
    refresh();
    return ok(undefined, data.name === "" ? "Group name removed." : `Group named “${groupLabel({ name: data.name })}”.`);
  });
}

const dissolveSchema = z.object({ groupId: id });

/** Ungroups everything: every task is let go, with a history line each, and the group is removed. The tasks stay. */
export async function dissolveGroup(input: z.input<typeof dissolveSchema>): Promise<ActionResult> {
  return runAction("tasks.group_dissolve", dissolveSchema, input, async (data) => {
    const viewer = await requireViewer();
    const now = new Date();
    const count = await db.transaction(async (tx) => {
      const { group, members } = await lockGroup(tx, viewer, data.groupId);
      for (const { task } of members) {
        await tx.update(tasks).set({ groupId: null, updatedAt: now }).where(eq(tasks.id, task.id));
        await recordActivity(tx, { orgId: viewer.orgId, taskId: task.id, actorId: viewer.userId }, [{ kind: "ungrouped", before: { groupId: group.id, groupName: group.name }, note: "The whole group was ungrouped." }], now);
      }
      await tx.delete(taskGroups).where(and(eq(taskGroups.id, group.id), eq(taskGroups.orgId, viewer.orgId)));
      return members.length;
    });
    log.info("tasks.group_dissolved", { orgId: viewer.orgId, groupId: data.groupId, tasks: count, by: viewer.userId });
    refresh();
    return ok(undefined, `Ungrouped ${count} ${count === 1 ? "task" : "tasks"}. They stay where they are.`);
  });
}
