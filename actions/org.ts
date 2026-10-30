"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { cappedText, requiredText } from "@/lib/sanitize";
import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { DEFAULT_TIMEZONE, ORG_COOKIE } from "@/lib/constants";
import { findMembership, uniqueSlug } from "@/lib/dal/orgs";
import { requireOrgAdmin } from "@/lib/guards";
import { log } from "@/lib/log";
import { setActiveOrgCookie } from "@/lib/org-cookie";
import { isValidTimeZone } from "@/lib/time";
import { requireUser } from "@/lib/viewer";

// Workspaces: create, rename, switch, delete. Members and invitations live in actions/members.ts and
// actions/invitations.ts.

const nameSchema = requiredText(2, LIMITS.workspaceName, "Give the workspace a name (2 characters or more).");
const timezoneSchema = z.string().trim().default(DEFAULT_TIMEZONE).refine(isValidTimeZone, "Pick a timezone from the list.");

const createSchema = z.object({ name: nameSchema, timezone: timezoneSchema });

/**
 * Onboarding's first step (and "New workspace" from the switcher): the creator becomes its first admin.
 * Onboarding then works out the next step from what exists, so a refresh can never lose it.
 */
export async function createOrganization(input: z.input<typeof createSchema>): Promise<ActionResult<{ orgId: string }>> {
  const result = await runAction("org.create", createSchema, input, async (data) => {
    const user = await requireUser();
    const orgId = await db.transaction(async (tx) => {
      const slug = await uniqueSlug(tx, data.name);
      const [org] = await tx
        .insert(organizations)
        .values({ name: data.name, slug, timezone: data.timezone, createdBy: user.id })
        .returning({ id: organizations.id });
      await tx.insert(organizationMembers).values({ orgId: org.id, userId: user.id, role: "admin" });
      return org.id;
    });
    await setActiveOrgCookie(orgId);
    log.info("org.created", { orgId, userId: user.id });
    return ok({ orgId });
  });
  if (result.ok) redirect("/onboarding");
  return result;
}

const updateSchema = z.object({ name: nameSchema, timezone: timezoneSchema });

/** Settings → Workspace: name and timezone. The slug follows the name when no other workspace has it. */
export async function updateOrganization(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("org.update", updateSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    await db.transaction(async (tx) => {
      const slug = await uniqueSlug(tx, data.name, viewer.orgId);
      await tx.update(organizations).set({ name: data.name, slug, timezone: data.timezone }).where(eq(organizations.id, viewer.orgId));
    });
    log.info("org.updated", { orgId: viewer.orgId, by: viewer.userId });
    refresh();
    return ok(undefined, "Workspace saved.");
  });
}

const switchSchema = z.object({ orgId: z.string().min(1) });

/** The workspace switcher: only a workspace the user really belongs to can become active. */
export async function switchOrganization(input: z.input<typeof switchSchema>): Promise<ActionResult> {
  const result = await runAction("org.switch", switchSchema, input, async ({ orgId }) => {
    const user = await requireUser();
    if ((await findMembership(db, orgId, user.id)) === null) throw new GuardError("not_found");
    await setActiveOrgCookie(orgId);
    return ok(undefined);
  });
  if (!result.ok) return fail(result.error);
  redirect("/home");
}

const deleteSchema = z.object({ confirmName: cappedText(LIMITS.workspaceName) });

/** Deletes the active workspace and everything in it (cascades). The admin must type its name to confirm. */
export async function deleteOrganization(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  const result = await runAction("org.delete", deleteSchema, input, async ({ confirmName }) => {
    const { viewer, org } = await requireOrgAdmin();
    if (confirmName.trim() !== org.name) return fail("Type the workspace name exactly to confirm.", { confirmName: ["Type the workspace name exactly to confirm."] });
    await db.delete(organizations).where(eq(organizations.id, viewer.orgId));
    (await cookies()).delete(ORG_COOKIE);
    log.warn("org.deleted", { orgId: viewer.orgId, by: viewer.userId });
    return ok(undefined);
  });
  if (result.ok) redirect("/home");
  return result;
}
