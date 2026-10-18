import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { listMemberships, type Membership } from "@/lib/dal/orgs";
import { teamIdsFor } from "@/lib/dal/teams";
import { readActiveOrgCookie, tryRewriteActiveOrgCookie } from "@/lib/org-cookie";
import type { Viewer } from "@/lib/permissions";
import { safeTimeZone } from "@/lib/time";

// Who is asking, and in which workspace. Resolved once per request (React cache) and handed to every
// DAL function and action, so scoping by workspace is never left to a screen.

export type SessionUser = { id: string; name: string | null; email: string; image: string | null; timezone: string | null };

export type ViewerContext = {
  viewer: Viewer;
  user: SessionUser;
  org: Membership;
  /** Every workspace the user belongs to, for the switcher. */
  orgs: Membership[];
};

type Resolved = { status: "signed-out" } | { status: "no-org"; user: SessionUser } | ({ status: "ok" } & ViewerContext);

/**
 * The signed-in user, from Better Auth's session (the signed cookie checked against the sessions table).
 * `disableRefresh` keeps reads pure: a page render never extends a session or sets a cookie.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers(), query: { disableRefresh: true, disableCookieCache: true } });
  if (!result) return null;
  const { user } = result;
  return { id: user.id, name: user.name || null, email: user.email, image: user.image ?? null, timezone: user.timezone ?? null };
});

/**
 * Resolves the active workspace: the `trackwise.org` cookie when the user really is a member of that
 * workspace, otherwise their oldest membership (and the cookie is rewritten where that is possible).
 */
const resolve = cache(async (): Promise<Resolved> => {
  const user = await getSessionUser();
  if (user === null) return { status: "signed-out" };

  const [memberships, wanted] = await Promise.all([listMemberships(user.id), readActiveOrgCookie()]);
  if (memberships.length === 0) return { status: "no-org", user };

  const org = memberships.find((membership) => membership.orgId === wanted) ?? memberships[0];
  if (org.orgId !== wanted) await tryRewriteActiveOrgCookie(org.orgId);
  // The viewer's teams in this workspace: "assigned through a team" is then a pure check in lib/permissions.ts.
  const teamIds = await teamIdsFor(db, org.orgId, user.id);

  return {
    status: "ok",
    viewer: { userId: user.id, orgId: org.orgId, orgRole: org.role, teamIds, timezone: safeTimeZone(user.timezone ?? org.timezone) },
    user,
    org,
    orgs: memberships,
  };
});

/** The viewer for the active workspace, or null (signed out, or no workspace yet). */
export async function getViewer(): Promise<Viewer | null> {
  const resolved = await resolve();
  return resolved.status === "ok" ? resolved.viewer : null;
}

/** The full context for the active workspace, or null. */
export async function getViewerContext(): Promise<ViewerContext | null> {
  const resolved = await resolve();
  return resolved.status === "ok" ? { viewer: resolved.viewer, user: resolved.user, org: resolved.org, orgs: resolved.orgs } : null;
}

/**
 * Signed-in user with a workspace, or a redirect to /login or, without a workspace, to /home (which shows how to
 * get one: create it, or accept an invitation).
 */
export async function requireViewerContext(): Promise<ViewerContext> {
  const resolved = await resolve();
  if (resolved.status === "signed-out") redirect("/login");
  if (resolved.status === "no-org") redirect("/home");
  return { viewer: resolved.viewer, user: resolved.user, org: resolved.org, orgs: resolved.orgs };
}

export async function requireViewer(): Promise<Viewer> {
  return (await requireViewerContext()).viewer;
}

/** Signed in, workspace or not (onboarding, invitations). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user === null) redirect("/login");
  return user;
}
