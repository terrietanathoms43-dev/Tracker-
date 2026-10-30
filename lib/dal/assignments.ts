import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { organizationMembers, taskAssignees, users } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { diffAssignees, uniqueIds, type AssignmentSnapshot } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";

// Who a task is assigned to, as rows: reading an assignment, checking one a form sent, writing the difference,
// and naming it for the audit trail. Shared by the task and request actions so both write the same rows.

type Handle = Tx | typeof db;

/** The people on a task right now, by id. */
export async function assignmentOf(handle: Handle, taskId: string): Promise<string[]> {
  const rows = await handle.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  return rows.map((row) => row.userId);
}

/**
 * An assignment as a form sent it, checked against the workspace: every person is a worker here (never a
 * stakeholder, never an outsider). Returns the ids deduplicated.
 */
export async function validateAssignment(handle: Handle, orgId: string, input: readonly string[]): Promise<string[]> {
  const assigneeIds = uniqueIds(input);
  if (assigneeIds.length > 0) {
    const workers = await handle
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, orgId), inArray(organizationMembers.userId, assigneeIds), sql`${organizationMembers.role} <> 'stakeholder'`));
    if (workers.length !== assigneeIds.length) throw new GuardError("forbidden", "Everyone assigned must be a member of this workspace.");
  }
  return assigneeIds;
}

/** Writes the difference between two assignments: rows for who joined, deletions for who left. */
export async function applyAssignment(tx: Tx, taskId: string, actorId: string, before: readonly string[], after: readonly string[], at: Date): Promise<void> {
  const diff = diffAssignees(before, after);
  if (diff.removed.length > 0) await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, diff.removed)));
  if (diff.added.length > 0) await tx.insert(taskAssignees).values(diff.added.map((userId) => ({ taskId, userId, assignedBy: actorId, assignedAt: at })));
}

/** The names behind an assignment, for an audit row: the history still reads right after a rename or a deletion. */
export async function snapshotAssignment(handle: Handle, ids: readonly string[]): Promise<AssignmentSnapshot> {
  if (ids.length === 0) return { assignees: [] };
  const people = await handle
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, [...ids]));
  // In the order the form had them, so "A, B and C" reads the same on both sides of a change.
  const byPerson = new Map(people.map((person) => [person.id, nameOf(person)]));
  return { assignees: ids.filter((id) => byPerson.has(id)).map((id) => ({ id, name: byPerson.get(id)! })) };
}
