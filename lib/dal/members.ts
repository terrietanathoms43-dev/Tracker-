import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizationMembers, users } from "@/db/schema";
import { CLOSED_STATUSES, type OrgRole } from "@/lib/constants";
import { canSeeMembers, type Viewer } from "@/lib/permissions";
import type { Person } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";

// The roster behind /members: everyone in the workspace with their role and the open work assigned to them.
// Every read filters by viewer.orgId in SQL.

const closed = sql.join(
  CLOSED_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

/** One member as the Members page lists them: role, and the open work assigned to them. */
export type MemberDirectoryRow = Person & {
  role: OrgRole;
  joinedAt: string;
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
      work: { active: row.active, blocked: row.blocked, overdue: row.overdue },
    }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}
