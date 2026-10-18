import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { organizationMembers, taskAssignees, taskTeams, teams, users } from "@/db/schema";
import { GuardError } from "@/lib/action-result";
import { diffAssignees, uniqueIds, type AssigneeIds, type AssignmentSnapshot } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";

// Who a task is assigned to, as rows: reading an assignment, checking one a form sent, writing the difference,
// and naming it for the audit trail. Shared by the task and request actions so both write the same rows.

type Handle = Tx | typeof db;

const jsonIds = (column: string, table: string, taskId: string) =>
  sql<string[]>`coalesce((select json_agg(${sql.raw(column)}) from ${sql.raw(table)} where task_id = ${taskId}), '[]'::json)`;

/** The people and teams on a task right now. */
export async function assignmentOf(handle: Handle, taskId: string): Promise<AssigneeIds> {
  const [row] = await handle.select({ assigneeIds: jsonIds("user_id", "task_assignees", taskId), teamIds: jsonIds("team_id", "task_teams", taskId) }).from(sql`(select 1) as one`);
  return { assigneeIds: row?.assigneeIds ?? [], teamIds: row?.teamIds ?? [] };
}

/** Everyone expected to deliver a task: the people assigned directly and every member of the teams assigned. */
export async function responsibleIds(handle: Handle, taskId: string): Promise<string[]> {
  const rows = await handle.execute<{ user_id: string }>(sql`
    select user_id from task_assignees where task_id = ${taskId}
    union
    select tm.user_id from task_teams tt join team_members tm on tm.team_id = tt.team_id where tt.task_id = ${taskId}`);
  return rows.rows.map((row) => row.user_id);
}

/** Everyone in any of `teamIds`, once each. */
export async function peopleInTeams(handle: Handle, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const rows = await handle.selectDistinct({ userId: sql<string>`team_members.user_id` }).from(sql`team_members`).where(inArray(sql`team_members.team_id`, teamIds));
  return rows.map((row) => row.userId);
}

/**
 * An assignment as a form sent it, checked against the workspace: every person is a worker here (never a
 * stakeholder, never an outsider) and every team is one of this workspace's. Returns the ids deduplicated.
 */
export async function validateAssignment(handle: Handle, orgId: string, input: AssigneeIds): Promise<AssigneeIds> {
  const assigneeIds = uniqueIds(input.assigneeIds);
  const teamIds = uniqueIds(input.teamIds);
  if (assigneeIds.length > 0) {
    const workers = await handle
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, orgId), inArray(organizationMembers.userId, assigneeIds), sql`${organizationMembers.role} <> 'stakeholder'`));
    if (workers.length !== assigneeIds.length) throw new GuardError("forbidden", "Everyone assigned must be a member of this workspace.");
  }
  if (teamIds.length > 0) {
    const found = await handle
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.orgId, orgId), inArray(teams.id, teamIds)));
    if (found.length !== teamIds.length) throw new GuardError("not_found", "That team doesn't exist, or you can't see it.");
  }
  return { assigneeIds, teamIds };
}

/** Writes the difference between two assignments: rows for who joined, deletions for who left. */
export async function applyAssignment(tx: Tx, taskId: string, actorId: string, before: AssigneeIds, after: AssigneeIds, at: Date): Promise<void> {
  const diff = diffAssignees(before, after);
  if (diff.removedPeople.length > 0) await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, diff.removedPeople)));
  if (diff.removedTeams.length > 0) await tx.delete(taskTeams).where(and(eq(taskTeams.taskId, taskId), inArray(taskTeams.teamId, diff.removedTeams)));
  if (diff.addedPeople.length > 0) await tx.insert(taskAssignees).values(diff.addedPeople.map((userId) => ({ taskId, userId, assignedBy: actorId, assignedAt: at })));
  if (diff.addedTeams.length > 0) await tx.insert(taskTeams).values(diff.addedTeams.map((teamId) => ({ taskId, teamId, assignedBy: actorId, assignedAt: at })));
}

/** The names behind an assignment, for an audit row: the history still reads right after a rename or a deletion. */
export async function snapshotAssignment(handle: Handle, ids: AssigneeIds): Promise<AssignmentSnapshot> {
  const [people, teamRows] = await Promise.all([
    ids.assigneeIds.length === 0
      ? []
      : handle
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, ids.assigneeIds)),
    ids.teamIds.length === 0
      ? []
      : handle
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, ids.teamIds)),
  ]);
  // In the order the form had them, so "A, B and C" reads the same on both sides of a change.
  const byPerson = new Map(people.map((person) => [person.id, nameOf(person)]));
  const byTeam = new Map(teamRows.map((team) => [team.id, team.name]));
  return {
    assignees: ids.assigneeIds.filter((id) => byPerson.has(id)).map((id) => ({ id, name: byPerson.get(id)! })),
    teams: ids.teamIds.filter((id) => byTeam.has(id)).map((id) => ({ id, name: byTeam.get(id)! })),
  };
}
