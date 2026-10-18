import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { invitations, organizations, users } from "@/db/schema";
import type { OrgRole } from "@/lib/constants";
import { hashInviteToken } from "@/lib/invite-token";
import type { Viewer } from "@/lib/permissions";

// Workspace invitations. Only the sha256 of a link's token is stored, so a link can be checked here but
// never rebuilt: the actions hand fresh links back to the person who created them.

const inviter = alias(users, "inviter");

export type InvitationByToken = {
  email: string;
  role: OrgRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  expired: boolean;
  orgName: string;
  inviterName: string | null;
};

/**
 * The invitation behind a link, for /invite/[token]. Not viewer-scoped on purpose: the token is the
 * credential, and the person opening it may not be in any workspace yet.
 */
export async function findInvitationByToken(token: string): Promise<InvitationByToken | null> {
  if (token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      orgName: organizations.name,
      inviterName: inviter.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(eq(invitations.tokenHash, hashInviteToken(token)));
  return row ? { ...row, expired: row.expiresAt.getTime() <= Date.now() } : null;
}

export type InvitationForEmail = {
  id: string;
  orgName: string;
  role: OrgRole;
  inviterName: string | null;
  expiresAt: Date;
};

/**
 * Invitations waiting for an email address (not accepted, not expired), newest first: what a signed-in person
 * without a workspace sees on Home. Not viewer-scoped: there is no workspace yet; the email was proven at sign-in.
 */
export async function listInvitationsForEmail(email: string): Promise<InvitationForEmail[]> {
  return db
    .select({ id: invitations.id, orgName: organizations.name, role: invitations.role, inviterName: inviter.name, expiresAt: invitations.expiresAt })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(and(eq(invitations.email, email.toLowerCase()), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .orderBy(desc(invitations.createdAt));
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  invitedByName: string | null;
  expiresAt: Date;
};

/** Invitations in the viewer's workspace that nobody has accepted yet (expired ones included), newest first. */
export async function listPendingInvitations(viewer: Viewer): Promise<PendingInvitation[]> {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      invitedBy: invitations.invitedBy,
      invitedByName: inviter.name,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(and(eq(invitations.orgId, viewer.orgId), isNull(invitations.acceptedAt)))
    .orderBy(desc(invitations.createdAt));
}
