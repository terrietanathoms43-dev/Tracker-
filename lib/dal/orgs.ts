import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { invitations, organizationMembers, organizations, users } from "@/db/schema";
import type { OrgRole } from "@/lib/constants";
import type { Viewer } from "@/lib/permissions";

// Workspaces (organizations) and their members. Everything a request needs to know about who the viewer is
// and where they are starts here.

export type Membership = {
  orgId: string;
  name: string;
  slug: string;
  timezone: string;
  role: OrgRole;
  joinedAt: Date;
};

/** Every workspace the user belongs to, oldest first (the first one is the fallback active workspace). */
export async function listMemberships(userId: string): Promise<Membership[]> {
  return db
    .select({
      orgId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizationMembers.joinedAt));
}

export async function findMembership(handle: Tx | typeof db, orgId: string, userId: string): Promise<{ role: OrgRole } | null> {
  const [row] = await handle
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)));
  return row ?? null;
}

export type Member = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: OrgRole;
  joinedAt: Date;
};

const ROLE_RANK: Record<OrgRole, number> = { admin: 0, leader: 1, member: 2, stakeholder: 3 };

/** The workspace's members: admins first, then leaders, members, stakeholders, alphabetically within each. */
export async function listMembers(viewer: Viewer): Promise<Member[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.orgId, viewer.orgId));
  return rows
    .map((row) => ({ ...row, email: row.email ?? "" }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

/** The people who can own and approve work (everyone but stakeholders). */
export async function listWorkers(viewer: Viewer): Promise<Member[]> {
  return (await listMembers(viewer)).filter((member) => member.role !== "stakeholder");
}

/** Leaders and admins of a workspace: the default approvers, and who hears about blocked work. */
export async function leaderIds(handle: Tx | typeof db, orgId: string): Promise<string[]> {
  const rows = await handle
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), inArray(organizationMembers.role, ["admin", "leader"])));
  return rows.map((row) => row.userId);
}

export async function countMembers(handle: Tx | typeof db, orgId: string): Promise<number> {
  const [row] = await handle
    .select({ n: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId));
  return row?.n ?? 0;
}

/** Other admins besides `userId`: an admin may only leave or step down when someone else can still administer. */
export async function otherAdminCount(handle: Tx | typeof db, orgId: string, userId: string): Promise<number> {
  const [row] = await handle
    .select({ n: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.role, "admin"), ne(organizationMembers.userId, userId)));
  return row?.n ?? 0;
}

// --- slugs -------------------------------------------------------------------------

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

/** A slug no other workspace has: the plain one, else with -2, -3, … */
export async function uniqueSlug(tx: Tx, name: string, keepFor?: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate));
    if (!taken || taken.id === keepFor) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

// --- setup and administration ------------------------------------------------------

export type SetupState = { otherMembers: number; pendingInvitations: number };

/**
 * What onboarding needs to pick its step from the server, never from client state: a workspace where
 * the admin is still alone (nobody else, nobody invited) gets the invite step.
 */
export async function getSetupState(viewer: Viewer): Promise<SetupState> {
  const [members, [pending]] = await Promise.all([
    countMembers(db, viewer.orgId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(invitations)
      .where(and(eq(invitations.orgId, viewer.orgId), isNull(invitations.acceptedAt))),
  ]);
  return { otherMembers: Math.max(0, members - 1), pendingInvitations: pending?.n ?? 0 };
}

/**
 * Locks the workspace's admin rows (`for update`) and returns their user ids. Call it first in any
 * transaction that could leave a workspace without an admin: two admins demoting or removing each other at
 * the same moment then queue up, and the second one sees the first one's change.
 */
export async function lockAdminIds(tx: Tx, orgId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.role, "admin")))
    .for("update");
  return rows.map((row) => row.userId);
}
