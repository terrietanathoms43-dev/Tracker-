import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { organizationMembers, teamMembers, teams, users } from "@/db/schema";
import { CLOSED_STATUSES, type OrgRole } from "@/lib/constants";
import { canSeeMembers, type Viewer } from "@/lib/permissions";
import type { Person, TeamRef } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";

// Teams: named groups of members inside one workspace (docs/PLAN.md, 2026-10-18 log). The list and the one-team
// read behind /members and /teams/[id], the ids the Viewer carries, the pickers, and the row lock the actions use.
// Every read filters by viewer.orgId in SQL.

type Handle = Tx | typeof db;

const closed = sql.join(
  CLOSED_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

/**
 * The outer team's id inside a correlated subquery. In a select without joins Drizzle writes a column inside raw
 * SQL without its table name, so `${teams.id}` would become `"id"` and bind to the subquery's own table; naming the
 * table explicitly keeps the correlation.
 */
const outerTeamId = sql`${teams}.${sql.identifier("id")}`;

/** One team as the Members page and the team page show it. */
export type TeamListItem = TeamRef & {
  description: string | null;
  members: Person[];
  /** Open tasks the team is assigned to, with the trouble inside them (as of today). */
  work: { active: number; blocked: number; overdue: number };
  /** Active goals the team owns. */
  goals: number;
  createdAt: string;
};

const teamColumns = (today: string) => ({
  id: teams.id,
  name: teams.name,
  description: teams.description,
  createdAt: teams.createdAt,
  members: sql<Person[]>`coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'image', u.image) order by u.name nulls last, u.email) from team_members m join users u on u.id = m.user_id where m.team_id = ${outerTeamId}), '[]'::json)`,
  active: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${outerTeamId} and t.status not in (${closed}))`,
  blocked: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${outerTeamId} and t.status = 'blocked')`,
  overdue: sql<number>`(select count(*)::int from task_teams tt join tasks t on t.id = tt.task_id where tt.team_id = ${outerTeamId} and t.status not in (${closed}) and t.due_date < ${today}::date)`,
  goals: sql<number>`(select count(*)::int from goal_teams gt join goals g on g.id = gt.goal_id where gt.team_id = ${outerTeamId} and g.status = 'active')`,
});

type TeamRow = { id: string; name: string; description: string | null; createdAt: Date; members: Person[]; active: number; blocked: number; overdue: number; goals: number };

const toItem = (row: TeamRow): TeamListItem => ({
  id: row.id,
  name: row.name,
  description: row.description,
  members: row.members,
  work: { active: row.active, blocked: row.blocked, overdue: row.overdue },
  goals: row.goals,
  createdAt: row.createdAt.toISOString(),
});

/** Every team of the workspace, by name, with its members and open work. Stakeholders see none. */
export async function listTeams(viewer: Viewer): Promise<TeamListItem[]> {
  if (!canSeeMembers(viewer)) return [];
  const rows = await db
    .select(teamColumns(dayKey(new Date(), viewer.timezone)))
    .from(teams)
    .where(eq(teams.orgId, viewer.orgId))
    .orderBy(asc(teams.name));
  return rows.map(toItem);
}

/** One team of this workspace, or null when it doesn't exist, belongs elsewhere, or the viewer can't see teams. */
export async function getTeam(viewer: Viewer, id: string): Promise<TeamListItem | null> {
  if (!canSeeMembers(viewer)) return null;
  const [row] = await db
    .select(teamColumns(dayKey(new Date(), viewer.timezone)))
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.orgId, viewer.orgId)));
  return row ? toItem(row) : null;
}

/** The teams a picker offers (tasks, goals, filters): every team of the workspace, by name. */
export async function teamOptions(viewer: Viewer): Promise<TeamRef[]> {
  if (!canSeeMembers(viewer)) return [];
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.orgId, viewer.orgId))
    .orderBy(asc(teams.name));
}

/** The ids of the teams `userId` is in within `orgId`: what lib/viewer.ts puts on the Viewer. */
export async function teamIdsFor(handle: Handle, orgId: string, userId: string): Promise<string[]> {
  const rows = await handle
    .select({ id: teams.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teams.orgId, orgId), eq(teamMembers.userId, userId)));
  return rows.map((row) => row.id);
}

/** A team of this workspace by name, ignoring case, so "frontend" and "Frontend" can't both exist. */
export async function findTeamByName(handle: Handle, orgId: string, name: string): Promise<{ id: string } | null> {
  const [row] = await handle
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.orgId, orgId), sql`lower(${teams.name}) = lower(${name})`));
  return row ?? null;
}

/**
 * The team row an action works on, locked (`select … for update`) for the rest of the transaction, with its
 * current member ids. Null when the id is unknown or belongs to another workspace.
 */
export async function lockTeam(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select({ id: teams.id, name: teams.name, description: teams.description })
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
    .for("update");
  if (!row) return null;
  const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, row.id));
  return { ...row, memberIds: members.map((member) => member.userId) };
}

// --- the roster ------------------------------------------------------------------------------------------------

/** One member as the Members page lists them: role, teams, and the open work assigned to them directly. */
export type MemberDirectoryRow = Person & {
  role: OrgRole;
  joinedAt: string;
  teams: TeamRef[];
  work: { active: number; blocked: number; overdue: number };
};

const ROLE_RANK: Record<OrgRole, number> = { admin: 0, leader: 1, member: 2, stakeholder: 3 };

/** Everyone in the workspace (admins first, then leaders, members, stakeholders; alphabetical within each). */
export async function memberDirectory(viewer: Viewer): Promise<MemberDirectoryRow[]> {
  if (!canSeeMembers(viewer)) return [];
  const today = dayKey(new Date(), viewer.timezone);
  const openWork = (extra = sql``) =>
    sql<number>`(select count(*)::int from task_assignees ta join tasks t on t.id = ta.task_id where ta.user_id = ${users.id} and t.org_id = ${viewer.orgId} and t.status not in (${closed}) ${extra})`;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
      teams: sql<TeamRef[]>`coalesce((select json_agg(json_build_object('id', tm.id, 'name', tm.name) order by tm.name) from team_members m join teams tm on tm.id = m.team_id where m.user_id = ${users.id} and tm.org_id = ${viewer.orgId}), '[]'::json)`,
      active: openWork(),
      blocked: openWork(sql`and t.status = 'blocked'`),
      overdue: openWork(sql`and t.due_date < ${today}::date`),
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.orgId, viewer.orgId));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      teams: row.teams,
      work: { active: row.active, blocked: row.blocked, overdue: row.overdue },
    }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

/** The user ids among `userIds` who are workers of this workspace (for a team's members: never a stakeholder). */
export async function workerIdsAmong(handle: Handle, orgId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await handle
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), inArray(organizationMembers.userId, userIds), sql`${organizationMembers.role} <> 'stakeholder'`));
  return rows.map((row) => row.userId);
}
