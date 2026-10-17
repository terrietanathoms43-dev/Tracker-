"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { organizationMembers, taskActivity, tasks } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { CLOSED_STATUSES, ORG_COOKIE, ORG_ROLE_LABELS, ORG_ROLES } from "@/lib/constants";
import { findMembership, lockAdminIds } from "@/lib/dal/orgs";
import { requireOrgAdmin } from "@/lib/guards";
import { log } from "@/lib/log";
import { requireViewerContext } from "@/lib/viewer";

// Members of a workspace: change a role, remove someone, leave. Every path keeps at least one admin, and
// a person who goes leaves no open task assigned to someone who can no longer see it.

const LAST_ADMIN = "A workspace needs at least one admin. Make someone else an admin first.";

/**
 * Unassigns a departing person's open tasks in this workspace and records each change in the task's history
 * (kind "assigned", before → after), so the team sees the work is free to pick up. Closed tasks and all
 * past updates keep their name.
 */
async function unassignOpenTasks(tx: Tx, orgId: string, userId: string, actorId: string, note: string): Promise<number> {
  const freed = await tx
    .update(tasks)
    .set({ assigneeId: null, updatedAt: new Date() })
    .where(and(eq(tasks.orgId, orgId), eq(tasks.assigneeId, userId), notInArray(tasks.status, [...CLOSED_STATUSES])))
    .returning({ id: tasks.id });
  if (freed.length > 0) {
    await tx.insert(taskActivity).values(
      freed.map(({ id }) => ({ orgId, taskId: id, actorId, kind: "assigned" as const, before: { assigneeId: userId }, after: { assigneeId: null }, note })),
    );
  }
  return freed.length;
}

const roleSchema = z.object({ userId: z.string().min(1).max(64), role: z.enum(ORG_ROLES) });

/** Admins only. The last admin cannot be demoted, which also stops a sole admin changing their own role. */
export async function changeRole(input: z.input<typeof roleSchema>): Promise<ActionResult> {
  return runAction("members.role", roleSchema, input, async ({ userId, role }) => {
    const { viewer } = await requireOrgAdmin();
    const outcome = await db.transaction(async (tx) => {
      const admins = await lockAdminIds(tx, viewer.orgId);
      // Re-checked under the lock: another admin may have demoted the viewer a moment ago.
      if (!admins.includes(viewer.userId)) throw new GuardError("forbidden");
      const member = await findMembership(tx, viewer.orgId, userId);
      if (member === null) throw new GuardError("not_found");
      if (member.role === role) return "unchanged";
      if (member.role === "admin" && admins.length <= 1) return "last-admin";
      await tx
        .update(organizationMembers)
        .set({ role })
        .where(and(eq(organizationMembers.orgId, viewer.orgId), eq(organizationMembers.userId, userId)));
      return "changed";
    });
    if (outcome === "last-admin") return fail(LAST_ADMIN);
    if (outcome === "changed") log.info("members.role_changed", { orgId: viewer.orgId, userId, role, by: viewer.userId });
    refresh();
    return ok(undefined, outcome === "changed" ? `Role changed to ${ORG_ROLE_LABELS[role].toLowerCase()}.` : undefined);
  });
}

const removeSchema = z.object({ userId: z.string().min(1).max(64) });

/** Admins only, never themselves (leaving is its own action). Their history stays; their open tasks are freed. */
export async function removeMember(input: z.input<typeof removeSchema>): Promise<ActionResult> {
  return runAction("members.remove", removeSchema, input, async ({ userId }) => {
    const { viewer } = await requireOrgAdmin();
    if (userId === viewer.userId) return fail("You can't remove yourself. Use Leave workspace under Settings → Profile.");
    const unassigned = await db.transaction(async (tx) => {
      const admins = await lockAdminIds(tx, viewer.orgId);
      if (!admins.includes(viewer.userId)) throw new GuardError("forbidden");
      if ((await findMembership(tx, viewer.orgId, userId)) === null) throw new GuardError("not_found");
      const count = await unassignOpenTasks(tx, viewer.orgId, userId, viewer.userId, "Removed from the workspace");
      await tx.delete(organizationMembers).where(and(eq(organizationMembers.orgId, viewer.orgId), eq(organizationMembers.userId, userId)));
      return count;
    });
    log.info("members.removed", { orgId: viewer.orgId, userId, by: viewer.userId, unassigned });
    refresh();
    return ok(undefined, unassigned > 0 ? `Member removed. ${unassigned} open ${unassigned === 1 ? "task is" : "tasks are"} now unassigned.` : "Member removed.");
  });
}

/**
 * Anyone may leave the active workspace except its last admin. The active-workspace cookie is cleared, and
 * /home falls back to another workspace, or to /onboarding when there is none.
 */
export async function leaveWorkspace(): Promise<ActionResult> {
  const result = await runAction("members.leave", z.object({}), {}, async () => {
    const { viewer } = await requireViewerContext();
    const outcome = await db.transaction(async (tx) => {
      const admins = await lockAdminIds(tx, viewer.orgId);
      if (admins.includes(viewer.userId) && admins.length <= 1) return "last-admin";
      await unassignOpenTasks(tx, viewer.orgId, viewer.userId, viewer.userId, "Left the workspace");
      await tx
        .delete(organizationMembers)
        .where(and(eq(organizationMembers.orgId, viewer.orgId), eq(organizationMembers.userId, viewer.userId)));
      return "left";
    });
    if (outcome === "last-admin") return fail("You're the only admin. Make someone else an admin first, or delete the workspace.");
    (await cookies()).delete(ORG_COOKIE);
    log.info("members.left", { orgId: viewer.orgId, userId: viewer.userId });
    return ok(undefined);
  });
  if (result.ok) redirect("/home");
  return result;
}
