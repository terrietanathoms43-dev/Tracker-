import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { taskGroups, tasks } from "@/db/schema";
import { recordActivity } from "@/lib/dal/activity";

// Groups of tasks (docs/PLAN.md, 2026-11-11 log): the rows behind `tasks.group_id`. Reads for the lists are in
// lib/dal/tasks.ts (every row carries its group); this file is what the actions need inside a transaction. A group
// is only ever two tasks or more: whatever takes a task out of one calls `dissolveIfSmall`, which lets the last
// task go and removes the row.

/** One group of this workspace, or null. */
export async function findGroup(handle: Tx | Db, orgId: string, groupId: string) {
  const [group] = await handle
    .select({ id: taskGroups.id, orgId: taskGroups.orgId, name: taskGroups.name, createdBy: taskGroups.createdBy })
    .from(taskGroups)
    .where(and(eq(taskGroups.id, groupId), eq(taskGroups.orgId, orgId)));
  return group ?? null;
}

/** Every task in a group, whatever its state, oldest first. */
export async function groupMembers(tx: Tx, orgId: string, groupId: string): Promise<{ id: string; title: string }[]> {
  return tx
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.groupId, groupId)))
    .orderBy(tasks.createdAt, tasks.id);
}

/**
 * Removes a group that has fewer than two tasks left: the one that remains is let go, with a history line saying
 * why, and the row is deleted. True when the group is gone.
 */
export async function dissolveIfSmall(tx: Tx, scope: { orgId: string; actorId: string }, groupId: string, now: Date): Promise<boolean> {
  const members = await groupMembers(tx, scope.orgId, groupId);
  if (members.length >= 2) return false;
  const group = await findGroup(tx, scope.orgId, groupId);
  for (const member of members) {
    await tx.update(tasks).set({ groupId: null, updatedAt: now }).where(eq(tasks.id, member.id));
    await recordActivity(tx, { orgId: scope.orgId, taskId: member.id, actorId: scope.actorId }, [{ kind: "ungrouped", before: { groupId, groupName: group?.name ?? null }, note: "It was the last task left in its group." }], now);
  }
  await tx.delete(taskGroups).where(and(eq(taskGroups.id, groupId), eq(taskGroups.orgId, scope.orgId)));
  return true;
}

/**
 * Takes a task out of whatever group it is in, inside the caller's transaction, and tidies the group it left. For
 * the things that end a membership without being asked to: a task attached under another (a sub-task goes where
 * its parent goes), a task deleted. `record` false leaves the task's own row and history alone (it is being deleted).
 */
export async function leaveGroup(tx: Tx, scope: { orgId: string; actorId: string }, task: { id: string; groupId: string | null }, now: Date, options: { note?: string; record?: boolean } = {}): Promise<void> {
  if (task.groupId === null) return;
  if (options.record !== false) {
    const group = await findGroup(tx, scope.orgId, task.groupId);
    await tx.update(tasks).set({ groupId: null, updatedAt: now }).where(eq(tasks.id, task.id));
    await recordActivity(tx, { orgId: scope.orgId, taskId: task.id, actorId: scope.actorId }, [{ kind: "ungrouped", before: { groupId: task.groupId, groupName: group?.name ?? null }, note: options.note ?? null }], now);
  } else {
    await tx.update(tasks).set({ groupId: null }).where(eq(tasks.id, task.id));
  }
  await dissolveIfSmall(tx, scope, task.groupId, now);
}
